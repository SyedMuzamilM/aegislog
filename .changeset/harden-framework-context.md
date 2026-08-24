---
"@aegislog/express": patch
"@aegislog/fastify": patch
"@aegislog/hono": patch
"@aegislog/next": patch
---

Harden framework request context handling:

- Use the core request ID generator consistently and preserve request context in lifecycle logs.
- Complete per-request debug buffers on successful, denied, failed, and prematurely closed requests.
- Forward rejected asynchronous actor or tenant resolution to Express 4 error middleware instead of leaving requests unresolved.
