import type { AuditRecord, LogEntry, LogLevel, LogSink } from "aegislog";
import { BatchDispatcher } from "./batch.js";

export interface OpenTelemetrySinkOptions {
  endpoint?: string;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  headers?: Record<string, string>;
  batchSize?: number;
  flushIntervalMs?: number;
}

const OTEL_SEVERITY_NUMBERS: Record<LogLevel, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

type OtelAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtelAnyValue[] } }
  | { kvlistValue: { values: Array<{ key: string; value: OtelAnyValue }> } };

function toOtelValue(value: unknown): OtelAnyValue {
  if (value === null || value === undefined) {
    return { stringValue: String(value) };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "bigint") {
    return { intValue: value.toString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toOtelValue) } };
  }
  if (typeof value === "object") {
    return {
      kvlistValue: {
        values: Object.entries(value).map(([key, item]) => ({ key, value: toOtelValue(item) })),
      },
    };
  }
  return { stringValue: String(value) };
}

export class OpenTelemetrySink implements LogSink {
  public name = "opentelemetry";
  private endpoint: string;
  private serviceName: string;
  private serviceVersion?: string;
  private environment?: string;
  private headers: Record<string, string>;
  private dispatcher: BatchDispatcher<LogEntry>;

  constructor(options: OpenTelemetrySinkOptions = {}) {
    this.endpoint = options.endpoint ?? "http://localhost:4318/v1/logs";
    this.serviceName = options.serviceName ?? "aegislog-service";
    this.serviceVersion = options.serviceVersion;
    this.environment = options.environment;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.dispatcher = new BatchDispatcher({
      batchSize: options.batchSize ?? 50,
      flushIntervalMs: options.flushIntervalMs ?? 3000,
      deliver: (batch) => this.deliver(batch),
    });
  }

  public log(entry: LogEntry): void {
    this.dispatcher.enqueue(entry);
  }

  public logAudit(record: AuditRecord): void {
    this.dispatcher.enqueue({
      level: record.outcome === "failure" ? "error" : record.outcome === "denied" ? "warn" : "info",
      message: `[AUDIT] ${record.action} on ${record.resource.type}:${record.resource.id}`,
      timestamp: record.timestamp ?? new Date().toISOString(),
      context: {
        requestId: record.eventId ?? record.traceId ?? "audit",
        traceId: record.traceId,
        actor: record.actor,
        tenant: record.tenant,
        session: record.session,
      },
      meta: { audit: record },
    });
  }

  public async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  private async deliver(batch: LogEntry[]): Promise<void> {
    const resourceAttributes: Array<{ key: string; value: { stringValue: string } }> = [
      { key: "service.name", value: { stringValue: this.serviceName } },
    ];
    if (this.serviceVersion) {
      resourceAttributes.push({
        key: "service.version",
        value: { stringValue: this.serviceVersion },
      });
    }
    if (this.environment) {
      resourceAttributes.push({
        key: "deployment.environment",
        value: { stringValue: this.environment },
      });
    }

    const logRecords = batch.map((entry) => {
      const attributes: Array<{ key: string; value: OtelAnyValue }> = [];

      if (entry.namespace) {
        attributes.push({ key: "logger.namespace", value: { stringValue: entry.namespace } });
      }
      if (entry.context?.requestId) {
        attributes.push({
          key: "http.request_id",
          value: { stringValue: entry.context.requestId },
        });
      }
      if (entry.context?.actor) {
        attributes.push({ key: "user", value: toOtelValue(entry.context.actor) });
      }
      if (entry.context?.tenant) {
        attributes.push({ key: "tenant", value: toOtelValue(entry.context.tenant) });
      }
      if (entry.context?.session) {
        attributes.push({ key: "session", value: toOtelValue(entry.context.session) });
      }
      if (entry.context?.tags) {
        attributes.push({ key: "tags", value: toOtelValue(entry.context.tags) });
      }
      if (entry.meta) {
        attributes.push({ key: "meta", value: toOtelValue(entry.meta) });
      }
      if (entry.error) {
        attributes.push({ key: "error", value: toOtelValue(entry.error) });
      }

      const timestampMs = new Date(entry.timestamp).getTime();
      const nanoTime = `${Number.isFinite(timestampMs) ? timestampMs : Date.now()}000000`;

      return {
        timeUnixNano: nanoTime,
        observedTimeUnixNano: nanoTime,
        severityNumber: OTEL_SEVERITY_NUMBERS[entry.level] || 9,
        severityText: entry.level.toUpperCase(),
        body: { stringValue: entry.message },
        traceId: entry.context?.traceId,
        spanId: entry.context?.spanId,
        attributes,
      };
    });

    const otelPayload = {
      resourceLogs: [
        {
          resource: { attributes: resourceAttributes },
          scopeLogs: [
            {
              scope: { name: "aegislog" },
              logRecords,
            },
          ],
        },
      ],
    };

    if (typeof fetch === "undefined") {
      throw new Error("opentelemetry: fetch is not available in this runtime");
    }
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(otelPayload),
    });
    if (!response.ok) {
      throw new Error(`opentelemetry: HTTP ${response.status} ${response.statusText}`);
    }
  }
}
