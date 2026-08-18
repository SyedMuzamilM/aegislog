# @aegislog/transports 📡

Production transports and ingestion sinks for [AegisLog](https://github.com/syedmuzamilm/aegislog).

- 🍃 **`MongoBatchSink`**: Batched buffer queue writing into MongoDB via `insertMany({ ordered: false })`.
- 📡 **`OpenTelemetrySink`**: Native OpenTelemetry OTLP `/v1/logs` HTTP transport.
- ⚡ **`HttpBatchSink` / `AxiomSink`**: Batched HTTP log ingestion with periodic timer flushes.

## Installation

```bash
pnpm add @aegislog/transports aegislog
```

## Quickstart

### MongoDB Batched Sink

```typescript
import { createLogger } from "aegislog";
import { MongoBatchSink } from "@aegislog/transports";

const mongoSink = new MongoBatchSink({
  collection: db.collection("system_logs"),
  batchSize: 100,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [mongoSink],
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
