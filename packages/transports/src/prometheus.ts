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

export class PrometheusMetricsSink implements LogSink {
  public name: string;
  public readonly contentType = "text/plain; version=0.0.4; charset=utf-8";

  private prefix: string;
  private defaultLabels: Record<string, string>;
  private includeAiMetrics: boolean;
  private includeAuditMetrics: boolean;

  private logCounts = new Map<string, number>();
  private errorCounts = new Map<string, number>();
  private auditCounts = new Map<string, number>();
  private aiRequestCounts = new Map<string, number>();
  private aiTokenCounts = new Map<string, number>();
  private aiCostTotals = new Map<string, number>();
  private aiLatencies = new Map<string, LatencySummary>();

  constructor(options: PrometheusMetricsSinkOptions = {}) {
    this.name = options.name ?? "prometheus";
    this.prefix = options.prefix ?? "aegislog_";
    this.defaultLabels = options.defaultLabels ?? {};
    this.includeAiMetrics = options.includeAiMetrics ?? true;
    this.includeAuditMetrics = options.includeAuditMetrics ?? true;
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
  }
}
