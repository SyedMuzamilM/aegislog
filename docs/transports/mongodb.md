# MongoDB Batched Transport 🍃

The `@aegislog/transports` package provides `MongoBatchSink`, a high-throughput buffer queue that flushes logs and audit trails into MongoDB using `insertMany({ ordered: false })` or bulk operations.

---

## 📦 Installation

```bash
pnpm add @aegislog/transports aegislog mongodb
```

---

## 🛠️ Usage with Native MongoDB Driver

```typescript
import { MongoClient } from "mongodb";
import { createLogger } from "aegislog";
import { MongoBatchSink } from "@aegislog/transports";

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db("babysteps_prod");

const mongoSink = new MongoBatchSink({
  collection: db.collection("system_logs"),
  auditCollection: db.collection("audit_logs"), // Optional dedicated collection
  batchSize: 100, // Flush after 100 logs
  flushIntervalMs: 2000, // Or flush every 2 seconds
  onError: (err, entries) => {
    console.error(`Failed to flush ${entries.length} logs to MongoDB:`, err.message);
  },
});

const logger = createLogger({
  namespace: "babysteps:api",
  sinks: [mongoSink],
});

logger.info("Patient appointment scheduled", { appointmentId: "apt_123" });
```

---

## 🛡️ Usage with Mongoose (Direct Model Support)

You can pass a Mongoose Model directly via the `model` and `auditModel` options without manual collection unwrapping:

```typescript
import mongoose from "mongoose";
import { createLogger } from "aegislog";
import { MongoBatchSink } from "@aegislog/transports";

const SystemLogsModel = mongoose.model(
  "SystemLog",
  new mongoose.Schema({}, { strict: false, timestamps: false }),
);

const AuditLogsModel = mongoose.model(
  "AuditLog",
  new mongoose.Schema({}, { strict: false, timestamps: false }),
);

const mongoSink = new MongoBatchSink({
  model: SystemLogsModel,
  auditModel: AuditLogsModel, // Direct Mongoose Model
  batchSize: 100,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [mongoSink],
  gracefulShutdown: true, // Auto-flushes on SIGTERM/SIGINT
});
```

---

## 🔍 Historical Log Query API (`mongoSink.query`)

The `MongoBatchSink` includes a built-in `.query()` helper designed for admin portals and audit dashboards:

```typescript
const { items, total, page, pageSize, totalPages } = await mongoSink.query({
  level: "error",
  actorId: "usr_sarah",
  tenantId: "org_acme",
  search: "payment failed",
  startDate: "2026-08-01",
  endDate: "2026-08-18",
  limit: 25,
  page: 1,
});

console.log(`Found ${total} logs matching query:`, items);
```

---

## ⚡ Built-in Graceful Shutdown

AegisLog can automatically drain and flush all in-flight buffers during `SIGTERM` and `SIGINT`:

```typescript
const logger = createLogger({
  sinks: [mongoSink],
  gracefulShutdown: true, // Enables automatic process shutdown hooks
});

// Or manually:
await logger.flush();
```
