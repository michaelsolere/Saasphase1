import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const workdir = resolve(repoRoot, ".supabase-e2e");
export const demoManifestDir = resolve(workdir, "demos");
export const sessionMarkerPath = resolve(workdir, ".reuse-session");
export const projectId = "saasphase1-e2e";
export const appPort = 3100;
export const apiPort = 55321;
export const dbPort = 55322;
export const dbContainer = "supabase_db_saasphase1-e2e";
export const e2ePorts = [appPort, 55320, apiPort, dbPort, 55323, 55324, 55327, 55329];
export const e2eVolumeNames = [
  "supabase_db_saasphase1-e2e",
  "supabase_storage_saasphase1-e2e",
  "supabase_edge_runtime_saasphase1-e2e",
];

const forbiddenProjectId = "saasphase1";
const forbiddenApiPort = "54321";
const forbiddenDbContainer = "supabase_db_saasphase1";

export const e2eEnv = {
  SUPABASE_PROJECT_ID: projectId,
  SUPABASE_E2E_DB_CONTAINER: dbContainer,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${apiPort}`,
  NEXT_PUBLIC_SUPABASE_ORGANIZATION_SLUG: "elevage-e2e",
  E2E_OWNER_EMAIL: "e2e-owner@saasphase1.invalid",
  E2E_OWNER_PASSWORD: "LocalE2EOwner-2026!",
  NEXT_DEV_DIR: ".next-e2e",
  PORT: String(appPort),
  HOSTNAME: "127.0.0.1",
};

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}${
        result.stderr ? `\n${result.stderr}` : ""
      }`,
    );
  }

  return result.stdout ?? "";
}

export async function isPortOpen(port) {
  return new Promise((resolvePort) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolvePort(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

export async function assertPortFree(port) {
  if (await isPortOpen(port)) {
    throw new Error(`Refusing to continue: E2E port ${port} is already occupied`);
  }
}

export function assertSafeE2eConfig() {
  if (projectId === forbiddenProjectId) {
    throw new Error("Refusing to use the development Supabase project for E2E");
  }

  if (String(apiPort) === forbiddenApiPort || e2eEnv.NEXT_PUBLIC_SUPABASE_URL.includes(forbiddenApiPort)) {
    throw new Error("Refusing to use the development Supabase API port for E2E");
  }

  if (dbContainer === forbiddenDbContainer) {
    throw new Error("Refusing to use the development Supabase database container for E2E");
  }
}

export function listDockerNames({ all = false } = {}) {
  return execFileSync("docker", ["ps", ...(all ? ["-a"] : []), "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

export function assertContainers() {
  const names = listDockerNames();

  if (!names.includes(dbContainer)) {
    throw new Error(`E2E database container ${dbContainer} is not running`);
  }

  if (names.includes(forbiddenDbContainer) && dbContainer === forbiddenDbContainer) {
    throw new Error("E2E container guard resolved to the development database container");
  }
}

export function readStatusEnv() {
  const output = run("supabase", ["status", "--workdir", workdir, "-o", "env"], { capture: true });
  const env = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }

  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY || !env.API_URL?.includes(`:${apiPort}`)) {
    throw new Error("Unable to read safe E2E Supabase environment from supabase status");
  }

  return {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  };
}

function rewriteConfigForE2e(config) {
  return config
    .replace('project_id = "saasphase1"', `project_id = "${projectId}"`)
    .replace("port = 54321", "port = 55321")
    .replace("port = 54322", "port = 55322")
    .replace("shadow_port = 54320", "shadow_port = 55320")
    .replace("port = 54329", "port = 55329")
    .replace("port = 54323", "port = 55323")
    .replace("port = 54324", "port = 55324")
    .replace("port = 54327", "port = 55327")
    .replace('site_url = "http://127.0.0.1:3000"', 'site_url = "http://127.0.0.1:3100"')
    .replace(
      'additional_redirect_urls = ["https://127.0.0.1:3000"]',
      'additional_redirect_urls = ["http://127.0.0.1:3100"]',
    )
    .replace('sql_paths = ["./seed.sql"]', 'sql_paths = ["./seed.sql", "./seed.e2e.sql"]');
}

export function prepareE2eWorkdir() {
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(resolve(workdir, "supabase"), { recursive: true });
  cpSync(resolve(repoRoot, "supabase/migrations"), resolve(workdir, "supabase/migrations"), {
    recursive: true,
  });

  const config = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");
  writeFileSync(resolve(workdir, "supabase/config.toml"), rewriteConfigForE2e(config));
  copyFileSync(resolve(repoRoot, "supabase/seed.sql"), resolve(workdir, "supabase/seed.sql"));
  writeFileSync(
    resolve(workdir, "supabase/seed.e2e.sql"),
    `-- E2E-only overrides. Generated workdir; do not edit or commit.
update auth.users
set
  email = 'e2e-owner@saasphase1.invalid',
  encrypted_password = extensions.crypt('LocalE2EOwner-2026!', extensions.gen_salt('bf')),
  raw_user_meta_data = '{"display_name":"Owner E2E"}'::jsonb,
  updated_at = now()
where id = '10000000-0000-4000-8000-000000000001';

update auth.identities
set
  provider_id = 'e2e-owner@saasphase1.invalid',
  identity_data = jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000001',
    'email', 'e2e-owner@saasphase1.invalid',
    'email_verified', true,
    'phone_verified', false
  ),
  updated_at = now()
where user_id = '10000000-0000-4000-8000-000000000001'
  and provider = 'email';

update public.organizations
set
  name = 'Élevage E2E',
  legal_name = 'Élevage E2E',
  slug = 'elevage-e2e',
  email = 'contact-e2e@saasphase1.invalid',
  updated_at = now()
where id = '20000000-0000-4000-8000-000000000001';
`,
  );
}

export function stopE2eStack() {
  if (existsSync(resolve(workdir, "supabase/config.toml"))) {
    run("supabase", ["stop", "--workdir", workdir]);
  }
}

export function removeE2eVolumes() {
  const existingVolumes = execFileSync("docker", ["volume", "ls", "--format", "{{.Name}}"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const volumesToRemove = e2eVolumeNames.filter((volumeName) => existingVolumes.includes(volumeName));

  for (const volumeName of volumesToRemove) {
    if (!volumeName.endsWith("_saasphase1-e2e")) {
      throw new Error(`Refusing to remove non-E2E Docker volume ${volumeName}`);
    }
  }

  if (volumesToRemove.length > 0) {
    run("docker", ["volume", "rm", ...volumesToRemove]);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tableNamePattern = /^[a-z][a-z0-9_]*$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertUniqueArray(values, label, path) {
  if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length) {
    throw new Error(`Invalid demonstration manifest ${path}: ${label} contains duplicate entries`);
  }
}

function validateIdRegistry(value, label, path) {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid demonstration manifest ${path}: ${label} must be an object`);
  }

  for (const [table, ids] of Object.entries(value)) {
    if (!tableNamePattern.test(table) || !Array.isArray(ids)) {
      throw new Error(`Invalid demonstration manifest ${path}: ${label}.${table} must be a UUID array`);
    }
    if (ids.some((id) => typeof id !== "string" || !uuidPattern.test(id))) {
      throw new Error(`Invalid demonstration manifest ${path}: ${label}.${table} contains an invalid UUID`);
    }
    assertUniqueArray(ids, `${label}.${table}`, path);
  }
}

export function validateDemoManifest(path, manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error(`Invalid demonstration manifest ${path}: root must be a non-null JSON object`);
  }
  if (manifest.version !== 1) {
    throw new Error(`Invalid demonstration manifest ${path}: version must equal 1`);
  }

  const expectedScenarioId = basename(path, ".json");
  if (typeof manifest.scenarioId !== "string" || manifest.scenarioId.trim() === "") {
    throw new Error(`Invalid demonstration manifest ${path}: scenarioId must be a non-empty string`);
  }
  if (manifest.scenarioId !== expectedScenarioId) {
    throw new Error(
      `Invalid demonstration manifest ${path}: scenarioId ${manifest.scenarioId} does not match filename ${expectedScenarioId}`,
    );
  }
  if (manifest.status !== "active" && manifest.status !== "cleaned") {
    throw new Error(`Invalid demonstration manifest ${path}: status must be active or cleaned`);
  }

  validateIdRegistry(manifest.directIds, "directIds", path);
  validateIdRegistry(manifest.serverGeneratedIds, "serverGeneratedIds", path);

  if (!Array.isArray(manifest.idempotencyKeys) || manifest.idempotencyKeys.some((key) => typeof key !== "string" || key.trim() === "")) {
    throw new Error(`Invalid demonstration manifest ${path}: idempotencyKeys must be an array of non-empty strings`);
  }
  assertUniqueArray(manifest.idempotencyKeys, "idempotencyKeys", path);

  if (!Array.isArray(manifest.storageObjects)) {
    throw new Error(`Invalid demonstration manifest ${path}: storageObjects must be an array`);
  }
  for (const object of manifest.storageObjects) {
    if (
      !isPlainObject(object) ||
      typeof object.bucket !== "string" ||
      object.bucket.trim() === "" ||
      typeof object.path !== "string" ||
      object.path.trim() === ""
    ) {
      throw new Error(`Invalid demonstration manifest ${path}: storageObjects entries require bucket and path strings`);
    }
  }
  assertUniqueArray(
    manifest.storageObjects.map((object) => `${object.bucket}\u0000${object.path}`),
    "storageObjects",
    path,
  );

  if (
    !Array.isArray(manifest.cleanupOrder) ||
    manifest.cleanupOrder.length === 0 ||
    manifest.cleanupOrder.some((table) => typeof table !== "string" || !tableNamePattern.test(table))
  ) {
    throw new Error(`Invalid demonstration manifest ${path}: cleanupOrder must be a non-empty table-name array`);
  }
  assertUniqueArray(manifest.cleanupOrder, "cleanupOrder", path);

  if (
    !isPlainObject(manifest.reserved) ||
    typeof manifest.reserved.uuidPrefix !== "string" ||
    manifest.reserved.uuidPrefix.trim() === "" ||
    typeof manifest.reserved.labelPrefix !== "string" ||
    manifest.reserved.labelPrefix.trim() === ""
  ) {
    throw new Error(`Invalid demonstration manifest ${path}: reserved requires uuidPrefix and labelPrefix strings`);
  }

  if (
    !isPlainObject(manifest.server) ||
    typeof manifest.server.state !== "string" ||
    manifest.server.state.trim() === "" ||
    !Number.isInteger(manifest.server.pid) ||
    manifest.server.pid <= 1 ||
    typeof manifest.server.baseUrl !== "string" ||
    manifest.server.baseUrl.trim() === "" ||
    typeof manifest.server.logPath !== "string" ||
    manifest.server.logPath.trim() === "" ||
    typeof manifest.server.checkedAt !== "string" ||
    manifest.server.checkedAt.trim() === ""
  ) {
    throw new Error(
      `Invalid demonstration manifest ${path}: server requires state, positive pid, baseUrl, logPath, and checkedAt`,
    );
  }

  return manifest;
}

export function readDemoManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Refusing to ignore unreadable demonstration manifest ${path}: ${error.message}`);
  }
  return validateDemoManifest(path, manifest);
}

export function readDemoManifests() {
  if (!existsSync(demoManifestDir)) {
    return [];
  }

  return readdirSync(demoManifestDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const path = resolve(demoManifestDir, name);
      return { path, manifest: readDemoManifest(path) };
    });
}

export function activeDemoManifests() {
  return readDemoManifests().filter(({ manifest }) => manifest.status === "active");
}

export function assertNoActiveDemoManifests(operation) {
  const active = activeDemoManifests();
  if (active.length === 0) {
    return;
  }

  const scenarioIds = active.map(({ manifest }) => manifest.scenarioId).join(", ");
  throw new Error(
    `Refusing ${operation}: active durable demonstration(s): ${scenarioIds}. ` +
      "Use pnpm demo:e2e:cleanup -- <scenario> before running E2E runners or stopping the stack.",
  );
}
