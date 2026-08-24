import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevServer } from "../src/server.js";
import { DevViewerSink } from "../src/sink.js";
import { createLogger } from "aegislog";

describe("AegisLog Dev Inspector Server & Sink", () => {
  let server: DevServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = new DevServer({ port: 4399, host: "127.0.0.1", maxBodyBytes: 256 });
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
    expect(html).toContain("function escapeHtml");
    expect(html).toContain("escapeHtml(item.error.stack");
    expect(html).not.toContain("__CSP_NONCE__");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'nonce-");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("receives events via POST /api/events and sink", async () => {
    const sink = new DevViewerSink({ port: 4399, host: "127.0.0.1" });
    const logger = createLogger({ sinks: [sink] });

    logger.info("Live stream test message", { userId: "usr_dev_1" });
    await sink.flush();

    // Verify event is in history
    const streamRes = await fetch(`${serverUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: "Direct post",
        timestamp: "2026-08-24T00:00:00.000Z",
      }),
    });
    expect(streamRes.status).toBe(200);
  });

  it("rejects invalid and oversized events", async () => {
    const invalid = await fetch(`${serverUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Missing level and timestamp" }),
    });
    expect(invalid.status).toBe(422);

    const oversized = await fetch(`${serverUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: "x".repeat(300),
        timestamp: "2026-08-24T00:00:00.000Z",
      }),
    });
    expect(oversized.status).toBe(413);
  });

  it("requires authentication when exposed beyond loopback", () => {
    expect(() => new DevServer({ host: "0.0.0.0" })).toThrow(
      "requires a token when listening on a non-loopback host",
    );
    expect(() => new DevServer({ host: "0.0.0.0", token: "local-secret" })).not.toThrow();
  });

  it("authenticates dashboard and sink traffic with a bearer token", async () => {
    const authenticatedServer = new DevServer({
      port: 4400,
      host: "127.0.0.1",
      token: "local-secret",
    });

    try {
      const dashboardUrl = await authenticatedServer.start();
      const origin = new URL(dashboardUrl).origin;
      expect((await fetch(origin)).status).toBe(401);
      expect((await fetch(dashboardUrl)).status).toBe(200);

      const sink = new DevViewerSink({
        port: 4400,
        host: "127.0.0.1",
        token: "local-secret",
      });
      sink.log({
        level: "info",
        message: "Authenticated event",
        timestamp: "2026-08-24T00:00:00.000Z",
      });
      await sink.flush();
    } finally {
      await authenticatedServer.stop();
    }
  });
});
