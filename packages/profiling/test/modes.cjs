const assert = require("node:assert/strict");
const mode = process.env.PROFILE_MODE;
const { startProfiling, profileOperation } = require("../dist/index.cjs");
const runtime = startProfiling({
  enabled: mode !== "disabled",
  sampleRate: mode === "zero" ? 0 : 1,
  maxSpans: 3,
});
const { createExpressProfilingMiddleware } = require("../dist/express.cjs");
const express = require("express");
const { createLogger, MemorySink } = require("../../core/dist/index.cjs");
const memory = new MemorySink();
const logger = createLogger({ sinks: [memory], shield: { enabled: false } });
const app = express();
app.use(createExpressProfilingMiddleware(runtime, { logger }));
const router = express.Router();
app.use("/org/:orgId", router);
router.get("/items/:id", async (_req, res) => {
  for (let i = 0; i < 12; i++) await profileOperation("work", "application", async () => {});
  res.json({ ok: true });
});
const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/org/PRIVATE_MOUNT/items/PRIVATE_ID`,
      { headers: { traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" } },
    );
    await response.json();
    assert.equal(response.status, 200);
    const profiles = memory.entries.filter((e) => e.meta?.event === "request_profile");
    if (mode === "cap") {
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].meta.route, "/org/:orgId/items/:id");
      assert(!JSON.stringify(profiles[0].meta).includes("PRIVATE_"));
      assert(profiles[0].meta.operations.length <= 3);
      assert(profiles[0].meta.droppedSpans > 0);
    } else {
      assert.equal(profiles.length, 0);
      assert.equal(response.headers.get("x-profile-trace-id"), null);
    }
    await runtime.shutdown();
    console.log("MODE_OK=" + mode);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close(() => process.exit(process.exitCode || 0));
  }
});
