import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  acquireRunnerLock,
  resolveTerminalResult,
  restoreFile,
  startManagedProcess,
  stopManagedProcess,
} from "./runner-lifecycle.mjs";

import {
  apiPort,
  appPort,
  assertContainers,
  assertNoActiveDemoManifests,
  assertPortFree,
  assertSafeE2eConfig,
  dbContainer,
  dbPort,
  e2eEnv,
  e2ePorts,
  isPortOpen,
  listDockerNames,
  prepareE2eWorkdir,
  projectId,
  readStatusEnv,
  removeE2eVolumes,
  repoRoot,
  run,
  sessionMarkerPath,
  stopE2eStack,
  workdir,
} from "./shared.mjs";

const tsconfigPath = resolve(repoRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const runnerLockPath = resolve(repoRoot, ".e2e-runner.lock");
const runnerFlags = new Set(["--reuse", "--stop"]);

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const mode = rawArgs.includes("--stop") ? "stop" : rawArgs.includes("--reuse") ? "reuse" : "ephemeral";
const playwrightArgs = rawArgs.filter((arg) => !runnerFlags.has(arg));

async function assertE2ePortsFree() {
  for (const port of e2ePorts) {
    await assertPortFree(port);
  }
}

function restoreTsconfig() {
  restoreFile(tsconfigPath, originalTsconfig);
}

function clearSessionMarker() {
  if (existsSync(sessionMarkerPath)) {
    rmSync(sessionMarkerPath, { force: true });
  }
}

function markSessionReady() {
  mkdirSync(workdir, { recursive: true });
  writeFileSync(
    sessionMarkerPath,
    `${JSON.stringify({ projectId, startedAt: new Date().toISOString() })}\n`,
    "utf8",
  );
}

function hasSessionMarker() {
  return existsSync(sessionMarkerPath);
}

function hasWorkdirConfig() {
  return existsSync(resolve(workdir, "supabase/config.toml"));
}

async function isReusableStackRunning() {
  if (!hasWorkdirConfig()) {
    return false;
  }

  if (!listDockerNames().includes(dbContainer)) {
    return false;
  }

  return (await isPortOpen(apiPort)) && (await isPortOpen(dbPort));
}

function removeWorkdir() {
  rmSync(workdir, { recursive: true, force: true });
}

async function runPlaywright(supabaseEnv) {
  const managedProcess = startManagedProcess("node_modules/.bin/playwright", ["test", ...playwrightArgs], {
    cwd: repoRoot,
    env: { ...e2eEnv, ...supabaseEnv },
  });
  activePlaywright = managedProcess;
  try {
    const outcome = await managedProcess.completed;
    const deadline = Date.now() + 10_000;
    while (await isPortOpen(appPort)) {
      if (Date.now() >= deadline) {
        throw new Error(`Playwright left its Next server listening on E2E port ${appPort}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return outcome;
  } finally {
    activePlaywright = undefined;
  }
}

async function startFreshStack({ resetDatabase }) {
  await assertE2ePortsFree();
  prepareE2eWorkdir();
  run("supabase", ["start", "--workdir", workdir]);
  assertContainers();
  if (resetDatabase) {
    run("supabase", ["db", "reset", "--workdir", workdir]);
  }
  markSessionReady();
}

async function ensureReusableStack() {
  if (await isReusableStackRunning()) {
    assertContainers();
    if (hasSessionMarker()) {
      console.log("E2E reuse: reusing existing saasphase1-e2e stack (skip start, skip db reset).");
      return;
    }

    console.log("E2E reuse: stack is up without session marker; running one-time db reset.");
    run("supabase", ["db", "reset", "--workdir", workdir]);
    markSessionReady();
    return;
  }

  console.log("E2E reuse: starting saasphase1-e2e and initializing with db reset.");
  stopE2eStack();
  removeE2eVolumes();
  clearSessionMarker();
  await startFreshStack({ resetDatabase: true });
}

async function runEphemeral() {
  stopE2eStack();
  removeE2eVolumes();
  clearSessionMarker();
  await assertE2ePortsFree();
  prepareE2eWorkdir();

  try {
    run("supabase", ["start", "--workdir", workdir]);
    assertContainers();
    run("supabase", ["db", "reset", "--workdir", workdir]);
    const supabaseEnv = readStatusEnv();
    return await runPlaywright(supabaseEnv);
  } finally {
    stopE2eStack();
    removeE2eVolumes();
    clearSessionMarker();
    removeWorkdir();
    restoreTsconfig();
  }
}

async function runReuse() {
  try {
    await ensureReusableStack();
    const supabaseEnv = readStatusEnv();
    return await runPlaywright(supabaseEnv);
  } finally {
    restoreTsconfig();
  }
}

function runStop() {
  assertSafeE2eConfig();
  console.log("E2E stop: shutting down saasphase1-e2e and removing its volumes.");
  stopE2eStack();
  removeE2eVolumes();
  clearSessionMarker();
  removeWorkdir();
  console.log("E2E stop: done.");
}

let activePlaywright;
let interruptedSignal;
let releaseRunnerLock;

async function handleSignal(signal) {
  if (interruptedSignal) {
    return;
  }
  interruptedSignal = signal;
  if (activePlaywright) {
    try {
      await stopManagedProcess(activePlaywright, signal);
    } catch (error) {
      console.error(`Unable to stop Playwright after ${signal}: ${error.message}`);
    }
  }
}

process.on("SIGINT", () => void handleSignal("SIGINT"));
process.on("SIGTERM", () => void handleSignal("SIGTERM"));

function reportTerminalResult(outcome) {
  const result = resolveTerminalResult(outcome, interruptedSignal);
  console.log(result.line);
  process.exitCode = result.exitCode;
}

async function main() {
  assertSafeE2eConfig();
  assertNoActiveDemoManifests(`E2E runner mode ${mode}`);
  releaseRunnerLock = acquireRunnerLock(runnerLockPath);

  try {
    let outcome;
    if (mode === "stop") {
      runStop();
      outcome = { code: 0 };
    } else if (mode === "reuse") {
      outcome = await runReuse();
    } else {
      outcome = await runEphemeral();
    }

    reportTerminalResult(outcome);
  } catch (error) {
    if (!interruptedSignal) {
      console.error(error.stack ?? error.message);
    }
    reportTerminalResult();
  } finally {
    restoreTsconfig();
    releaseRunnerLock?.();
  }
}

await main();
