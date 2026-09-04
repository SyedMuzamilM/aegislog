# Prometheus & Grafana Mimir Metrics Transport 📈

The `@aegislog/transports` package provides `PrometheusMetricsSink`, a high-throughput, zero-dependency metrics collector and exposition generator for **Prometheus** and **Grafana Mimir**.

As logs and compliance events flow through AegisLog, `PrometheusMetricsSink` automatically aggregates log volume rates, error breakdowns, audit outcomes, and AI token/cost telemetry into standard Prometheus text exposition format (`text/plain; version=0.0.4`).

---

## 📦 Installation

```bash
pnpm add @aegislog/transports aegislog
```

---

## 🛠️ Basic Usage (Express Example)

```typescript
import express from "express";
import { createLogger } from "aegislog";
import { LokiBatchSink, PrometheusMetricsSink } from "@aegislog/transports";

const app = express();

// 1. Initialize PrometheusMetricsSink
const metricsSink = new PrometheusMetricsSink({
  prefix: "aegislog_",
  defaultLabels: { env: process.env.NODE_ENV ?? "production" },
  includeAiMetrics: true,
  includeAuditMetrics: true,
});

// 2. Attach to your AegisLog logger (alongside Loki, Dev Inspector, or Console)
const logger = createLogger({
  namespace: "shop:api",
  sinks: [
    new LokiBatchSink({ host: "http://localhost:3100" }), // Logs -> Loki
    metricsSink, // Metrics -> Prometheus
  ],
});

logger.info("Order processed", { orderId: "ord_101" });
logger.error("Database connection lost", { error: new Error("ECONNREFUSED") });

// 3. Expose standard /metrics endpoint for Prometheus scraping
app.get("/metrics", (_req, res) => {
  res.type(metricsSink.contentType).send(metricsSink.getMetrics());
});

app.listen(3000);
```

---

## ⚡ Framework Integration (Fastify & Hono)

### Fastify

```typescript
import fastify from "fastify";
import { PrometheusMetricsSink } from "@aegislog/transports";

const app = fastify();
const metricsSink = new PrometheusMetricsSink();

app.get("/metrics", async (_req, reply) => {
  return reply.type(metricsSink.contentType).send(metricsSink.getMetrics());
});
```

### Hono

```typescript
import { Hono } from "hono";
import { PrometheusMetricsSink } from "@aegislog/transports";

const app = new Hono();
const metricsSink = new PrometheusMetricsSink();

app.get("/metrics", (c) => {
  return c.text(metricsSink.getMetrics(), 200, {
    "Content-Type": metricsSink.contentType,
  });
});
```

---

## 📊 Emitted Metrics Catalog

`PrometheusMetricsSink` automatically produces the following metrics:

| Metric Name                    | Type    | Labels                      | Description                                                                           |
| :----------------------------- | :------ | :-------------------------- | :------------------------------------------------------------------------------------ |
| `aegislog_logs_total`          | Counter | `level`, `namespace`        | Total count of logs emitted per severity and namespace                                |
| `aegislog_errors_total`        | Counter | `error_name`, `namespace`   | Total count of error/fatal logs by error constructor name                             |
| `aegislog_audit_records_total` | Counter | `action`, `outcome`         | Total compliance audit records by action and outcome (`success`, `failure`, `denied`) |
| `aegislog_ai_requests_total`   | Counter | `provider`, `model`         | Total number of AI completions tracked via `ai.track()`                               |
| `aegislog_ai_tokens_total`     | Counter | `provider`, `model`, `type` | Total tokens consumed broken down by `type` (`prompt`, `completion`, `total`)         |
| `aegislog_ai_cost_usd_total`   | Counter | `provider`, `model`         | Estimated cumulative dollar expenditure for AI model calls                            |
| `aegislog_ai_latency_seconds`  | Summary | `provider`, `model`         | Duration of AI model completions with `_sum` and `_count`                             |

### Sample Output Format

```text
# HELP aegislog_logs_total Total number of log entries recorded
# TYPE aegislog_logs_total counter
aegislog_logs_total{env="production",level="info",namespace="shop_api"} 142
aegislog_logs_total{env="production",level="error",namespace="shop_api"} 3

# HELP aegislog_errors_total Total number of error log entries
# TYPE aegislog_errors_total counter
aegislog_errors_total{env="production",error_name="Error",namespace="shop_api"} 3

# HELP aegislog_audit_records_total Total compliance audit records
# TYPE aegislog_audit_records_total counter
aegislog_audit_records_total{action="billing_payment",env="production",outcome="success"} 89

# HELP aegislog_ai_tokens_total Total tokens consumed in AI tracking calls
# TYPE aegislog_ai_tokens_total counter
aegislog_ai_tokens_total{env="production",model="gpt_4o",provider="openai",type="total"} 14200

# HELP aegislog_ai_cost_usd_total Estimated total AI expenditure in USD
# TYPE aegislog_ai_cost_usd_total counter
aegislog_ai_cost_usd_total{env="production",model="gpt_4o",provider="openai"} 0.035500
```

---

## 🎯 PromQL Queries for Grafana Dashboards

Here are ready-to-use PromQL queries for your Grafana panels:

### 1. Error Rate per Minute

```promql
sum(rate(aegislog_logs_total{level="error"}[1m])) * 60
```

### 2. Total Log Volume Rate by Level

```promql
sum by (level) (rate(aegislog_logs_total[5m]))
```

### 3. AI Token Consumption per Minute

```promql
sum by (model) (rate(aegislog_ai_tokens_total{type="total"}[5m])) * 60
```

### 4. Hourly AI Cost in USD

```promql
sum by (provider, model) (increase(aegislog_ai_cost_usd_total[1h]))
```

### 5. Audit Authorization Denial Rate

```promql
sum(rate(aegislog_audit_records_total{outcome="denied"}[5m]))
```

---

## ⚙️ Configuration Options

```typescript
const metricsSink = new PrometheusMetricsSink({
  // Custom sink identifier (default: "prometheus")
  name: "custom-prom",

  // Metric prefix (default: "aegislog_")
  prefix: "myapp_",

  // Labels applied to every single metric
  defaultLabels: {
    service: "billing-api",
    cluster: "us-east-1",
  },

  // Toggle AI metric tracking from entry.meta.ai (default: true)
  includeAiMetrics: true,

  // Toggle audit record tracking (default: true)
  includeAuditMetrics: true,
});

// Programmatic reset (useful in tests)
metricsSink.reset();
```
