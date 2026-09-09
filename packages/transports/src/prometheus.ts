import type { AuditRecord, LogEntry, LogSink } from "aegislog";

export interface PrometheusMetricsSinkOptions {
  /**
   * Custom sink name (default: "prometheus")
   */
  name?: string;

  /**
   * Metric name prefix (default: "aegislog_")
   */
  prefix?: string;

  /**
   * Default labels attached to all emitted metrics
   */
  defaultLabels?: Record<string, string>;

  /**
   * Whether to track AI / LLM metrics from entry.meta.ai (default: true)
   */
  includeAiMetrics?: boolean;

  /**
   * Whether to track compliance audit record metrics (default: true)
   */
  includeAuditMetrics?: boolean;

  /**
   * Whether to track HTTP request metrics and waterfall phase durations (default: true)
   */
  includeHttpMetrics?: boolean;

  /**
   * Buckets for http_request_duration_seconds histogram in seconds.
   * Default: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
   */
  httpDurationBuckets?: number[];

  /**
   * Buckets for http_phase_duration_seconds histogram in seconds.
   * Default: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
   */
  httpPhaseBuckets?: number[];
}

function sanitizeIdentifier(str: string): string {
  const sanitized = str.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function escapeLabelValue(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatLabelString(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const parts = keys.map((k) => `${sanitizeIdentifier(k)}="${escapeLabelValue(labels[k] ?? "")}"`);
  return `{${parts.join(",")}}`;
}

interface LatencySummary {
  sum: number;
  count: number;
}

interface HistogramData {
  labels: Record<string, string>;
  buckets: number[];
  counts: number[];
  infCount: number;
  sum: number;
  count: number;
}

const DEFAULT_HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DEFAULT_HTTP_PHASE_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2];

function observeHistogram(data: HistogramData, valSec: number): void {
  for (let i = 0; i < data.buckets.length; i++) {
    if (valSec <= data.buckets[i]!) {
      data.counts[i] = (data.counts[i] ?? 0) + 1;
    }
  }
  data.infCount += 1;
  data.sum += valSec;
  data.count += 1;
}

export class PrometheusMetricsSink implements LogSink {
  public name: string;
  public readonly contentType = "text/plain; version=0.0.4; charset=utf-8";

  private prefix: string;
  private defaultLabels: Record<string, string>;
  private includeAiMetrics: boolean;
  private includeAuditMetrics: boolean;
  private includeHttpMetrics: boolean;
  private httpDurationBuckets: number[];
  private httpPhaseBuckets: number[];

  private logCounts = new Map<string, number>();
  private errorCounts = new Map<string, number>();
  private auditCounts = new Map<string, number>();
  private aiRequestCounts = new Map<string, number>();
  private aiTokenCounts = new Map<string, number>();
  private aiCostTotals = new Map<string, number>();
  private aiLatencies = new Map<string, LatencySummary>();

  private httpRequestsTotal = new Map<string, number>();
  private httpRequestDurations = new Map<string, HistogramData>();
  private httpPhaseDurations = new Map<string, HistogramData>();

  constructor(options: PrometheusMetricsSinkOptions = {}) {
    this.name = options.name ?? "prometheus";
    this.prefix = options.prefix ?? "aegislog_";
    this.defaultLabels = options.defaultLabels ?? {};
    this.includeAiMetrics = options.includeAiMetrics ?? true;
    this.includeAuditMetrics = options.includeAuditMetrics ?? true;
    this.includeHttpMetrics = options.includeHttpMetrics ?? true;
    this.httpDurationBuckets = (options.httpDurationBuckets ?? DEFAULT_HTTP_DURATION_BUCKETS).slice().sort((a, b) => a - b);
    this.httpPhaseBuckets = (options.httpPhaseBuckets ?? DEFAULT_HTTP_PHASE_BUCKETS).slice().sort((a, b) => a - b);
  }

  public recordHttpRequest(params: {
    method: string;
    status: number;
    durationMs: number;
    route?: string;
    labels?: Record<string, string>;
  }): void {
    if (!this.includeHttpMetrics) return;

    const baseLabels: Record<string, string> = {
      ...this.defaultLabels,
      ...params.labels,
      method: sanitizeIdentifier(params.method.toUpperCase()),
      status: String(params.status),
      route: params.route || "unknown",
    };

    const key = formatLabelString(baseLabels);
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) ?? 0) + 1);

    const durationSec = Math.max(0, params.durationMs / 1000);
    let hist = this.httpRequestDurations.get(key);
    if (!hist) {
      hist = {
        labels: baseLabels,
        buckets: this.httpDurationBuckets,
        counts: new Array(this.httpDurationBuckets.length).fill(0),
        infCount: 0,
        sum: 0,
        count: 0,
      };
      this.httpRequestDurations.set(key, hist);
    }
    observeHistogram(hist, durationSec);
  }

  public recordHttpPhase(params: {
    phase: string;
    durationMs: number;
    route?: string;
    labels?: Record<string, string>;
  }): void {
    if (!this.includeHttpMetrics) return;

    const baseLabels: Record<string, string> = {
      ...this.defaultLabels,
      ...params.labels,
      phase: sanitizeIdentifier(params.phase),
      route: params.route || "unknown",
    };

    const key = formatLabelString(baseLabels);
    const durationSec = Math.max(0, params.durationMs / 1000);
    let hist = this.httpPhaseDurations.get(key);
    if (!hist) {
      hist = {
        labels: baseLabels,
        buckets: this.httpPhaseBuckets,
        counts: new Array(this.httpPhaseBuckets.length).fill(0),
        infCount: 0,
        sum: 0,
        count: 0,
      };
      this.httpPhaseDurations.set(key, hist);
    }
    observeHistogram(hist, durationSec);
  }

  public log(entry: LogEntry): void {
    const baseLabels: Record<string, string> = {
      ...this.defaultLabels,
      level: entry.level,
    };
    if (entry.namespace) {
      baseLabels.namespace = sanitizeIdentifier(entry.namespace);
    }

    const logKey = formatLabelString(baseLabels);
    this.logCounts.set(logKey, (this.logCounts.get(logKey) ?? 0) + 1);

    if (entry.error || entry.level === "error" || entry.level === "fatal") {
      const errLabels: Record<string, string> = {
        ...this.defaultLabels,
        error_name: entry.error?.name ? sanitizeIdentifier(entry.error.name) : "Error",
      };
      if (entry.namespace) {
        errLabels.namespace = sanitizeIdentifier(entry.namespace);
      }
      const errKey = formatLabelString(errLabels);
      this.errorCounts.set(errKey, (this.errorCounts.get(errKey) ?? 0) + 1);
    }

    // Auto-detect HTTP request log and populate HTTP duration & phase histograms
    if (this.includeHttpMetrics && entry.meta && typeof entry.meta === "object") {
      const meta = entry.meta as Record<string, any>;
      const hasDuration = typeof meta.durationMs === "number";
      const hasStatus = typeof meta.status === "number" || typeof meta.statusCode === "number";

      if (hasDuration && hasStatus) {
        const status = (meta.status ?? meta.statusCode) as number;
        const method = (meta.method as string) || entry.message.match(/<--\s+([A-Z]+)/)?.[1] || "GET";
        const route = (meta.route as string) || (meta.path as string) || (meta.url as string) || "unknown";

        this.recordHttpRequest({
          method,
          status,
          route,
          durationMs: meta.durationMs as number,
        });

        if (meta.phases && typeof meta.phases === "object") {
          for (const [phase, dur] of Object.entries(meta.phases)) {
            if (typeof dur === "number") {
              this.recordHttpPhase({
                phase,
                route,
                durationMs: dur,
              });
            }
          }
        }
      }
    }

    if (this.includeAiMetrics && entry.meta?.ai && typeof entry.meta.ai === "object") {
      const aiData = entry.meta.ai as {
        provider?: string;
        model?: string;
        tokens?: { prompt?: number; completion?: number; total?: number };
        estimatedCostUsd?: number;
        latencyMs?: number;
      };

      const aiLabels: Record<string, string> = {
        ...this.defaultLabels,
        model: sanitizeIdentifier(aiData.model ?? "unknown"),
        provider: sanitizeIdentifier(aiData.provider ?? "unknown"),
      };

      const aiReqKey = formatLabelString(aiLabels);
      this.aiRequestCounts.set(aiReqKey, (this.aiRequestCounts.get(aiReqKey) ?? 0) + 1);

      if (aiData.tokens) {
        if (typeof aiData.tokens.prompt === "number") {
          const key = formatLabelString({ ...aiLabels, type: "prompt" });
          this.aiTokenCounts.set(key, (this.aiTokenCounts.get(key) ?? 0) + aiData.tokens.prompt);
        }
        if (typeof aiData.tokens.completion === "number") {
          const key = formatLabelString({ ...aiLabels, type: "completion" });
          this.aiTokenCounts.set(
            key,
            (this.aiTokenCounts.get(key) ?? 0) + aiData.tokens.completion,
          );
        }
        if (typeof aiData.tokens.total === "number") {
          const key = formatLabelString({ ...aiLabels, type: "total" });
          this.aiTokenCounts.set(key, (this.aiTokenCounts.get(key) ?? 0) + aiData.tokens.total);
        }
      }

      if (typeof aiData.estimatedCostUsd === "number") {
        const costKey = formatLabelString(aiLabels);
        this.aiCostTotals.set(
          costKey,
          (this.aiCostTotals.get(costKey) ?? 0) + aiData.estimatedCostUsd,
        );
      }

      if (typeof aiData.latencyMs === "number") {
        const latKey = formatLabelString(aiLabels);
        const current = this.aiLatencies.get(latKey) ?? { sum: 0, count: 0 };
        current.sum += aiData.latencyMs / 1000;
        current.count += 1;
        this.aiLatencies.set(latKey, current);
      }
    }
  }

  public logAudit(record: AuditRecord): void {
    if (!this.includeAuditMetrics) return;

    const auditLabels: Record<string, string> = {
      ...this.defaultLabels,
      action: sanitizeIdentifier(record.action),
      outcome: record.outcome ?? "success",
    };

    const auditKey = formatLabelString(auditLabels);
    this.auditCounts.set(auditKey, (this.auditCounts.get(auditKey) ?? 0) + 1);
  }

  public getMetrics(): string {
    const lines: string[] = [];

    if (this.logCounts.size > 0) {
      lines.push(`# HELP ${this.prefix}logs_total Total number of log entries recorded`);
      lines.push(`# TYPE ${this.prefix}logs_total counter`);
      for (const [labels, count] of this.logCounts.entries()) {
        lines.push(`${this.prefix}logs_total${labels} ${count}`);
      }
    }

    if (this.errorCounts.size > 0) {
      lines.push(`# HELP ${this.prefix}errors_total Total number of error log entries`);
      lines.push(`# TYPE ${this.prefix}errors_total counter`);
      for (const [labels, count] of this.errorCounts.entries()) {
        lines.push(`${this.prefix}errors_total${labels} ${count}`);
      }
    }

    if (this.auditCounts.size > 0) {
      lines.push(`# HELP ${this.prefix}audit_records_total Total compliance audit records`);
      lines.push(`# TYPE ${this.prefix}audit_records_total counter`);
      for (const [labels, count] of this.auditCounts.entries()) {
        lines.push(`${this.prefix}audit_records_total${labels} ${count}`);
      }
    }

    if (this.httpRequestsTotal.size > 0) {
      lines.push(
        `# HELP ${this.prefix}http_requests_total Total number of HTTP requests completed`,
      );
      lines.push(`# TYPE ${this.prefix}http_requests_total counter`);
      for (const [labels, count] of this.httpRequestsTotal.entries()) {
        lines.push(`${this.prefix}http_requests_total${labels} ${count}`);
      }
    }

    if (this.httpRequestDurations.size > 0) {
      lines.push(
        `# HELP ${this.prefix}http_request_duration_seconds HTTP request latency waterfall in seconds`,
      );
      lines.push(`# TYPE ${this.prefix}http_request_duration_seconds histogram`);
      for (const hist of this.httpRequestDurations.values()) {
        for (let i = 0; i < hist.buckets.length; i++) {
          const le = hist.buckets[i]!;
          const bucketLabels = formatLabelString({ ...hist.labels, le: String(le) });
          lines.push(`${this.prefix}http_request_duration_seconds_bucket${bucketLabels} ${hist.counts[i]}`);
        }
        const infLabels = formatLabelString({ ...hist.labels, le: "+Inf" });
        lines.push(`${this.prefix}http_request_duration_seconds_bucket${infLabels} ${hist.infCount}`);
        const baseLabels = formatLabelString(hist.labels);
        lines.push(`${this.prefix}http_request_duration_seconds_sum${baseLabels} ${Number(hist.sum.toFixed(6))}`);
        lines.push(`${this.prefix}http_request_duration_seconds_count${baseLabels} ${hist.count}`);
      }
    }

    if (this.httpPhaseDurations.size > 0) {
      lines.push(
        `# HELP ${this.prefix}http_phase_duration_seconds HTTP waterfall sub-phase latency in seconds`,
      );
      lines.push(`# TYPE ${this.prefix}http_phase_duration_seconds histogram`);
      for (const hist of this.httpPhaseDurations.values()) {
        for (let i = 0; i < hist.buckets.length; i++) {
          const le = hist.buckets[i]!;
          const bucketLabels = formatLabelString({ ...hist.labels, le: String(le) });
          lines.push(`${this.prefix}http_phase_duration_seconds_bucket${bucketLabels} ${hist.counts[i]}`);
        }
        const infLabels = formatLabelString({ ...hist.labels, le: "+Inf" });
        lines.push(`${this.prefix}http_phase_duration_seconds_bucket${infLabels} ${hist.infCount}`);
        const baseLabels = formatLabelString(hist.labels);
        lines.push(`${this.prefix}http_phase_duration_seconds_sum${baseLabels} ${Number(hist.sum.toFixed(6))}`);
        lines.push(`${this.prefix}http_phase_duration_seconds_count${baseLabels} ${hist.count}`);
      }
    }

    if (this.aiRequestCounts.size > 0) {
      lines.push(
        `# HELP ${this.prefix}ai_requests_total Total number of AI model tracking requests`,
      );
      lines.push(`# TYPE ${this.prefix}ai_requests_total counter`);
      for (const [labels, count] of this.aiRequestCounts.entries()) {
        lines.push(`${this.prefix}ai_requests_total${labels} ${count}`);
      }
    }

    if (this.aiTokenCounts.size > 0) {
      lines.push(`# HELP ${this.prefix}ai_tokens_total Total tokens consumed in AI tracking calls`);
      lines.push(`# TYPE ${this.prefix}ai_tokens_total counter`);
      for (const [labels, count] of this.aiTokenCounts.entries()) {
        lines.push(`${this.prefix}ai_tokens_total${labels} ${count}`);
      }
    }

    if (this.aiCostTotals.size > 0) {
      lines.push(`# HELP ${this.prefix}ai_cost_usd_total Estimated total AI expenditure in USD`);
      lines.push(`# TYPE ${this.prefix}ai_cost_usd_total counter`);
      for (const [labels, cost] of this.aiCostTotals.entries()) {
        lines.push(`${this.prefix}ai_cost_usd_total${labels} ${cost}`);
      }
    }

    if (this.aiLatencies.size > 0) {
      lines.push(`# HELP ${this.prefix}ai_latency_seconds Total duration of AI calls in seconds`);
      lines.push(`# TYPE ${this.prefix}ai_latency_seconds summary`);
      for (const [labels, summary] of this.aiLatencies.entries()) {
        lines.push(
          `${this.prefix}ai_latency_seconds_sum${labels} ${Number(summary.sum.toFixed(6))}`,
        );
        lines.push(`${this.prefix}ai_latency_seconds_count${labels} ${summary.count}`);
      }
    }

    return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  }

  public reset(): void {
    this.logCounts.clear();
    this.errorCounts.clear();
    this.auditCounts.clear();
    this.aiRequestCounts.clear();
    this.aiTokenCounts.clear();
    this.aiCostTotals.clear();
    this.aiLatencies.clear();
    this.httpRequestsTotal.clear();
    this.httpRequestDurations.clear();
    this.httpPhaseDurations.clear();
  }
}
