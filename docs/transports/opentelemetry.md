# OpenTelemetry & Cloud Transports 📡

The `@aegislog/transports` package provides native OpenTelemetry OTLP `/v1/logs` HTTP ingestion and high-throughput batching sinks for services like **Datadog**, **Grafana Loki**, **Axiom**, and **Honeycomb**.

> [!NOTE]
> For direct HTTP push to Grafana Loki with automatic stream labels and LogQL queries, see the dedicated [Grafana & Grafana Loki Guide](./grafana-loki.md).

---

## 📦 Installation

```bash
pnpm add @aegislog/transports aegislog
```

---

## 🛠️ OpenTelemetry OTLP Sink

Stream structured logs directly into any OTLP collector:

```typescript
import { OpenTelemetrySink } from "@aegislog/transports";
import { createLogger } from "aegislog";

const otelSink = new OpenTelemetrySink({
  endpoint: "https://otlp.datadoghq.com/v1/logs", // Or http://localhost:4318/v1/logs
  headers: {
    "dd-api-key": process.env.DATADOG_API_KEY!,
  },
  serviceName: "billing-service",
  serviceVersion: "1.4.0",
  batchSize: 50,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [otelSink],
});

logger.info("Service initialized and streaming to OTLP collector");
```

---

## ⚡ Axiom & Batched HTTP Sinks

```typescript
import { AxiomSink, HttpBatchSink } from "@aegislog/transports";
import { createLogger } from "aegislog";

const axiomSink = new AxiomSink({
  token: process.env.AXIOM_TOKEN!,
  dataset: "production-logs",
});

const logger = createLogger({
  sinks: [axiomSink],
});
```

## Request traces

`OpenTelemetrySink` exports OTLP logs to `/v1/logs`. It does not instrument database clients or export spans. Use [`@aegislog/profiling`](../../packages/profiling/README.md) for request waterfalls and actual OTLP traces at `/v1/traces`. Both can use the same collector with separate ingest URLs.
