# Hono & Cloudflare Workers Integration 🔥

The `@aegislog/hono` package brings full AegisLog capabilities to edge runtimes (Cloudflare Workers, Fastly, Bun, Deno, and Node.js) with 0 external dependencies.

---

## 📦 Installation

```bash
pnpm add @aegislog/hono aegislog
```

---

## 🛠️ Usage with Hono on Cloudflare Workers

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
      if (auth) {
        return { id: "usr_edge_1", role: "admin" };
      }
      return undefined;
    },
    getTenant: (c) => {
      const orgId = c.req.header("x-org-id");
      return orgId ? { id: orgId } : undefined;
    },
  }),
);

app.get("/api/users", async (c) => {
  // Context is automatically present
  logger.info("Listing users from edge data center", {
    region: c.req.header("cf-ipcountry"),
  });

  return c.json({ users: [] });
});

export default app;
```
