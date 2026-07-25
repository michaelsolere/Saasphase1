import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { e2eEnv, nextBuildDir, workdir, assertDockerAvailable } from "../scripts/e2e/shared.mjs";
import {
  createManagedPlaywrightEnvironment,
  isPureE2eSpec,
  resolvePlaywrightRunMode,
} from "../scripts/e2e/test-suite.mjs";

test("fails immediately with actionable guidance when Docker is unavailable", () => {
  assert.throws(
    () =>
      assertDockerAvailable({
        dockerInfo() {
          const error = new Error("Cannot connect to the Docker daemon at unix:///var/run/docker.sock");
          error.stderr = "Cannot connect to the Docker daemon";
          throw error;
        },
      }),
    /Docker is not available\.[\s\S]*pnpm test:e2e -- <spec>/,
  );
});

test("keeps unexpected Docker failures visible", () => {
  const expected = new Error("docker info failed: permission denied");
  assert.throws(
    () => assertDockerAvailable({ dockerInfo: () => { throw expected; } }),
    (error) => error === expected,
  );
});

test("refuses an integrated spec without the managed-runner marker", () => {
  assert.throws(
    () => resolvePlaywrightRunMode({ environment: {}, argv: ["test", "tests/e2e/breeding-calendar.spec.ts"] }),
    /pnpm test:e2e -- tests\/e2e\/breeding-calendar\.spec\.ts/,
  );
});

test("accepts an integrated spec through the managed runner", () => {
  const environment = createManagedPlaywrightEnvironment({ SUPABASE_PROJECT_ID: "saasphase1-e2e" });
  assert.equal(environment.E2E_RUNNER_MANAGED, "1");
  assert.deepEqual(
    resolvePlaywrightRunMode({
      environment,
      argv: ["test", "tests/e2e/breeding-calendar.spec.ts"],
    }),
    { managedRunner: true },
  );
});

test("accepts a declared pure spec directly without Supabase variables", () => {
  assert.equal(isPureE2eSpec("tests/e2e/breeding-calendar-core.spec.ts"), true);
  assert.deepEqual(
    resolvePlaywrightRunMode({ environment: {}, argv: ["test", "tests/e2e/breeding-calendar-core.spec.ts"] }),
    { managedRunner: false },
  );
});

test("uses the ignored E2E workdir for Next and never the repository .next-playwright directory", () => {
  assert.equal(e2eEnv.NEXT_DEV_DIR, nextBuildDir);
  assert.equal(resolve(nextBuildDir).startsWith(`${workdir}/`), true);
  assert.equal(nextBuildDir.includes(".next-playwright"), false);
  assert.equal(existsSync(".next-playwright"), false);
  assert.equal(readFileSync("playwright.config.ts", "utf8").includes(".next-playwright"), false);
});
