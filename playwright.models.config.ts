import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "/tmp/saasphase1-playwright-model-results",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
