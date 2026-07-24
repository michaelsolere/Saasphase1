import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  acquireRunnerLock,
  resolveTerminalResult,
  restoreFile,
  startManagedProcess,
  stopManagedProcess,
} from "../scripts/e2e/runner-lifecycle.mjs";
import { isPortOpen } from "../scripts/e2e/shared.mjs";

function tempDirectory() {
  return mkdtempSync(resolve(tmpdir(), "saasphase1-e2e-runner-"));
}

function fakeChild(script) {
  return startManagedProcess(process.execPath, ["-e", script], { stdio: "pipe" });
}

test("resolves Playwright terminal outcomes without treating child signals as success", () => {
  assert.deepEqual(resolveTerminalResult({ code: 0, signal: null }), { line: "E2E_EXIT=0", exitCode: 0 });
  assert.deepEqual(resolveTerminalResult({ code: 7, signal: null }), { line: "E2E_EXIT=7", exitCode: 7 });
  assert.deepEqual(resolveTerminalResult({ code: null, signal: "SIGTERM" }), {
    line: "E2E_CHILD_SIGNAL=SIGTERM",
    exitCode: 1,
  });
});

test("returns the child's successful exit code", async () => {
  const outcome = await fakeChild("process.exit(0)").completed;
  assert.equal(outcome.code, 0);
  assert.equal(outcome.signal, null);
});

test("returns the child's failing exit code unchanged", async () => {
  const outcome = await fakeChild("process.exit(7)").completed;
  assert.equal(outcome.code, 7);
  assert.equal(outcome.signal, null);
});

test("inherits the parent environment and lets explicit process options override it", async () => {
  const inheritedName = "E2E_RUNNER_PARENT_ONLY";
  const overriddenName = "E2E_RUNNER_OVERRIDDEN";
  const previousInherited = process.env[inheritedName];
  const previousOverridden = process.env[overriddenName];
  process.env[inheritedName] = "visible-from-parent";
  process.env[overriddenName] = "parent-value";

  try {
    const managed = startManagedProcess(
      process.execPath,
      [
        "-e",
        `process.stdout.write(JSON.stringify({ inherited: process.env.${inheritedName}, supplied: process.env.E2E_RUNNER_SUPPLIED, overridden: process.env.${overriddenName} }))`,
      ],
      {
        env: {
          E2E_RUNNER_SUPPLIED: "visible-from-options",
          [overriddenName]: "options-value",
        },
        stdio: "pipe",
      },
    );
    let stdout = "";
    managed.child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    const outcome = await managed.completed;
    assert.equal(outcome.code, 0);
    assert.deepEqual(JSON.parse(stdout), {
      inherited: "visible-from-parent",
      supplied: "visible-from-options",
      overridden: "options-value",
    });
  } finally {
    if (previousInherited === undefined) delete process.env[inheritedName];
    else process.env[inheritedName] = previousInherited;
    if (previousOverridden === undefined) delete process.env[overriddenName];
    else process.env[overriddenName] = previousOverridden;
  }
});

test("forwards an interruption and waits for the child process group", async () => {
  const managed = fakeChild("process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)");
  await managed.started;
  const outcome = await stopManagedProcess(managed, "SIGTERM", 2_000);
  assert.equal(outcome.code, null);
  assert.equal(outcome.signal, "SIGTERM");
});

test("restores a modified tsconfig file", () => {
  const directory = tempDirectory();
  const path = resolve(directory, "tsconfig.json");
  try {
    writeFileSync(path, "original\n");
    restoreFile(path, "original\n");
    writeFileSync(path, "modified\n");
    restoreFile(path, "original\n");
    assert.equal(readFileSync(path, "utf8"), "original\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("removes its lock and refuses a concurrent runner", () => {
  const directory = tempDirectory();
  const lockPath = resolve(directory, "runner.lock");
  try {
    const release = acquireRunnerLock(lockPath);
    assert.throws(() => acquireRunnerLock(lockPath), /another E2E runner/);
    release();
    assert.equal(existsSync(lockPath), false);
    const nextRelease = acquireRunnerLock(lockPath);
    nextRelease();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("does not leave a managed server on port 3100", async (t) => {
  if (await isPortOpen(3100)) {
    t.skip("port 3100 belongs to an active durable demonstration");
    return;
  }
  const managed = fakeChild(
    "require('node:http').createServer((_, response) => response.end('ok')).listen(3100, '127.0.0.1'); setInterval(() => {}, 1000)",
  );
  for (let attempt = 0; attempt < 20 && !(await isPortOpen(3100)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(await isPortOpen(3100), true);
  await stopManagedProcess(managed, "SIGTERM", 2_000);
  for (let attempt = 0; attempt < 20 && (await isPortOpen(3100)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(await isPortOpen(3100), false);
});
