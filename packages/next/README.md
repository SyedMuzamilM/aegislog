# @aegislog/next ⚛️

Next.js App Router, Server Actions, and Route Handlers integration for [AegisLog](https://github.com/syedmuzamilm/aegislog).

---

## 📦 Installation

```bash
pnpm add @aegislog/next aegislog
# or
npm install @aegislog/next aegislog
```

---

## 🚀 Usage with Server Actions

Wrap Next.js Server Actions with `withAegisContext` to automatically track user identity, tenant, request correlation, and execution timing:

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
      logger.info("Processing plan upgrade", { newTier: planTier });

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

## 🚀 Usage with Route Handlers (`app/api/.../route.ts`)

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

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
