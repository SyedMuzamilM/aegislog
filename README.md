<p align="center">
  <img src="https://raw.githubusercontent.com/voidzero-dev/vite-plus/main/public/icon.svg" width="72" height="72" alt="AegisLog Logo" />
</p>

<h1 align="center">🛡️ AegisLog</h1>

<p align="center">
  <strong>The armored logging, ambient context propagation, and user auditing engine for modern TypeScript.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aegislog"><img src="https://img.shields.io/npm/v/aegislog.svg?style=flat-square&color=3b82f6" alt="npm version" /></a>
  <a href="https://github.com/voidzero-dev/vite-plus"><img src="https://img.shields.io/badge/tooling-Vite%2B-7474fb.svg?style=flat-square" alt="Vite+" /></a>
  <a href="https://github.com/your-org/aegislog/actions"><img src="https://img.shields.io/badge/tests-22%20passed-34d399.svg?style=flat-square" alt="Tests" /></a>
  <a href="https://github.com/your-org/aegislog/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-43853d.svg?style=flat-square" alt="Node" /></a>
</p>

---

## 🌟 Highlights

- 🛡️ **Helmet Security Shield:** Zero-leak auto-redaction for passwords, Bearer tokens, JWTs, OpenAI/AWS keys, and credit cards at sub-microsecond speed.
- 🌐 **Ambient Context Engine:** Zero parameter drilling. Automatically attaches `actor` (user), `tenant` (org), and `requestId` across asynchronous call stacks via `AsyncLocalStorage`.
- 📜 **Business Audit Trails:** First-class `audit.record()` engine for immutable SOC2/HIPAA/GDPR compliance events separate from ephemeral debug noise.
- 🎨 **Customizable Console Display:** Syntax-colored JSON metadata, clean error stack traces, and configurable presets (`default`, `minimal`, `compact`, `detailed`).
- 🤖 **AI / LLM Observability:** Built-in `ai.track()` measuring prompts, completions, tokens, latency, and estimated USD cost (GPT-4o, Claude 3.5, Gemini 2.0, DeepSeek R1).
- 📐 **Type-Safe Event Schemas:** Native support for Standard Schema v1, Zod, and Valibot event definitions.
- ⚡ **Zero-Pipe Edge Universal:** No Unix pipes (`| pino-pretty`) or `worker_threads` required. Runs identically on Node.js, Cloudflare Workers, Next.js, Fastify, Express, Bun, and Deno.
- 🖥️ **Localhost Dev Inspector:** Realtime visual dashboard & CLI (`npx @aegislog/dev --port 4319`).

---

## ⚡ Microbenchmark Results

Executed with `pnpm bench` (Apple Silicon M-Series):

```
  ✓ bench/logger.bench.ts > AegisLog Microbenchmarks & Latency Profiling
    · 1. Standard Logger Info Call:                          924,650 ops/sec (~1.08 µs/call)
    · 2. Ambient Context Logging (AsyncLocalStorage):        318,239 ops/sec (~3.14 µs/call)
    · 3. Security Shield Redaction (Complex Nested Object):  613,786 ops/sec (~1.62 µs/call)
    · 4. Audit Trail Event Recording:                      1,030,271 ops/sec (~0.97 µs/call)
```

---

## 📦 Packages in Monorepo

| Package                                         | Version | Description                                                   |
| :---------------------------------------------- | :------ | :------------------------------------------------------------ |
| [`aegislog`](./packages/core)                   | `0.2.1` | Core logging, context, shield, audit, and AI tracking engine  |
| [`@aegislog/next`](./packages/next)             | `0.2.1` | Next.js App Router context wrapper & Server Action loggers    |
| [`@aegislog/hono`](./packages/hono)             | `0.2.1` | Hono & Cloudflare Workers edge middleware adapter             |
| [`@aegislog/fastify`](./packages/fastify)       | `0.2.1` | Fastify v4/v5 plugin adapter with global hooks                |
| [`@aegislog/express`](./packages/express)       | `0.2.1` | Express request/response lifecycle middleware                 |
| [`@aegislog/transports`](./packages/transports) | `0.2.1` | OpenTelemetry OTLP `/v1/logs`, MongoDB, and Axiom cloud sinks |
| [`@aegislog/dev`](./packages/dev)               | `0.2.1` | Standalone local visual web dashboard & CLI inspector         |

---

## 🚀 Quickstart

### 1. Installation

```bash
pnpm add aegislog
```

### 2. Basic Usage & Auto-Redaction

```typescript
import { logger } from "aegislog";

// Standard logging with automatic PII sanitization
logger.info("Checkout initiated", {
  userId: "usr_99",
  password: "SuperSecretPassword", // Masked -> "[REDACTED]"
  authorization: "Bearer eyJhbGci...", // Masked -> "Bearer [REDACTED_JWT]"
  creditCard: "4111 2222 3333 4444", // Masked -> "****-****-****-4444"
  amount: 49.99,
});
```

### 3. Ambient Context (Zero Parameter Drilling)

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
  // Sarah's context is attached automatically!
  logger.info("Order processed successfully", { orderId: "ord_123" });
  // Output: 16:05:14.229 ℹ️ [INFO] Order processed successfully [👤 usr_sarah <sarah@acme.com> | 🏢 acme-corp | 🆔 req_9921]
}
```

### 4. Business Compliance Audit Trail

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

### 5. AI / LLM Observability

```typescript
import { ai } from "aegislog";

const result = await ai.track({
  model: "gpt-4o",
  provider: "openai",
  prompt: "Summarize this quarterly earnings report",
  call: async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Summarize report..." }],
    });
  },
});
// Automatically logs: 16:10:04 ℹ️ [INFO] 🤖 [AI:SUCCESS] openai:gpt-4o (480 tokens, ~$0.001200, 342ms)
```

---

## 🎨 Customizable Console Display ("Helmet for Console Logging")

```typescript
import { createLogger } from "aegislog";

const logger = createLogger({
  display: {
    preset: "default", // 'default' | 'minimal' | 'compact' | 'detailed'
    icons: true, // ℹ️, ⚠️, 🚨, 🤖, 🛡️, 👤, 🏢
    timestamp: "time-only",
    context: {
      actor: true,
      tenant: true,
      requestId: true,
    },
    colorizeMeta: true,
    filterMeta: (key) => key !== "rawInternalPayload",
  },
});
```

---

## 🖥️ Localhost Dev Inspector

Start the visual developer dashboard:

```bash
npx @aegislog/dev --port 4319
```

Open `http://localhost:4319` in your browser to inspect logs and audit streams in real time.

---

## 📚 Documentation & Guides

- [Introduction & Motivation](./docs/introduction.md)
- [5-Minute Quickstart](./docs/quickstart.md)
- [Ambient Context Propagation](./docs/core-concepts/ambient-context.md)
- [Helmet Security Shield](./docs/core-concepts/helmet-shield.md)
- [Customizable Console Display](./docs/core-concepts/customizable-console.md)
- [Business Compliance Audit Trails](./docs/core-concepts/audit-trails.md)
- [AI & LLM Observability](./docs/core-concepts/ai-observability.md)
- [Type-Safe Event Schemas](./docs/core-concepts/type-safe-events.md)
- [Next.js App Router Guide](./docs/frameworks/nextjs.md)
- [Hono & Cloudflare Workers Guide](./docs/frameworks/hono-and-cloudflare.md)
- [Fastify Plugin Guide](./docs/frameworks/fastify.md)
- [Express Middleware Guide](./docs/frameworks/express.md)
- [OpenTelemetry OTLP Cloud Transports](./docs/transports/opentelemetry.md)
- [Localhost Dev Inspector](./docs/dev-inspector.md)

---

## 🛠️ Tooling & Contributing

AegisLog uses the [Vite+](https://viteplus.dev/) unified toolchain:

```bash
vp check         # Oxlint + Oxfmt + TypeScript validation in ~350ms
vp check --fix   # Auto-format and lint fix
vp test          # Run Vitest test suite
pnpm bench       # Run microbenchmark suite
```

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

---

## 📄 License

MIT © 2026 AegisLog Contributors
