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

## 🛡️ Usage with Mongoose

```typescript
import mongoose from "mongoose";
import { createLogger } from "aegislog";
import { MongoBatchSink } from "@aegislog/transports";

const LogModel = mongoose.model(
  "SystemLog",
  new mongoose.Schema({}, { strict: false, timestamps: false }),
);

const mongoSink = new MongoBatchSink({
  collection: LogModel.collection,
  batchSize: 100,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  sinks: [mongoSink],
});
```

---

## ⚡ Graceful Shutdown

To ensure in-flight buffered logs are written during server shutdown:

```typescript
process.on("SIGTERM", async () => {
  await mongoSink.flush();
  await client.close();
  process.exit(0);
});
```
