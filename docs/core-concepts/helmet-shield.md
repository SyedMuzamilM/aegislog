# Helmet Security Shield 🛡️

The **Helmet Security Shield** is AegisLog's zero-leak PII and credential sanitization engine. It runs in-memory before any log entry or audit event is emitted or formatted, ensuring sensitive data never reaches log aggregators like Datadog, Axiom, CloudWatch, or local terminal histories.

---

## 🔒 Automatic Redaction Rules

By default, the Helmet Shield automatically scans and sanitizes:

1. **Sensitive Key Names (Case-Insensitive Dictionary):**
   - `password`, `secret`, `token`, `api_key`, `apikey`, `access_token`, `refresh_token`, `auth_token`, `authorization`
   - `credit_card`, `card_number`, `cvv`, `cvc`, `ssn`, `social_security`
   - `private_key`, `client_secret`, `secret_key`, `session_token`, `cookie`

2. **Bearer & JWT Tokens:**
   - Detects `Bearer eyJ...` and standalone JWT strings (`^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$`) and redacts the token signature.

3. **Provider API Keys:**
   - OpenAI / Anthropic keys (`sk-[A-Za-z0-9_-]{20,}` -> `sk-[REDACTED_KEY]`)
   - AWS Access Key IDs (`AKIA[0-9A-Z]{16}` -> `AKIA[REDACTED_KEY]`)

4. **Credit Card Numbers:**
   - Detects Visa, Mastercard, Amex, Discover PAN numbers and masks everything except the last 4 digits (`4111 2222 3333 4444` -> `****-****-****-4444`).

5. **Circular References & Deep Nesting Protection:**
   - Automatically handles circular object references safely without throwing `TypeError: Converting circular structure to JSON`.
   - Limits traversal depth (default: 6 levels) to prevent memory exhaustion on giant structures.

---

## ⚙️ Customizing Shield Options

You can configure custom masking behavior when initializing your logger:

```typescript
import { createLogger } from "aegislog";

const logger = createLogger({
  shield: {
    enabled: true,
    maskString: "[CONFIDENTIAL]",
    additionalKeys: ["stripeCustomerId", "encryptionSalt", "taxIdentifier"],
    maskCreditCards: true,
    maskTokens: true,
    maskJwt: true,
    maxDepth: 5,
    maxStringLength: 4000,
    customMasker: (key, value) => {
      if (key === "phoneNumber" && typeof value === "string") {
        return value.replace(/\d{4}$/, "****");
      }
      return undefined; // Fall back to default masking
    },
  },
});
```

---

## ⚡ Performance

The Helmet Shield executes at **~627,000 ops/sec** (approx. 1.5µs per complex nested payload), making it virtually zero overhead for high-traffic microservices.
