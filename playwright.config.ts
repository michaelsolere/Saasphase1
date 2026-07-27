import { defineConfig, devices } from "@playwright/test";

import { resolvePlaywrightRunMode } from "./scripts/e2e/test-suite.mjs";

const { managedRunner } = resolvePlaywrightRunMode();
const nextDevDir = process.env.NEXT_DEV_DIR ?? ".supabase-e2e/next";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "/tmp/saasphase1-playwright-results",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: managedRunner
    ? {
        command: "node_modules/.bin/next dev -H 127.0.0.1 -p 3100",
        env: {
          NEXT_DEV_DIR: nextDevDir,
          NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=1536",
        },
        url: "http://127.0.0.1:3100",
        reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "1",
        timeout: 120_000,
      }
    : undefined,
});
