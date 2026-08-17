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
  private level: LogLevel;
  private namespace?: string;
  private shield: SecurityShield;
  private sinks: LogSink[];
  private defaultMeta: Record<string, unknown>;
  private ringBufferOptions: RingBufferOptions;
  private ringBuffer: LogEntry[] = [];
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
  }

  public addSink(sink: LogSink): this {
    this.sinks.push(sink);
    this.audit = new AuditEngine(this.sinks, this.shield);
    return this;
  }

  public shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.level];
  }

  private emit(entry: LogEntry): void {
    // If ring buffer is enabled and entry is below current level (e.g. debug while level is info)
    if (this.ringBufferOptions.enabled && (entry.level === "debug" || entry.level === "trace")) {
      this.ringBuffer.push(entry);
      if (this.ringBuffer.length > (this.ringBufferOptions.capacity ?? 25)) {
        this.ringBuffer.shift();
      }
      // If below threshold, don't output yet
      if (!this.shouldLog(entry.level)) {
        return;
      }
    }

    // Flush ring buffer on error if enabled
    if (
      this.ringBufferOptions.enabled &&
      this.ringBufferOptions.flushOnError &&
      (entry.level === "error" || entry.level === "fatal") &&
      this.ringBuffer.length > 0
    ) {
      const buffered = [...this.ringBuffer];
      this.ringBuffer = [];
      for (const bufEntry of buffered) {
        for (const sink of this.sinks) {
          sink.log(bufEntry);
        }
      }
    }

    if (!this.shouldLog(entry.level)) {
      return;
    }

    for (const sink of this.sinks) {
      sink.log(entry);
    }
  }

  private createEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: Error | { name: string; message: string; stack?: string; cause?: unknown },
  ): LogEntry {
    const ambientContext = getContext();

    const mergedMeta: Record<string, unknown> = {
      ...this.defaultMeta,
      ...(meta ? (this.shield.sanitize(meta) as Record<string, unknown>) : {}),
    };

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

  public error(
    message: string,
    metaOrError?: Record<string, unknown> | Error,
    error?: Error,
  ): void {
    let meta: Record<string, unknown> | undefined;
    let err: Error | undefined = error;

    if (metaOrError instanceof Error) {
      err = metaOrError;
    } else if (metaOrError && typeof metaOrError === "object") {
      meta = metaOrError;
      if ("error" in meta && meta.error instanceof Error) {
        err = meta.error;
      }
    }

    this.emit(this.createEntry("error", message, meta, err));
  }

  public fatal(
    message: string,
    metaOrError?: Record<string, unknown> | Error,
    error?: Error,
  ): void {
    let meta: Record<string, unknown> | undefined;
    let err: Error | undefined = error;

    if (metaOrError instanceof Error) {
      err = metaOrError;
    } else if (metaOrError && typeof metaOrError === "object") {
      meta = metaOrError;
      if ("error" in meta && meta.error instanceof Error) {
        err = meta.error;
      }
    }

    this.emit(this.createEntry("fatal", message, meta, err));
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

    return new AegisLogger({
      level: this.level,
      namespace: newNamespace,
      sinks: this.sinks,
      defaultMeta: { ...this.defaultMeta, ...options.defaultMeta },
      ringBuffer: this.ringBufferOptions,
    });
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
