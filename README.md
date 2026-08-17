<p align="center">
  <h1 align="center">🛡️ AegisLog</h1>
  <p align="center">
    <strong>The armored logging, context propagation, and user auditing engine for modern TypeScript.</strong>
  </p>
  <p align="center">
    <em>"A Helmet for your logs — with ambient user context and zero-pipe developer joy."</em>
  </p>
</p>

<p align="center">
  <a href="docs/01-MARKET-RESEARCH.md">Market Research</a> •
  <a href="docs/02-VISION-AND-NAME.md">Vision & Brand</a> •
  <a href="docs/03-CORE-ARCHITECTURE.md">Architecture</a> •
  <a href="docs/04-API-DESIGN-SPEC.md">API Spec</a> •
  <a href="docs/05-SECURITY-AND-MASKING-SPEC.md">Helmet Shield</a> •
  <a href="docs/06-USER-CONTEXT-AND-AUDIT-SPEC.md">User Audit Trails</a> •
  <a href="docs/07-TRANSPORTS-AND-INTEGRATIONS.md">Transports</a> •
  <a href="docs/08-ROADMAP-AND-CONTRIBUTING.md">Roadmap</a>
</p>

---

## 💡 Why AegisLog?

Traditional loggers like **Winston** (too heavy, legacy) and **Pino** (breaks on serverless/edge, requires messy CLI piping `| pino-pretty` to be readable) weren't built for modern TypeScript, async context propagation, or compliance-heavy environments.

**AegisLog** solves this with four core pillars:

1. **🛡️ The "Helmet" for Logging (Zero-Leak Redaction):** Built-in heuristic shield that automatically redacts passwords, Bearer tokens, JWTs, credit cards, and cookies from objects, strings, and errors before serialization.
2. **👤 Ambient User & Tenant Context:** Uses native `AsyncLocalStorage` to automatically attach the current `actor` (user), `tenant` (org), `sessionId`, and `traceId` across deep async call trees without manual argument passing.
3. **🎨 Dual-Engine Developer Experience:**
   - **Local Dev:** Beautiful, structured, color-coded terminal output without requiring external CLI pipes.
   - **Production:** Blazing-fast (< 2.5µs), OpenTelemetry-compliant structured JSON streaming.
4. **🌐 100% Universal & Edge-Ready:** Zero native C++ bindings, zero worker-thread crashes on Cloudflare Workers, Next.js App Router (Server Actions & Route Handlers), Bun, Deno, and Node.js.
5. **📋 Business Audit Trails vs System Logs:** Separate, SOC2/GDPR-ready audit logging engine (`audit.record(...)`) alongside standard operational logging (`logger.info(...)`).

---

## ⚡ Quick Start

### 1. Zero-Config Logging
```typescript
import { logger } from 'aegislog';

logger.info('Server initialized', { port: 3000 });
logger.warn('Rate limit approaching', { ip: '192.168.1.1', attempts: 4 });
```

### 2. Ambient User Context (e.g. Next.js Server Action)
```typescript
'use server';

import { withAegisContext, logger } from 'aegislog/next';

export async function createTeamAction(teamName: string) {
  return withAegisContext({ actor: { id: 'usr_881', email: 'sarah@acme.com' } }, async () => {
    logger.info('Creating new workspace', { teamName });
    // Any downstream database queries or helper functions automatically include sarah@acme.com!
    await teamService.create(teamName);
  });
}
```

### 3. Automatic "Helmet" Shield Sanitization
```typescript
// Even if you log a raw request object with authorization headers or passwords:
logger.error('Failed API call', {
  headers: { authorization: 'Bearer eyJhbGciOiJIUzI1Ni...' },
  body: { email: 'user@test.com', password: 'SuperSecretPassword123' }
});

// Output automatically sanitizes:
// {
//   "headers": { "authorization": "Bearer [REDACTED_TOKEN]" },
//   "body": { "email": "user@test.com", "password": "[REDACTED]" }
// }
```

### 4. SOC2 Audit Trail Logging
```typescript
import { audit } from 'aegislog';

audit.record({
  action: 'billing.subscription_cancelled',
  resource: { type: 'subscription', id: 'sub_9912' },
  reason: 'Customer downgraded to free plan',
  outcome: 'success'
});
```

---

## 📊 Feature Comparison

| Feature | **AegisLog** | **Pino** | **Winston** | **LogTape** |
| :--- | :---: | :---: | :---: | :---: |
| **Strict TypeScript Native** | ✅ | ⚠️ | ❌ | ✅ |
| **Zero-Config Pretty Dev Terminal** | ✅ (Built-in) | ❌ (Needs CLI pipe) | ⚠️ (Manual formatters) | ⚠️ |
| **Edge & Serverless Compatible** | ✅ (Universal) | ❌ (Worker crash) | ❌ | ✅ |
| **Ambient Context (`AsyncLocalStorage`)** | ✅ (First-class) | ⚠️ (`pino-http`) | ❌ | ⚠️ |
| **"Helmet" Security & PII Shield** | ✅ (Built-in) | ⚠️ (Manual regex) | ⚠️ | ❌ |
| **Business Audit Trail Separation** | ✅ (Built-in) | ❌ | ❌ | ❌ |
| **Type-Safe Schemas (Zod / Valibot)**| ✅ (Optional) | ❌ | ❌ | ❌ |
| **OpenTelemetry Trace Correlation**  | ✅ (Native) | ⚠️ (Plugins) | ⚠️ (Plugins) | ✅ |

---

## 📚 Complete Documentation & Specifications

Explore the detailed architecture and specifications:

1. [**01-MARKET-RESEARCH.md**](docs/01-MARKET-RESEARCH.md) — Deep dive into developer pain points, HN/Reddit/X insights, and market gaps.
2. [**02-VISION-AND-NAME.md**](docs/02-VISION-AND-NAME.md) — Project manifesto, naming rationale, and core pillars.
3. [**03-CORE-ARCHITECTURE.md**](docs/03-CORE-ARCHITECTURE.md) — High-throughput pipeline, ambient context, and runtime compatibility.
4. [**04-API-DESIGN-SPEC.md**](docs/04-API-DESIGN-SPEC.md) — Full TypeScript API, middleware adapters for Express/Hono/Next.js.
5. [**05-SECURITY-AND-MASKING-SPEC.md**](docs/05-SECURITY-AND-MASKING-SPEC.md) — The "Helmet" for logs: automatic secret & PII sanitization.
6. [**06-USER-CONTEXT-AND-AUDIT-SPEC.md**](docs/06-USER-CONTEXT-AND-AUDIT-SPEC.md) — Actor/tenant context and compliance audit engine.
7. [**07-TRANSPORTS-AND-INTEGRATIONS.md**](docs/07-TRANSPORTS-AND-INTEGRATIONS.md) — Sinks for Stdout, OpenTelemetry, Axiom, Datadog, and Serverless `waitUntil`.
8. [**08-ROADMAP-AND-CONTRIBUTING.md**](docs/08-ROADMAP-AND-CONTRIBUTING.md) — Monorepo structure, phases, and milestone delivery.
9. [**09-HOW-CONTEXT-WORKS.md**](docs/09-HOW-CONTEXT-WORKS.md) — Deep dive into AsyncLocalStorage, late-binding auth, and background queues.
10. [**10-MODERN-FEATURES-WISHLIST.md**](docs/10-MODERN-FEATURES-WISHLIST.md) — 2026 wishlist: AI token tracking, Debug-on-Error ring buffer, local web dashboard.

---

## 📄 License

MIT © 2026
