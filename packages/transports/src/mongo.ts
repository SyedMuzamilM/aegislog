import type { AuditRecord, LogEntry, LogLevel, LogSink } from "aegislog";

export interface MongoCollectionLike {
  insertMany?: (docs: any[], options?: { ordered?: boolean; [key: string]: unknown }) => any;
  find?: (filter?: any, options?: any) => any;
  countDocuments?: (filter?: any, options?: any) => any;
  [key: string]: any;
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
   * MongoDB collection for storing application logs (Native MongoDB driver collection or Mongoose Model.collection)
   */
  collection?: MongoCollectionLike;

  /**
   * Directly pass a Mongoose Model (e.g. `model: SystemLogsModel`)
   */
  model?: any;

  /**
   * Optional separate MongoDB collection for storing audit records.
   * If not provided, audit records are formatted and stored in `collection` or `model`.
   */
  auditCollection?: MongoCollectionLike;

  /**
   * Directly pass a Mongoose Model for audit logs (e.g. `auditModel: AuditLogsModel`)
   */
  auditModel?: any;

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

export interface MongoLogQueryOptions {
  level?: LogLevel;
  namespace?: string;
  actorId?: string;
  tenantId?: string;
  requestId?: string;
  search?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  limit?: number;
  page?: number;
  skip?: number;
}

export interface MongoLogQueryResult<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class MongoBatchSink implements LogSink {
  public name: string;
  private collection?: MongoCollectionLike;
  private model?: any;
  private auditCollection?: MongoCollectionLike;
  private auditModel?: any;
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
    this.collection =
      options.collection ??
      (options.model ? (options.model.collection ?? options.model) : undefined);
    this.model = options.model;
    this.auditCollection =
      options.auditCollection ??
      (options.auditModel ? (options.auditModel.collection ?? options.auditModel) : undefined);
    this.auditModel = options.auditModel;
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
    if (this.auditCollection || this.auditModel) {
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
      this.timer?.unref?.();
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
      const target = this.model?.insertMany ? this.model : this.collection;

      if (target?.insertMany) {
        tasks.push(
          Promise.resolve(
            target.insertMany(docs as Record<string, unknown>[], { ordered: false }),
          ).catch((err: unknown) => {
            if (this.onError) {
              this.onError(err instanceof Error ? err : new Error(String(err)), entriesToFlush);
            }
          }),
        );
      }
    }

    if (auditsToFlush.length > 0 && (this.auditCollection || this.auditModel)) {
      const docs = this.transformAudit
        ? auditsToFlush.map((a) => this.transformAudit!(a))
        : auditsToFlush;
      const target = this.auditModel?.insertMany ? this.auditModel : this.auditCollection;

      if (target?.insertMany) {
        tasks.push(
          Promise.resolve(
            target.insertMany(docs as Record<string, unknown>[], { ordered: false }),
          ).catch((err: unknown) => {
            if (this.onError) {
              this.onError(err instanceof Error ? err : new Error(String(err)), auditsToFlush);
            }
          }),
        );
      }
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Search and query historical logs directly from the connected MongoDB collection or model.
   */
  public async query(options: MongoLogQueryOptions = {}): Promise<MongoLogQueryResult> {
    const target = this.model ?? this.collection;
    if (!target || typeof target.find !== "function") {
      throw new Error("MongoBatchSink: query requires a collection or model with find() support");
    }

    const filter: Record<string, any> = {};

    if (options.level) filter.level = options.level;
    if (options.namespace) filter.namespace = options.namespace;
    if (options.actorId) filter["context.actor.id"] = options.actorId;
    if (options.tenantId) filter["context.tenant.id"] = options.tenantId;
    if (options.requestId) filter["context.requestId"] = options.requestId;
    if (options.search) filter.message = { $regex: options.search, $options: "i" };

    if (options.startDate || options.endDate) {
      filter.timestamp = {};
      if (options.startDate) {
        filter.timestamp.$gte = new Date(options.startDate).toISOString();
      }
      if (options.endDate) {
        filter.timestamp.$lte = new Date(options.endDate).toISOString();
      }
    }

    const pageSize = Math.min(options.limit ?? 50, 500);
    const skip = options.skip ?? (Math.max(options.page ?? 1, 1) - 1) * pageSize;

    let cursor = target.find(filter);
    if (cursor && typeof cursor.sort === "function") {
      cursor = cursor.sort({ timestamp: -1 });
    }
    if (cursor && typeof cursor.skip === "function") {
      cursor = cursor.skip(skip);
    }
    if (cursor && typeof cursor.limit === "function") {
      cursor = cursor.limit(pageSize);
    }

    const items =
      cursor && typeof cursor.toArray === "function"
        ? await cursor.toArray()
        : Array.isArray(cursor)
          ? cursor
          : await cursor;

    let total = 0;
    if (typeof target.countDocuments === "function") {
      total = await target.countDocuments(filter);
    } else if (typeof target.count === "function") {
      total = await target.count(filter);
    } else {
      total = Array.isArray(items) ? items.length : 0;
    }

    const page = options.page ?? Math.floor(skip / pageSize) + 1;

    return {
      items: Array.isArray(items) ? items : [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  public async close(): Promise<void> {
    await this.flush();
  }
}
