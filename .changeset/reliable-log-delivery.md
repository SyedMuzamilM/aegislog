---
"@aegislog/transports": patch
---

Prevent buffered logs from being silently lost during transport failures:

- Keep HTTP, OpenTelemetry, and MongoDB batches queued until delivery succeeds, including while another flush is in flight.
- Reject manual flushes on failed requests or inserts so applications can detect delivery failures.
- Preserve structured metadata, errors, tags, actor, tenant, session, and audit records in OTLP exports.
- Validate MongoDB sink configuration and escape literal text used by the historical log search helper.
