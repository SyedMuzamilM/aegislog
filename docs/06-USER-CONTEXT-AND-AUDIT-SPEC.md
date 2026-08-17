# 👤 User Context & Audit Trail Engine Specification

---

## 1. Why User-Centric Logging Matters

In modern multi-tenant SaaS and server applications, debugging an issue rarely starts with *"Show me all errors on server-04"*. It almost always starts with:

> *"Customer Acme Corp (User `usr_912`) reported that their export failed at 3:15 PM. Show me everything that happened during their session."*

Traditional loggers treat logs as flat strings with arbitrary metadata. AegisLog elevates **User Context** and **Audit Trails** to first-class architectural primitives.

---

## 2. User & Tenant Identity Model

AegisLog standardizes the actor model across the entire lifecycle:

```typescript
export interface ActorContext {
  id: string;                    // e.g. "usr_10293"
  email?: string;                // e.g. "sarah@acme.com"
  role?: string;                 // e.g. "workspace_admin"
  isSystem?: boolean;            // true if automated cron / worker
}

export interface TenantContext {
  id: string;                    // e.g. "org_772"
  slug?: string;                 // e.g. "acme-corp"
  tier?: 'free' | 'pro' | 'ent'; // Subscription tier
}

export interface SessionContext {
  id: string;                    // Session / Client Token ID
  ip?: string;                   // Client IP (automatically anonymized if required)
  userAgent?: string;            // Client Browser / Device
}
```

---

## 3. Operational Logs vs. Audit Trails

A major design flaw in existing tools is conflating **System Telemetry** with **Business Audit Trails**:

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│              OPERATIONAL LOGS                 │                 AUDIT TRAILS                  │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • High volume (thousands/sec)                 │ • Low-to-medium volume (business events only) │
│ • Ephemeral retention (7-30 days)             │ • Long retention (1-7 years for SOC2/GDPR)    │
│ • Audience: SREs, Backend Engineers           │ • Audience: Security, Compliance, End-Users   │
│ • Target: Datadog, Loki, CloudWatch           │ • Target: PostgreSQL, S3, ClickHouse, Datadog │
│ • Example: "Cache hit for key user:123"       │ • Example: "Admin Sarah deleted Team Acme"    │
└───────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

AegisLog gives you dedicated APIs for both, with unified context:

### Operational Logging:
```typescript
logger.debug('Cache lookup performed', { key: 'cache:user:123', hit: true });
```

### Business Audit Trail Logging:
```typescript
import { audit } from 'aegislog';

// Record an immutable business action
await audit.record({
  action: 'document.permissions_updated',
  resource: {
    type: 'document',
    id: 'doc_8831',
    name: 'Q3 Financial Report.pdf'
  },
  changes: {
    visibility: { from: 'private', to: 'organization' },
    allowExport: { from: false, to: true }
  },
  outcome: 'success', // 'success' | 'failure' | 'denied'
  reason: 'Requested by CFO approval ticket #902'
});
```

---

## 4. Automatic Audit Log Pipeline & Sinks

AegisLog allows routing audit logs to dedicated secure sinks (such as S3, Postgres, or dedicated compliance webhooks) separate from debug logs:

```typescript
import { configureAudit, S3AuditSink, PostgresAuditSink } from 'aegislog/audit';

configureAudit({
  sinks: [
    // Stream audit events to an immutable append-only S3 bucket for compliance
    new S3AuditSink({
      bucket: 'acme-compliance-audit-logs',
      region: 'us-east-1',
      format: 'jsonl.gz',
    }),
    // Optionally mirror to database for in-app user activity feeds
    new PostgresAuditSink({
      tableName: 'audit_logs',
      connectionString: process.env.DATABASE_URL!,
    })
  ]
});
```
