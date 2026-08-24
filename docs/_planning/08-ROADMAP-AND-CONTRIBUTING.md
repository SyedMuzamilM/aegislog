# 🗺️ Roadmap, Monorepo Structure & Contributing Guide

---

## 1. Monorepo Architecture

AegisLog is structured as a modern pnpm / Turborepo monorepo with clean sub-packages:

```
aegislog/
├── docs/                        # Complete RFCs and architecture specs
├── packages/
│   ├── core/                    # Zero-dependency core logging & context engine
│   │   ├── src/
│   │   │   ├── context/         # AsyncLocalStorage ambient context runner
│   │   │   ├── shield/          # "Helmet" PII & secret redaction engine
│   │   │   ├── formatters/      # Dev TUI & Prod JSON formatters
│   │   │   ├── sinks/           # Console, Stdout, Memory sinks
│   │   │   └── logger.ts        # Main Logger implementation
│   │   └── package.json
│   ├── audit/                   # Dedicated SOC2/GDPR business audit trail engine
│   ├── express/                 # Express middleware adapter
│   ├── hono/                    # Hono & Cloudflare Workers middleware adapter
│   ├── next/                    # Next.js App Router (Server Actions & Route Handlers)
│   ├── fastify/                 # Fastify plugin adapter
│   └── transports/
│       ├── otel/                # OpenTelemetry OTLP sink
│       ├── axiom/               # Axiom sink
│       └── datadog/             # Datadog sink
├── examples/                    # Demo projects (Express, Next.js, Hono, Bun)
├── package.json
└── tsconfig.base.json
```

---

## 2. Phased Development Roadmap

### Phase 1: Core Engine & Security Shield (v0.1.0)

- [x] Core `AegisLogger` class with log levels (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- [x] Ambient context runner using native `AsyncLocalStorage`.
- [x] Built-in **Helmet Security Shield** (case-insensitive dictionary + regex token masking).
- [x] Circular-safe, depth-capped serializer.
- [x] Zero-config Dev Console Formatter (TUI badges, highlighted stacks).
- [x] Production JSON Formatter.

### Phase 2: Framework Adapters (v0.2.0)

- [x] `@aegislog/hono` middleware (Cloudflare Workers with `nodejs_compat`, Bun, Deno).
- [x] `@aegislog/next` context wrappers for Server Actions and Route Handlers.
- [x] `@aegislog/express` and `@aegislog/fastify` HTTP request logging middleware.

### Phase 3: Audit Engine & Schema Validation (v0.3.0)

- [x] Core `audit.record()` engine for structured business event logs.
- [x] Type-safe event definitions with Standard Schema, Zod, and Valibot validation.
- [ ] S3 and PostgreSQL audit sinks.

### Phase 4: Cloud Transports & Observability (v0.4.0)

- [x] OpenTelemetry OTLP trace and span correlation sink.
- [x] Batched Axiom and generic HTTP sinks.
- [ ] Dedicated BetterStack and Datadog sink presets.
- [ ] Edge `waitUntil` lifecycle flush handlers.

### Phase 5: Interactive Dev Viewer / TUI (v1.0.0)

- [x] Optional local developer dashboard for real-time visual log streaming, level/audit filtering, search, and payload inspection.
