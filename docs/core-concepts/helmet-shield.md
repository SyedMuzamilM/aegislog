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

## 🏥 Built-in Domain Presets

AegisLog includes pre-built domain-specific compliance dictionaries and patterns via the `preset` option:

| Preset                         | Target Industry / Compliance         | Auto-Redacted Fields & Patterns                                                                                                                                                                                                                        |
| :----------------------------- | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`"hipaa"` / `"healthcare"`** | Healthcare & Maternal Health (HIPAA) | Medical Record Numbers (`mrn`, `medicalrecordnumber`), diagnoses, prescriptions, patient notes, insurance IDs, obstetric fields (`conceptiondate`, `consivedate`, `gestationalage`, `edd`, `ultrasoundprescription`), DOB, and MRN/SSN regex patterns. |
| **`"pci"`**                    | Payment Cards & Banking (PCI-DSS)    | Primary account numbers (PAN), `cvv`, `cvc`, `pin`, `cardnumber`, expiration dates, and cardholder names.                                                                                                                                              |
| **`"financial"`**              | FinTech & Banking Compliance         | Bank account numbers, `routingnumber`, `iban`, `swift`, `bic`, `taxid`, `ein`, and IBAN regex patterns.                                                                                                                                                |
| **`"strict"`**                 | High-Security Environments           | Activates **all** presets simultaneously (HIPAA + PCI + Financial + Default credentials).                                                                                                                                                              |

### Example: Activating Healthcare & PCI Presets

```typescript
import { createLogger } from "aegislog";

export const logger = createLogger({
  shield: {
    preset: ["hipaa", "pci"], // Activate multiple presets simultaneously
    maskString: "[PROTECTED_HEALTH_INFO]",
  },
});

logger.info("Patient check-in", {
  patientNotes: "Routine prenatal checkup", // -> "[PROTECTED_HEALTH_INFO]"
  conceptionDate: "2026-02-14", // -> "[PROTECTED_HEALTH_INFO]"
  notes: "Patient with MRN-889900 visited", // -> "Patient with [PROTECTED_HEALTH_INFO] visited"
});
```

---

## ⚙️ Customizing Shield Options & Regex Rules

You can combine presets with custom dictionary keys, regex pattern rules, and custom masker functions:

```typescript
import { createLogger } from "aegislog";

const logger = createLogger({
  shield: {
    enabled: true,
    preset: "hipaa",
    maskString: "[CONFIDENTIAL]",
    additionalKeys: ["stripeCustomerId", "encryptionSalt", "taxIdentifier"],
    customPatterns: [
      // Direct regex pattern redaction
      /MRN-\d{6}/g,
      // Regex rule with custom replacer function
      {
        pattern: /PATIENT:\s*([A-Z]+)/g,
        replacer: (_match, name) => `PATIENT: [MASKED_${name[0]}]`,
      },
    ],
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
