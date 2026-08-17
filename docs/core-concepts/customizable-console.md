# Customizable Console Engine ("Helmet for Console Logging") 🎨

AegisLog features a dedicated Dev ANSI TUI formatter with rich syntax coloring, visual badges, and deep customization options. You can customize exactly what and how information is printed to your local development terminal.

---

## 🌈 Visual Output Highlights

- **Status & Level Badges:** `ℹ️ [INFO]`, `⚠️ [WARN]`, `🚨 [ERROR]`, `💥 [FATAL]`, `🔍 [TRACE]`, `🤖 [AI]`, `🛡️ [AUDIT]`
- **Context Highlighting:** Automatically formats ambient user and tenant context tags: `[👤 usr_sarah <sarah@acme.com> | 🏢 acme-corp | 🆔 req_9921]`
- **Syntax-Colored JSON Trees:**
  - Property keys in **Cyan**
  - Strings in **Green**
  - Numbers in **Yellow**
  - Booleans in **Purple / Magenta**
  - Nulls and undefined in **Dim Gray**
- **Clean Error Stacks:** Highlights your project source files in bright red/white while dimming internal `node_modules` lines, letting you spot your bug immediately.
- **HTTP Request Highlighting:** Highlights HTTP response status codes (2xx green, 4xx yellow, 5xx red) and response duration `2.34ms`.

---

## 🛠️ Customizing Console Display Options

You can configure console output declaratively via `createLogger({ display: { ... } })`:

```typescript
import { createLogger } from "aegislog";

const logger = createLogger({
  display: {
    // 1. Visual Preset: 'default' | 'minimal' | 'compact' | 'detailed'
    preset: "default",

    // 2. Toggle visual icons (ℹ️, ⚠️, 🚨, 🤖, 🛡️, 👤, 🏢, 🆔)
    icons: true,

    // 3. Timestamps: 'time-only' (e.g. 16:05:14.229) | 'iso' | false
    timestamp: "time-only",

    // 4. Granular context toggles
    context: {
      actor: true, // Show user ID & email
      tenant: true, // Show tenant/org ID
      requestId: true, // Show request ID
    },

    // 5. Syntax-colorized JSON metadata
    colorizeMeta: true,
    depth: 4,

    // 6. Filter out internal keys from terminal logs
    filterMeta: (key, value) => key !== "rawInternalPayload",

    // 7. Custom level badges
    badges: {
      info: "[APP_INFO]",
      error: "[FATAL_ERROR]",
    },
  },
});
```

---

## 🎨 Visual Presets

| Preset       | Description                                                                                                | Use Case                                |
| :----------- | :--------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| `'default'`  | Balanced, beautiful multi-line dev format with timestamps, context tags, and syntax-colored JSON metadata. | Standard local backend development      |
| `'minimal'`  | Strips timestamps and ambient context tags, printing clean focused messages.                               | CLI utilities and clean script output   |
| `'compact'`  | Single-line compact logs with inline properties.                                                           | High-frequency test runs & CI consoles  |
| `'detailed'` | Expands all metadata to maximum depth with trace parent headers and session IP/UserAgent.                  | Deep system debugging & troubleshooting |
