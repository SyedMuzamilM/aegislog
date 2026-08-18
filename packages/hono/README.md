# @aegislog/hono 🔥

Hono and Cloudflare Workers edge middleware adapter for [AegisLog](https://github.com/syedmuzamilm/aegislog). Runs with zero external dependencies across Cloudflare Workers, Fastly Compute, Node.js, Deno, and Bun.

---

## 📦 Installation

```bash
pnpm add @aegislog/hono aegislog
# or
npm install @aegislog/hono aegislog
```

---

## 🚀 Quickstart

```typescript
import { Hono } from "hono";
import { aegisMiddleware } from "@aegislog/hono";
import { logger, audit } from "aegislog";

const app = new Hono();

// Attach AegisLog Edge Middleware
app.use(
  "*",
  aegisMiddleware({
    logRequests: true,
    getActor: (c) => {
      const auth = c.req.header("authorization");
      return auth ? { id: "usr_edge_1", role: "admin" } : undefined;
    },
    getTenant: (c) => {
      const orgId = c.req.header("x-org-id");
      return orgId ? { id: orgId } : undefined;
    },
  }),
);

app.get("/api/users", async (c) => {
  // Context is automatically attached without parameter drilling
  logger.info("Listing users from edge runtime", {
    region: c.req.header("cf-ipcountry"),
  });

  return c.json({ users: [] });
});

export default app;
```

---

## ⚙️ Options (`HonoAegisOptions`)

| Option        | Type                                                      | Description                                                        |
| :------------ | :-------------------------------------------------------- | :----------------------------------------------------------------- |
| `logger`      | `AegisLogger`                                             | Custom logger instance to use (default: global `logger`).          |
| `logRequests` | `boolean`                                                 | Automatically log request lifecycle and latency (default: `true`). |
| `getActor`    | `(c: Context) => ActorContext \| Promise<ActorContext>`   | Extract actor context from Hono request context.                   |
| `getTenant`   | `(c: Context) => TenantContext \| Promise<TenantContext>` | Extract tenant context from headers or route context.              |

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
