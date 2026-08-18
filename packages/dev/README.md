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

- ⚡ **Realtime Event Streaming:** Server-Sent Events (SSE) stream logs, audits, and errors directly to your browser with sub-millisecond latency.
- 🎨 **Syntax-Colored Inspector:** Collapsible JSON trees, actor/tenant pills, and HTTP latency badges.
- 🔍 **Live Filtering & Search:** Filter logs by level (`debug`, `info`, `warn`, `error`), namespace, tenant ID, or user ID in real-time.
- 🛑 **Audit Trail Isolation:** Dedicated tabs to inspect compliance audit records separately from debug noise.

---

## ⚙️ CLI Options

| Flag                  | Default     | Description                                 |
| :-------------------- | :---------- | :------------------------------------------ |
| `-p, --port <number>` | `4319`      | Port to run the inspector web dashboard on. |
| `-h, --host <string>` | `127.0.0.1` | Host address to bind.                       |

---

## 📄 License

MIT © [AegisLog Contributors](https://github.com/syedmuzamilm/aegislog)
