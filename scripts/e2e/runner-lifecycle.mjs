import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export const defaultShutdownTimeoutMs = 10_000;

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function acquireRunnerLock(lockPath) {
  if (existsSync(lockPath)) {
    let owner;
    try {
      owner = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      throw new Error(`Refusing to continue: E2E runner lock is unreadable at ${lockPath}`);
    }

    if (Number.isInteger(owner.pid) && isProcessRunning(owner.pid)) {
      throw new Error(`Refusing to continue: another E2E runner is active (pid ${owner.pid})`);
    }

    rmSync(lockPath, { force: true });
  }

  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, "utf8");
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("Refusing to continue: another E2E runner acquired the lock");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }

  return () => rmSync(lockPath, { force: true });
}

export function restoreFile(path, originalContents) {
  if (readFileSync(path, "utf8") !== originalContents) {
    writeFileSync(path, originalContents);
  }
}

export function startManagedProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env,
    stdio: options.stdio ?? "inherit",
  });

  const started = new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  return { child, started, completed };
}

function signalManagedProcess(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
    return;
  }

  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
    return;
  }

  child.kill(signal);
}

export async function stopManagedProcess(managedProcess, signal, timeoutMs = defaultShutdownTimeoutMs) {
  signalManagedProcess(managedProcess.child, signal);

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs, "timeout");
  });
  let outcome;
  try {
    outcome = await Promise.race([managedProcess.completed, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }

  if (outcome !== "timeout") {
    return outcome;
  }

  signalManagedProcess(managedProcess.child, "SIGKILL");
  return managedProcess.completed;
}
