import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("TypeScript package compatibility", () => {
  it("resolves the Express subpath with legacy CommonJS module resolution", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "aegis-types-"));
    try {
      await mkdir(path.join(directory, "node_modules", "@aegislog"), { recursive: true });
      await symlink(
        path.resolve("packages/profiling"),
        path.join(directory, "node_modules", "@aegislog", "profiling"),
        "dir",
      );
      await writeFile(
        path.join(directory, "consumer.ts"),
        `import { startProfiling } from '@aegislog/profiling';\nimport { createExpressProfilingMiddleware } from '@aegislog/profiling/express';\nconst runtime = startProfiling({ enabled: false });\ncreateExpressProfilingMiddleware(runtime, { filter: req => req.path !== '/health' });\n`,
      );
      const { stderr } = await exec(
        process.execPath,
        [
          path.resolve("node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--skipLibCheck",
          "--strict",
          "--esModuleInterop",
          "--module",
          "commonjs",
          "--moduleResolution",
          "node",
          "--target",
          "es2022",
          path.join(directory, "consumer.ts"),
        ],
        { timeout: 15000 },
      );
      expect(stderr).toBe("");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20000);
});
