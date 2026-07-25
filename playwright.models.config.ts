import { defineConfig } from "@playwright/test";

import { pureE2eSpecPaths } from "./scripts/e2e/test-suite.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "/tmp/saasphase1-playwright-model-results",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  testMatch: [...pureE2eSpecPaths],
});
