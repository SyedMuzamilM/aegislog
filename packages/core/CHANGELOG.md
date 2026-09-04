# aegislog

## 0.2.5

### Patch Changes

- Add Prometheus metrics sink and W3C trace context correlation:

  - Add `PrometheusMetricsSink` in `@aegislog/transports` providing zero-dependency Prometheus exposition format (`/metrics`) tracking log volume, error rates, compliance audit records, and AI tokens/costs.
  - Add W3C `traceparent` parsing, formatting, and trace ID / span ID dynamic getters and setters to `aegislog` ambient context.
  - Update Express, Fastify, and Hono middlewares to automatically extract W3C `traceparent` headers into ambient context for seamless Grafana Tempo distributed trace linking.

## 0.2.4

## 0.2.3

### Patch Changes

- c189aaa: Harden core logging security and request isolation:

  - Sanitize default metadata, child logger metadata, documented credential-key variants, scalar session values, complete audit records, and `bigint` values.
  - Keep debug-on-error ring buffers separate for each request, discard successful request trails, and flush trails for failed HTTP requests.
  - Wait for asynchronous sink writes during `flush()`, report sink failures, and finish graceful shutdown by restoring the original signal behavior.
  - Capture and sanitize common OpenAI, Anthropic, and Gemini completion response shapes, with an `extractCompletion` option for custom providers.

## 0.2.2

### Patch Changes

- **📖 Documentation & NPM Landing Page:** Added dedicated package README and LICENSE for NPM landing page.

## 0.2.1

### Patch Changes

- **🏥 Built-in Domain Presets (`hipaa`, `pci`, `financial`, `strict`):** Added domain-specific redaction presets to `ShieldOptions`.
- **🛑 Native Graceful Shutdown:** Added `logger.flush()` and `logger.enableGracefulShutdown()` / `createLogger({ gracefulShutdown: true })`.
- **🪵 Flexible Error Signatures:** Support for `logger.error(err, meta)` and variadic error argument handling.

## 0.2.0

### Minor Changes

- **🛡️ Custom Pattern & Domain Redaction Rules:** Added first-class support for `customPatterns` in `ShieldOptions` and `SecurityShield`. Supports both raw `RegExp` patterns and `{ pattern: RegExp, replacer: string | Function }` rules for custom domain PII/PHI redaction.
- **⚙️ Redaction Toggles:** Added full support for `maskCreditCards`, `maskTokens`, and `maskJwt` granular toggle options in `ShieldOptions`.

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
