import path from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      aegislog: path.resolve(__dirname, "./packages/core/src/index.ts"),
      "@aegislog/hono": path.resolve(__dirname, "./packages/hono/src/index.ts"),
      "@aegislog/express": path.resolve(__dirname, "./packages/express/src/index.ts"),
      "@aegislog/next": path.resolve(__dirname, "./packages/next/src/index.ts"),
      "@aegislog/fastify": path.resolve(__dirname, "./packages/fastify/src/index.ts"),
      "@aegislog/transports": path.resolve(__dirname, "./packages/transports/src/index.ts"),
      "@aegislog/dev": path.resolve(__dirname, "./packages/dev/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
  },
});
