import fastify from "fastify";
import { describe, expect, it } from "vitest";
import { MemorySink, createLogger } from "aegislog";
import { aegisFastifyPlugin } from "../src/plugin.js";

describe("AegisLog Fastify Plugin", () => {
  it("instruments Fastify instance and logs responses", async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });

    const app = fastify();
    await app.register(aegisFastifyPlugin, {
      logger: testLogger,
      getActor: () => ({ id: "usr_fastify_1" }),
    });

    app.get("/health", async () => ({ status: "ok" }));

    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "req_fastify_123" },
    });

    expect(res.statusCode).toBe(200);

    const log = memory.entries.find((e) => e.message.includes("<-- GET /health 200"));
    expect(log).toBeDefined();
    expect(log?.level).toBe("info");
    expect(log?.meta?.status).toBe(200);
  });
});
