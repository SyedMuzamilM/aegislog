import { describe, expect, it } from "vitest";
import { createLogger } from "aegislog";
import { PrometheusMetricsSink } from "../src/prometheus.js";

describe("PrometheusMetricsSink (Grafana Metrics)", () => {
  it("tracks log entries and generates Prometheus text format with correct HELP, TYPE, and labels", () => {
    const metricsSink = new PrometheusMetricsSink();
    const logger = createLogger({
      namespace: "api:shop",
      sinks: [metricsSink],
    });

    logger.info("Order placed");
    logger.info("Invoice sent");
    logger.warn("Low inventory");
    logger.error("Database connection lost", { error: new Error("ECONNREFUSED") });

    const output = metricsSink.getMetrics();

    expect(metricsSink.contentType).toContain("text/plain");
    expect(output).toContain("# HELP aegislog_logs_total Total number of log entries recorded");
    expect(output).toContain("# TYPE aegislog_logs_total counter");
    expect(output).toContain('aegislog_logs_total{level="info",namespace="api_shop"} 2');
    expect(output).toContain('aegislog_logs_total{level="warn",namespace="api_shop"} 1');
    expect(output).toContain('aegislog_logs_total{level="error",namespace="api_shop"} 1');

    // Error breakdown
    expect(output).toContain("# HELP aegislog_errors_total Total number of error log entries");
    expect(output).toContain("# TYPE aegislog_errors_total counter");
    expect(output).toContain('aegislog_errors_total{error_name="Error",namespace="api_shop"} 1');
  });

  it("tracks audit compliance records with action and outcome labels", async () => {
    const metricsSink = new PrometheusMetricsSink();
    const logger = createLogger({ sinks: [metricsSink] });

    await logger.audit.record({
      action: "user.role_promoted",
      resource: { type: "user", id: "usr_1" },
      outcome: "success",
    });

    await logger.audit.record({
      action: "user.role_promoted",
      resource: { type: "user", id: "usr_2" },
      outcome: "denied",
    });

    const output = metricsSink.getMetrics();
    expect(output).toContain("# HELP aegislog_audit_records_total Total compliance audit records");
    expect(output).toContain("# TYPE aegislog_audit_records_total counter");
    expect(output).toContain(
      'aegislog_audit_records_total{action="user_role_promoted",outcome="success"} 1',
    );
    expect(output).toContain(
      'aegislog_audit_records_total{action="user_role_promoted",outcome="denied"} 1',
    );
  });

  it("tracks AI observability metrics (tokens, cost, latency)", () => {
    const metricsSink = new PrometheusMetricsSink();
    const logger = createLogger({ sinks: [metricsSink] });

    logger.info("AI call completed", {
      ai: {
        provider: "openai",
        model: "gpt-4o",
        tokens: {
          prompt: 150,
          completion: 50,
          total: 200,
        },
        estimatedCostUsd: 0.00125,
        latencyMs: 350,
      },
    });

    const output = metricsSink.getMetrics();

    expect(output).toContain(
      "# HELP aegislog_ai_requests_total Total number of AI model tracking requests",
    );
    expect(output).toContain('aegislog_ai_requests_total{model="gpt_4o",provider="openai"} 1');

    expect(output).toContain(
      "# HELP aegislog_ai_tokens_total Total tokens consumed in AI tracking calls",
    );
    expect(output).toContain(
      'aegislog_ai_tokens_total{model="gpt_4o",provider="openai",type="prompt"} 150',
    );
    expect(output).toContain(
      'aegislog_ai_tokens_total{model="gpt_4o",provider="openai",type="completion"} 50',
    );
    expect(output).toContain(
      'aegislog_ai_tokens_total{model="gpt_4o",provider="openai",type="total"} 200',
    );

    expect(output).toContain(
      "# HELP aegislog_ai_cost_usd_total Estimated total AI expenditure in USD",
    );
    expect(output).toContain(
      'aegislog_ai_cost_usd_total{model="gpt_4o",provider="openai"} 0.00125',
    );

    expect(output).toContain(
      "# HELP aegislog_ai_latency_seconds Total duration of AI calls in seconds",
    );
    expect(output).toContain(
      'aegislog_ai_latency_seconds_sum{model="gpt_4o",provider="openai"} 0.35',
    );
    expect(output).toContain(
      'aegislog_ai_latency_seconds_count{model="gpt_4o",provider="openai"} 1',
    );
  });

  it("supports custom prefix, default labels, and reset", () => {
    const metricsSink = new PrometheusMetricsSink({
      prefix: "shop_",
      defaultLabels: { cluster: "us-east-1" },
    });

    const logger = createLogger({ sinks: [metricsSink] });
    logger.info("Server started");

    let output = metricsSink.getMetrics();
    expect(output).toContain('shop_logs_total{cluster="us-east-1",level="info"} 1');

    metricsSink.reset();
    output = metricsSink.getMetrics();
    expect(output).not.toContain("shop_logs_total");
  });
});
