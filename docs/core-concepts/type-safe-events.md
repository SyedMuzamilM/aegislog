# Type-Safe Event Schemas 📐

In large engineering teams, unstructured log payloads often become inconsistent and noisy. AegisLog supports **Type-Safe Event Schemas** with native support for [Standard Schema v1](https://standardschema.dev/), [Zod](https://zod.dev/), and [Valibot](https://valibot.dev/).

---

## 🎯 Defining an Event Schema

Use `defineLogEvent()` to declare event contracts:

### With Standard TypeScript Functions

```typescript
import { defineLogEvent, logger } from "aegislog";

interface UserSignupPayload {
  userId: string;
  email: string;
  plan: "free" | "starter" | "enterprise";
}

export const UserSignupEvent = defineLogEvent<string, UserSignupPayload>({
  name: "user.signed_up",
  level: "info",
  schema: (data: unknown) => {
    const d = data as UserSignupPayload;
    if (!d.userId || !d.email || !d.plan) {
      throw new Error("Invalid UserSignupEvent: missing required fields");
    }
    return d;
  },
});
```

### With Zod or Valibot

```typescript
import { z } from "zod";
import { defineLogEvent, logger } from "aegislog";

export const OrderCheckoutEvent = defineLogEvent({
  name: "order.checkout_completed",
  level: "info",
  schema: z.object({
    orderId: z.string(),
    amount: z.number().positive(),
    itemCount: z.number().int(),
    currency: z.enum(["USD", "EUR", "GBP"]),
  }),
});
```

---

## 🚀 Emitting Type-Safe Events

Use `logger.event(EventDefinition, data)`:

```typescript
// Fully type-checked at compile-time!
logger.event(OrderCheckoutEvent, {
  orderId: "ord_2026_99",
  amount: 149.5,
  itemCount: 3,
  currency: "USD",
});

// TypeScript will flag type errors if fields are missing or invalid:
// @ts-expect-error Type 'string' is not assignable to type 'number'
logger.event(OrderCheckoutEvent, { orderId: "ord_1", amount: "invalid" });
```
