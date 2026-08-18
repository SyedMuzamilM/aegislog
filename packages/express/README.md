# @aegislog/express 🚂

Express request/response lifecycle middleware and ambient context propagation adapter for [AegisLog](https://github.com/syedmuzamilm/aegislog).

---

## 📦 Installation

```bash
pnpm add @aegislog/express aegislog
# or
npm install @aegislog/express aegislog
```

---

## 🚀 Quickstart

```typescript
import express from "express";
import { aegisExpressMiddleware } from "@aegislog/express";
import { logger, audit } from "aegislog";

const app = express();
app.use(express.json());

// Attach AegisLog middleware
app.use(
  aegisExpressMiddleware({
    logRequests: true,
    getActor: (req) => {
      const auth = req.headers.authorization;
      return auth ? { id: "usr_sarah", email: "sarah@acme.com", role: "admin" } : undefined;
    },
    getTenant: (req) => {
      const tenant = req.headers["x-tenant-id"] as string;
      return tenant ? { id: tenant, slug: "acme-corp" } : undefined;
    },
  }),
);

app.post("/api/checkout", async (req, res) => {
  // Sarah's user/tenant context and requestId are automatically attached!
  logger.info("Processing checkout", { amount: req.body.amount });

  await audit.record({
    action: "billing.checkout_completed",
    resource: { type: "order", id: "ord_123" },
    outcome: "success",
  });

  res.json({ success: true });
});

app.listen(3000, () => {
  logger.info("Express server running on http://localhost:3000");
});
```

---

## ⚙️ Options (`ExpressAegisOptions`)

| Option        | Type                                                        | Description                                                                        |
| :------------ | :---------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `logger`      | `AegisLogger`                                               | Custom logger instance to use (default: global `logger`).                          |
| `logRequests` | `boolean`                                                   | Log inbound requests and outbound response status with duration (default: `true`). |
| `getActor`    | `(req: Request) => ActorContext \| Promise<ActorContext>`   | Extract authenticated user info from the request.                                  |
| `getTenant`   | `(req: Request) => TenantContext \| Promise<TenantContext>` | Extract organization/tenant info from headers or session.                          |

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
