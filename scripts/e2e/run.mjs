import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  acquireRunnerLock,
  resolveTerminalResult,
  startManagedProcess,
  stopManagedProcess,
  withRestoredFile,
} from "./runner-lifecycle.mjs";

import {
  apiPort,
  appPort,
  assertContainers,
  assertDockerAvailable,
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
import { createManagedPlaywrightEnvironment } from "./test-suite.mjs";

const tsconfigPath = resolve(repoRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const runnerLockPath = resolve(repoRoot, ".e2e-runner.lock");
const runnerFlags = new Set(["--reuse", "--stop", "--preserve-demo"]);

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const mode = rawArgs.includes("--stop") ? "stop" : rawArgs.includes("--reuse") ? "reuse" : "ephemeral";
const preserveDemo = rawArgs.includes("--preserve-demo");
const playwrightArgs = rawArgs.filter((arg) => !runnerFlags.has(arg));

async function assertE2ePortsFree() {
  for (const port of e2ePorts) {
    await assertPortFree(port);
  }
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
    env: createManagedPlaywrightEnvironment({ ...e2eEnv, ...supabaseEnv }),
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
  }
}

async function runReuse() {
  try {
    await ensureReusableStack();
    const supabaseEnv = readStatusEnv();
    return await runPlaywright(supabaseEnv);
  } finally {
  }
}

async function runPreserveDemo() {
  // Intentionally does not call ensureReusableStack: this path is read-only
  // with respect to Docker, volumes, the workdir and the database.
  if (!(await isReusableStackRunning()) || !hasSessionMarker()) {
    throw new Error("Preserved-demo E2E requires an already running marked saasphase1-e2e stack.");
  }
  assertContainers();
  const supabaseEnv = readStatusEnv();
  if (supabaseEnv.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") {
    throw new Error("Preserved-demo E2E requires http://127.0.0.1:55321.");
  }
  return runPlaywright(supabaseEnv);
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
  assertDockerAvailable();
  if (preserveDemo) {
    const target = playwrightArgs.filter((arg) => arg.endsWith(".spec.ts"));
    const allowedSpecs = new Set([
      "tests/e2e/litter-plan-ad-hoc-metadata.spec.ts",
      "tests/e2e/litter-plan-timeline-resolution-ui.spec.ts",
      "tests/e2e/litter-plan-timeline-ui.spec.ts",
      "tests/e2e/litter-planning-model-library-recurrence.spec.ts",
      "tests/e2e/maternal-temperature-planning-link.spec.ts",
    ]);
    const permitted = playwrightArgs.every((arg) => allowedSpecs.has(arg) || /^--(workers=1|retries=0)$/.test(arg));
    if (mode !== "reuse" || target.length !== 1 || !allowedSpecs.has(target[0]) || !permitted) {
      throw new Error("--preserve-demo is limited to one allowlisted E2E spec in reuse mode.");
    }
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321") {
      throw new Error("--preserve-demo requires the isolated E2E Supabase URL.");
    }
  } else {
    assertNoActiveDemoManifests(`E2E runner mode ${mode}`);
  }
  releaseRunnerLock = acquireRunnerLock(runnerLockPath);

  try {
    const outcome = await withRestoredFile(tsconfigPath, originalTsconfig, async () => {
      if (mode === "stop") {
        runStop();
        return { code: 0 };
      }
      if (mode === "reuse") {
        return preserveDemo ? runPreserveDemo() : runReuse();
      }
      return runEphemeral();
    });

    reportTerminalResult(outcome);
  } catch (error) {
    if (!interruptedSignal) {
      console.error(error.stack ?? error.message);
    }
    reportTerminalResult();
  } finally {
    releaseRunnerLock?.();
  }
}

await main();
