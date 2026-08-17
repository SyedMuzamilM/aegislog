# Express Integration 🚂

The `@aegislog/express` package provides plug-and-play middleware for Express applications.

---

## 📦 Installation

```bash
pnpm add @aegislog/express aegislog
```

---

## 🛠️ Usage with Express

```typescript
import express from "express";
import { aegisExpressMiddleware } from "@aegislog/express";
import { logger, audit } from "aegislog";

const app = express();
app.use(express.json());

// Attach AegisLog Express Middleware
app.use(
  aegisExpressMiddleware({
    logRequests: true,
    getActor: (req) => {
      const auth = req.headers.authorization;
      return auth ? { id: "usr_express_admin", email: "admin@acme.com" } : undefined;
    },
    getTenant: (req) => {
      const tenant = req.headers["x-tenant-id"] as string;
      return tenant ? { id: tenant, slug: "acme-corp" } : undefined;
    },
  }),
);

app.post("/api/checkout", async (req, res) => {
  logger.info("Checkout initiated", { amount: req.body.amount });

  await audit.record({
    action: "billing.checkout_completed",
    resource: { type: "order", id: "ord_express_1" },
    outcome: "success",
  });

  res.json({ success: true });
});

app.listen(3000);
```
