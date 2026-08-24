import type { AuditRecord, LogEntry, LogSink } from "aegislog";
import { BatchDispatcher } from "./batch.js";

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
  private transform?: (entries: LogEntry[], auditRecords: AuditRecord[]) => unknown;
  private dispatcher: BatchDispatcher<
    { type: "log"; value: LogEntry } | { type: "audit"; value: AuditRecord }
  >;

  constructor(options: HttpBatchSinkOptions) {
    this.name = options.name ?? "http-batch";
    this.url = options.url;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.transform = options.transform;
    this.dispatcher = new BatchDispatcher({
      batchSize: options.batchSize ?? 50,
      flushIntervalMs: options.flushIntervalMs ?? 3000,
      deliver: async (items) => {
        const entries = items
          .filter((item): item is { type: "log"; value: LogEntry } => item.type === "log")
          .map((item) => item.value);
        const auditRecords = items
          .filter((item): item is { type: "audit"; value: AuditRecord } => item.type === "audit")
          .map((item) => item.value);
        const payload = this.transform
          ? this.transform(entries, auditRecords)
          : { logs: entries, audit: auditRecords };

        if (typeof fetch === "undefined") {
          throw new Error(`${this.name}: fetch is not available in this runtime`);
        }
        const response = await fetch(this.url, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`${this.name}: HTTP ${response.status} ${response.statusText}`);
        }
      },
    });
  }

  public log(entry: LogEntry): void {
    this.dispatcher.enqueue({ type: "log", value: entry });
  }

  public logAudit(record: AuditRecord): void {
    this.dispatcher.enqueue({ type: "audit", value: record });
  }

  public async flush(): Promise<void> {
    await this.dispatcher.flush();
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
      transform: (entries, auditRecords) => [
        ...entries,
        ...auditRecords.map((record) => ({ type: "audit", ...record })),
      ],
    });
  }
}
