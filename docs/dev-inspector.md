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

The server binds to `127.0.0.1` by default and does not allow cross-origin browser access. A non-loopback host requires a shared token:

```bash
npx @aegislog/dev --host 0.0.0.0 --token "$AEGIS_DEV_TOKEN"
```

```typescript
const logger = createLogger({
  dev: { host: "127.0.0.1", port: 4319, token: process.env.AEGIS_DEV_TOKEN },
});
```

---

## ✨ Features

- **Live SSE Streaming:** Instant real-time log ingestion without page reloads.
- **Search & Filtering:** Filter instantly by user ID, tenant ID, request ID, or error message.
- **Level Filters:** Switch between `All`, `Info`, `Warn`, `Error`, and `Audit` views.
- **Formatted JSON Details:** Inspect metadata and audit changes in an escaped JSON block.
- **Error Stack Display:** Read sanitized stack traces with each error.
- **Stream Pause & Clear:** Pause stream inspection when debugging high-frequency events.
