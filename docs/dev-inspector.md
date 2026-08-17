# Realtime Localhost Dev Inspector 🖥️

The `@aegislog/dev` package provides a standalone, zero-dependency visual developer dashboard and CLI for inspecting logs, audit events, and AI inferences in real-time during local development.

---

## 🚀 Quick Launch

Run the inspector CLI in any terminal window:

```bash
npx @aegislog/dev --port 4319
```

Open `http://127.0.0.1:4319` in your browser.

---

## 🔌 Connecting Your Application

Add the `DevViewerSink` to your application logger:

```typescript
import { DevViewerSink } from "@aegislog/dev";
import { createLogger } from "aegislog";

const logger = createLogger({
  sinks: [
    new DevViewerSink({ port: 4319 }), // Automatically streams logs to local inspector
  ],
});
```

---

## ✨ Features

- **Live SSE Streaming:** Instant real-time log ingestion without page reloads.
- **Search & Filtering:** Filter instantly by user ID, tenant ID, request ID, or error message.
- **Level Filters:** Switch between `All`, `Info`, `Warn`, `Error`, and `Audit` views.
- **Collapsible JSON Trees:** Inspect complex objects and changes with syntax highlighting.
- **Error Stack Highlighting:** Expand and debug stack traces with ease.
- **Stream Pause & Clear:** Pause stream inspection when debugging high-frequency events.
