import { formatDevAudit, formatDevLog } from "./formatters/dev.js";
import { formatJsonAudit, formatJsonLog } from "./formatters/json.js";
import type { AuditRecord, DevDisplayOptions, LogEntry, LogSink } from "./types.js";

export class ConsoleSink implements LogSink {
  public name = "console";
  private isPretty: boolean;
  private displayOptions: DevDisplayOptions;

  constructor(format: "auto" | "pretty" | "json" = "auto", displayOptions: DevDisplayOptions = {}) {
    this.displayOptions = displayOptions;
    if (format === "pretty") {
      this.isPretty = true;
    } else if (format === "json") {
      this.isPretty = false;
    } else {
      // Auto-detect based on NODE_ENV and TTY
      const isProd = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
      const isCI =
        typeof process !== "undefined" &&
        (process.env?.CI === "true" || process.env?.CONTINUOUS_INTEGRATION === "true");
      this.isPretty = !isProd && !isCI;
    }
  }

  public log(entry: LogEntry): void {
    if (this.isPretty) {
      const formatted = formatDevLog(entry, this.displayOptions);
      if (entry.level === "error" || entry.level === "fatal") {
        console.error(formatted);
      } else if (entry.level === "warn") {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    } else {
      const json = formatJsonLog(entry);
      if (typeof process !== "undefined" && process.stdout?.write) {
        process.stdout.write(`${json}\n`);
      } else {
        console.log(json);
      }
    }
  }

  public logAudit(record: AuditRecord): void {
    if (this.isPretty) {
      console.log(formatDevAudit(record, this.displayOptions));
    } else {
      const json = formatJsonAudit(record);
      if (typeof process !== "undefined" && process.stdout?.write) {
        process.stdout.write(`${json}\n`);
      } else {
        console.log(json);
      }
    }
  }
}

export class MemorySink implements LogSink {
  public name = "memory";
  public entries: LogEntry[] = [];
  public auditRecords: AuditRecord[] = [];

  public log(entry: LogEntry): void {
    this.entries.push(entry);
  }

  public logAudit(record: AuditRecord): void {
    this.auditRecords.push(record);
  }

  public clear(): void {
    this.entries = [];
    this.auditRecords = [];
  }
}

export class DevViewerSink implements LogSink {
  public name = "dev-viewer";
  private url: string;

  constructor(options: { port?: number; host?: string } = {}) {
    const port = options.port ?? 4319;
    const host = options.host ?? "127.0.0.1";
    this.url = `http://${host}:${port}/api/events`;
  }

  public log(entry: LogEntry): void {
    void this.send(entry);
  }

  public logAudit(record: AuditRecord): void {
    void this.send(record);
  }

  private async send(payload: unknown): Promise<void> {
    try {
      if (typeof fetch !== "undefined") {
        await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
    } catch {
      // Dev Inspector is not running
    }
  }
}
