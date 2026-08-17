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
});
