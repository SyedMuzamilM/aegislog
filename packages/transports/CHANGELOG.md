# @aegislog/transports

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
