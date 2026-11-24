import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    onConsoleLog(log) {
      return !log.includes("request_id") || log.includes("debug");
    },
    include: ["tests/**/*.test.{ts,mjs}"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    reporters: ["default", "json"],
    outputFile: { json: "reports/tests.json" },
  },
});
