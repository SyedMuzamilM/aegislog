# OpenTelemetry & Cloud Transports 📡

The `@aegislog/transports` package provides native OpenTelemetry OTLP `/v1/logs` HTTP ingestion and high-throughput batching sinks for services like **Datadog**, **Grafana Loki**, **Axiom**, and **Honeycomb**.

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
  apiToken: process.env.AXIOM_TOKEN!,
  dataset: "production-logs",
});

const logger = createLogger({
  sinks: [axiomSink],
});
```
