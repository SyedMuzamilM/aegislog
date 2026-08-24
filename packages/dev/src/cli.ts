#!/usr/bin/env node
import { DevServer } from "./server.js";

const args = process.argv.slice(2);
let port = 4319;
let host = "127.0.0.1";
let token: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    const nextArg = args[i + 1];
    if (nextArg) {
      port = Number(nextArg);
    }
  }
  if (args[i] === "--host" || args[i] === "-h") {
    const nextArg = args[i + 1];
    if (nextArg) {
      host = nextArg;
    }
  }
  if (args[i] === "--token" || args[i] === "-t") {
    const nextArg = args[i + 1];
    if (nextArg) {
      token = nextArg;
    }
  }
}

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("AegisLog Dev Inspector: --port must be an integer between 1 and 65535");
  process.exit(1);
}

let server: DevServer;
try {
  server = new DevServer({ port, host, token });
} catch (error) {
  console.error(
    "Failed to configure AegisLog Dev Inspector:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}

server
  .start()
  .then((url) => {
    const ingestUrl = new URL("/api/events", url).toString();
    console.log(`\n  🛡️  \x1b[1m\x1b[36mAegisLog Dev Inspector\x1b[0m is running at:`);
    console.log(`  \x1b[32m➜\x1b[0m  \x1b[1m\x1b[4m${url}\x1b[0m\n`);
    console.log(`  \x1b[90mWaiting for incoming log events on POST ${ingestUrl}...\x1b[0m\n`);
    if (token) {
      console.log("  Use the same token in DevViewerSink({ token }) or an Authorization header.\n");
    }
  })
  .catch((err) => {
    console.error("Failed to start AegisLog Dev Inspector:", err);
    process.exit(1);
  });
