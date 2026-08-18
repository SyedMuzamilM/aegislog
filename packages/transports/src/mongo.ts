import type { AuditRecord, LogEntry, LogSink } from "aegislog";

export interface MongoCollectionLike<T = Record<string, unknown>> {
  insertMany: (
    docs: T[],
    options?: { ordered?: boolean; [key: string]: unknown },
  ) => Promise<unknown>;
}

export interface MongoBatchSinkOptions<
  TLog = Record<string, unknown>,
  TAudit = Record<string, unknown>,
> {
  /**
   * Custom name for this sink (default: "mongo-batch")
   */
  name?: string;

  /**
   * MongoDB collection for storing application logs
   */
  collection: MongoCollectionLike<TLog>;

  /**
   * Optional separate MongoDB collection for storing audit records.
   * If not provided, audit records are formatted and stored in `collection`.
   */
  auditCollection?: MongoCollectionLike<TAudit>;

  /**
   * Maximum number of log/audit entries before an immediate flush (default: 50)
   */
  batchSize?: number;

  /**
   * Periodic flush interval in milliseconds (default: 2000 ms)
   */
  flushIntervalMs?: number;

  /**
   * Optional custom transformation function for log entries before insertion
   */
  transform?: (entry: LogEntry) => TLog;

  /**
   * Optional custom transformation function for audit records before insertion
   */
  transformAudit?: (record: AuditRecord) => TAudit;

  /**
   * Optional error callback invoked when batch insertion fails
   */
  onError?: (error: Error, entries: (LogEntry | AuditRecord)[]) => void;
}

export class MongoBatchSink implements LogSink {
  public name: string;
  private collection: MongoCollectionLike;
  private auditCollection?: MongoCollectionLike;
  private batchSize: number;
  private flushIntervalMs: number;
  private transform?: (entry: LogEntry) => unknown;
  private transformAudit?: (record: AuditRecord) => unknown;
  private onError?: (error: Error, entries: (LogEntry | AuditRecord)[]) => void;

  private entryQueue: LogEntry[] = [];
  private auditQueue: AuditRecord[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(options: MongoBatchSinkOptions) {
    this.name = options.name ?? "mongo-batch";
    this.collection = options.collection;
    this.auditCollection = options.auditCollection;
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.transform = options.transform;
    this.transformAudit = options.transformAudit;
    this.onError = options.onError;
  }

  public log(entry: LogEntry): void {
    this.entryQueue.push(entry);
    this.scheduleFlush();
  }

  public logAudit(record: AuditRecord): void {
    if (this.auditCollection) {
      this.auditQueue.push(record);
    } else {
      // Default: wrap audit record into log entry for unified collection
      const fallbackEntry: LogEntry = {
        level: "info",
        message: `[AUDIT] ${record.action} on ${record.resource.type}:${record.resource.id}`,
        timestamp: record.timestamp ?? new Date().toISOString(),
        context: {
          requestId: record.eventId ?? record.traceId ?? "audit",
          actor: record.actor,
          tenant: record.tenant,
          session: record.session,
        },
        meta: { audit: record },
      };
      this.entryQueue.push(fallbackEntry);
    }
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

    const entriesToFlush = [...this.entryQueue];
    const auditsToFlush = [...this.auditQueue];
    this.entryQueue = [];
    this.auditQueue = [];

    const tasks: Promise<unknown>[] = [];

    if (entriesToFlush.length > 0) {
      const docs = this.transform ? entriesToFlush.map((e) => this.transform!(e)) : entriesToFlush;

      tasks.push(
        this.collection
          .insertMany(docs as Record<string, unknown>[], { ordered: false })
          .catch((err) => {
            if (this.onError) {
              this.onError(err instanceof Error ? err : new Error(String(err)), entriesToFlush);
            }
          }),
      );
    }

    if (auditsToFlush.length > 0 && this.auditCollection) {
      const docs = this.transformAudit
        ? auditsToFlush.map((a) => this.transformAudit!(a))
        : auditsToFlush;

      tasks.push(
        this.auditCollection
          .insertMany(docs as Record<string, unknown>[], { ordered: false })
          .catch((err) => {
            if (this.onError) {
              this.onError(err instanceof Error ? err : new Error(String(err)), auditsToFlush);
            }
          }),
      );
    }

    await Promise.allSettled(tasks);
  }

  public async close(): Promise<void> {
    await this.flush();
  }
}
