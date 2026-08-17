import http from "node:http";
import { DASHBOARD_HTML } from "./ui.js";
import type { AuditRecord, LogEntry } from "aegislog";

export interface DevServerOptions {
  port?: number;
  host?: string;
}

export class DevServer {
  private port: number;
  private host: string;
  private server?: http.Server;
  private clients: Set<http.ServerResponse> = new Set();
  private history: Array<LogEntry | AuditRecord> = [];

  constructor(options: DevServerOptions = {}) {
    this.port = options.port ?? 4319;
    this.host = options.host ?? "127.0.0.1";
  }

  public broadcast(event: LogEntry | AuditRecord): void {
    this.history.push(event);
    if (this.history.length > 500) {
      this.history.shift();
    }

    const payload = `data: ${JSON.stringify(event)}\n\n`;
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
        const url = req.url || "/";

        // CORS headers for local development
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        if (url === "/" || url === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(DASHBOARD_HTML);
          return;
        }

        if (url === "/api/stream") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          this.clients.add(res);

          // Replay recent history to new client
          for (const item of this.history) {
            res.write(`data: ${JSON.stringify(item)}\n\n`);
          }

          req.on("close", () => {
            this.clients.delete(res);
          });
          return;
        }

        if (url === "/api/events" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const event = JSON.parse(body);
              this.broadcast(event);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end("Not Found");
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        resolve(url);
      });

      this.server.on("error", reject);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.end();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
