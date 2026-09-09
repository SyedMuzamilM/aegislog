# @aegislog/fastify

## 0.2.6

### Patch Changes

- Add HTTP latency waterfall histograms, phase duration metrics, and W3C Server-Timing support
- Updated dependencies
  - aegislog@0.2.6

## 0.2.5

### Patch Changes

- Add Prometheus metrics sink and W3C trace context correlation:

  - Add `PrometheusMetricsSink` in `@aegislog/transports` providing zero-dependency Prometheus exposition format (`/metrics`) tracking log volume, error rates, compliance audit records, and AI tokens/costs.
  - Add W3C `traceparent` parsing, formatting, and trace ID / span ID dynamic getters and setters to `aegislog` ambient context.
  - Update Express, Fastify, and Hono middlewares to automatically extract W3C `traceparent` headers into ambient context for seamless Grafana Tempo distributed trace linking.

- Updated dependencies
  - aegislog@0.2.5

## 0.2.4

### Patch Changes

- aegislog@0.2.4

## 0.2.3

### Patch Changes

- c189aaa: Harden framework request context handling:

  - Use the core request ID generator consistently and preserve request context in lifecycle logs.
  - Complete per-request debug buffers on successful, denied, failed, and prematurely closed requests.
  - Forward rejected asynchronous actor or tenant resolution to Express 4 error middleware instead of leaving requests unresolved.

- Updated dependencies [c189aaa]
  - aegislog@0.2.3

## 0.2.2

### Patch Changes

- **📖 Documentation & NPM Landing Page:** Added dedicated package README and plugin documentation.

## 0.2.1

### Patch Changes

- **✨ Fix Re-Export Symbol Ambiguity:** Removed duplicate re-exports of core symbols (`logger`, `context`, `audit`, `createLogger`) from `@aegislog/fastify` to avoid TS2308 collisions in consuming applications.
- Updated dependencies:
  - aegislog@0.2.1

## 0.1.1

### Patch Changes

- # Patch Release (v0.1.1) 🚀
  - **🎨 Modern Console Redesign:** Tree-structured metadata layout (`│`), aligned pill badges, and sleek HTTP latency formatting (`⚡ 2.34ms`).
  - **🖥️ Dev Inspector Streaming:** Automatic `DevViewerSink` attachment when `dev: true` or `AEGIS_DEV=true` is set.
  - **🛡️ Resilient Web UI:** Hardened timestamp parsing and active connection indicators for the local real-time Dev Inspector dashboard.
  - **⚡ Scripts:** Added `pnpm inspector` shortcut and `start` script to `@aegislog/dev`.

- 1e11d79: # Initial Release (v0.1.0) 🛡️

  The armored logging, ambient context propagation, and user auditing engine for modern TypeScript.

  ### ✨ Features Included
  - **Ambient Context Engine:** Zero parameter drilling with `AsyncLocalStorage` context propagation (`runWithContext`, `setActor`, `setTenant`, `setSession`, `setTag`).
  - **Helmet Security Shield:** Sub-microsecond automated PII and secret redaction for passwords, tokens, Bearer auth, JWTs, OpenAI/AWS keys, and credit cards.
  - **Customizable Console Display:** Rich syntax-colored JSON trees, clean error stack traces, and configurable presets (`default`, `minimal`, `compact`, `detailed`).
  - **Business Compliance Audit Trails:** Immutable compliance events with `audit.record()`, outcome badges, and diff tracking.
  - **AI / LLM Observability:** Built-in `ai.track()` & `ai.log()` measuring prompt/completion tokens, latency, and estimated USD cost across GPT-4o, Claude 3.5, Gemini 2.0, and DeepSeek.
  - **Type-Safe Event Schemas:** Native support for Standard Schema v1, Zod, and Valibot event contracts via `defineLogEvent()`.
  - **Framework Adapters:** Dedicated middleware & plugin packages for **Hono**, **Next.js App Router**, **Fastify**, and **Express**.
  - **Cloud Transports:** Native OpenTelemetry OTLP `/v1/logs` HTTP export and high-throughput batching Axiom/HTTP sinks.
  - **Localhost Dev Inspector:** Standalone realtime visual web dashboard and CLI (`npx @aegislog/dev --port 4319`).

- Updated dependencies
- Updated dependencies [1e11d79]
  - aegislog@0.1.1
