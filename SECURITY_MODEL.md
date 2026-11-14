# Security model: aegislog

Threat model used to prioritize security scan findings for this repository. It was written with the maintainer from the code. Facts marked _(maintainer)_ came from the maintainer; the rest is read from the code. Edit it as the system changes.

## Maintainer priorities _(maintainer)_

- **Assets:** all assets weigh the same; none is ranked above the others.
- **Attackers:** all count. None is ruled out.
- **Out of scope:** `docs/`, `examples/`, `bench/` and tests (`test/`, `tests/`, `Tests/`, `*.test.*`, `*_test*`). Findings located only in those paths are not worth fixing. Production code that a test exercises stays in scope.

## Components

| Component               | Code                                                                          | Trust boundary                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **aegislog-core**       | `packages/core/**` (shield.ts redaction, context, audit, ai)                  | Library inside the host app's process; untrusted log data in                     |
| **aegislog-transports** | `packages/transports/**`, `packages/{express,fastify,hono,next,profiling}/**` | Outbound to Loki/OTLP/Mongo/Axiom/HTTP; query helpers; framework middleware      |
| **aegislog-dev**        | `packages/dev/**`                                                             | Local dev inspector HTTP/SSE server (loopback default, token required otherwise) |

## System, entry points, assets and attackers

TypeScript logging library published to npm. Assets: secrets/PII in the host app's logs (redaction via `shield.ts` key dictionary + regex scrubber + presets hipaa/pci/financial/strict), audit records, AsyncLocalStorage actor/tenant context. Entry points: whatever the host app logs (attacker-controlled request data), framework middleware logging headers, `lokiSink.query`/`mongoSink.query` filter synthesis (LogQL/Mongo query injection if host passes user input), transport URLs/credentials, the dev inspector (`packages/dev`, default 127.0.0.1:4319). Attackers: remote users whose input reaches logs (log injection, ReDoS in scrubber regexes, redaction bypass), cross-tenant context bleed in async stacks.

## Open questions

- Should developer tooling (the `packages/dev` inspector) be treated as lower priority?
