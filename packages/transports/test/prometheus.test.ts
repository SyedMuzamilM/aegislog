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

  it("records HTTP request latency and waterfall phase histograms", () => {
    const metricsSink = new PrometheusMetricsSink();

    metricsSink.recordHttpRequest({
      method: "GET",
      route: "/api/v1/users",
      status: 200,
      durationMs: 45,
    });

    metricsSink.recordHttpPhase({
      phase: "db_query",
      route: "/api/v1/users",
      durationMs: 15,
    });

    const output = metricsSink.getMetrics();
    expect(output).toContain(
      "# HELP aegislog_http_requests_total Total number of HTTP requests completed",
    );
    expect(output).toContain("# TYPE aegislog_http_requests_total counter");
    expect(output).toContain(
      'aegislog_http_requests_total{method="GET",route="/api/v1/users",status="200"} 1',
    );

    expect(output).toContain(
      "# HELP aegislog_http_request_duration_seconds HTTP request latency waterfall in seconds",
    );
    expect(output).toContain("# TYPE aegislog_http_request_duration_seconds histogram");
    expect(output).toContain(
      'aegislog_http_request_duration_seconds_bucket{le="0.05",method="GET",route="/api/v1/users",status="200"} 1',
    );
    expect(output).toContain(
      'aegislog_http_request_duration_seconds_bucket{le="+Inf",method="GET",route="/api/v1/users",status="200"} 1',
    );
    expect(output).toContain(
      'aegislog_http_request_duration_seconds_count{method="GET",route="/api/v1/users",status="200"} 1',
    );

    expect(output).toContain(
      "# HELP aegislog_http_phase_duration_seconds HTTP waterfall sub-phase latency in seconds",
    );
    expect(output).toContain("# TYPE aegislog_http_phase_duration_seconds histogram");
    expect(output).toContain(
      'aegislog_http_phase_duration_seconds_bucket{le="0.025",phase="db_query",route="/api/v1/users"} 1',
    );
  });

  it("automatically detects HTTP request and phase metadata from log entries", () => {
    const metricsSink = new PrometheusMetricsSink();
    const logger = createLogger({ sinks: [metricsSink] });

    logger.info("<-- POST /api/v1/checkout 201 in 120ms", {
      status: 201,
      durationMs: 120,
      method: "POST",
      route: "/api/v1/checkout",
      phases: {
        auth_check: 10,
        db: 65,
        payment_gateway: 40,
      },
    });

    const output = metricsSink.getMetrics();
    expect(output).toContain(
      'aegislog_http_requests_total{method="POST",route="/api/v1/checkout",status="201"} 1',
    );
    expect(output).toContain(
      'aegislog_http_phase_duration_seconds_bucket{le="0.01",phase="auth_check",route="/api/v1/checkout"} 1',
    );
    expect(output).toContain(
      'aegislog_http_phase_duration_seconds_bucket{le="0.1",phase="db",route="/api/v1/checkout"} 1',
    );
    expect(output).toContain(
      'aegislog_http_phase_duration_seconds_bucket{le="0.05",phase="payment_gateway",route="/api/v1/checkout"} 1',
    );
  });
});
