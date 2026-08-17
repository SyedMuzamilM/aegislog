# 💻 API Design & Developer Experience Specification

---

## 1. Quick Start (Zero Config)

A single import gets you started in any TypeScript application:

```typescript
import { logger } from "aegislog";

// Basic logging
logger.info("Server started on port 3000");
logger.warn("Redis connection retry 2/5");
logger.error("Failed to charge payment", { invoiceId: "inv_123", amount: 49.99 });
```

---

## 2. Setting Up Ambient User & Request Context

### 2.1 Using Middleware (Express, Fastify, Hono, Next.js)

#### Hono / Cloudflare Workers:

```typescript
import { Hono } from "hono";
import { aegisMiddleware, logger } from "aegislog/hono";

const app = new Hono();

// Automatically extracts requestId, IP, user-agent, and bearer user
app.use("*", aegisMiddleware());

app.get("/api/profile", async (c) => {
  // Automatically attaches the current requestId and traceId to the log!
  logger.info("Fetching user profile");
  return c.json({ ok: true });
});
```

#### Next.js App Router (Server Actions & Route Handlers):

```typescript
// app/actions/update-billing.ts
"use server";

import { withAegisContext, logger } from "aegislog/next";
import { getAuthUser } from "@/lib/auth";

export async function updateBillingAction(planId: string) {
  const user = await getAuthUser();

  return withAegisContext(
    { actor: { id: user.id, email: user.email }, tenant: { id: user.orgId } },
    async () => {
      logger.info("Updating subscription plan", { planId });
      // Inside any helper called here, context is preserved!
      await billingService.changePlan(planId);
    },
  );
}
```

#### Express:

```typescript
import express from "express";
import { aegisExpressMiddleware, logger } from "aegislog/express";

const app = express();
app.use(
  aegisExpressMiddleware({
    getActor: (req) => (req.user ? { id: req.user.id, email: req.user.email } : undefined),
    getTenant: (req) =>
      req.headers["x-tenant-id"] ? { id: String(req.headers["x-tenant-id"]) } : undefined,
  }),
);

app.post("/api/orders", (req, res) => {
  logger.info("Processing order checkout", { cartItems: req.body.items });
  res.json({ status: "ok" });
});
```

---

## 3. Dynamic Context Mutation within Request Lifecycle

Sometimes you authenticate the user _after_ the request started (e.g. in an auth middleware or inside a controller):

```typescript
import { context, logger } from "aegislog";

export async function loginController(req, res) {
  logger.info("Attempting login"); // Has requestId, no actor yet

  const user = await authService.authenticate(req.body.email, req.body.password);

  // Set the actor in the current ambient context for all subsequent logs
  context.setActor({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  context.setTenant({
    id: user.organizationId,
    slug: user.orgSlug,
  });

  logger.info("User logged in successfully"); // Automatically has actor & tenant!
}
```

---

## 4. Fluent & Child Loggers

You can create module-scoped or subsystem-scoped child loggers:

```typescript
import { createLogger } from "aegislog";

// Create a component-specific logger
const paymentLogger = createLogger({
  namespace: "billing:stripe",
  defaultMeta: { provider: "stripe", version: "2024-06" },
});

paymentLogger.info("Creating checkout session", { customerId: "cus_882" });
```

Or using the fluent builder API:

```typescript
logger
  .with({ retryCount: 3, latencyMs: 142 })
  .withError(new Error("Stripe timeout"))
  .error("Payment checkout failed");
```

---

## 5. Type-Safe Event Logging (Zod / Schemas)

Avoid messy unstructured log payloads across large teams by defining strict schemas:

```typescript
import { defineLogEvent, logger } from "aegislog";
import { z } from "zod";

// Define a strictly typed event
export const UserSignedUpEvent = defineLogEvent({
  name: "user.signed_up",
  schema: z.object({
    userId: z.string(),
    plan: z.enum(["free", "pro", "enterprise"]),
    referrer: z.string().optional(),
  }),
});

// Fully type-checked at compile time and validated at runtime!
logger.event(UserSignedUpEvent, {
  userId: "usr_123",
  plan: "pro", // Type error if invalid string
  referrer: "google_ads",
});
```

---

## 6. Audit Trail Logging (SOC2 / GDPR Ready)

Audit logs have a distinct semantics and target:

```typescript
import { audit } from "aegislog";

// Record a business-critical action for audit history
audit.record({
  action: "organization.member_invited",
  resource: { type: "organization", id: "org_456" },
  target: { type: "user", id: "usr_new_999" },
  details: {
    roleGranted: "admin",
    inviteTokenId: "inv_tok_112",
  },
  outcome: "success", // 'success' | 'failure' | 'denied'
});
```
