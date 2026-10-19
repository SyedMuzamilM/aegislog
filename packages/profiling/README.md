# @aegislog/profiling

Opt-in request waterfalls for Node.js applications using AegisLog. Profiles include MongoDB commands, MongoDB pool checkout, Mongoose operations, ioredis, Node HTTP and fetch/Undici. Add named spans around authentication, cache adapters or application functions.

AegisLog's normal logger already measures total HTTP duration and manual phases. Its `OpenTelemetrySink` sends **OTLP logs** to `/v1/logs`. This package creates **actual traces** and optionally sends them to `/v1/traces`. No collector is needed for the Aegis request-summary log.

## Start before application imports

Install `aegislog`, `@aegislog/express` and `@aegislog/profiling`. Node 18.19 or newer is required. The package is optional; existing Aegis users need no new dependencies or configuration.

For a CommonJS application, initialize profiling before requiring Express or database/HTTP clients:

```js
// profiling.cjs
const { startProfiling } = require("@aegislog/profiling");
module.exports = startProfiling({
  enabled: process.env.API_PROFILING_ENABLED === "true",
  serviceName: "my-api",
  environment: "production",
  sampleRate: 0.1,
  maxSpans: 200,
  // Optional. Without this, use your existing Loki/log sinks.
  // otlp: { endpoint: 'https://collector.example/v1/traces', headers: { Authorization: '...' } },
});
```

```js
const profiler = require("./profiling.cjs"); // first
const express = require("express");
const { createLogger } = require("aegislog");
const { aegisExpressMiddleware } = require("@aegislog/express");
const { createExpressProfilingMiddleware } = require("@aegislog/profiling/express");
const app = express();
const log = createLogger({/* existing Loki, console and metrics sinks */});
app.use(
  createExpressProfilingMiddleware(profiler, {
    logger: log,
    environment: "production",
    filter: (req) => req.path !== "/health" && req.path !== "/metrics",
  }),
);
app.use(aegisExpressMiddleware({ logger: log }));
app.use(express.json());
// Authentication and routes follow.
// During your existing graceful shutdown, drain requests first:
// await profiler.shutdown(); await log.flush();
```

Both ESM and CommonJS exports are provided. With ESM, preload profiling before static application imports, for example `node --import ./profiling.mjs app.mjs`. Instrumentation of native ESM dependency imports additionally requires the OpenTelemetry instrumentation loader; see that instrumentation's runtime instructions. The integration suite tests both package export formats with clients loaded through Node's CommonJS loader, the loading path used by TypeScript CommonJS builds.

Register only one OpenTelemetry SDK in a process. If your application already owns a global SDK, integrate the exported `RequestProfileProcessor` and appropriate instrumentation into it rather than starting another SDK. This package does not replace an existing SDK automatically. `shutdown()` flushes pending trace exports, is idempotent, and should run after requests have drained. Starting a second enabled profiling runtime in the same process is rejected.

## Measure application work

```ts
import { profileOperation, profileSync, profileMiddleware } from "@aegislog/profiling";

const result = await profileOperation("recommendations.load", "application", () =>
  loadRecommendations(),
);
const output = profileSync("response.transform", "application", () => transform(result));
app.use(profileMiddleware("auth.validate", "auth", authenticate));
```

Names and categories must be static and must not contain user identifiers or health data. Optional attributes are restricted to the package's safe allowlist. Query statements, documents, URLs, headers, Redis keys, exception events/messages and link attributes are removed before processors or exporters receive completed spans. Route templates come from Express instrumentation, including nested mount paths. If that instrumentation is disabled, supply a template-only `route` resolver to the middleware when full mounted routes are needed. Existing application log behavior is unchanged.

Without a sampled request context, helpers call the function directly. `profileOperation` preserves its returned promise identity and error behavior. Middleware timing ends before calling `next`, so the route does not become part of authentication time. `profileSync` measures synchronous execution; it does not measure later asynchronous work.

## Read the results

A sampled response includes `x-request-id`, `x-profile-trace-id` and `Server-Timing` category durations. Invalid request IDs are replaced. Expose these headers in your application's CORS configuration if browser JavaScript needs to read them. Server timing does not set a global cross-origin timing policy.

One Aegis log with `meta.event="request_profile"` contains:

- `requestId`, `traceId`, template `route`, method, status, `aborted` and sample rate.
- `totalMs` through response finish or premature close.
- `operations`, each with start offset, duration, parent span ID, category and status.
- `categories`, with operation count, summed `workMs`, interval-merged `wallMs` and error count.
- `uninstrumentedMs`, time outside named application/dependency/authentication/serialization spans.
- `droppedSpans`, operations omitted after the request cap.

Parallel and nested spans overlap. Do not add categories or command durations to elapsed request time. MongoDB commands include transport time, not just database execution. Pool checkout includes waiting and connection establishment. Mongoose spans include driver work and hydration. Remaining time is **not CPU time**; it can include application work, body upload, server selection, event-loop delay and response streaming.

Header timing is captured at the first response headers; the final log covers the whole response lifetime. Open operations are clipped and marked `unfinished`. Detached work after completion is outside the summary. Once the cap is reached, further spans are not recorded for that request. The OTLP queue is bounded and can drop spans during collector outages. Request profiling logs use your configured logger level, shield and sinks, so those settings still govern delivery and retention.

The middleware preserves valid incoming W3C trace IDs, but samples locally regardless of incoming sampled flags. `sampleRate=0` produces no profiles. `enabled=false` does not install instrumentation. Random head sampling does not guarantee that every slow request is retained.

`@aegislog/transports` recognizes profile category wall times and records them in `aegislog_http_phase_duration_seconds` without incrementing HTTP request totals a second time. These phase observations describe the sampled traffic only. Choose static categories and route templates to keep metric cardinality bounded. In Loki, find `request_profile` by request ID; in Tempo, look up the trace ID.

Supported automatic instrumentation currently covers MongoDB 7 pool checkout, MongoDB commands, Mongoose through version 9, ioredis 5, Express 4/5, Node HTTP and Undici. It does not capture CPU stacks, arbitrary SQL clients, filesystem work or WebSockets. Disable unused integrations with `instrumentations: { redis: false }`, for example. Application-specific wrappers remain useful for logical operations above those clients.

## Tests

`pnpm build && pnpm test` builds both export formats and runs integration fixtures in fresh Node processes. The tests use a temporary MongoDB server, real MongoDB and Mongoose clients, an ioredis client talking to a local RESP fixture, both HTTP transports and a local OTLP receiver. They exercise concurrent requests, failures, aborted responses, nested routes, privacy filtering, disabled/zero-rate collection, remote sampling flags and span caps. No production services or credentials are used.
