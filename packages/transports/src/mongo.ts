import type { AuditRecord, LogEntry, LogLevel, LogSink } from "aegislog";
import { BatchDispatcher } from "./batch.js";

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
  private transform?: (entry: LogEntry) => unknown;
  private transformAudit?: (record: AuditRecord) => unknown;
  private onError?: (error: Error, entries: (LogEntry | AuditRecord)[]) => void;
  private dispatcher: BatchDispatcher<
    { type: "log"; value: LogEntry } | { type: "audit"; value: AuditRecord }
  >;

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
    this.transform = options.transform;
    this.transformAudit = options.transformAudit;
    this.onError = options.onError;

    if (!this.collection && !this.model) {
      throw new TypeError("MongoBatchSink requires a collection or model");
    }

    this.dispatcher = new BatchDispatcher({
      batchSize: options.batchSize ?? 50,
      flushIntervalMs: options.flushIntervalMs ?? 2000,
      deliver: (items) => this.deliver(items),
    });
  }

  public log(entry: LogEntry): void {
    this.dispatcher.enqueue({ type: "log", value: entry });
  }

  public logAudit(record: AuditRecord): void {
    if (this.auditCollection || this.auditModel) {
      this.dispatcher.enqueue({ type: "audit", value: record });
    } else {
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
      this.dispatcher.enqueue({ type: "log", value: fallbackEntry });
    }
  }

  public async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  private async deliver(
    items: Array<{ type: "log"; value: LogEntry } | { type: "audit"; value: AuditRecord }>,
  ): Promise<void> {
    const entriesToFlush = items
      .filter((item): item is { type: "log"; value: LogEntry } => item.type === "log")
      .map((item) => item.value);
    const auditsToFlush = items
      .filter((item): item is { type: "audit"; value: AuditRecord } => item.type === "audit")
      .map((item) => item.value);

    const tasks: Promise<unknown>[] = [];

    if (entriesToFlush.length > 0) {
      const docs = this.transform ? entriesToFlush.map((e) => this.transform!(e)) : entriesToFlush;
      const target = this.model?.insertMany ? this.model : this.collection;

      if (target?.insertMany) {
        tasks.push(
          Promise.resolve(target.insertMany(docs as Record<string, unknown>[], { ordered: false })),
        );
      } else {
        throw new TypeError("MongoBatchSink log target does not implement insertMany()");
      }
    }

    if (auditsToFlush.length > 0 && (this.auditCollection || this.auditModel)) {
      const docs = this.transformAudit
        ? auditsToFlush.map((a) => this.transformAudit!(a))
        : auditsToFlush;
      const target = this.auditModel?.insertMany ? this.auditModel : this.auditCollection;

      if (target?.insertMany) {
        tasks.push(
          Promise.resolve(target.insertMany(docs as Record<string, unknown>[], { ordered: false })),
        );
      } else {
        throw new TypeError("MongoBatchSink audit target does not implement insertMany()");
      }
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.onError?.(normalized, [...entriesToFlush, ...auditsToFlush]);
      throw normalized;
    }
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
    if (options.search) {
      const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.message = { $regex: escapedSearch, $options: "i" };
    }

    if (options.startDate || options.endDate) {
      filter.timestamp = {};
      if (options.startDate) {
        filter.timestamp.$gte = new Date(options.startDate).toISOString();
      }
      if (options.endDate) {
        filter.timestamp.$lte = new Date(options.endDate).toISOString();
      }
    }

    const pageSize = Math.max(1, Math.min(options.limit ?? 50, 500));
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
