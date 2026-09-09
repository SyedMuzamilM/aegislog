import express from "express";
import { describe, expect, it } from "vitest";
import { MemorySink, createLogger } from "aegislog";
import { aegisExpressMiddleware } from "../src/middleware.js";

describe("AegisLog Express Middleware", () => {
  it("attaches context and logs request lifecycle", async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });

    const app = express();
    app.use(
      aegisExpressMiddleware({
        getActor: () => ({ id: "usr_express_1", email: "express@test.com" }),
        getTenant: () => ({ id: "org_express" }),
      }),
    );

    app.get("/test", (req, res) => {
      testLogger.info("Express route handler executed");
      res.status(200).json({ ok: true });
    });

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/test`, {
        headers: {
          "x-request-id": "req_express_99",
        },
      });

      expect(response.status).toBe(200);

      const routeLog = memory.entries.find((e) => e.message === "Express route handler executed");
      expect(routeLog).toBeDefined();
      expect(routeLog?.context?.requestId).toBe("req_express_99");
      expect(routeLog?.context?.actor?.id).toBe("usr_express_1");
      expect(routeLog?.context?.tenant?.id).toBe("org_express");
    } finally {
      server.close();
    }
  });

  it("forwards rejected actor resolution to Express 4 error middleware", async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });
    const app = express();
    app.use(
      aegisExpressMiddleware({
        logger: testLogger,
        getActor: async () => {
          throw new Error("Authentication service unavailable");
        },
      }),
    );
    app.get("/test", (_req, res) => res.json({ ok: true }));
    app.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(503).json({ error: error.message });
      },
    );

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/test`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Authentication service unavailable" });
    } finally {
      server.close();
    }
  });

  it("injects W3C Server-Timing header and captures phase timings", async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });

    const app = express();
    app.use(aegisExpressMiddleware({ logger: testLogger, serverTiming: true }));

    app.get("/waterfall-test", async (req, res) => {
      const timing = (res as any).timing;
      expect(timing).toBeDefined();

      timing.record("auth_check", 12.5, "Authentication");
      await timing.time("db_query", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      res.status(200).json({ ok: true });
    });

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/waterfall-test`);
      expect(response.status).toBe(200);

      const serverTiming = response.headers.get("server-timing");
      expect(serverTiming).toBeDefined();
      expect(serverTiming).toContain("total;dur=");
      expect(serverTiming).toContain('auth_check;dur=12.5;desc="Authentication"');
      expect(serverTiming).toContain("db_query;dur=");

      expect(response.headers.get("timing-allow-origin")).toBe("*");

      // Verify phases were logged in metadata
      const finishedLog = memory.entries.find((e) => e.message.includes("<-- GET /waterfall-test 200"));
      expect(finishedLog).toBeDefined();
      expect(finishedLog?.meta?.phases).toBeDefined();
      expect((finishedLog?.meta?.phases as any)?.auth_check).toBe(12.5);
    } finally {
      server.close();
    }
  });
});
