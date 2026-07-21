import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  apiPort,
  appPort,
  assertContainers,
  assertNoActiveDemoManifests,
  assertPortFree,
  assertSafeE2eConfig,
  dbContainer,
  dbPort,
  demoManifestDir,
  e2eEnv,
  e2ePorts,
  isPortOpen,
  listDockerNames,
  prepareE2eWorkdir,
  projectId,
  readDemoManifests,
  readStatusEnv,
  removeE2eVolumes,
  repoRoot,
  run,
  sessionMarkerPath,
  stopE2eStack,
  workdir,
} from "./shared.mjs";

const serverStatePath = resolve(workdir, "demo-server.json");
const serverLogPath = resolve(workdir, "demo-server.log");
const tsconfigPath = resolve(repoRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const scenarioDefinitions = {
  "technical-lifecycle": {
    scenarioId: "technical-lifecycle",
    labelPrefix: "DURABLE_DEMO_TECH_V1",
    uuidPrefix: "d3e7000",
    contactId: "d3e70001-0000-4000-8000-000000000001",
    applicationId: "d3e70002-0000-4000-8000-000000000001",
  },
};

function usage() {
  console.log(`Usage:
  pnpm demo:e2e:start
  pnpm demo:e2e:create -- technical-lifecycle
  pnpm demo:e2e:status
  pnpm demo:e2e:cleanup -- technical-lifecycle
  pnpm demo:e2e:stop`);
}

function writeJsonAtomic(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function restoreTsconfig() {
  if (readFileSync(tsconfigPath, "utf8") !== originalTsconfig) {
    writeFileSync(tsconfigPath, originalTsconfig, "utf8");
  }
}

function manifestPath(scenarioId) {
  return resolve(demoManifestDir, `${scenarioId}.json`);
}

function scenarioFor(id) {
  const scenario = scenarioDefinitions[id];
  if (!scenario) {
    throw new Error(`Unknown demonstration scenario ${id}. Available: ${Object.keys(scenarioDefinitions).join(", ")}`);
  }
  return scenario;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSql(sql) {
  assertSafeE2eConfig();
  assertContainers();
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-f",
      "-",
    ],
    { cwd: repoRoot, encoding: "utf8", input: sql, maxBuffer: 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error(`E2E SQL failed with exit code ${result.status ?? "unknown"}:\n${result.stderr}`);
  }

  return result.stdout.trim();
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readServerMetadata() {
  if (!existsSync(serverStatePath)) {
    return null;
  }
  try {
    return readJson(serverStatePath);
  } catch (error) {
    throw new Error(`Invalid durable demonstration server state ${serverStatePath}: ${error.message}`);
  }
}

async function httpProbe(url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(3_000) });
    return { status: response.status, finalUrl: response.url };
  } catch {
    return { status: 0, finalUrl: null };
  }
}

async function waitForHttp200(url, pid, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) {
      throw new Error(`Durable demonstration server process ${pid} exited before becoming ready; see ${serverLogPath}`);
    }
    const probe = await httpProbe(url);
    if (probe.status === 200) {
      return probe;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for HTTP 200 from ${url}; see ${serverLogPath}`);
}

async function reusableStackState() {
  const hasConfig = existsSync(resolve(workdir, "supabase/config.toml"));
  const hasContainer = listDockerNames().includes(dbContainer);
  const apiOpen = await isPortOpen(apiPort);
  const dbOpen = await isPortOpen(dbPort);
  return { hasConfig, hasContainer, apiOpen, dbOpen };
}

async function ensureStack() {
  const state = await reusableStackState();
  if (state.hasConfig && state.hasContainer && state.apiOpen && state.dbOpen) {
    if (!existsSync(sessionMarkerPath)) {
      throw new Error("Refusing to reuse an E2E stack without its session marker; inspect or stop it explicitly first");
    }
    assertContainers();
    readStatusEnv();
    return "reused";
  }

  const hasAnyE2eContainer = listDockerNames({ all: true }).some((name) => name.endsWith("_saasphase1-e2e"));
  const occupiedSupabasePorts = [];
  for (const port of e2ePorts.filter((port) => port !== appPort)) {
    if (await isPortOpen(port)) {
      occupiedSupabasePorts.push(port);
    }
  }
  if (state.hasConfig || hasAnyE2eContainer || occupiedSupabasePorts.length > 0) {
    throw new Error(
      `Refusing to repair an incoherent E2E stack automatically: ${JSON.stringify({ ...state, occupiedSupabasePorts })}`,
    );
  }

  for (const port of e2ePorts.filter((port) => port !== appPort)) {
    await assertPortFree(port);
  }
  prepareE2eWorkdir();
  run("supabase", ["start", "--workdir", workdir]);
  assertContainers();
  run("supabase", ["db", "reset", "--workdir", workdir]);
  writeJsonAtomic(sessionMarkerPath, { projectId, startedAt: new Date().toISOString(), purpose: "durable-demo" });
  return "started";
}

async function ensureServer() {
  const metadata = readServerMetadata();
  const portOpen = await isPortOpen(appPort);

  if (metadata && processIsAlive(metadata.pid)) {
    const command = processCommand(metadata.pid);
    if (!command.includes("next") || !command.includes("3100")) {
      throw new Error(`Refusing to trust PID ${metadata.pid}; unexpected command: ${command}`);
    }
    if (!portOpen) {
      throw new Error(`Durable demonstration PID ${metadata.pid} is alive but port ${appPort} is closed`);
    }
    const probe = await httpProbe(`http://127.0.0.1:${appPort}`);
    if (probe.status !== 200) {
      throw new Error(`Durable demonstration server PID ${metadata.pid} is not healthy (HTTP ${probe.status})`);
    }
    return { ...metadata, state: "running", httpStatus: probe.status, reused: true };
  }

  if (metadata && !processIsAlive(metadata.pid)) {
    rmSync(serverStatePath, { force: true });
  }
  if (portOpen) {
    throw new Error(`Refusing to start: port ${appPort} is occupied without a live trusted demonstration PID`);
  }

  const supabaseEnv = readStatusEnv();
  mkdirSync(workdir, { recursive: true });
  const logFd = openSync(serverLogPath, "a");
  const child = spawn(resolve(repoRoot, "node_modules/.bin/next"), ["dev", "-H", "127.0.0.1", "-p", String(appPort)], {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, ...e2eEnv, ...supabaseEnv },
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);

  const server = {
    state: "starting",
    pid: child.pid,
    startedAt: new Date().toISOString(),
    baseUrl: `http://127.0.0.1:${appPort}`,
    logPath: serverLogPath,
  };
  writeJsonAtomic(serverStatePath, server);
  let probe;
  try {
    probe = await waitForHttp200(server.baseUrl, child.pid);
  } finally {
    restoreTsconfig();
  }
  const ready = { ...server, state: "running", readyAt: new Date().toISOString(), httpStatus: probe.status };
  writeJsonAtomic(serverStatePath, ready);
  return { ...ready, reused: false };
}

async function startSession() {
  assertSafeE2eConfig();
  const stack = await ensureStack();
  const server = await ensureServer();
  console.log(JSON.stringify({ stack, server }, null, 2));
  return server;
}

function scenarioCounts(scenario, manifest = null) {
  const generatedRoleIds = manifest?.serverGeneratedIds?.contact_roles ?? [];
  const roleIdPredicate = generatedRoleIds.length > 0
    ? `id in (${generatedRoleIds.map((id) => `${sqlLiteral(id)}::uuid`).join(", ")}) or`
    : "";
  return JSON.parse(
    runSql(`
      select json_build_object(
        'applications', (select count(*) from public.applications
          where id::text like ${sqlLiteral(`${scenario.uuidPrefix}%`)}
             or internal_comment like ${sqlLiteral(`${scenario.labelPrefix}%`)}),
        'contact_roles', (select count(*) from public.contact_roles
          where ${roleIdPredicate} notes like ${sqlLiteral(`${scenario.labelPrefix}%`)}),
        'contacts', (select count(*) from public.contacts
          where id::text like ${sqlLiteral(`${scenario.uuidPrefix}%`)}
             or internal_comment like ${sqlLiteral(`${scenario.labelPrefix}%`)})
      );
    `),
  );
}

function createTechnicalScenario(scenario, server) {
  const path = manifestPath(scenario.scenarioId);
  if (existsSync(path) && readJson(path).status === "active") {
    throw new Error(`Demonstration ${scenario.scenarioId} is already active`);
  }
  const before = scenarioCounts(scenario);
  if (Object.values(before).some((count) => Number(count) !== 0)) {
    throw new Error(`Reserved demonstration data already exists; refusing ambiguous cleanup: ${JSON.stringify(before)}`);
  }

  const generated = JSON.parse(
    runSql(`
      begin;
      with inserted_contact as (
        insert into public.contacts (
          id, organization_id, first_name, last_name, display_name, email,
          origin_channel, internal_comment, created_by, updated_by
        ) values (
          ${sqlLiteral(scenario.contactId)}::uuid, ${sqlLiteral(organizationId)}::uuid,
          'Démo', 'Technique', ${sqlLiteral(`${scenario.labelPrefix} Contact`)},
          'durable-demo-tech@saasphase1.invalid', 'other',
          ${sqlLiteral(`${scenario.labelPrefix} cleanup-registry proof`)},
          ${sqlLiteral(ownerId)}::uuid, ${sqlLiteral(ownerId)}::uuid
        ) returning id
      ), inserted_role as (
        insert into public.contact_roles (
          organization_id, contact_id, role, started_at, notes, created_by, updated_by
        ) select
          ${sqlLiteral(organizationId)}::uuid, id, 'candidate', current_date,
          ${sqlLiteral(`${scenario.labelPrefix} server-generated-id`)},
          ${sqlLiteral(ownerId)}::uuid, ${sqlLiteral(ownerId)}::uuid
        from inserted_contact
        returning id
      ), inserted_application as (
        insert into public.applications (
          id, organization_id, contact_id, species, breed, desired_sex_preference,
          desired_quantity, project_description, internal_comment, status,
          submitted_at, created_by, updated_by
        ) select
          ${sqlLiteral(scenario.applicationId)}::uuid, ${sqlLiteral(organizationId)}::uuid, id,
          'dog', 'Golden Retriever', 'no_preference', 1,
          'Preuve technique du cycle de démonstration durable.',
          ${sqlLiteral(`${scenario.labelPrefix} linked-application`)}, 'to_review', now(),
          ${sqlLiteral(ownerId)}::uuid, ${sqlLiteral(ownerId)}::uuid
        from inserted_contact
        returning id
      )
      select json_build_object(
        'contactRoleId', (select id from inserted_role),
        'applicationId', (select id from inserted_application)
      );
      commit;
    `),
  );

  const manifest = {
    version: 1,
    scenarioId: scenario.scenarioId,
    status: "active",
    createdAt: new Date().toISOString(),
    url: `http://127.0.0.1:${appPort}/candidatures/${scenario.applicationId}`,
    directIds: {
      contacts: [scenario.contactId],
      applications: [scenario.applicationId],
    },
    serverGeneratedIds: {
      contact_roles: [generated.contactRoleId],
    },
    idempotencyKeys: [],
    storageObjects: [],
    cleanupOrder: ["applications", "contact_roles", "contacts"],
    reserved: { uuidPrefix: scenario.uuidPrefix, labelPrefix: scenario.labelPrefix },
    server: {
      state: server.state,
      pid: server.pid,
      baseUrl: server.baseUrl,
      logPath: server.logPath,
      checkedAt: new Date().toISOString(),
    },
  };

  try {
    writeJsonAtomic(path, manifest);
  } catch (error) {
    runSql(`
      delete from public.applications where id = ${sqlLiteral(scenario.applicationId)}::uuid;
      delete from public.contact_roles where id = ${sqlLiteral(generated.contactRoleId)}::uuid;
      delete from public.contacts where id = ${sqlLiteral(scenario.contactId)}::uuid;
    `);
    throw error;
  }
  const counts = scenarioCounts(scenario, manifest);
  console.log(JSON.stringify({ manifestPath: path, manifest, counts }, null, 2));
}

async function createScenario(scenarioId) {
  const scenario = scenarioFor(scenarioId);
  const server = await startSession();
  createTechnicalScenario(scenario, server);
}

async function status() {
  assertSafeE2eConfig();
  const stack = await reusableStackState();
  const metadata = readServerMetadata();
  const portOpen = await isPortOpen(appPort);
  const server = metadata
    ? {
        ...metadata,
        state: processIsAlive(metadata.pid) && portOpen ? "running" : "stale",
        processAlive: processIsAlive(metadata.pid),
        portOpen,
        http: await httpProbe(`http://127.0.0.1:${appPort}`),
      }
    : { state: portOpen ? "unknown-port-owner" : "stopped", portOpen };
  const canReadDatabase = stack.hasContainer && stack.apiOpen && stack.dbOpen;
  const demonstrations = readDemoManifests().map(({ path, manifest }) => {
    const scenario = scenarioDefinitions[manifest.scenarioId];
    return {
      path,
      manifest,
      databaseCounts: canReadDatabase && scenario ? scenarioCounts(scenario, manifest) : null,
    };
  });
  console.log(JSON.stringify({ stack, server, demonstrations }, null, 2));
}

function cleanupScenario(scenarioId) {
  const scenario = scenarioFor(scenarioId);
  const path = manifestPath(scenarioId);
  if (!existsSync(path)) {
    throw new Error(`No cleanup manifest found for demonstration ${scenarioId}`);
  }
  const manifest = readJson(path);
  if (manifest.status !== "active") {
    throw new Error(`Demonstration ${scenarioId} is not active (status: ${manifest.status})`);
  }
  const contactIds = manifest.directIds?.contacts ?? [];
  const applicationIds = manifest.directIds?.applications ?? [];
  const roleIds = manifest.serverGeneratedIds?.contact_roles ?? [];
  if (contactIds.length !== 1 || applicationIds.length !== 1 || roleIds.length !== 1) {
    throw new Error(`Refusing cleanup with an incomplete or unexpected manifest inventory: ${path}`);
  }

  runSql(`
    begin;
    delete from public.applications
      where id in (${applicationIds.map((id) => `${sqlLiteral(id)}::uuid`).join(", ")});
    delete from public.contact_roles
      where id in (${roleIds.map((id) => `${sqlLiteral(id)}::uuid`).join(", ")});
    delete from public.contacts
      where id in (${contactIds.map((id) => `${sqlLiteral(id)}::uuid`).join(", ")});
    commit;
  `);
  const counts = scenarioCounts(scenario, manifest);
  if (Object.values(counts).some((count) => Number(count) !== 0)) {
    throw new Error(`Hard-delete verification failed for ${scenarioId}: ${JSON.stringify(counts)}`);
  }
  const cleaned = { ...manifest, status: "cleaned", cleanedAt: new Date().toISOString(), finalCounts: counts };
  writeJsonAtomic(path, cleaned);
  console.log(JSON.stringify({ manifestPath: path, deleted: { applications: applicationIds, contact_roles: roleIds, contacts: contactIds }, finalCounts: counts }, null, 2));
}

async function stopServer() {
  const metadata = readServerMetadata();
  const portOpen = await isPortOpen(appPort);
  if (!metadata) {
    if (portOpen) {
      throw new Error(`Refusing to stop unknown process occupying port ${appPort}`);
    }
    return;
  }

  if (processIsAlive(metadata.pid)) {
    const command = processCommand(metadata.pid);
    if (!command.includes("next") || !command.includes("3100")) {
      throw new Error(`Refusing to stop untrusted PID ${metadata.pid}; unexpected command: ${command}`);
    }
    process.kill(-metadata.pid, "SIGTERM");
    const deadline = Date.now() + 15_000;
    while (processIsAlive(metadata.pid) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (processIsAlive(metadata.pid)) {
      throw new Error(`Durable demonstration server PID ${metadata.pid} did not stop after SIGTERM`);
    }
  }
  rmSync(serverStatePath, { force: true });
  if (await isPortOpen(appPort)) {
    throw new Error(`Port ${appPort} remains occupied after stopping the recorded demonstration server`);
  }
}

async function stopSession() {
  assertSafeE2eConfig();
  assertNoActiveDemoManifests("durable demonstration session stop");
  await stopServer();
  stopE2eStack();
  removeE2eVolumes();
  rmSync(workdir, { recursive: true, force: true });
  console.log("Durable E2E demonstration session stopped; port 3100, stack, volumes, and workdir removed.");
}

assertSafeE2eConfig();

const [command, scenarioId] = process.argv.slice(2).filter((arg) => arg !== "--");
if (command === "start") {
  await startSession();
} else if (command === "create") {
  if (!scenarioId) {
    usage();
    process.exitCode = 1;
  } else {
    await createScenario(scenarioId);
  }
} else if (command === "status") {
  await status();
} else if (command === "cleanup") {
  if (!scenarioId) {
    usage();
    process.exitCode = 1;
  } else {
    cleanupScenario(scenarioId);
  }
} else if (command === "stop") {
  await stopSession();
} else {
  usage();
  process.exitCode = 1;
}
