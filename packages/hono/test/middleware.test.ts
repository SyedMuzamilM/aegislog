import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { MemorySink, createLogger } from "aegislog";
import { aegisMiddleware } from "../src/middleware.js";

describe("AegisLog Hono Middleware", () => {
  it("instruments Hono app and correlates request logs with context", async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });

    const app = new Hono();
    app.use(
      "*",
      aegisMiddleware({
        logger: testLogger,
        getActor: () => ({ id: "usr_hono_1", email: "hono@test.com" }),
        getTenant: () => ({ id: "org_hono" }),
      }),
    );

    app.get("/api/users", (c) => {
      testLogger.info("Inside route handler");
      return c.json({ users: [] });
    });

    const res = await app.request("/api/users", {
      headers: {
        "x-request-id": "req_custom_99",
        "cf-connecting-ip": "1.1.1.1",
      },
    });

    expect(res.status).toBe(200);
    // Find the log entry emitted inside the route
    const innerLog = memory.entries.find((e) => e.message === "Inside route handler");
    expect(innerLog).toBeDefined();
    expect(innerLog?.context?.requestId).toBe("req_custom_99");
    expect(innerLog?.context?.actor?.id).toBe("usr_hono_1");
    expect(innerLog?.context?.tenant?.id).toBe("org_hono");
    expect(innerLog?.context?.session?.ip).toBe("1.1.1.1");
  });
});
