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

- [ ] Core `AegisLogger` class with log levels (`debug`, `info`, `warn`, `error`, `fatal`).
- [ ] Ambient context runner using native `AsyncLocalStorage`.
- [ ] Built-in **Helmet Security Shield** (case-insensitive dictionary + regex token masking).
- [ ] Circular-safe, allocation-efficient serializer.
- [ ] Beautiful zero-config Dev Console Formatter (TUI badges, highlight stacks).
- [ ] High-throughput Production JSON Formatter.

### Phase 2: Framework Adapters (v0.2.0)

- [ ] `@aegislog/hono` middleware (Cloudflare Workers, Bun, Deno).
- [ ] `@aegislog/next` context wrappers for Server Actions and Route Handlers.
- [ ] `@aegislog/express` and `@aegislog/fastify` HTTP request logging middleware.

### Phase 3: Audit Engine & Schema Validation (v0.3.0)

- [ ] `@aegislog/audit` module for immutable business event logs.
- [ ] Type-safe event definitions with Zod & Valibot schema validation.
- [ ] S3 and PostgreSQL audit sinks.

### Phase 4: Cloud Transports & Observability (v0.4.0)

- [ ] OpenTelemetry OTLP trace and span correlation sink.
- [ ] Direct batching cloud sinks for Axiom, BetterStack, and Datadog.
- [ ] Edge `waitUntil` lifecycle flush handlers.

### Phase 5: Interactive Dev Viewer / TUI (v1.0.0)

- [ ] Optional local developer dashboard (inspired by `oplogs`) for real-time visual log stream inspection, user session timeline filtering, and payload inspection.
