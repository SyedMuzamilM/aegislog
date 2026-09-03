# @aegislog/transports 📡

Production transports and ingestion sinks for [AegisLog](https://github.com/syedmuzamilm/aegislog).

- 📊 **`LokiBatchSink` / `GrafanaLokiSink`**: Batched buffer queue pushing to Grafana Loki `/loki/api/v1/push` with LogQL query engine (`lokiSink.query`).
- 🍃 **`MongoBatchSink`**: Batched buffer queue writing into MongoDB via `insertMany({ ordered: false })`.
- 📡 **`OpenTelemetrySink`**: Native OpenTelemetry OTLP `/v1/logs` HTTP transport.
- ⚡ **`HttpBatchSink` / `AxiomSink`**: Batched HTTP log ingestion with periodic timer flushes.

## Installation

```bash
pnpm add @aegislog/transports aegislog
```

## Quickstart

### MongoDB Batched Sink & Query Engine

```typescript
import { createLogger } from "aegislog";
import { MongoBatchSink } from "@aegislog/transports";

const mongoSink = new MongoBatchSink({
  model: SystemLogsModel, // Direct Mongoose model or db.collection("system_logs")
  batchSize: 100,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [mongoSink],
  gracefulShutdown: true, // Auto-flushes on SIGTERM
});

// Query historical logs
const { items, total } = await mongoSink.query({
  level: "error",
  actorId: "usr_123",
  limit: 20,
});
```

### OpenTelemetry OTLP Sink

```typescript
import { createLogger } from "aegislog";
import { OpenTelemetrySink } from "@aegislog/transports";

const otelSink = new OpenTelemetrySink({
  endpoint: "http://localhost:4318/v1/logs",
  serviceName: "order-service",
});

const logger = createLogger({
  sinks: [otelSink],
});
```

### Grafana & Grafana Loki Batched Sink & LogQL Engine

```typescript
import { createLogger } from "aegislog";
import { LokiBatchSink } from "@aegislog/transports";

const lokiSink = new LokiBatchSink({
  host: "http://localhost:3100", // Or https://logs-prod-us-central1.grafana.net
  labels: { app: "order-service", env: "production" },
  batchSize: 50,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [lokiSink],
  gracefulShutdown: true,
});

// Query historical logs using LogQL directly from Node.js
const { items, total } = await lokiSink.query({
  level: "error",
  search: "payment failed",
  limit: 20,
});
```
