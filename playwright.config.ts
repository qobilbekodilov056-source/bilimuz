import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "reports/browser.json" }]],
  use: {
    baseURL: "http://127.0.0.1:8789",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          args: ["--no-sandbox"],
        }
      : {},
  },
  webServer: {
    command: "node tests/e2e-server.mjs",
    url: "http://127.0.0.1:8789/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
