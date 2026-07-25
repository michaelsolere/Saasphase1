import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const result = spawnSync("node_modules/.bin/playwright", ["test", "--config=playwright.models.config.ts", ...args], {
  stdio: "inherit",
});

process.exitCode = result.status ?? 1;
