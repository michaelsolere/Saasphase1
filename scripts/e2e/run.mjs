import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workdir = resolve(repoRoot, ".supabase-e2e");
const tsconfigPath = resolve(repoRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const projectId = "saasphase1-e2e";
const appPort = 3100;
const apiPort = 55321;
const dbPort = 55322;
const dbContainer = "supabase_db_saasphase1-e2e";
const e2eVolumeNames = [
  "supabase_db_saasphase1-e2e",
  "supabase_storage_saasphase1-e2e",
  "supabase_edge_runtime_saasphase1-e2e",
];
const forbiddenProjectId = "saasphase1";
const forbiddenApiPort = "54321";
const forbiddenDbContainer = "supabase_db_saasphase1";

const e2eEnv = {
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
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== "--");

function run(command, args, options = {}) {
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

async function isPortOpen(port) {
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

async function assertPortFree(port) {
  if (await isPortOpen(port)) {
    throw new Error(`Refusing to continue: E2E port ${port} is already occupied`);
  }
}

function assertSafeE2eConfig() {
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

async function assertE2ePortsFree() {
  for (const port of [appPort, 55320, apiPort, dbPort, 55323, 55324, 55327, 55329]) {
    await assertPortFree(port);
  }
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

function prepareWorkdir() {
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

function readStatusEnv() {
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

function assertContainers() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);

  if (!names.includes(dbContainer)) {
    throw new Error(`E2E database container ${dbContainer} is not running`);
  }

  if (names.includes(forbiddenDbContainer) && dbContainer === forbiddenDbContainer) {
    throw new Error("E2E container guard resolved to the development database container");
  }
}

function stopE2e() {
  if (!existsSync(resolve(workdir, "supabase/config.toml"))) {
    return;
  }

  run("supabase", ["stop", "--workdir", workdir]);
}

function removeE2eVolumes() {
  const existingVolumes = execFileSync(
    "docker",
    ["volume", "ls", "--format", "{{.Name}}"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const volumesToRemove = e2eVolumeNames.filter((volumeName) =>
    existingVolumes.includes(volumeName),
  );

  for (const volumeName of volumesToRemove) {
    if (!volumeName.endsWith("_saasphase1-e2e")) {
      throw new Error(`Refusing to remove non-E2E Docker volume ${volumeName}`);
    }
  }

  if (volumesToRemove.length > 0) {
    run("docker", ["volume", "rm", ...volumesToRemove]);
  }
}

function restoreTsconfig() {
  if (readFileSync(tsconfigPath, "utf8") !== originalTsconfig) {
    writeFileSync(tsconfigPath, originalTsconfig);
  }
}

assertSafeE2eConfig();
stopE2e();
removeE2eVolumes();
await assertE2ePortsFree();
prepareWorkdir();

try {
  run("supabase", ["start", "--workdir", workdir]);
  assertContainers();
  run("supabase", ["db", "reset", "--workdir", workdir]);
  const supabaseEnv = readStatusEnv();

  run("node_modules/.bin/playwright", ["test", ...playwrightArgs], {
    env: { ...e2eEnv, ...supabaseEnv },
  });
} finally {
  stopE2e();
  removeE2eVolumes();
  restoreTsconfig();
}
