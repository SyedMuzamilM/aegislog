# Fastify Integration ⚡

The `@aegislog/fastify` package integrates AegisLog into Fastify v4 & v5 using global lifecycle hooks.

---

## 📦 Installation

```bash
pnpm add @aegislog/fastify aegislog
```

---

## 🛠️ Usage with Fastify

```typescript
import fastify from "fastify";
import { aegisFastifyPlugin } from "@aegislog/fastify";
import { logger, audit } from "aegislog";

const app = fastify({ logger: false });

// Register AegisLog plugin
await app.register(aegisFastifyPlugin, {
  logRequests: true,
  getActor: (req) => {
    const auth = req.headers.authorization;
    return auth ? { id: "usr_fastify_user", email: "dev@company.com" } : undefined;
  },
  getTenant: (req) => {
    const tenant = req.headers["x-tenant-id"] as string;
    return tenant ? { id: tenant } : undefined;
  },
});

app.get("/api/orders", async (req, reply) => {
  logger.info("Fetching customer orders");
  return reply.send({ orders: [] });
});

await app.listen({ port: 3000 });
```
