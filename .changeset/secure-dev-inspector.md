---
"@aegislog/dev": patch
---

Secure the local Dev Inspector:

- Escape all event fields before rendering and add a nonce-based Content Security Policy.
- Reject cross-origin browser requests, oversized bodies, and malformed events.
- Require a shared bearer token when binding beyond loopback, with matching `--token` CLI and `DevViewerSink` options.
- Track pending inspector requests during `flush()` and resume SSE streams without duplicate reconnect loops.
