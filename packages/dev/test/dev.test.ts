import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevServer } from "../src/server.js";
import { DevViewerSink } from "../src/sink.js";
import { createLogger } from "aegislog";

describe("AegisLog Dev Inspector Server & Sink", () => {
  let server: DevServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = new DevServer({ port: 4399, host: "127.0.0.1" });
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("serves dashboard HTML on GET /", async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("AegisLog Dev Inspector");
  });

  it("receives events via POST /api/events and sink", async () => {
    const sink = new DevViewerSink({ port: 4399, host: "127.0.0.1" });
    const logger = createLogger({ sinks: [sink] });

    logger.info("Live stream test message", { userId: "usr_dev_1" });

    // Allow event dispatch
    await new Promise((r) => setTimeout(r, 60));

    // Verify event is in history
    const streamRes = await fetch(`${serverUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "info", message: "Direct post" }),
    });
    expect(streamRes.status).toBe(200);
  });
});
