import { formatDevAudit, formatDevLog } from "./formatters/dev.js";
import { formatJsonAudit, formatJsonLog } from "./formatters/json.js";
import type { AuditRecord, LogEntry, LogSink } from "./types.js";

export class ConsoleSink implements LogSink {
  public name = "console";
  private isPretty: boolean;

  constructor(format: "auto" | "pretty" | "json" = "auto") {
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
      const formatted = formatDevLog(entry);
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
      console.log(formatDevAudit(record));
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
