# Next.js App Router Integration ⚛️

The `@aegislog/next` package provides first-class support for Next.js App Router, Server Actions, Route Handlers, and error boundaries.

---

## 📦 Installation

```bash
pnpm add @aegislog/next aegislog
```

---

## 1. Next.js Server Actions with `withAegisContext`

Server Actions in Next.js execute in serverless worker environments. Wrap your action with `withAegisContext` to automatically attach request ID, user, and action latency metrics:

```typescript
// app/actions/billing.ts
"use server";

import { withAegisContext } from "@aegislog/next";
import { logger, audit } from "aegislog";

export async function upgradePlanAction(formData: FormData) {
  const planTier = formData.get("tier") as string;
  const user = await getCurrentAuthUser();

  return withAegisContext(
    {
      actionName: "upgradePlanAction",
      actor: { id: user.id, email: user.email },
      tenant: { id: user.organizationId },
    },
    async () => {
      logger.info("Processing subscription upgrade", { newTier: planTier });

      await stripe.subscriptions.update(user.stripeSubId, { plan: planTier });

      await audit.record({
        action: "billing.plan_upgraded",
        resource: { type: "subscription", id: user.stripeSubId },
        changes: { plan: { from: user.currentPlan, to: planTier } },
        outcome: "success",
      });

      return { success: true };
    },
  );
}
```

---

## 2. Route Handlers (`app/api/.../route.ts`)

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runWithContext, logger } from "aegislog";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const requestId = req.headers.get("x-request-id") || `req_${Date.now()}`;

  return runWithContext(
    {
      requestId,
      session: {
        id: requestId,
        ip: req.headers.get("x-forwarded-for") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      },
    },
    async () => {
      logger.info("Checkout API request received", { amount: body.amount });
      return NextResponse.json({ ok: true });
    },
  );
}
```

---

## 3. Dedicated Server Action Loggers

```typescript
import { createActionLogger } from "@aegislog/next";

export async function processData() {
  const log = createActionLogger({
    actionName: "processData",
    actor: { id: "usr_system" },
  });

  log.info("Processing complete");
}
```
