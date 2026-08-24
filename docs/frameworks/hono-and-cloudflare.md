# Hono & Cloudflare Workers Integration 🔥

The `@aegislog/hono` package connects Hono request lifecycles to AegisLog on Node.js-compatible runtimes. Cloudflare Workers must enable the `nodejs_compat` compatibility flag because ambient context uses `node:async_hooks`.

---

## 📦 Installation

```bash
pnpm add @aegislog/hono aegislog
```

For Cloudflare Workers, add the compatibility flag to `wrangler.jsonc`:

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
}
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
