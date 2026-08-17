# Business Compliance Audit Trails 📜

In enterprise software, there is a fundamental distinction between **ephemeral application logs** (e.g. `logger.info("Connecting to Redis")`) and **business compliance audit records** (e.g. `audit.record("user.role_promoted")`).

AegisLog treats compliance audit logging as a first-class citizen.

---

## 🏛️ Ephemeral Logs vs. Audit Trails

| Characteristic | Ephemeral Application Logs (`logger`)                     | Business Audit Trails (`audit`)                                            |
| :------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Purpose**    | Developer debugging, error tracking, operational latency. | Legal compliance, security audits, SOC2, HIPAA, ISO27001.                  |
| **Retention**  | Days to weeks (e.g. 7-30 days in Datadog/CloudWatch).     | Years (e.g. 1-7 years in immutable S3/Postgres).                           |
| **Schema**     | Unstructured or semi-structured messages and metadata.    | Strict event schema (`action`, `resource`, `actor`, `outcome`, `changes`). |
| **Log Levels** | `trace`, `debug`, `info`, `warn`, `error`, `fatal`.       | `[SUCCESS]`, `[DENIED]`, `[FAILURE]`.                                      |

---

## ✍️ Recording Audit Events

Use the dedicated `audit.record()` method:

```typescript
import { audit } from "aegislog";

// 1. Role / Permission Changes
await audit.record({
  action: "organization.member_role_updated",
  resource: { type: "user", id: "usr_marcus_22" },
  changes: {
    role: { from: "viewer", to: "editor" },
  },
  outcome: "success",
  details: { approvedBy: "usr_admin_1", reason: "Promoted to tech lead" },
});

// 2. Access Denied / Security Events
await audit.record({
  action: "billing.invoice_exported",
  resource: { type: "invoice", id: "inv_2026_09" },
  outcome: "denied",
  reason: "Insufficient RBAC permissions: required 'billing.export'",
});
```

---

## 🛡️ Automatic Actor & Tenant Inheritance

If an audit record is emitted inside an active `runWithContext` scope, the audit engine automatically inherits the `actor`, `tenant`, `session`, and `traceId` if not explicitly passed:

```typescript
runWithContext(
  {
    actor: { id: "usr_sarah", email: "sarah@acme.com" },
    tenant: { id: "org_acme_corp" },
  },
  async () => {
    // Automatically tagged with Sarah & Acme Corp!
    await audit.record({
      action: "api_key.created",
      resource: { type: "api_key", id: "key_live_9921" },
      outcome: "success",
    });
  },
);
```
