# 🏗️ Core Architecture & Pipeline Specification

---

## 1. System Overview

AegisLog processes every log invocation through a high-speed, zero-leak pipeline designed for modern asynchronous runtimes:

```
  [ Application Code / Middleware ]
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│              1. Entry Point API                  │
│    logger.info() / logger.error() / audit()      │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│          2. Ambient Context Resolver             │
│   AsyncLocalStorage: extracts actor, tenantId,   │
│   requestId, sessionId, traceId & spanId         │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│          3. The "Helmet" Security Shield         │
│   - Fast recursive key & value redaction         │
│   - Circular reference safe serialization        │
│   - Error stack trace normalizer                 │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│          4. Schema & Metadata Validator          │
│   (Optional) Zod / Valibot / TypeBox validation  │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│            5. Dual-Mode Output Engine            │
│  ┌───────────────────────┬─────────────────────┐ │
│  │ Local Dev TUI Mode    │ Production Mode     │ │
│  │ - Color-coded levels  │ - OTel format JSON  │ │
│  │ - Highlighted errors  │ - Microsecond fast  │ │
│  │ - Clean object tables │ - Streamlined bytes │ │
│  └───────────────────────┴─────────────────────┘ │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│              6. Transport Dispatch               │
│   Stdout / Console / OpenTelemetry / Sinks       │
└──────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Subsystems

### 2.1 Ambient Context Engine (`AsyncLocalStorage`)

Traditional loggers force developers to create child loggers and pass them into every function. AegisLog implements an ambient context runner:

```typescript
import { contextStorage } from "aegislog";

// Ambient context interface
export interface AegisContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  actor?: {
    id: string;
    email?: string;
    role?: string;
  };
  tenant?: {
    id: string;
    slug?: string;
    tier?: string;
  };
  session?: {
    id: string;
    ip?: string;
    userAgent?: string;
  };
  tags?: Record<string, string>;
}
```

When an HTTP request or background job runs inside `runWithContext(context, fn)`, any invocation of `logger.info()` or `logger.error()` throughout the async call tree automatically retrieves and includes the ambient context.

### 2.2 The "Helmet" Security & Redaction Engine

Similar to how Express `helmet` applies default security headers, AegisLog's **Security Shield** runs before any log data is serialized or printed.

#### Redaction Rules:

1. **Key-Name Matches:** Any key matching `password`, `secret`, `authorization`, `cookie`, `token`, `apiKey`, `creditCard`, `cvv`, `ssn`, `privateKey`, etc., is automatically replaced with `[REDACTED]`.
2. **Pattern-Based Scanning:** Strings containing Bearer tokens (`Bearer eyJ...`), AWS keys (`AKIA...`), and credit card numbers are masked at the string level.
3. **Safe Serialization:** Standard `JSON.stringify` throws `TypeError: Converting circular structure to JSON` when given complex database models or raw request objects. AegisLog implements an allocation-free circular reference detector with depth capping.

### 2.3 Dual-Mode Rendering Engine

#### Development Mode (Terminal TUI)

- Zero external CLI tools or piping required (`node app.ts` works immediately).
- High-contrast color-coded badges for log levels (`INFO`, `WARN`, `ERROR`, `AUDIT`).
- Clean inline metadata formatting.
- Interactive-style formatted error stacks highlighting app code vs. `node_modules`.

#### Production Mode (Ultra-Fast Structured JSON)

- Outputs pure, newline-delimited JSON (`NDJSON`).
- Follows OpenTelemetry / Cloud Native log data models.
- Benchmarked to execute in under **2.5 microseconds** per log call with negligible GC pressure.

---

## 3. Universal Runtime Compatibility

AegisLog is designed from day one to operate identically across:

- **Node.js:** (v18.0.0+) using native `node:async_hooks`.
- **Bun:** (v1.0.0+) native high-speed streams.
- **Deno:** (v1.30.0+) standard web APIs.
- **Cloudflare Workers / Vercel Edge:** Pure JS execution with no native binary bindings or `worker_threads` dependencies.
- **Next.js (App Router):** First-class support in Server Components, Route Handlers, and Server Actions.
