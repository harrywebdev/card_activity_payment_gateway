import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only's default export throws by design to prevent client-side
      // imports. In a Node test runner it's just noise — alias it to nothing.
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.js"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    // Run every test file in a single fork so they share the same SQLite
    // test DB and never race each other on `prisma migrate deploy`.
    fileParallelism: false,
  },
});
