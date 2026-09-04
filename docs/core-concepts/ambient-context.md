# Ambient Context Engine 🌐

One of the biggest frustrations in backend development is **parameter drilling** — passing `userId`, `tenantId`, and `requestId` through dozens of database functions, third-party API clients, and business logic methods just so the logs contain who triggered the action.

AegisLog eliminates parameter drilling by leveraging Node.js and modern JS runtimes' native **`AsyncLocalStorage`** engine.

---

## 🧭 How It Works

When a request enters your application (via middleware, Next.js Server Action, or job worker), AegisLog creates an isolated asynchronous storage context.

Every `logger` call anywhere inside that asynchronous call stack automatically reads the ambient context without requiring you to pass objects around.

```
Incoming Request ──► [ Middleware: runWithContext(ctx) ]
                            │
                            ├──► Controller Method
                            │         │
                            │         ▼
                            ├──► Service Layer ──► logger.info("Calculating tax")
                            │         │            (Automatically includes user & org)
                            │         ▼
                            └──► Repository Layer ──► logger.debug("Querying Postgres")
                                                  (Automatically includes user & org)
```

---

## 🛠️ API Reference

### 1. `runWithContext(context, callback)`

Executes a synchronous or asynchronous function within an ambient context store:

```typescript
import { runWithContext, logger } from "aegislog";

await runWithContext(
  {
    requestId: "req_abc_123",
    actor: { id: "usr_alice", email: "alice@company.com", role: "finance_admin" },
    tenant: { id: "tenant_42", slug: "enterprise-acme", tier: "enterprise" },
    session: { id: "sess_999", ip: "192.168.1.1", userAgent: "Mozilla/5.0..." },
    tags: { cluster: "us-east-1", version: "v2.4.0" },
  },
  async () => {
    // Any logger invocation inside here inherits the context!
    logger.info("Executing financial reconciliation");
  },
);
```

### 2. Late Binding Context (`setActor`, `setTenant`, `setTag`)

In many applications, the user's identity is not known at the beginning of the request (e.g. during authentication or login endpoints). AegisLog allows you to dynamically attach or update the context at any point in the request lifecycle:

```typescript
import { context, logger } from "aegislog";

app.post("/api/login", async (req, res) => {
  logger.info("Login attempt started"); // Anonymous context

  const user = await authenticateUser(req.body);

  // Late-bind user and organization into the current request's context!
  context.setActor({ id: user.id, email: user.email, role: user.role });
  context.setTenant({ id: user.organizationId });
  context.setTag("auth_strategy", "oauth2");

  logger.info("User logged in successfully"); // User ID & email attached now!
  res.json({ success: true });
});
```

### 3. Inspecting the Current Context

You can retrieve the active context anywhere using `getContext()`:

```typescript
import { getContext } from "aegislog";

const currentContext = getContext();
console.log(currentContext?.actor?.id); // 'usr_alice'
```

---

### 4. Distributed Tracing & Trace Correlation (`traceId`, `spanId`)

AegisLog natively correlates log entries with distributed trace identifiers for OpenTelemetry, Grafana Tempo, AWS X-Ray, Datadog, and Jaeger:

```typescript
import { context, logger, runWithContext } from "aegislog";

// Pass traceId and spanId directly on request entry:
await runWithContext(
  {
    requestId: "req_123",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    spanId: "00f067aa0ba902b7",
  },
  async () => {
    logger.info("Executing traced operation");
    // Structured log automatically includes traceId & spanId!

    // Dynamically retrieve or update trace identifiers:
    console.log(context.getTraceId()); // '4bf92f3577b34da6a3ce929d0e0e4736'
    console.log(context.getSpanId()); // '00f067aa0ba902b7'

    context.setSpanId("new_child_span_id");
  },
);
```

---

### 5. W3C `traceparent` Header Utilities

AegisLog provides zero-dependency helpers to parse and format standard W3C Trace Context headers (`00-<trace_id>-<span_id>-<flags>`):

```typescript
import { parseTraceParent, formatTraceParent } from "aegislog";

// 1. Parse incoming W3C traceparent header
const parsed = parseTraceParent(req.headers["traceparent"]);
if (parsed) {
  console.log(parsed.traceId); // '4bf92f3577b34da6a3ce929d0e0e4736'
  console.log(parsed.spanId); // '00f067aa0ba902b7'
  console.log(parsed.sampled); // true
}

// 2. Format outgoing W3C traceparent header for downstream HTTP calls
const outgoingHeader = formatTraceParent(parsed.traceId, parsed.spanId);
// Returns: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
```
