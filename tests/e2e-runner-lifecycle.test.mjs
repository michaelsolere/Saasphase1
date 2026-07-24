import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  acquireRunnerLock,
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
