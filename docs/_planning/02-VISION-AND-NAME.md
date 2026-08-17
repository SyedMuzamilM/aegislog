# 🏷️ Project Vision, Positioning & Naming Proposals

---

## 1. Project Manifesto

Modern server applications don't just fail because of bugs—they fail because of **blind spots** and **data leaks**.

Traditional loggers were built for 2012-era monolithic Node.js scripts writing to `/var/log/app.log`. Today, developers build serverless microservices, edge functions, Next.js Server Actions, and distributed AI agents. They juggle complex user sessions, micro-tenants, compliance mandates (GDPR, SOC2, HIPAA), and distributed traces.

Our mission is to create **the definitive TypeScript logging and auditing framework**:

- **Protected by Default:** Safe serialization and active PII shielding ("Helmet for your logs").
- **Aware of Context:** Effortlessly tracks the user, tenant, and request through asynchronous tasks.
- **Joyful Developer Experience:** Instantly human-readable in development, ultra-fast OpenTelemetry JSON in production.
- **Universal:** Seamless in Node.js, Bun, Deno, Next.js, and Cloudflare Workers.

---

## 2. Naming Candidates & Rationale

We evaluated several naming options based on memorability, domain availability, npm package brevity, and psychological resonance:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NAMING SPECTRUM                                  │
├───────────────────┬────────────────────────────┬────────────────────────────┤
│ Security / Shield │ Context / Observability    │ Sibling / Developer Punch  │
├───────────────────┼────────────────────────────┼────────────────────────────┤
│ 🛡️ AegisLog       │ 🧭 CtxLog / TelepathLog    │ ⚡ Oplogger / LogPulse     │
│ 🛡️ LogGuard       │ 🌐 OmniLog                 │ ⚡ HyperLog                │
│ 🛡️ SentinelLog    │ 🔗 Synclog                 │ ⚡ ZeroLog-TS              │
│ 🛡️ VigilLog       │ 🎯 UserLog                 │ ⚡ CraftLog                │
└───────────────────┴────────────────────────────┴────────────────────────────┘
```

### Option A: `AegisLog` / `aegislog` ⭐ (Top Recommendation)

- **Etymology:** _Aegis_ (Ancient Greek: αἰγίς) — the mythical shield/armor of Athena & Zeus representing divine protection.
- **Why it fits:** Exactly matches the user's requirement: **"The Helmet for Logging"**. It conveys fortified security, automatic PII masking, data protection, and resilience.
- **Tagline:** _"The armored logging & user auditing engine for TypeScript."_
- **Package Name:** `aegislog` or `@aegislog/core`

### Option B: `LogGuard` / `logguard`

- **Why it fits:** Direct, explicit, easy to remember. Emphasizes security, context isolation, and guarded execution.
- **Tagline:** _"Type-safe server logging with built-in security and user context."_
- **Package Name:** `logguard`

### Option C: `VigilLog` / `vigillog`

- **Etymology:** _Vigilance_ (constant watchful attention).
- **Why it fits:** Perfect for both operational observability and user audit trails.
- **Tagline:** _"Vigilant server-side logging, user tracking, and audit trails."_

### Option D: `Oplogger` / `oplog-ts`

- **Why it fits:** Sibling project to the existing `oplogs` workspace repo. Bridges the experiment tracking world of `oplogs` into general server-side TypeScript backend operations.
- **Tagline:** _"High-signal server logging and user audit engine."_

---

## 3. Brand Identity & Pillars

### Core Personality

- **Armored & Safe:** Never leaks secrets or throws unhandled serialization crashes.
- **Human-Centric:** Treats "Who did what and when" (User/Actor Context) with equal importance to "What function threw an error".
- **Zero-Friction:** Works with `import { logger } from 'aegislog'` in one line—no mandatory 40-line configuration files.
- **Modern & Fast:** Built for modern runtimes (Bun, Next.js, Cloudflare Workers, Node 20+).

---

## 4. Feature Highlights & Value Propositions

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                              AEGISLOG                                  │
 ├────────────────────────────────────────────────────────────────────────┤
 │  🛡️ Zero-Leak Sanitizer     │ Auto-redacts auth, tokens, PII, keys    │
 │  👤 Ambient User Context    │ AsyncLocalStorage actor & tenant store   │
 │  📋 SOC2-Ready Audit Engine │ Differentiated business audit logging    │
 │  🎨 Dev/Prod Dual Engine    │ Zero-pipe terminal TUI + Raw JSON stream │
 │  ⚡ Universal Edge Runtime   │ Cloudflare Workers, Vercel, Bun, Node    │
 │  📐 Typed Event Schemas     │ Zod / Valibot schema verification        │
 └────────────────────────────────────────────────────────────────────────┘
```
