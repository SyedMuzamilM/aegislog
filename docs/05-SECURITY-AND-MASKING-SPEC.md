# 🛡️ Security, PII Redaction & The "Helmet" Engine

---

## 1. The Core Problem: Accidental Production Leaks

In modern web development, sensitive information frequently sneaks into logs through:
1. **Uncaught exceptions** containing full database connection strings or third-party API headers.
2. **HTTP framework request/response logging** dumping entire `req.headers` (with `Authorization: Bearer ...` or `Cookie: session=...`).
3. **Database ORM queries** logging raw parameter arrays containing hashed passwords or customer payment tokens.
4. **Third-party SDK errors** (e.g. Stripe, AWS, OpenAI) dumping raw payload dumps with API keys.

AegisLog acts as a **"Helmet for Logging"**, enforcing defense-in-depth sanitization at the serialization boundary.

---

## 2. Multi-Layered Protection Engine

```
 [ Input Payload / Error Object ]
                │
                ▼
 ┌──────────────────────────────────────────────┐
 │ Layer 1: Circular Reference & Depth Breaker  │  Protects against OOM & crashes
 └──────────────────────┬───────────────────────┘
                        ▼
 ┌──────────────────────────────────────────────┐
 │ Layer 2: Case-Insensitive Key Dictionary     │  Matches 'password', 'token', etc.
 └──────────────────────┬───────────────────────┘
                        ▼
 ┌──────────────────────────────────────────────┐
 │ Layer 3: High-Speed Regex Value Scrubber     │  Detects Bearer, JWTs, AWS & Cards
 └──────────────────────┬───────────────────────┘
                        ▼
 ┌──────────────────────────────────────────────┐
 │ Layer 4: Custom User Redaction Hooks         │  Application-specific PII rules
 └──────────────────────┬───────────────────────┘
                        ▼
            [ Sanitized Output ]
```

---

## 3. Built-in Redaction Defaults

### 3.1 Protected Key Names (Case-Insensitive)
By default, any object property matching the following terms is automatically replaced with `"[REDACTED]"`:

- **Authentication & Secrets:** `password`, `pass`, `secret`, `token`, `bearer`, `auth`, `authorization`, `apiKey`, `api_key`, `access_token`, `refresh_token`, `private_key`, `privateKey`, `certificate`.
- **Financial & Payment:** `creditCard`, `credit_card`, `cardNumber`, `card_number`, `cvv`, `cvc`, `pan`, `accountNumber`, `routingNumber`, `iban`.
- **Identity & PII:** `ssn`, `social_security`, `nationalId`, `passport`, `pin`, `dateOfBirth`, `dob`.
- **Cookies & Sessions:** `cookie`, `set-cookie`, `session`, `sessionId`, `session_token`.

### 3.2 High-Speed Regex Value Scrubbing
Even if a secret is inside an unstructured string (e.g. `logger.error("Failed call: Bearer eyJhbGciOi...")`), AegisLog detects and masks it:

| Pattern Type | Detection Rule | Masked Output |
| :--- | :--- | :--- |
| **Bearer Token** | `/Bearer\s+[A-Za-z0-9\-_.]+/gi` | `Bearer [REDACTED_TOKEN]` |
| **JWT (JSON Web Token)** | `/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g` | `[REDACTED_JWT]` |
| **AWS Access Key** | `/AKIA[0-9A-Z]{16}/g` | `AKIA[REDACTED_AWS_KEY]` |
| **OpenAI / Anthropic Keys** | `/(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,})/g` | `sk-[REDACTED_API_KEY]` |
| **Credit Card Numbers** | `/\b(?:\d{4}[-\s]?){3}\d{4}\b/g` (Luhn-checked) | `****-****-****-1234` |
| **Email Addresses (Optional)** | `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g` | `u***r@example.com` (Pseudonymized) |

---

## 4. Configuration & Customization

Developers can customize and extend the helmet shield:

```typescript
import { createLogger, presets } from 'aegislog';

export const logger = createLogger({
  shield: {
    // Enable strict mode (compliance mode for HIPAA / PCI-DSS)
    preset: presets.PCI_DSS,

    // Add application-specific sensitive fields
    additionalKeys: ['internalStripeSecret', 'customerTaxId'],

    // Custom value transformer
    maskValue: (key, value) => {
      if (key === 'email') {
        // Mask: user@domain.com -> u***@domain.com
        return value.replace(/^(.)(.*)(@.*)$/, '$1***$3');
      }
      return '[REDACTED]';
    },

    // Maximum serialization depth to avoid payload bloat
    maxDepth: 5,
    maxStringLength: 10_000,
  }
});
```

---

## 5. Safe Error Serialization

Standard errors in Node.js lose their properties or stack when naively stringified. AegisLog standardizes error handling:

```typescript
try {
  await db.query('SELECT * FROM users WHERE token = ?', [secretToken]);
} catch (error) {
  // Automatically serializes name, message, stack, cause, and attached metadata,
  // while ensuring secretToken is scrubbed!
  logger.error('Database query failed', { error });
}
```
