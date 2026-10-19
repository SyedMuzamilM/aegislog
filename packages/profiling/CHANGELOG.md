# @aegislog/profiling

## 0.3.1

### Patch Changes

- Resolve the Express profiling entry's declarations under TypeScript's legacy Node/CommonJS module resolver. Add a standalone consumer compilation regression test without changing runtime instrumentation.
- aegislog@0.3.1

## 0.3.0

### Minor Changes

- Add opt-in request profiling with MongoDB, Mongoose, pool checkout, ioredis and HTTP spans, bounded request waterfalls, privacy filtering and optional real OTLP trace export. Correlate profiles with Aegis context, accumulate repeated manual Express phases safely, and record sampled category metrics without double-counting HTTP requests. Existing OTLP log transport behavior remains unchanged.

### Patch Changes

- aegislog@0.3.0
