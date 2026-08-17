import type { LogEntry, LogSink, LogLevel } from "aegislog";

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

export class OpenTelemetrySink implements LogSink {
  public name = "opentelemetry";
  private endpoint: string;
  private serviceName: string;
  private serviceVersion?: string;
  private environment?: string;
  private headers: Record<string, string>;
  private batchSize: number;
  private flushIntervalMs: number;
  private queue: LogEntry[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(options: OpenTelemetrySinkOptions = {}) {
    this.endpoint = options.endpoint ?? "http://localhost:4318/v1/logs";
    this.serviceName = options.serviceName ?? "aegislog-service";
    this.serviceVersion = options.serviceVersion;
    this.environment = options.environment;
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 3000;
  }

  public log(entry: LogEntry): void {
    this.queue.push(entry);

    if (this.queue.length >= this.batchSize) {
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

    if (this.queue.length === 0) {
      return;
    }

    const batch = [...this.queue];
    this.queue = [];

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
      const attributes: Array<{ key: string; value: { stringValue?: string; intValue?: number } }> =
        [];

      if (entry.namespace) {
        attributes.push({ key: "logger.namespace", value: { stringValue: entry.namespace } });
      }
      if (entry.context?.actor?.id) {
        attributes.push({ key: "user.id", value: { stringValue: entry.context.actor.id } });
      }
      if (entry.context?.tenant?.id) {
        attributes.push({ key: "tenant.id", value: { stringValue: entry.context.tenant.id } });
      }
      if (entry.context?.requestId) {
        attributes.push({
          key: "http.request_id",
          value: { stringValue: entry.context.requestId },
        });
      }

      const nanoTime = `${new Date(entry.timestamp).getTime()}000000`;

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

    try {
      if (typeof fetch !== "undefined") {
        await fetch(this.endpoint, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(otelPayload),
        });
      }
    } catch {
      // Gracefully swallow network failures in log transport to never crash application
    }
  }
}
