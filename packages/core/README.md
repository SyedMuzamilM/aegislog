<p align="center">
  <img src="https://raw.githubusercontent.com/voidzero-dev/vite-plus/main/public/icon.svg" width="72" height="72" alt="AegisLog Logo" />
</p>

<h1 align="center">🛡️ aegislog</h1>

<p align="center">
  <strong>The armored logging, ambient context propagation, and user auditing engine for modern TypeScript.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aegislog"><img src="https://img.shields.io/npm/v/aegislog.svg?style=flat-square&color=3b82f6" alt="npm version" /></a>
  <a href="https://github.com/syedmuzamilm/aegislog/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-43853d.svg?style=flat-square" alt="Node" /></a>
</p>

---

## 🌟 Highlights

- 🛡️ **Helmet Security Shield:** Zero-leak auto-redaction for passwords, Bearer tokens, JWTs, OpenAI/AWS keys, credit cards, and domain compliance presets (`hipaa`, `pci`, `financial`, `strict`) at sub-microsecond speed.
- 🌐 **Ambient Context Engine:** Zero parameter drilling. Automatically attaches `actor` (user), `tenant` (org), and `requestId` across asynchronous call stacks via `AsyncLocalStorage`.
- 📜 **Business Audit Trails:** First-class `audit.record()` engine for immutable SOC2/HIPAA/GDPR compliance events separate from ephemeral debug noise.
- 🎨 **Customizable Console Display:** Syntax-colored JSON metadata, clean error stack traces, and configurable presets (`default`, `minimal`, `compact`, `detailed`).
- 🤖 **AI / LLM Observability:** Built-in `ai.track()` measuring prompts, completions, tokens, latency, and estimated USD cost (GPT-4o, Claude 3.5, Gemini 2.0, DeepSeek R1).
- 📐 **Type-Safe Event Schemas:** Native support for Standard Schema v1, Zod, and Valibot event definitions via `defineLogEvent()`.
- ⚡ **Zero-Pipe Edge Universal:** No Unix pipes (`| pino-pretty`) or `worker_threads` required. Runs identically on Node.js, Cloudflare Workers, Next.js, Fastify, Express, Bun, and Deno.
- 🛑 **Native Graceful Shutdown:** Automated buffer draining on `SIGTERM` and `SIGINT` via `gracefulShutdown: true`.
- 🖥️ **Localhost Dev Inspector:** Realtime visual dashboard & CLI (`npx @aegislog/dev --port 4319`).

---

## 📦 Installation

```bash
pnpm add aegislog
# or
npm install aegislog
# or
bun add aegislog
```

---

## 🚀 Quickstart

### 1. Basic Logging & Automatic Sanitization

```typescript
import { logger } from "aegislog";

// Standard logging with automatic PII sanitization
logger.info("User checkout attempted", {
  userId: "usr_99",
  password: "SuperSecretPassword", // Masked -> "[REDACTED]"
  authorization: "Bearer eyJhbGci...", // Masked -> "Bearer [REDACTED_JWT]"
  creditCard: "4111 2222 3333 4444", // Masked -> "****-****-****-4444"
  amount: 49.99,
});
```

### 2. Ambient Context (Zero Parameter Drilling)

```typescript
import { runWithContext, logger } from "aegislog";

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
  // Sarah's context is attached automatically across all nested async calls!
  logger.info("Order processed successfully", { orderId: "ord_123" });
}
```

### 3. Domain Compliance Presets (Healthcare / HIPAA / PCI / FinTech)

```typescript
import { createLogger } from "aegislog";

const logger = createLogger({
  shield: {
    preset: ["hipaa", "pci"], // Auto-redacts medical fields, MRNs, diagnoses, prescriptions, PANs, CVVs
    maskString: "[CONFIDENTIAL]",
    customPatterns: [
      /MRN-\d{6}/g,
      {
        pattern: /PATIENT:\s*([A-Z]+)/g,
        replacer: (_match, name) => `PATIENT: [MASKED_${name[0]}]`,
      },
    ],
  },
});
```

### 4. Business Audit Trails

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

### 5. AI / LLM Cost Tracking & Observability

```typescript
import { ai } from "aegislog";

const result = await ai.track({
  model: "gpt-4o",
  provider: "openai",
  prompt: "Summarize customer feedback",
  call: async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Summarize customer feedback" }],
    });
  },
});
```

---

## 📦 Ecosystem Packages

- [`@aegislog/express`](https://www.npmjs.com/package/@aegislog/express) - Express request/response lifecycle middleware
- [`@aegislog/hono`](https://www.npmjs.com/package/@aegislog/hono) - Hono & Cloudflare Workers edge adapter
- [`@aegislog/fastify`](https://www.npmjs.com/package/@aegislog/fastify) - Fastify v4/v5 plugin with global hooks
- [`@aegislog/next`](https://www.npmjs.com/package/@aegislog/next) - Next.js App Router & Server Actions wrapper
- [`@aegislog/transports`](https://www.npmjs.com/package/@aegislog/transports) - OpenTelemetry OTLP `/v1/logs`, MongoDB, and Axiom sinks
- [`@aegislog/dev`](https://www.npmjs.com/package/@aegislog/dev) - Realtime visual local dashboard & CLI inspector

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
