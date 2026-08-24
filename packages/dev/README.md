# @aegislog/dev 🖥️

Real-time localhost visual web dashboard and CLI inspector for [AegisLog](https://github.com/syedmuzamilm/aegislog).

---

## 📦 Installation & CLI Usage

Run directly without installation via `npx` / `pnpx`:

```bash
npx @aegislog/dev --port 4319
# or
pnpm dlx @aegislog/dev --port 4319
```

Open `http://127.0.0.1:4319` in your browser.

---

## 🚀 Streaming Logs from Your App

In your application code, enable `dev: true` (or set the environment variable `AEGIS_DEV=true`):

```typescript
import { createLogger } from "aegislog";

export const logger = createLogger({
  namespace: "api",
  dev: true, // Automatically streams logs to http://127.0.0.1:4319
});

logger.info("Server started", { port: 3000 });
```

---

## ✨ Features

- ⚡ **Realtime Event Streaming:** Server-Sent Events (SSE) stream logs, audits, and errors directly to your browser.
- 🎨 **Safe Detail Rendering:** Escaped JSON metadata, actor pills, request IDs, and HTTP latency fields.
- 🔍 **Live Filtering & Search:** Filter logs by level or audit type and search every event field.
- 🛑 **Audit Filtering:** Switch to the audit filter to inspect compliance records separately from debug noise.

---

## ⚙️ CLI Options

| Flag                  | Default     | Description                                                     |
| :-------------------- | :---------- | :-------------------------------------------------------------- |
| `-p, --port <number>` | `4319`      | Port to run the inspector web dashboard on.                     |
| `-h, --host <string>` | `127.0.0.1` | Host address to bind. Non-loopback hosts require `--token`.     |
| `-t, --token <value>` | none        | Bearer token required by the dashboard and event ingestion API. |

The inspector rejects cross-origin browser requests. When using `--token`, pass the same value to `createLogger({ dev: { token } })` or `new DevViewerSink({ token })`.

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
