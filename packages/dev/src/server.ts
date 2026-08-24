import http from "node:http";
import { randomBytes } from "node:crypto";
import { DASHBOARD_HTML } from "./ui.js";
import type { AuditRecord, LogEntry } from "aegislog";

export interface DevServerOptions {
  port?: number;
  host?: string;
  token?: string;
  maxBodyBytes?: number;
}

export class DevServer {
  private port: number;
  private host: string;
  private token?: string;
  private maxBodyBytes: number;
  private server?: http.Server;
  private clients: Set<http.ServerResponse> = new Set();
  private history: Array<{ id: number; event: LogEntry | AuditRecord }> = [];
  private nextEventId = 1;

  constructor(options: DevServerOptions = {}) {
    this.port = options.port ?? 4319;
    this.host = options.host ?? "127.0.0.1";
    this.token = options.token;
    this.maxBodyBytes = options.maxBodyBytes ?? 1_048_576;

    if (!this.isLoopbackHost(this.host) && !this.token) {
      throw new TypeError("DevServer requires a token when listening on a non-loopback host");
    }
  }

  public broadcast(event: LogEntry | AuditRecord): void {
    const item = { id: this.nextEventId++, event };
    this.history.push(item);
    if (this.history.length > 500) {
      this.history.shift();
    }

    const payload = `id: ${item.id}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  public start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || "/", `http://${this.host}:${this.port}`);

        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");

        if (req.method === "OPTIONS") {
          this.sendJson(res, 403, { error: "Cross-origin requests are not allowed" });
          return;
        }

        if (!this.isAuthorized(req, url)) {
          res.setHeader("WWW-Authenticate", "Bearer");
          this.sendJson(res, 401, { error: "Unauthorized" });
          return;
        }

        if (url.pathname === "/" || url.pathname === "/index.html") {
          const nonce = randomBytes(18).toString("base64");
          res.setHeader(
            "Content-Security-Policy",
            `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(DASHBOARD_HTML.replaceAll("__CSP_NONCE__", nonce));
          return;
        }

        if (url.pathname === "/api/stream" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          this.clients.add(res);

          const lastEventId = Number(req.headers["last-event-id"] ?? 0);
          for (const item of this.history) {
            if (!Number.isFinite(lastEventId) || item.id > lastEventId) {
              res.write(`id: ${item.id}\ndata: ${JSON.stringify(item.event)}\n\n`);
            }
          }

          req.on("close", () => {
            this.clients.delete(res);
          });
          return;
        }

        if (url.pathname === "/api/events" && req.method === "POST") {
          let body = "";
          let bodyBytes = 0;
          let tooLarge = false;
          req.on("data", (chunk) => {
            bodyBytes += Buffer.byteLength(chunk);
            if (bodyBytes > this.maxBodyBytes) {
              tooLarge = true;
              return;
            }
            body += chunk;
          });
          req.on("end", () => {
            if (tooLarge) {
              this.sendJson(res, 413, { error: "Request body is too large" });
              return;
            }
            try {
              const event: unknown = JSON.parse(body);
              if (!this.isLogEvent(event)) {
                this.sendJson(res, 422, { error: "Invalid log event" });
                return;
              }
              this.broadcast(event);
              this.sendJson(res, 200, { ok: true });
            } catch {
              this.sendJson(res, 400, { error: "Invalid JSON" });
            }
          });
          return;
        }

        res.writeHead(404);
        res.end("Not Found");
      });

      this.server.listen(this.port, this.host, () => {
        const baseUrl = `http://${this.host}:${this.port}`;
        const url = this.token ? `${baseUrl}?token=${encodeURIComponent(this.token)}` : baseUrl;
        resolve(url);
      });

      this.server.on("error", reject);
    });
  }

  private isLoopbackHost(host: string): boolean {
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  }

  private isAuthorized(req: http.IncomingMessage, url: URL): boolean {
    if (!this.token) {
      return true;
    }
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    return bearerToken === this.token || url.searchParams.get("token") === this.token;
  }

  private isLogEvent(value: unknown): value is LogEntry | AuditRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const event = value as Record<string, unknown>;
    const isLog =
      typeof event.level === "string" &&
      typeof event.message === "string" &&
      typeof event.timestamp === "string";
    const resource = event.resource;
    const isAudit =
      typeof event.action === "string" &&
      !!resource &&
      typeof resource === "object" &&
      typeof (resource as Record<string, unknown>).type === "string" &&
      typeof (resource as Record<string, unknown>).id === "string";
    return isLog || isAudit;
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.end();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
