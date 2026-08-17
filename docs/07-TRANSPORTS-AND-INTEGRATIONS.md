# 🔌 Transports, Sinks & Cloud Integrations

---

## 1. Transport Architecture

AegisLog uses a modular **Sink / Transport** model. The core logger is 100% dependency-free, allowing custom transports to be imported on-demand without bloating bundle sizes or breaking edge runtimes.

```
 ┌────────────────────────────────────────────────────────┐
 │                      AegisLog Core                     │
 └───────────────────────────┬────────────────────────────┘
                             │
            ┌────────────────┼────────────────┬───────────────┐
            ▼                ▼                ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ ┌─────────────┐
     │ Console/Dev │  │ Stdout/Prod │  │ OpenTele-   │ │ Cloud Sinks │
     │ TUI Sink    │  │ JSON Sink   │  │ metry OTLP  │ │ Axiom/Datadog
     └─────────────┘  └─────────────┘  └─────────────┘ └─────────────┘
```

---

## 2. Standard Built-in Sinks

### 2.1 Pretty Console Sink (Local Development)

- Active automatically when `process.env.NODE_ENV !== 'production'` or `AEGIS_FORMAT=pretty`.
- Outputs human-friendly colorized logs, timestamps, formatted JSON tables, and clean stack traces.

### 2.2 Standard Output JSON Sink (Production Default)

- Active by default in production.
- Outputs high-throughput, machine-readable NDJSON formatted for CloudWatch, Kubernetes, Docker, and log collectors.

---

## 3. Pluggable Cloud Sinks

### 3.1 OpenTelemetry OTLP Sink

Seamlessly forwards structured logs and correlates with active OpenTelemetry distributed spans:

```typescript
import { createLogger } from "aegislog";
import { OpenTelemetrySink } from "aegislog/transports/otel";

export const logger = createLogger({
  sinks: [
    new OpenTelemetrySink({
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/logs",
      serviceName: "checkout-service",
      serviceVersion: "1.4.0",
    }),
  ],
});
```

### 3.2 Axiom / BetterStack / Datadog Sinks

```typescript
import { AxiomSink } from "aegislog/transports/axiom";
import { BetterStackSink } from "aegislog/transports/betterstack";

export const logger = createLogger({
  sinks: [
    new AxiomSink({
      dataset: "backend-prod",
      token: process.env.AXIOM_TOKEN!,
      batchSize: 50,
      flushIntervalMs: 2000,
    }),
  ],
});
```

---

## 4. Serverless & Edge Lifecycle Management (`waitUntil`)

In serverless environments (like Cloudflare Workers or Next.js Edge), asynchronous background timers can be terminated abruptly when a request ends. AegisLog provides native integration with execution contexts:

```typescript
import { Hono } from "hono";
import { aegisMiddleware, flushLogs } from "aegislog/hono";

const app = new Hono();

app.use("*", aegisMiddleware());

app.get("/task", async (c) => {
  logger.info("Performing background processing");

  // Ensures all buffered logs are dispatched before isolate shutdown
  c.executionCtx.waitUntil(flushLogs());

  return c.text("Processing started");
});
```
