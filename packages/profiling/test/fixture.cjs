const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { startProfiling, profileOperation, profileMiddleware } = require("../dist/index.cjs");
const { createExpressProfilingMiddleware } = require("../dist/express.cjs");
const runtime = startProfiling({
  serviceName: "aegis-integration",
  sampleRate: 1,
  otlp: { endpoint: process.env.PROFILE_TEST_OTLP },
});
// Load the actual clients AFTER instrumentation, without bundler/module-cache mocks.
const express = require("express");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const Redis = require("ioredis");
const { createServer, get } = require("node:http");
const { createServer: createTcpServer } = require("node:net");
const { createLogger, MemorySink, getContext } = require("../../core/dist/index.cjs");
const { aegisExpressMiddleware } = require("../../express/dist/index.cjs");

async function main() {
  const memory = new MemorySink();
  const logger = createLogger({
    sinks: [memory],
    shield: { enabled: false },
    gracefulShutdown: false,
  });
  const profiles = () => memory.entries.filter((entry) => entry.meta?.event === "request_profile");
  const client = new MongoClient(process.env.PROFILE_TEST_MONGO, { maxPoolSize: 1 });
  await client.connect();
  await mongoose.connect(process.env.PROFILE_TEST_MONGO, { maxPoolSize: 1 });
  const model = mongoose.model("Fixture", new mongoose.Schema({ value: String }));
  await model.create({ value: "PRIVATE_DOCUMENT" });
  // A local RESP peer exercises ioredis's actual network client and instrumentation.
  const sockets = new Set();
  const redisPeer = createTcpServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        let position = 0;
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const count = Number(buffer.toString("utf8", 1, end));
        position = end + 2;
        const parts = [];
        let incomplete = false;
        for (let n = 0; n < count; n++) {
          const sizeEnd = buffer.indexOf("\r\n", position);
          if (sizeEnd < 0) {
            incomplete = true;
            break;
          }
          const size = Number(buffer.toString("utf8", position + 1, sizeEnd));
          position = sizeEnd + 2;
          if (buffer.length < position + size + 2) {
            incomplete = true;
            break;
          }
          parts.push(buffer.toString("utf8", position, position + size));
          position += size + 2;
        }
        if (incomplete) return;
        buffer = buffer.subarray(position);
        const command = parts[0].toLowerCase();
        socket.write(command === "get" ? "$-1\r\n" : command === "ping" ? "+PONG\r\n" : "+OK\r\n");
        if (!buffer.length) return;
      }
    });
  });
  await new Promise((resolve) => redisPeer.listen(0, "127.0.0.1", resolve));
  const redis = new Redis({
    host: "127.0.0.1",
    port: redisPeer.address().port,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: () => null,
  });
  await redis.connect();
  const upstream = createServer((_req, res) => {
    void delay(10).then(() => res.end("ok"));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = upstream.address().port;
  const app = express();
  app.use(
    createExpressProfilingMiddleware(runtime, {
      logger,
      filter: (req) => !req.path.startsWith("/health"),
    }),
  );
  app.use(aegisExpressMiddleware({ logger, logRequests: false }));
  app.use(
    profileMiddleware("auth.check", "auth", async (_req, _res, next) => {
      await delay(4);
      next();
    }),
  );
  app.use(
    profileMiddleware("auth.callback", "auth", (_req, _res, next) => {
      setTimeout(next, 12);
    }),
  );
  app.get("/api/items/:id", async (req, res, next) => {
    try {
      await Promise.all([
        model.findOne({ value: "PRIVATE_DOCUMENT" }).lean(),
        client.db().collection("fixtures").findOne({ value: "PRIVATE_DOCUMENT" }),
        profileOperation("service.parallel", "application", () => delay(16)),
      ]);
      await profileOperation("cache.read", "cache", () => redis.get("PRIVATE_CACHE_KEY"), {
        "cache.hit": false,
        token: "PRIVATE_ATTRIBUTE",
      });
      await (await fetch(`http://127.0.0.1:${upstreamPort}/PRIVATE_PATH?token=PRIVATE_URL`)).text();
      await new Promise((resolve, reject) =>
        get(`http://127.0.0.1:${upstreamPort}/PRIVATE_PATH?token=PRIVATE_URL`, (response) => {
          response.resume();
          response.on("end", resolve);
        }).on("error", reject),
      );
      await assert.rejects(
        profileOperation("service.failed", "application", async () => {
          throw new Error("PRIVATE_ERROR");
        }),
      );
      assert.equal(getContext().requestId, req.headers["x-request-id"]);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/failure", (_req, res) => res.status(503).json({ ok: false }));
  app.get("/api/abort", (_req, res) => {
    res.write("partial");
    setTimeout(() => res.destroy(), 10);
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    const responses = await Promise.all(
      ["one", "two"].map(async (id) => {
        const res = await fetch(
          `http://127.0.0.1:${port}/api/items/PRIVATE_ID?email=PRIVATE_EMAIL`,
          {
            headers: {
              "x-request-id": id,
              traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
            },
          },
        );
        assert.equal(res.status, 200);
        await res.json();
        return {
          traceId: res.headers.get("x-profile-trace-id"),
          timing: res.headers.get("server-timing"),
        };
      }),
    );
    assert.equal(profiles().length, 2);
    for (const entry of profiles()) {
      const p = entry.meta;
      assert.equal(p.route, "/api/items/:id");
      assert.equal(p.traceId, "0123456789abcdef0123456789abcdef");
      assert.equal(entry.context.traceId, p.traceId);
      for (const category of [
        "mongodb",
        "mongoose",
        "db_pool",
        "redis",
        "http",
        "auth",
        "serialization",
        "cache",
      ])
        assert(p.categories[category]?.count > 0, `missing ${category}`);
      assert(p.operations.some((op) => op.name === "service.failed" && op.status === "error"));
      assert(!JSON.stringify(p).includes("PRIVATE_"));
      assert(
        p.operations.some((op) => op.name === "auth.callback" && op.durationMs >= 8),
        "callback middleware ended too early",
      );
      assert(p.operations.every((op) => op.startMs + op.durationMs <= p.totalMs + 0.02));
    }
    assert.deepEqual(
      new Set(profiles().map((entry) => entry.meta.requestId)),
      new Set(["one", "two"]),
    );
    assert(responses.every((response) => response.timing.includes("profile_mongodb")));
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    await health.text();
    assert.equal(health.headers.get("x-profile-trace-id"), null);
    const failure = await fetch(`http://127.0.0.1:${port}/api/failure`);
    await failure.text();
    assert.equal(failure.status, 503);
    await new Promise((resolve, reject) => {
      get(`http://127.0.0.1:${port}/api/abort`, (response) => {
        response.resume();
        response.on("aborted", resolve);
        response.on("error", () => resolve());
      }).on("error", reject);
    });
    await delay(15);
    assert.equal(profiles().filter((entry) => entry.meta.aborted).length, 1);
    assert.equal(profiles().length, 4);
    process.stdout.write(
      "PROFILE_RESULT=" +
        JSON.stringify({ profiles: profiles().map((entry) => entry.meta) }) +
        "\n",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    redis.disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => redisPeer.close(resolve));
    await mongoose.disconnect();
    await client.close();
    await runtime.shutdown();
    await logger.flush();
  }
}
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
