import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const container = "supabase_db_saasphase1-e2e";
const database = "public_form_concurrency_e2e";
const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(resolve(root, "supabase/migrations/202608090001_public_form_administration_foundation.sql"), "utf8");

function docker(args, options = {}) {
  const result = spawnSync("docker", ["exec", ...(options.stdin ? ["-i"] : []), container, ...args], {
    cwd: root,
    encoding: "utf8",
    input: options.stdin,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function sql(statement, target = database) {
  return docker(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target, "-c", statement]);
}

function sqlAsync(statement) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", ["exec", container, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-c", statement], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr || stdout)));
  });
}

const pause = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const booleanRows = (output) => output.split(/\r?\n/).filter((line) => line === "t" || line === "f");

try {
  docker(["dropdb", "-U", "postgres", "--if-exists", "--force", database]);
  docker(["createdb", "-U", "postgres", database]);
  const schemaDump = docker([
    "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--no-owner", "--no-privileges",
  ])
    .split("\n")
    .filter((line) => !line.includes("log_min_messages"))
    .join("\n");
  docker(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { stdin: schemaDump });
  const fixtureDump = docker([
    "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only", "--no-owner", "--no-privileges",
    "--table=auth.users", "--table=public.organizations",
    "--table=public.memberships",
  ]);
  docker(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { stdin: fixtureDump });
  sql(`insert into public.public_forms(
    id, organization_id, name, slug, form_type, species, breed, is_active,
    title, description, success_message, created_by, updated_by
  ) select
    '87000000-0000-4000-8000-000000000001', o.id, 'Candidature générale',
    'golden-retriever-2026', 'adoption_application', 'dog', 'Golden Retriever', true,
    'Présentez-nous votre projet',
    'Parlez-nous de votre projet afin que nous puissions préparer un premier échange.',
    'Merci, votre candidature a bien été transmise et sera relue avec attention.',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
  from public.organizations o where o.slug='elevage-e2e';`);
  docker(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { stdin: migration });
  sql("grant usage on schema public to authenticated; grant select, update on public.public_forms to authenticated;");

  const [formId, revision] = sql("select f.id::text || '|' || f.draft_revision::text from public.public_forms f join public.organizations o on o.id=f.organization_id where o.slug='elevage-e2e' and f.deleted_at is null;").split("|");
  const versionCountBefore = Number(sql(`select count(*) from public.public_form_versions where public_form_id='${formId}';`));
  const commandId = "85000000-0000-4000-8000-000000000001";
  const ownerContext = "select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true); set local role authenticated;";
  const lifecycleCall = `select replayed from public.change_standard_public_form_lifecycle('${formId}',${revision},'${commandId}','publish');`;
  const firstLifecycle = sqlAsync(`begin; ${ownerContext} select id from public.public_forms where id='${formId}' for update; select pg_sleep(0.8); ${lifecycleCall} commit;`);
  await pause(120);
  const secondLifecycle = sqlAsync(`begin; ${ownerContext} ${lifecycleCall} commit;`);
  const lifecycleResults = [...booleanRows(await firstLifecycle), ...booleanRows(await secondLifecycle)].sort();
  if (lifecycleResults.join(",") !== "f,t") throw new Error(`Concurrent lifecycle replay mismatch: ${lifecycleResults}`);
  if (Number(sql(`select count(*) from public.public_form_versions where public_form_id='${formId}';`)) !== versionCountBefore + 1) throw new Error("Concurrent publication created more than one version");
  if (Number(sql(`select count(*) from public.public_form_events where command_id='${commandId}';`)) !== 1) throw new Error("Concurrent publication created more than one event");

  const versionReference = sql(`select v.public_reference from public.public_forms f join public.public_form_versions v on v.id=f.published_version_id where f.id='${formId}';`);
  const submissionKey = "86000000-0000-4000-8000-000000000001";
  const submissionCall = `select replayed from public.submit_public_application_v2('elevage-e2e','golden-retriever-2026','${versionReference}','${submissionKey}','Constance','Concurrente',null,'constance.concurrente@example.invalid','+33612349874','10 rue Concurrente',null,'31000','Toulouse','FR','female_only','Notre foyer dispose du temps et du cadre nécessaires pour accueillir un chiot.','website',true,true,null,'concurrency-test','{}'::jsonb,null);`;
  const firstSubmission = sqlAsync(`begin; select id from public.public_forms where id='${formId}' for update; select pg_sleep(0.8); ${submissionCall} commit;`);
  await pause(120);
  const secondSubmission = sqlAsync(`begin; ${submissionCall} commit;`);
  const submissionResults = [...booleanRows(await firstSubmission), ...booleanRows(await secondSubmission)].sort();
  if (submissionResults.join(",") !== "f,t") throw new Error(`Concurrent submission replay mismatch: ${submissionResults}`);
  if (Number(sql(`select count(*) from public.form_submissions where submission_key='${submissionKey}';`)) !== 1) throw new Error("Concurrent retry created more than one submission");
  if (Number(sql("select count(*) from public.applications a join public.form_submissions s on s.id=a.form_submission_id where s.submission_key='86000000-0000-4000-8000-000000000001';")) !== 1) throw new Error("Concurrent retry created more than one application");

  console.log("CONCURRENCY_OK lifecycle=f,t versions=1 events=1 submission=f,t submissions=1 applications=1");
} finally {
  docker(["dropdb", "-U", "postgres", "--if-exists", "--force", database]);
  const remaining = sql(`select count(*) from pg_database where datname='${database}';`, "postgres");
  if (remaining !== "0") throw new Error(`Temporary concurrency database still exists: ${remaining}`);
  console.log("CONCURRENCY_CLEAN temporary_database=0");
}
