# @aegislog/fastify ⚡

Fastify v4 & v5 lifecycle plugin adapter for [AegisLog](https://github.com/syedmuzamilm/aegislog).

---

## 📦 Installation

```bash
pnpm add @aegislog/fastify aegislog
# or
npm install @aegislog/fastify aegislog
```

---

## 🚀 Quickstart

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
    return auth ? { id: "usr_admin", email: "admin@enterprise.io" } : undefined;
  },
  getTenant: (req) => {
    const tenantId = req.headers["x-tenant-id"] as string;
    return tenantId ? { id: tenantId } : undefined;
  },
});

app.get("/api/orders", async (req, reply) => {
  logger.info("Fetching customer orders");
  return reply.send({ orders: [] });
});

await app.listen({ port: 3000 });
```

---

## ⚙️ Options (`FastifyAegisOptions`)

| Option        | Type                                                               | Description                                                        |
| :------------ | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| `logger`      | `AegisLogger`                                                      | Custom logger instance to use (default: global `logger`).          |
| `logRequests` | `boolean`                                                          | Automatically log request lifecycle and latency (default: `true`). |
| `getActor`    | `(req: FastifyRequest) => ActorContext \| Promise<ActorContext>`   | Extract actor context from the request.                            |
| `getTenant`   | `(req: FastifyRequest) => TenantContext \| Promise<TenantContext>` | Extract tenant context from headers or session.                    |

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
