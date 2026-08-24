import { AiTracker } from "./ai.js";
import { AuditEngine } from "./audit.js";
import { getContext } from "./context.js";
import { type LogEventDefinition, validateEventData } from "./schema.js";
import { SecurityShield } from "./shield.js";
import { ConsoleSink, DevViewerSink } from "./sinks.js";
import {
  LOG_LEVEL_SEVERITY,
  type LogEntry,
  type LogLevel,
  type LogSink,
  type LoggerOptions,
  type RingBufferOptions,
} from "./types.js";

export class AegisLogger {
  private static readonly GLOBAL_RING_BUFFER_KEY = "__aegis_global__";
  private level: LogLevel;
  private namespace?: string;
  private shield: SecurityShield;
  private sinks: LogSink[];
  private defaultMeta: Record<string, unknown>;
  private ringBufferOptions: RingBufferOptions;
  private ringBuffers = new Map<string, LogEntry[]>();
  private pendingWrites = new Set<Promise<void>>();
  private pendingWriteErrors: unknown[] = [];
  private disableGracefulShutdown?: () => void;
  public audit: AuditEngine;
  public ai: AiTracker;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.namespace = options.namespace;
    this.shield = new SecurityShield(options.shield);

    const sinks: LogSink[] =
      options.sinks && options.sinks.length > 0
        ? [...options.sinks]
        : [new ConsoleSink(options.format, options.display)];

    const shouldAttachDev =
      options.dev !== false &&
      (options.dev === true ||
        typeof options.dev === "object" ||
        (typeof process !== "undefined" && process.env?.AEGIS_DEV === "true"));

    if (shouldAttachDev) {
      const devOpts = typeof options.dev === "object" ? options.dev : {};
      sinks.push(new DevViewerSink(devOpts));
    }

    this.sinks = sinks;
    this.defaultMeta = options.defaultMeta ?? {};
    this.ringBufferOptions = {
      enabled: options.ringBuffer?.enabled ?? false,
      capacity: options.ringBuffer?.capacity ?? 25,
      flushOnError: options.ringBuffer?.flushOnError ?? true,
    };
    this.audit = new AuditEngine(this.sinks, this.shield);
    this.ai = new AiTracker(this, this.shield);

    if (options.gracefulShutdown) {
      this.disableGracefulShutdown = this.enableGracefulShutdown();
    }
  }

  public async flush(): Promise<void> {
    await Promise.all(this.pendingWrites);
    await Promise.all(this.sinks.map((sink) => sink.flush?.()));

    if (this.pendingWriteErrors.length > 0) {
      const errors = this.pendingWriteErrors.splice(0);
      throw new AggregateError(errors, "One or more log sinks failed");
    }
  }

  public enableGracefulShutdown(): () => void {
    if (typeof process === "undefined" || typeof process.on !== "function") {
      return () => {};
    }

    this.disableGracefulShutdown?.();
    let shuttingDown = false;

    const handleSignal = async (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      try {
        await this.flush();
      } catch {
        process.exitCode = 1;
      }

      cleanup();
      process.kill(process.pid, signal);
    };

    const sigtermHandler = () => void handleSignal("SIGTERM");
    const sigintHandler = () => void handleSignal("SIGINT");
    process.on("SIGTERM", sigtermHandler);
    process.on("SIGINT", sigintHandler);

    const cleanup = () => {
      process.off?.("SIGTERM", sigtermHandler);
      process.off?.("SIGINT", sigintHandler);
      if (this.disableGracefulShutdown === cleanup) {
        this.disableGracefulShutdown = undefined;
      }
    };
    this.disableGracefulShutdown = cleanup;
    return cleanup;
  }

  public addSink(sink: LogSink): this {
    this.sinks.push(sink);
    this.audit = new AuditEngine(this.sinks, this.shield);
    return this;
  }

  public shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.level];
  }

  private getRingBufferKey(entry?: LogEntry, requestId?: string): string {
    return requestId ?? entry?.context?.requestId ?? AegisLogger.GLOBAL_RING_BUFFER_KEY;
  }

  private dispatch(entry: LogEntry): void {
    for (const sink of this.sinks) {
      try {
        const result = sink.log(entry);
        if (result instanceof Promise) {
          const tracked = result
            .catch((error: unknown) => {
              this.pendingWriteErrors.push(error);
            })
            .finally(() => {
              this.pendingWrites.delete(tracked);
            });
          this.pendingWrites.add(tracked);
        }
      } catch (error) {
        this.pendingWriteErrors.push(error);
      }
    }
  }

  private flushBufferedEntries(requestId?: string): void {
    const key = this.getRingBufferKey(undefined, requestId);
    const buffered = this.ringBuffers.get(key) ?? [];
    this.ringBuffers.delete(key);
    for (const entry of buffered) {
      this.dispatch(entry);
    }
  }

  public completeRequest(statusCode: number, requestId?: string): void {
    if (!this.ringBufferOptions.enabled) {
      return;
    }

    const key = this.getRingBufferKey(undefined, requestId ?? getContext()?.requestId);
    if (statusCode >= 400) {
      this.flushBufferedEntries(key);
    } else {
      this.ringBuffers.delete(key);
    }
  }

  private emit(entry: LogEntry): void {
    if (
      this.ringBufferOptions.enabled &&
      !this.shouldLog(entry.level) &&
      (entry.level === "debug" || entry.level === "trace")
    ) {
      const key = this.getRingBufferKey(entry);
      const buffer = this.ringBuffers.get(key) ?? [];
      buffer.push(entry);
      if (buffer.length > (this.ringBufferOptions.capacity ?? 25)) {
        buffer.shift();
      }
      this.ringBuffers.set(key, buffer);
      return;
    }

    if (
      this.ringBufferOptions.enabled &&
      this.ringBufferOptions.flushOnError &&
      (entry.level === "error" || entry.level === "fatal") &&
      this.ringBuffers.has(this.getRingBufferKey(entry))
    ) {
      this.flushBufferedEntries(this.getRingBufferKey(entry));
    }

    if (!this.shouldLog(entry.level)) {
      return;
    }

    this.dispatch(entry);
  }

  private createEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: Error | { name: string; message: string; stack?: string; cause?: unknown },
  ): LogEntry {
    const ambientContext = getContext();

    const mergedMeta = this.shield.sanitize<Record<string, unknown>>({
      ...this.defaultMeta,
      ...meta,
    });

    return {
      level,
      message: this.shield.sanitizeString(message),
      timestamp: new Date().toISOString(),
      namespace: this.namespace,
      context: ambientContext
        ? (this.shield.sanitize(ambientContext) as typeof ambientContext)
        : undefined,
      meta: Object.keys(mergedMeta).length > 0 ? mergedMeta : undefined,
      error: error ? (this.shield.sanitize(error) as Error) : undefined,
    };
  }

  public trace(message: string, meta?: Record<string, unknown>): void {
    this.emit(this.createEntry("trace", message, meta));
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.emit(this.createEntry("debug", message, meta));
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.emit(this.createEntry("info", message, meta));
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.emit(this.createEntry("warn", message, meta));
  }

  private normalizeErrorArguments(
    messageOrError: string | Error,
    metaOrError?: Record<string, unknown> | Error,
    error?: Error,
  ): { message: string; meta?: Record<string, unknown>; error?: Error } {
    let message: string;
    let meta: Record<string, unknown> | undefined;
    let err: Error | undefined = error;

    if (messageOrError instanceof Error) {
      message = messageOrError.message;
      err = messageOrError;
      if (metaOrError && !(metaOrError instanceof Error) && typeof metaOrError === "object") {
        meta = metaOrError;
      }
    } else {
      message = String(messageOrError);
      if (metaOrError instanceof Error) {
        err = metaOrError;
      } else if (metaOrError && typeof metaOrError === "object") {
        meta = metaOrError;
        if ("error" in meta && meta.error instanceof Error) {
          err = meta.error;
        }
      }
    }

    return { message, meta, error: err };
  }

  public error(
    messageOrError: string | Error,
    metaOrError?: Record<string, unknown> | Error,
    error?: Error,
  ): void {
    const normalized = this.normalizeErrorArguments(messageOrError, metaOrError, error);
    this.emit(this.createEntry("error", normalized.message, normalized.meta, normalized.error));
  }

  public fatal(
    messageOrError: string | Error,
    metaOrError?: Record<string, unknown> | Error,
    error?: Error,
  ): void {
    const normalized = this.normalizeErrorArguments(messageOrError, metaOrError, error);
    this.emit(this.createEntry("fatal", normalized.message, normalized.meta, normalized.error));
  }

  public event<TName extends string, TData>(
    definition: LogEventDefinition<TName, TData>,
    data: TData,
    meta?: Record<string, unknown>,
  ): void {
    const validatedData = validateEventData(definition.schema, data);
    const level = definition.level ?? "info";
    this.emit(
      this.createEntry(level, `[Event: ${definition.name}]`, {
        event: definition.name,
        payload: validatedData as Record<string, unknown>,
        ...meta,
      }),
    );
  }

  public time(label: string, meta?: Record<string, unknown>): () => number {
    const start = performance.now();
    return () => {
      const elapsed = Number((performance.now() - start).toFixed(2));
      this.info(`${label} completed in ${elapsed}ms`, { ...meta, durationMs: elapsed });
      return elapsed;
    };
  }

  public child(options: {
    namespace?: string;
    defaultMeta?: Record<string, unknown>;
  }): AegisLogger {
    const newNamespace = this.namespace
      ? options.namespace
        ? `${this.namespace}:${options.namespace}`
        : this.namespace
      : options.namespace;

    const child = new AegisLogger({
      level: this.level,
      namespace: newNamespace,
      sinks: this.sinks,
      defaultMeta: { ...this.defaultMeta, ...options.defaultMeta },
      ringBuffer: this.ringBufferOptions,
    });
    child.shield = this.shield;
    child.audit = new AuditEngine(child.sinks, child.shield);
    child.ai = new AiTracker(child, child.shield);
    return child;
  }

  public with(meta: Record<string, unknown>): FluentLogBuilder {
    return new FluentLogBuilder(this, meta);
  }

  public withError(err: Error): FluentLogBuilder {
    return new FluentLogBuilder(this, {}, err);
  }
}

export class FluentLogBuilder {
  private logger: AegisLogger;
  private meta: Record<string, unknown>;
  private boundError?: Error;

  constructor(logger: AegisLogger, meta: Record<string, unknown> = {}, error?: Error) {
    this.logger = logger;
    this.meta = { ...meta };
    this.boundError = error;
  }

  public with(meta: Record<string, unknown>): this {
    this.meta = { ...this.meta, ...meta };
    return this;
  }

  public withError(err: Error): this {
    this.boundError = err;
    return this;
  }

  public trace(message: string): void {
    this.logger.trace(message, this.meta);
  }

  public debug(message: string): void {
    this.logger.debug(message, this.meta);
  }

  public info(message: string): void {
    this.logger.info(message, this.meta);
  }

  public warn(message: string): void {
    this.logger.warn(message, this.meta);
  }

  public error(message: string): void {
    this.logger.error(message, this.meta, this.boundError);
  }

  public fatal(message: string): void {
    this.logger.fatal(message, this.meta, this.boundError);
  }
}

export function createLogger(options?: LoggerOptions): AegisLogger {
  return new AegisLogger(options);
}
