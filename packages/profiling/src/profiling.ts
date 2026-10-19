import {
  context,
  createContextKey,
  trace,
  SpanStatusCode,
  type Context,
  type Span,
  type Attributes,
  type Tracer,
} from "@opentelemetry/api";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { RequestHandler } from "express";

export const profileContextKey: symbol = createContextKey("aegislog.request-profile");
export const tracer: Tracer = trace.getTracer("aegislog-profiling");

export interface ProfileOperation {
  spanId: string;
  parentSpanId?: string;
  name: string;
  category: string;
  startMs: number;
  durationMs: number;
  status: "ok" | "error" | "unfinished";
  attributes: Attributes;
}

const safeAttributes = new Set([
  "aegislog.category",
  "cache.hit",
  "cache.shared_fill",
  "cache.driver",
  "db.redis.database_index",
  "db.system",
  "db.system.name",
  "db.operation",
  "db.operation.name",
  "db.collection.name",
  "db.mongodb.collection",
  "db.name",
  "db.namespace",
  "http.method",
  "http.request.method",
  "http.status_code",
  "http.response.status_code",
  "http.route",
  "server.address",
  "server.port",
  "net.peer.name",
  "net.peer.port",
  "express.type",
  "express.name",
  "request.id",
  "deployment.environment.name",
  "service.name",
]);

/** Never send query values, URLs, headers, documents or exception messages to a trace sink. */
export function scrubSpan(span: ReadableSpan): void {
  for (const key of Object.keys(span.attributes)) {
    if (!safeAttributes.has(key)) delete span.attributes[key];
  }
  span.events.splice(0);
  for (const link of span.links) {
    for (const key of Object.keys(link.attributes ?? {})) {
      delete link.attributes![key];
    }
  }
  delete span.status.message;
}

const milliseconds = (time: [number, number]) => time[0] * 1000 + time[1] / 1e6;
const round = (value: number) => Math.round(value * 100) / 100;

function category(span: ReadableSpan): string {
  const explicit = span.attributes["aegislog.category"];
  if (typeof explicit === "string") return explicit;
  const scope = span.instrumentationScope.name;
  if (scope.includes("mongoose")) return "mongoose";
  if (scope.includes("mongodb")) return "mongodb";
  if (scope.includes("ioredis")) return "redis";
  if (scope.includes("http") || scope.includes("undici")) return "http";
  if (scope.includes("express")) return "middleware";
  return "application";
}

/** Merge overlapping intervals rather than adding concurrent or nested spans. */
export function coveredMs(operations: Pick<ProfileOperation, "startMs" | "durationMs">[]): number {
  const intervals = operations
    .map((op): [number, number] => [op.startMs, op.startMs + op.durationMs])
    .sort((a, b) => a[0] - b[0]);
  let end = 0;
  let total = 0;
  for (const [start, nextEnd] of intervals) {
    total += Math.max(0, nextEnd - Math.max(end, start));
    end = Math.max(end, nextEnd);
  }
  return round(total);
}

export interface ProfileSnapshot {
  totalMs: number;
  categories: Record<string, { count: number; workMs: number; wallMs: number; errors: number }>;
  uninstrumentedMs: number;
  droppedSpans: number;
  operations: ProfileOperation[];
}

export class RequestProfile {
  routeTemplate?: string;
  readonly operations: Map<string, ProfileOperation> = new Map();
  droppedSpans = 0;
  closed = false;

  constructor(
    readonly startedAt: number,
    readonly maxSpans: number,
  ) {}

  start(span: ReadableSpan): void {
    if (this.closed) return;
    if (this.operations.size >= this.maxSpans) {
      this.droppedSpans++;
      return;
    }
    this.operations.set(span.spanContext().spanId, {
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanContext?.spanId,
      name: span.name,
      category: category(span),
      startMs: Math.max(0, milliseconds(span.startTime) - this.startedAt),
      durationMs: 0,
      status: "unfinished",
      attributes: {},
    });
  }

  end(span: ReadableSpan): void {
    if (this.closed) return;
    const operation = this.operations.get(span.spanContext().spanId);
    if (!operation) return;
    operation.category = category(span);
    operation.name = span.name;
    operation.durationMs = milliseconds(span.duration);
    operation.status = span.status.code === SpanStatusCode.ERROR ? "error" : "ok";
    operation.attributes = { ...span.attributes };
  }

  snapshot(totalMs: number): ProfileSnapshot {
    const operations = [...this.operations.values()]
      .map((op) => ({
        ...op,
        startMs: round(Math.min(totalMs, op.startMs)),
        durationMs: round(
          Math.max(
            0,
            Math.min(
              op.status === "unfinished" ? totalMs - op.startMs : op.durationMs,
              totalMs - op.startMs,
            ),
          ),
        ),
      }))
      .sort((a, b) => a.startMs - b.startMs);
    const categories = Object.fromEntries(
      [...new Set(operations.map((op) => op.category))].map((name) => {
        const matching = operations.filter((op) => op.category === name);
        return [
          name,
          {
            count: matching.length,
            workMs: round(matching.reduce((sum, op) => sum + op.durationMs, 0)),
            wallMs: coveredMs(matching),
            errors: matching.filter((op) => op.status === "error").length,
          },
        ];
      }),
    );
    const dependencies = operations.filter((op) => op.category !== "middleware");
    return {
      totalMs: round(totalMs),
      categories,
      uninstrumentedMs: round(Math.max(0, totalMs - coveredMs(dependencies))),
      droppedSpans: this.droppedSpans,
      operations,
    };
  }
}

/** Runs before the exporter so every sink receives the same redacted attributes. */
export class RequestProfileProcessor implements SpanProcessor {
  private profiles = new WeakMap<object, RequestProfile>();
  onStart(span: Span, parentContext: Context): void {
    const profile = parentContext.getValue(profileContextKey) as RequestProfile | undefined;
    if (!profile || profile.closed) return;
    this.profiles.set(span, profile);
    profile.start(span as unknown as ReadableSpan);
  }
  onEnd(span: ReadableSpan): void {
    scrubSpan(span);
    this.profiles.get(span)?.end(span);
    this.profiles.delete(span);
  }
  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

export function profileOperation<T>(
  name: string,
  category: string,
  fn: () => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  const profile = context.active().getValue(profileContextKey) as RequestProfile | undefined;
  if (!profile || profile.closed) return fn();
  return tracer.startActiveSpan(
    name,
    { attributes: { ...attributes, "aegislog.category": category } },
    (span) => {
      try {
        const pending = fn();
        // Observe completion without changing promise identity or scheduling for callers.
        void pending.then(
          () => span.end(),
          () => {
            span.setStatus({ code: SpanStatusCode.ERROR });
            span.end();
          },
        );
        return pending;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        throw error;
      }
    },
  );
}

export function profileSync<T>(name: string, category: string, fn: () => T): T {
  const profile = context.active().getValue(profileContextKey) as RequestProfile | undefined;
  if (!profile || profile.closed) return fn();
  return tracer.startActiveSpan(name, { attributes: { "aegislog.category": category } }, (span) => {
    try {
      return fn();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function profileMiddleware(
  name: string,
  category: string,
  middleware: RequestHandler,
): RequestHandler {
  return (req, res, next) => {
    const parent = context.active();
    const profile = parent.getValue(profileContextKey) as RequestProfile | undefined;
    if (!profile || profile.closed) return middleware(req, res, next);
    return tracer.startActiveSpan(
      name,
      { attributes: { "aegislog.category": category } },
      (span) => {
        let ended = false;
        const end = () => {
          if (ended) return;
          ended = true;
          res.removeListener("finish", end);
          res.removeListener("close", end);
          span.end();
        };
        const forward = (error?: unknown) => {
          if (error) span.setStatus({ code: SpanStatusCode.ERROR });
          end();
          context.with(parent, () => next(error));
        };
        res.once("finish", end);
        res.once("close", end);
        try {
          const pending: unknown = middleware(req, res, forward);
          if (pending && typeof (pending as Promise<unknown>).then === "function") {
            return Promise.resolve(pending).catch(forward);
          }
          return pending;
        } catch (error) {
          forward(error);
        }
      },
    );
  };
}
