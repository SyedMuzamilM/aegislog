import type { AuditRecord, LogEntry, LogSink } from "aegislog";

export interface HttpBatchSinkOptions {
  name?: string;
  url: string;
  headers?: Record<string, string>;
  batchSize?: number;
  flushIntervalMs?: number;
  transform?: (entries: LogEntry[], auditRecords: AuditRecord[]) => unknown;
}

export class HttpBatchSink implements LogSink {
  public name: string;
  private url: string;
  private headers: Record<string, string>;
  private batchSize: number;
  private flushIntervalMs: number;
  private transform?: (entries: LogEntry[], auditRecords: AuditRecord[]) => unknown;
  private entryQueue: LogEntry[] = [];
  private auditQueue: AuditRecord[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(options: HttpBatchSinkOptions) {
    this.name = options.name ?? "http-batch";
    this.url = options.url;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 3000;
    this.transform = options.transform;
  }

  public log(entry: LogEntry): void {
    this.entryQueue.push(entry);
    this.scheduleFlush();
  }

  public logAudit(record: AuditRecord): void {
    this.auditQueue.push(record);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.entryQueue.length + this.auditQueue.length >= this.batchSize) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  public async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.entryQueue.length === 0 && this.auditQueue.length === 0) {
      return;
    }

    const entries = [...this.entryQueue];
    const auditRecords = [...this.auditQueue];
    this.entryQueue = [];
    this.auditQueue = [];

    const payload = this.transform
      ? this.transform(entries, auditRecords)
      : { logs: entries, audit: auditRecords };

    try {
      if (typeof fetch !== "undefined") {
        await fetch(this.url, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(payload),
        });
      }
    } catch {
      // Swallowed safely
    }
  }
}

export class AxiomSink extends HttpBatchSink {
  constructor(options: {
    dataset: string;
    token: string;
    batchSize?: number;
    flushIntervalMs?: number;
  }) {
    super({
      name: "axiom",
      url: `https://api.axiom.co/v1/datasets/${options.dataset}/ingest`,
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      batchSize: options.batchSize,
      flushIntervalMs: options.flushIntervalMs,
      transform: (entries) => entries,
    });
  }
}
