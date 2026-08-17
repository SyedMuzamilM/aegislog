# Introduction to AegisLog 🛡️

**AegisLog** ("The Helmet of TypeScript logging") is the armored logging, context propagation, and user auditing engine designed specifically for modern TypeScript and serverless runtimes.

```
                  ┌─────────────────────────────────┐
                  │          USER REQUEST           │
                  └────────────────┬────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │       AegisLog Context Engine 🛡️          │
             │   (AsyncLocalStorage Context Propagation)  │
             │  • Actor (User ID, Email, Role)           │
             │  • Tenant (Org ID, Tier, Plan)            │
             │  • Request ID & Trace Correlation         │
             └─────────────────────┬─────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
   ┌───────────────────────────┐       ┌───────────────────────────┐
   │    Ephemeral App Logs     │       │ Business Audit Records    │
   │  (Debug / Info / Errors)  │       │  (Immutable Compliance)   │
   └─────────────┬─────────────┘       └─────────────┬─────────────┘
                 │                                   │
                 ▼                                   ▼
   ┌───────────────────────────┐       ┌───────────────────────────┐
   │   Helmet Security Shield  │       │   Long-term Storage /     │
   │ (Auto PII/JWT/Card Scrub) │       │   Compliance SIEM Sink    │
   └─────────────┬─────────────┘       └───────────────────────────┘
                 │
                 ▼
   ┌───────────────────────────────────────────────┐
   │             Dual Output Modes                 │
   │  • Local Dev: ANSI TUI with Syntax Colors     │
   │  • Production: OTel-Compliant High-Speed JSON │
   │  • Cloud: OpenTelemetry OTLP / Axiom / HTTP   │
   │  • Dev Inspector: Realtime Web Dashboard      │
   └───────────────────────────────────────────────┘
```

---

## 💥 Why Traditional Loggers Fail in Modern TypeScript

| Problem in Pino / Winston                                                                                                                                                                | How AegisLog Solves It                                                                                                                                                                                 |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker Threads Break on Edge:** Pino relies on Node.js `worker_threads` and Unix pipes (`\| pino-pretty`), which crash or drop logs on Cloudflare Workers, Vercel Serverless, and Bun. | **Zero-Pipe Universal Engine:** AegisLog formats directly in memory with 0 external runtime dependencies. Works identically on Node.js, Cloudflare Workers, Bun, Deno, and Browser.                    |
| **Accidental PII & Secret Leaks:** Developers accidentally log `{ user, headers, token }`, leaking JWTs, Bearer keys, credit cards, or passwords to Datadog/CloudWatch.                  | **Built-in Helmet Security Shield:** Automatically sanitizes passwords, Authorization headers, Bearer tokens, OpenAI/AWS keys, JWTs, and credit card numbers at sub-microsecond speed before emission. |
| **Manual Parameter Drilling:** Passing `userId`, `tenantId`, or `requestId` through 15 nested service functions to correlate logs.                                                       | **Ambient `AsyncLocalStorage` Context:** Set the user once in middleware/Server Action. Every logger call in that async call stack automatically includes actor and tenant data.                       |
| **No Compliance Audit Distinction:** Mixing temporary debug noise with critical security compliance events (e.g. `user.role_changed`, `billing.plan_upgraded`).                          | **First-Class Audit Trail Engine:** Dedicated `audit.record()` API with strict compliance event schema, outcome badges, and diff tracking.                                                             |
| **No Native AI Observability:** No standard way to trace LLM calls, prompts, token counts, and USD cost.                                                                                 | **Integrated `logger.ai.track()`:** Automatically measures prompt/completion tokens, calculates dynamic USD cost, measures latency, and scrubs prompt secrets.                                         |

---

## 📦 Monorepo Architecture

AegisLog is structured as an ecosystem of lightweight, modular packages:

- [`aegislog`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/core) (`@aegislog/core`): Core logging, context, helmet shield, AI tracker, and audit engine.
- [`@aegislog/next`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/next): Next.js App Router context wrapper & Server Actions logger.
- [`@aegislog/hono`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/hono): Hono & Cloudflare Workers edge middleware adapter.
- [`@aegislog/fastify`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/fastify): Fastify plugin with global request correlation hooks.
- [`@aegislog/express`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/express): Express request/response lifecycle middleware.
- [`@aegislog/transports`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/transports): Native OpenTelemetry OTLP `/v1/logs` and batching HTTP cloud sinks.
- [`@aegislog/dev`](file:///Users/syedmuzamilm/work/opensource/aegislog/packages/dev): Local visual web inspector dashboard (`npx aegislog dev`).
