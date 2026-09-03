# Grafana & Grafana Loki Batched Transport 📊

The `@aegislog/transports` package provides `LokiBatchSink` (aliased as `GrafanaLokiSink`), a high-performance buffer queue that streams structured logs and audit events directly into **Grafana Loki** via its HTTP Push API (`/loki/api/v1/push`).

It features automatic stream aggregation, nanosecond timestamps, LogQL query capabilities via `lokiSink.query()`, and seamless visualization in Grafana dashboards.

---

## 📦 Installation

```bash
pnpm add @aegislog/transports aegislog
```

---

## 🛠️ Quickstart

### 1. Local or Self-Hosted Grafana Loki

```typescript
import { createLogger } from "aegislog";
import { LokiBatchSink } from "@aegislog/transports";

const lokiSink = new LokiBatchSink({
  host: "http://localhost:3100", // Loki HTTP API
  labels: {
    app: "billing-service",
    env: "production",
  },
  batchSize: 50, // Immediate flush after 50 logs
  flushIntervalMs: 2000, // Or flush every 2 seconds
  onError: (err, entries) => {
    console.error(`Failed to push ${entries.length} logs to Loki:`, err.message);
  },
});

const logger = createLogger({
  sinks: [lokiSink],
  gracefulShutdown: true, // Automatically flushes buffers on SIGTERM/SIGINT
});

logger.info("Invoice generated", { invoiceId: "inv_9012", amount: 250.0 });
```

### 2. Grafana Cloud Loki (Hosted)

Grafana Cloud uses HTTP Basic Authentication with your numeric User ID and API Token:

```typescript
import { createLogger } from "aegislog";
import { GrafanaLokiSink } from "@aegislog/transports";

const lokiSink = new GrafanaLokiSink({
  host: "https://logs-prod-us-central1.grafana.net",
  basicAuth: {
    username: process.env.GRAFANA_LOKI_USER!, // e.g. "123456"
    password: process.env.GRAFANA_LOKI_TOKEN!, // Glc token
  },
  labels: {
    app: "checkout-api",
    env: process.env.NODE_ENV ?? "production",
  },
});

const logger = createLogger({
  sinks: [lokiSink],
});
```

---

## 🏷️ Loki Stream Labels vs Structured JSON Payload

> [!TIP]
> **Loki Indexing Best Practice**: Loki indexes only the stream labels (like Prometheus). Using high-cardinality fields (such as user IDs, UUIDs, or timestamps) as labels can explode memory consumption and slow down queries.
>
> AegisLog automatically maintains stream labels for low-cardinality routing (`app`, `level`, `env`, `namespace`) and places high-cardinality ambient context (`actor`, `tenant`, `requestId`, `meta`, `error`) in the structured JSON log line.

You can query both effortlessly in Grafana Explore with LogQL:

```logql
# Filter by stream label, parse JSON payload, and filter by user ID
{app="billing-service", level="error"} | json | context_actor_id = "usr_sarah"
```

### Customizing Labels

```typescript
const lokiSink = new LokiBatchSink({
  host: "http://localhost:3100",
  labels: {
    app: "order-service",
    region: "us-east-1",
  },
  includeLevelLabel: true, // Adds level: "info" | "error" (default: true)
  includeNamespaceLabel: true, // Adds namespace: "billing" if logger has a namespace
  dynamicLabels: (entry) => ({
    // Dynamic low-cardinality tags only
    cluster: process.env.CLUSTER_NAME,
  }),
});
```

---

## 🛡️ Business Compliance Audit Trails in Loki

When using `logger.audit.record()`, `LokiBatchSink` automatically indexes audit records with label `type: "audit"`, `action`, and `outcome`:

```typescript
import { createLogger } from "aegislog";
import { LokiBatchSink } from "@aegislog/transports";

const lokiSink = new LokiBatchSink({ host: "http://localhost:3100" });
const logger = createLogger({ sinks: [lokiSink] });

await logger.audit.record({
  action: "user.role_promoted",
  resource: { type: "user", id: "usr_99" },
  outcome: "success",
  details: { previousRole: "member", newRole: "admin" },
});
```

Query audit trails in Grafana with:

```logql
{app="aegislog", type="audit"} | json
```

---

## 🔍 Historical LogQL Query API (`lokiSink.query`)

The `LokiBatchSink` includes a built-in `.query()` method that executes LogQL queries against Loki's `/loki/api/v1/query_range` endpoint and returns parsed structured results:

```typescript
// 1. Structured query with automatic LogQL synthesis
const results = await lokiSink.query({
  level: "error",
  search: "Connection timeout",
  actorId: "usr_sarah",
  limit: 25,
  direction: "backward", // Newest first
});

for (const entry of results.items) {
  console.log(`[${entry.timestamp}] ${entry.line}`);
  console.log("Parsed context:", entry.data?.context);
}

// 2. Direct custom LogQL query
const auditLogs = await lokiSink.query({
  query: '{app="billing-service", type="audit"} | json | outcome = "denied"',
  limit: 50,
});
```

---

## 🏢 Multi-Tenancy (`X-Scope-OrgID`)

For multi-tenant Grafana Loki clusters (or Cortex):

```typescript
const lokiSink = new LokiBatchSink({
  host: "http://localhost:3100",
  tenantId: "tenant_enterprise_prod", // Sets X-Scope-OrgID header
});
```

---

## ⚡ Built-in Graceful Shutdown

AegisLog automatically drains and flushes all buffered Loki streams during process shutdown (`SIGTERM` and `SIGINT`):

```typescript
const logger = createLogger({
  sinks: [lokiSink],
  gracefulShutdown: true,
});

// Or manually:
await logger.flush();
```

---

## 🖥️ Pre-Configured Grafana Dashboard

To get started in 30 seconds with a pre-configured Grafana + Loki stack and AegisLog Dashboard, check out the example in [`examples/grafana-loki`](../../examples/grafana-loki):

```bash
cd examples/grafana-loki
docker compose up -d
pnpm start
```

Open `http://localhost:3000` to view live AegisLog streams, level distributions, and audit trail metrics in Grafana!
