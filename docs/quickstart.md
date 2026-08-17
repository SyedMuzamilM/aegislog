# 5-Minute Quickstart 🚀

Get started with **AegisLog** in less than 5 minutes.

---

## 1. Installation

Install the core package using your preferred package manager:

```bash
# Using pnpm (recommended)
pnpm add aegislog

# Using npm
npm install aegislog

# Using yarn / bun
bun add aegislog
```

---

## 2. Basic Logging

```typescript
import { logger } from "aegislog";

// Standard logging
logger.info("Server initialized", { port: 3000, environment: "production" });
logger.debug("Database connected", { poolSize: 10 });
logger.warn("High memory usage detected", { memoryUsage: "82%" });
logger.error(
  "Failed to charge credit card",
  { orderId: "ord_123" },
  new Error("Payment Gateway Timeout"),
);
```

---

## 3. The Helmet Security Shield in Action

AegisLog automatically redacts sensitive data (passwords, tokens, Bearer auth, credit cards, OpenAI/AWS keys) without any manual configuration:

```typescript
import { logger } from "aegislog";

// Accidental leak prevented automatically!
logger.info("User checkout attempted", {
  userId: "usr_99",
  password: "SuperSecretPassword123", // Automatically masked -> "[REDACTED]"
  authorization: "Bearer eyJhbGciOi...", // Automatically masked -> "Bearer [REDACTED_JWT]"
  creditCard: "4111 2222 3333 4444", // Automatically masked -> "****-****-****-4444"
  apiKey: "sk-proj-1234567890abcdef", // Automatically masked -> "sk-[REDACTED_KEY]"
});
```

---

## 4. Ambient User & Request Context (No Parameter Drilling!)

Wrap your request handler with `runWithContext` or use framework middleware. All logger calls in that async call stack will automatically inherit the user and request context:

```typescript
import { runWithContext, logger } from "aegislog";

// Inside an incoming request or background job:
runWithContext(
  {
    requestId: "req_9921",
    actor: { id: "usr_sarah", email: "sarah@acme.com", role: "admin" },
    tenant: { id: "org_acme", slug: "acme-corp" },
  },
  async () => {
    await performDeepOperation();
  },
);

async function performDeepOperation() {
  // 0 parameter drilling: Sarah's context is attached automatically!
  logger.info("Order processed successfully", { orderId: "ord_456", total: 49.99 });
  // Output: 16:05:14.229 [INFO] Order processed successfully [👤 usr_sarah <sarah@acme.com> | 🏢 acme-corp | 🆔 req_9921]
}
```

---

## 5. Business Compliance Audit Trail

Record immutable compliance audit events for SOC2, HIPAA, or ISO27001 requirements:

```typescript
import { audit } from "aegislog";

await audit.record({
  action: "user.role_promoted",
  resource: { type: "user", id: "usr_bob_77" },
  changes: { role: { from: "member", to: "admin" } },
  outcome: "success",
  details: { approvedBy: "usr_sarah" },
});
```

---

## 6. AI / LLM Observability & Token Cost Tracking

```typescript
import { ai } from "aegislog";

const result = await ai.track({
  model: "gpt-4o",
  provider: "openai",
  prompt: "Summarize this quarterly earnings report",
  call: async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Summarize this quarterly earnings report" }],
    });
  },
});
// Automatically logs: 🤖 [openai:gpt-4o] (420 tokens, ~$0.00105, 310ms)
```

---

## 7. Realtime Visual Dev Inspector

Start the local visual dashboard in your terminal:

```bash
npx @aegislog/dev --port 4319
```

Open `http://localhost:4319` in your browser to view incoming logs in real-time with filters, syntax-colored JSON trees, and search!
