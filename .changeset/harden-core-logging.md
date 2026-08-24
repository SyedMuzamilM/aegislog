---
"aegislog": patch
---

Harden core logging security and request isolation:

- Sanitize default metadata, child logger metadata, documented credential-key variants, scalar session values, complete audit records, and `bigint` values.
- Keep debug-on-error ring buffers separate for each request, discard successful request trails, and flush trails for failed HTTP requests.
- Wait for asynchronous sink writes during `flush()`, report sink failures, and finish graceful shutdown by restoring the original signal behavior.
- Capture and sanitize common OpenAI, Anthropic, and Gemini completion response shapes, with an `extractCompletion` option for custom providers.
