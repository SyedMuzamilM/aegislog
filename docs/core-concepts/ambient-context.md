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
