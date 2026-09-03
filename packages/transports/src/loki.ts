import type { AuditRecord, LogEntry, LogLevel, LogSink } from "aegislog";
import { BatchDispatcher } from "./batch.js";

export interface LokiBatchSinkOptions {
  /**
   * Custom sink name (default: "loki")
   */
  name?: string;

  /**
   * Base host URL (e.g. "http://localhost:3100" or "https://logs-prod-us-central1.grafana.net")
   * or full push endpoint (e.g. "http://localhost:3100/loki/api/v1/push").
   * Default: "http://localhost:3100"
   */
  host?: string;

  /**
   * Alias for host/push URL
   */
  endpoint?: string;

  /**
   * Static stream labels attached to all log entries (e.g. { app: "billing", env: "production" }).
   * Default: { app: "aegislog" }
   */
  labels?: Record<string, string>;

  /**
   * Automatically include entry.level as a stream label (e.g. { level: "info" }).
   * Default: true
   */
  includeLevelLabel?: boolean;

  /**
   * Automatically include entry.namespace as a stream label (e.g. { namespace: "auth" }) if present.
   * Default: true
   */
  includeNamespaceLabel?: boolean;

  /**
   * Dynamic label extractor for extracting custom labels per log entry.
   * Note: In Loki, high-cardinality labels (like user IDs or UUIDs) should NOT be used as stream labels.
   * Keep stream labels low-cardinality (e.g. service, region, component, env).
   */
  dynamicLabels?: (entry: LogEntry) => Record<string, string | undefined>;

  /**
   * Tenant ID for Loki multi-tenancy (sets X-Scope-OrgID header).
   */
  tenantId?: string;

  /**
   * HTTP Basic Authentication (e.g. for Grafana Cloud or secured Loki instances).
   */
  basicAuth?: {
    username: string;
    password?: string;
  };

  /**
   * Bearer token authentication header (sets Authorization: Bearer <token>).
   */
  token?: string;

  /**
   * Custom HTTP headers.
   */
  headers?: Record<string, string>;

  /**
   * Max number of logs before triggering an immediate batch flush (default: 50).
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds (default: 2000 ms).
   */
  flushIntervalMs?: number;

  /**
   * Log line format: "json" | "raw" | "logfmt" (default: "json").
   */
  format?: "json" | "raw" | "logfmt";

  /**
   * Custom log line formatter. Overrides the `format` option.
   */
  formatLine?: (entry: LogEntry) => string;

  /**
   * Optional error callback invoked when batch push to Loki fails.
   */
  onError?: (error: Error, entries: (LogEntry | AuditRecord)[]) => void;
}

export interface LokiLogQueryOptions {
  /**
   * Raw LogQL query string (e.g. '{app="api"} |= "error"').
   * If omitted, a LogQL query is automatically synthesized from the provided filters.
   */
  query?: string;

  /**
   * Filter by log level
   */
  level?: LogLevel;

  /**
   * Filter by logger namespace
   */
  namespace?: string;

  /**
   * Filter by string content (translates to LogQL `|= "<search>"`)
   */
  search?: string;

  /**
   * Filter by actor ID in context
   */
  actorId?: string;

  /**
   * Filter by tenant ID in context
   */
  tenantId?: string;

  /**
   * Filter by requestId in context
   */
  requestId?: string;

  /**
   * Start timestamp (Date, ISO string, or epoch ms)
   */
  startDate?: string | Date | number;

  /**
   * End timestamp (Date, ISO string, or epoch ms)
   */
  endDate?: string | Date | number;

  /**
   * Maximum log entries to return (default: 50, max: 5000)
   */
  limit?: number;

  /**
   * Query direction: "backward" (newest first, default) or "forward" (oldest first)
   */
  direction?: "backward" | "forward";
}

export interface LokiLogEntry {
  timestamp: string;
  timestampNano: string;
  line: string;
  labels: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface LokiLogQueryResult {
  items: LokiLogEntry[];
  total: number;
}

interface QueuedItem {
  type: "log" | "audit";
  entry: LogEntry;
  rawAudit?: AuditRecord;
}

function sanitizeLabelKey(key: string): string {
  const sanitized = key.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function toLogfmt(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = sanitizeLabelKey(k);
    if (typeof v === "object") {
      parts.push(`${key}=${JSON.stringify(JSON.stringify(v))}`);
    } else if (typeof v === "string" && (v.includes(" ") || v.includes("=") || v.includes('"'))) {
      parts.push(`${key}=${JSON.stringify(v)}`);
    } else {
      parts.push(`${key}=${String(v)}`);
    }
  }
  return parts.join(" ");
}

export class LokiBatchSink implements LogSink {
  public name: string;
  private baseUrl: string;
  private pushUrl: string;
  private queryUrl: string;
  private defaultLabels: Record<string, string>;
  private includeLevelLabel: boolean;
  private includeNamespaceLabel: boolean;
  private dynamicLabels?: (entry: LogEntry) => Record<string, string | undefined>;
  private format: "json" | "raw" | "logfmt";
  private formatLine?: (entry: LogEntry) => string;
  private headers: Record<string, string>;
  private onError?: (error: Error, entries: (LogEntry | AuditRecord)[]) => void;
  private dispatcher: BatchDispatcher<QueuedItem>;

  constructor(options: LokiBatchSinkOptions = {}) {
    this.name = options.name ?? "loki";

    const rawHost = options.host ?? options.endpoint ?? "http://localhost:3100";
    const normalizedHost = rawHost.replace(/\/+$/, "");

    if (normalizedHost.endsWith("/loki/api/v1/push")) {
      this.pushUrl = normalizedHost;
      this.baseUrl = normalizedHost.slice(0, -"/loki/api/v1/push".length);
      this.queryUrl = `${this.baseUrl}/loki/api/v1/query_range`;
    } else if (normalizedHost.endsWith("/loki/api/v1")) {
      this.baseUrl = normalizedHost.slice(0, -"/loki/api/v1".length);
      this.pushUrl = `${this.baseUrl}/loki/api/v1/push`;
      this.queryUrl = `${this.baseUrl}/loki/api/v1/query_range`;
    } else {
      this.baseUrl = normalizedHost;
      this.pushUrl = `${normalizedHost}/loki/api/v1/push`;
      this.queryUrl = `${normalizedHost}/loki/api/v1/query_range`;
    }

    this.defaultLabels = {
      app: "aegislog",
      ...options.labels,
    };
    this.includeLevelLabel = options.includeLevelLabel ?? true;
    this.includeNamespaceLabel = options.includeNamespaceLabel ?? true;
    this.dynamicLabels = options.dynamicLabels;
    this.format = options.format ?? "json";
    this.formatLine = options.formatLine;
    this.onError = options.onError;

    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (options.tenantId) {
      this.headers["X-Scope-OrgID"] = options.tenantId;
    }

    if (options.basicAuth) {
      const creds = `${options.basicAuth.username}:${options.basicAuth.password ?? ""}`;
      const encoded =
        typeof Buffer !== "undefined" ? Buffer.from(creds).toString("base64") : btoa(creds);
      this.headers.Authorization = `Basic ${encoded}`;
    } else if (options.token) {
      this.headers.Authorization = `Bearer ${options.token}`;
    }

    this.dispatcher = new BatchDispatcher<QueuedItem>({
      batchSize: options.batchSize ?? 50,
      flushIntervalMs: options.flushIntervalMs ?? 2000,
      deliver: (items) => this.deliver(items),
    });
  }

  public log(entry: LogEntry): void {
    this.dispatcher.enqueue({ type: "log", entry });
  }

  public logAudit(record: AuditRecord): void {
    const auditEntry: LogEntry = {
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
      meta: {
        audit: record,
      },
    };

    this.dispatcher.enqueue({ type: "audit", entry: auditEntry, rawAudit: record });
  }

  public async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  public async close(): Promise<void> {
    await this.flush();
  }

  private buildLabels(item: QueuedItem): Record<string, string> {
    const labels: Record<string, string> = {};

    for (const [k, v] of Object.entries(this.defaultLabels)) {
      if (v !== undefined && v !== null) {
        labels[sanitizeLabelKey(k)] = String(v);
      }
    }

    if (this.includeLevelLabel) {
      labels.level = item.entry.level;
    }

    if (this.includeNamespaceLabel && item.entry.namespace) {
      labels.namespace = sanitizeLabelKey(item.entry.namespace);
    }

    if (item.type === "audit") {
      labels.type = "audit";
      if (item.rawAudit?.action) {
        labels.action = sanitizeLabelKey(item.rawAudit.action);
      }
      if (item.rawAudit?.outcome) {
        labels.outcome = sanitizeLabelKey(item.rawAudit.outcome);
      }
    }

    if (this.dynamicLabels) {
      const dynamic = this.dynamicLabels(item.entry);
      for (const [k, v] of Object.entries(dynamic)) {
        if (v !== undefined && v !== null) {
          labels[sanitizeLabelKey(k)] = String(v);
        }
      }
    }

    return labels;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.formatLine) {
      return this.formatLine(entry);
    }

    if (this.format === "raw") {
      return entry.message;
    }

    if (this.format === "logfmt") {
      return toLogfmt({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        namespace: entry.namespace,
        actor: entry.context?.actor?.id,
        tenant: entry.context?.tenant?.id,
        requestId: entry.context?.requestId,
        ...entry.meta,
        ...(entry.error ? { error: entry.error.message } : {}),
      });
    }

    // Default: structured JSON string
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.namespace ? { namespace: entry.namespace } : {}),
      ...(entry.context ? { context: entry.context } : {}),
      ...(entry.meta ? { meta: entry.meta } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    });
  }

  private async deliver(items: QueuedItem[]): Promise<void> {
    if (items.length === 0) return;

    // Group entries into streams by canonical sorted label set
    const streamsMap = new Map<
      string,
      { stream: Record<string, string>; values: Array<[string, string, bigint]> }
    >();

    let sequenceCounter = 0n;

    for (const item of items) {
      const labels = this.buildLabels(item);
      const canonicalKey = Object.keys(labels)
        .sort()
        .map((k) => `${k}=${labels[k]}`)
        .join(",");

      let streamEntry = streamsMap.get(canonicalKey);
      if (!streamEntry) {
        streamEntry = { stream: labels, values: [] };
        streamsMap.set(canonicalKey, streamEntry);
      }

      let epochMs = Date.parse(item.entry.timestamp);
      if (Number.isNaN(epochMs)) {
        epochMs = Date.now();
      }

      // Nanoseconds representation with monotonic offset to preserve chronological sequence
      const baseNs = BigInt(epochMs) * 1_000_000n;
      const nanoTs = baseNs + sequenceCounter;
      sequenceCounter += 1000n; // 1 microsecond increment per item in batch

      const line = this.formatEntry(item.entry);
      streamEntry.values.push([nanoTs.toString(), line, nanoTs]);
    }

    // Ensure values within each stream are strictly sorted in ascending chronological order
    const streams = Array.from(streamsMap.values()).map(({ stream, values }) => {
      values.sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
      return {
        stream,
        values: values.map(([ts, line]) => [ts, line] as [string, string]),
      };
    });

    const payload = { streams };

    if (typeof fetch === "undefined") {
      throw new Error("loki: fetch is not available in this runtime");
    }

    try {
      const response = await fetch(this.pushUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `loki: HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`,
        );
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      const originalEntries = items.map((i) =>
        i.type === "audit" && i.rawAudit ? i.rawAudit : i.entry,
      );
      this.onError?.(normalized, originalEntries);
      throw normalized;
    }
  }

  /**
   * Query historical logs directly from the connected Grafana Loki instance using LogQL.
   */
  public async query(options: LokiLogQueryOptions = {}): Promise<LokiLogQueryResult> {
    if (typeof fetch === "undefined") {
      throw new Error("loki: fetch is not available in this runtime");
    }

    let logQl = options.query;
    if (!logQl) {
      const selectorParts: string[] = [];
      for (const [k, v] of Object.entries(this.defaultLabels)) {
        selectorParts.push(`${sanitizeLabelKey(k)}="${v}"`);
      }
      if (options.level) {
        selectorParts.push(`level="${options.level}"`);
      }
      if (options.namespace) {
        selectorParts.push(`namespace="${sanitizeLabelKey(options.namespace)}"`);
      }

      logQl = `{${selectorParts.join(", ")}}`;

      if (options.search) {
        const escaped = JSON.stringify(options.search);
        logQl += ` |= ${escaped}`;
      }

      if (options.actorId) {
        const escaped = JSON.stringify(options.actorId);
        logQl += ` |= ${escaped}`;
      }

      if (options.tenantId) {
        const escaped = JSON.stringify(options.tenantId);
        logQl += ` |= ${escaped}`;
      }

      if (options.requestId) {
        const escaped = JSON.stringify(options.requestId);
        logQl += ` |= ${escaped}`;
      }
    }

    const url = new URL(this.queryUrl);
    url.searchParams.set("query", logQl);

    const limit = Math.max(1, Math.min(options.limit ?? 50, 5000));
    url.searchParams.set("limit", String(limit));

    const direction = (options.direction ?? "backward").toUpperCase();
    url.searchParams.set("direction", direction);

    if (options.startDate) {
      const startMs =
        options.startDate instanceof Date
          ? options.startDate.getTime()
          : typeof options.startDate === "number"
            ? options.startDate
            : Date.parse(options.startDate);
      if (!Number.isNaN(startMs)) {
        url.searchParams.set("start", `${BigInt(startMs) * 1_000_000n}`);
      }
    }

    if (options.endDate) {
      const endMs =
        options.endDate instanceof Date
          ? options.endDate.getTime()
          : typeof options.endDate === "number"
            ? options.endDate
            : Date.parse(options.endDate);
      if (!Number.isNaN(endMs)) {
        url.searchParams.set("end", `${BigInt(endMs) * 1_000_000n}`);
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `loki query: HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`,
      );
    }

    const body = (await response.json()) as {
      status?: string;
      data?: {
        resultType?: string;
        result?: Array<{
          stream: Record<string, string>;
          values: Array<[string, string]>;
        }>;
      };
    };

    const items: LokiLogEntry[] = [];
    const streamResults = body.data?.result ?? [];

    for (const res of streamResults) {
      const streamLabels = res.stream ?? {};
      for (const [nanoTs, rawLine] of res.values ?? []) {
        let parsedData: Record<string, unknown> | undefined;
        try {
          parsedData = JSON.parse(rawLine) as Record<string, unknown>;
        } catch {
          // not JSON, keep as raw line
        }

        let isoTimestamp = new Date().toISOString();
        try {
          const ms = Number(BigInt(nanoTs) / 1_000_000n);
          if (!Number.isNaN(ms)) {
            isoTimestamp = new Date(ms).toISOString();
          }
        } catch {
          // fallback to now
        }

        items.push({
          timestamp: isoTimestamp,
          timestampNano: nanoTs,
          line: rawLine,
          labels: streamLabels,
          data: parsedData,
        });
      }
    }

    // Sort items across streams
    items.sort((a, b) => {
      try {
        const bigA = BigInt(a.timestampNano);
        const bigB = BigInt(b.timestampNano);
        return direction === "FORWARD"
          ? bigA < bigB
            ? -1
            : bigA > bigB
              ? 1
              : 0
          : bigA > bigB
            ? -1
            : bigA < bigB
              ? 1
              : 0;
      } catch {
        return 0;
      }
    });

    return {
      items: items.slice(0, limit),
      total: items.length,
    };
  }
}

/**
 * Convenient alias for LokiBatchSink
 */
export { LokiBatchSink as GrafanaLokiSink };
