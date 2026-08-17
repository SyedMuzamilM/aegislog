# 🧠 Deep Dive: How Context & User Identification Works

---

## 1. The Core Mystery: How Does Context Work Without Parameter Passing?

In traditional Node.js/TypeScript code, if you want a function 5 levels deep in your service layer to know `userId`, you either have to:

1. Pass `userId` through every function argument: `service(userId, data) -> repo(userId, query) -> db(userId)`.
2. Pass a `logger` instance everywhere: `service(logger, data) -> repo(logger, query)`.

**Both approaches create massive boilerplate and pollute clean architecture.**

AegisLog solves this using **`AsyncLocalStorage`** (part of the ECMAScript standard & supported in Node.js, Bun, Deno, and Cloudflare Workers).

---

## 2. What is `AsyncLocalStorage`? (The Analogy)

Think of `AsyncLocalStorage` like **"Thread-Local Storage for Asynchronous JavaScript"**:

- In synchronous code, variables live on the call stack.
- In asynchronous code (Promises, `async/await`, timers, network I/O), the call stack unwinds while waiting for I/O.
- `AsyncLocalStorage` creates an invisible ambient memory bubble that follows the asynchronous execution chain throughout its entire lifetime.

```
Incoming Request (User: usr_123, Trace: tr_abc)
   │
   ▼
[ aegisMiddleware() creates ambient context bubble ]
   │
   ├──▶ Controller: calls `logger.info("Order started")`  --> Sees usr_123 automatically!
   │      │
   │      ├──▶ await paymentService.charge()
   │      │       │
   │      │       └──▶ calls `logger.info("Stripe charge ok")` --> Still sees usr_123!
   │      │
   │      └──▶ await emailService.sendReceipt()
   │              │
   │              └──▶ calls `logger.error("SMTP failed")` --> Still sees usr_123 & tr_abc!
   │
[ Response sent & Context Bubble Cleaned Up ]
```

---

## 3. The Lifecycle: 3 Common Context Scenarios

### Scenario A: Known User at Request Start (API Token / Session)

When the request already has a session cookie or Bearer token, the middleware populates the context immediately:

```typescript
// hono-app.ts
import { Hono } from "hono";
import { aegisMiddleware, logger } from "aegislog/hono";

const app = new Hono();

app.use(
  "*",
  aegisMiddleware({
    // Extract user and tenant directly from request/JWT
    getActor: async (c) => {
      const user = await verifyJwt(c.req.header("Authorization"));
      return user ? { id: user.id, email: user.email, role: user.role } : undefined;
    },
    getTenant: (c) => ({ id: c.req.header("x-org-id") }),
  }),
);

app.post("/api/documents", async (c) => {
  // 0 boilerplate: actor and tenant are automatically in the log!
  logger.info("Creating document");
  return c.json({ ok: true });
});
```

---

### Scenario B: "Late Authentication" (Login / Signup Endpoints)

On a `/login` endpoint, the user identity is **not known** when the request begins. It is only discovered after verifying their credentials:

```typescript
import { context, logger } from "aegislog";

export async function loginHandler(req, res) {
  // Log 1: Has requestId & IP, but no actor yet
  logger.info("Login attempt initiated", { email: req.body.email });

  const user = await authService.validateCredentials(req.body.email, req.body.password);

  if (!user) {
    logger.warn("Invalid login credentials");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 🔑 Late Binding: Mutate the active ambient context for the remainder of this request!
  context.setActor({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  context.setTenant({
    id: user.organizationId,
    slug: user.orgSlug,
  });

  // Log 2: All subsequent logs (including inside helper services) now have `user.id`!
  logger.info("User successfully authenticated");

  res.json({ token: user.token });
}
```

---

### Scenario C: Background Queues & Cron Jobs (BullMQ, Celery, Temporal)

When a background worker picks up a job from Redis, there is no HTTP request. You wrap the job handler using `runWithContext`:

```typescript
import { runWithContext, logger } from "aegislog";
import { Worker } from "bullmq";

const worker = new Worker("pdf-export-queue", async (job) => {
  // Rehydrate the original user context that initiated the background job
  return runWithContext(
    {
      requestId: job.id,
      actor: { id: job.data.initiatedByUserId },
      tenant: { id: job.data.organizationId },
      tags: { queue: "pdf-export", attempt: String(job.attemptsMade) },
    },
    async () => {
      logger.info("Starting PDF compilation");
      await generatePdfReport(job.data);
      logger.info("PDF successfully uploaded to S3");
    },
  );
});
```

---

## 4. How User Audit Logging Connects to Context

### Why User Context is Crucial for Auditing

Audit trails answer compliance questions:

- _"Who deleted Project X?"_
- _"Who changed the company's payout bank account?"_
- _"When did Sarah revoke API key #12?"_

Because the ambient context already knows the `actor` (Sarah), writing an audit event requires zero boilerplate:

```typescript
import { audit } from "aegislog";

export async function updatePayoutBank(newIban: string) {
  // `audit.record` automatically attaches Sarah as the actor from ambient context!
  await audit.record({
    action: "billing.payout_method_changed",
    resource: { type: "bank_account", id: "acc_772" },
    changes: {
      iban: { from: "****-5521", to: "****-9942" },
    },
    reason: "User updated bank via settings page",
    outcome: "success",
  });
}
```

### The Generated Immutable Audit Record:

```json
{
  "eventId": "aud_01J6A7X...",
  "timestamp": "2026-08-17T21:15:00.123Z",
  "actor": {
    "id": "usr_9912",
    "email": "sarah@acme.com",
    "role": "billing_admin"
  },
  "tenant": {
    "id": "org_441",
    "slug": "acme-corp"
  },
  "session": {
    "ip": "203.0.113.195",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
  },
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "action": "billing.payout_method_changed",
  "resource": { "type": "bank_account", "id": "acc_772" },
  "changes": {
    "iban": { "from": "****-5521", "to": "****-9942" }
  },
  "outcome": "success"
}
```
