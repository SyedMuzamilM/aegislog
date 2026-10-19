import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { describe, it, expect } from "vitest";
const exec = promisify(execFile);

describe("published package integration", () => {
  it.each(["disabled", "zero", "cap"])(
    "handles %s collection without trusting remote sampling flags",
    async (mode) => {
      const { stdout } = await exec(
        process.execPath,
        [path.resolve("packages/profiling/test/modes.cjs")],
        { timeout: 15000, env: { ...process.env, PROFILE_MODE: mode } },
      );
      expect(stdout).toContain("MODE_OK=" + mode);
    },
    20000,
  );
  // MongoDB 7 and Mongoose 9 test clients require Node 20.19; the runtime itself supports 18.19.
  it.skipIf(Number(process.versions.node.split(".")[0]) < 20).each(["cjs", "mjs"])(
    "profiles real MongoDB, Mongoose, Redis protocol and HTTP through %s exports",
    async (format) => {
      const mongo = await MongoMemoryServer.create();
      const exported: string[] = [];
      const collector = createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          exported.push(body);
          response.end("{}");
        });
      });
      await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
      const port = (collector.address() as { port: number }).port;
      try {
        const result = await exec(
          process.execPath,
          [path.resolve("packages/profiling/test/fixture." + format)],
          {
            cwd: process.cwd(),
            timeout: 40000,
            maxBuffer: 4 * 1024 * 1024,
            env: {
              ...process.env,
              PROFILE_TEST_MONGO: mongo.getUri("profiling-test"),
              PROFILE_TEST_OTLP: `http://127.0.0.1:${port}/v1/traces`,
            },
          },
        );
        const data = JSON.parse(result.stdout.split("PROFILE_RESULT=")[1]!);
        expect(data.profiles).toHaveLength(4);
        expect(exported.length).toBeGreaterThan(0);
        expect(exported.join("")).not.toContain("PRIVATE_");
        expect(exported.join("")).toContain("mongodb.pool.checkout");
        expect(exported.join("")).toContain("redis");
      } finally {
        await mongo.stop();
        await new Promise<void>((resolve) => collector.close(() => resolve()));
      }
    },
    60000,
  );
});
