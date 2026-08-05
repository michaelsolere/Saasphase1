import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const container = "supabase_db_saasphase1-e2e";
const database = "public_form_concurrency_e2e";
const root = resolve(import.meta.dirname, "../..");
const migration = [
  "202608090001_public_form_administration_foundation.sql",
  "202608090002_public_form_authoritative_rpc_writes.sql",
]
  .map((name) => readFileSync(resolve(root, `supabase/migrations/${name}`), "utf8"))
  .join("\n");

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
const barrierKeys = new Set();
let pendingWorkers = [];

async function waitForActivity(applicationName, waitEventType, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const count = Number(sql(`select count(*) from pg_stat_activity where application_name='${applicationName}' and wait_event_type='${waitEventType}';`));
    if (count > 0) return;
    await pause(50);
  }
  throw new Error(`${applicationName} did not reach ${waitEventType}`);
}

function releaseBarrier(key) {
  sql(`insert into public.public_form_test_barriers(barrier_key) values('${key}') on conflict do nothing;`);
}

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
  sql("create table public.public_form_test_barriers(barrier_key text primary key);");

  const [formId, revision] = sql("select f.id::text || '|' || f.draft_revision::text from public.public_forms f join public.organizations o on o.id=f.organization_id where o.slug='elevage-e2e' and f.deleted_at is null;").split("|");
  const versionCountBefore = Number(sql(`select count(*) from public.public_form_versions where public_form_id='${formId}';`));
  const commandId = "85000000-0000-4000-8000-000000000001";
  const ownerContext = "select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true); set local role authenticated;";
  const lifecycleCall = `select replayed from public.change_standard_public_form_lifecycle('${formId}',${revision},'${commandId}','publish');`;
  const lifecycleBarrier = "lifecycle-ready";
  barrierKeys.add(lifecycleBarrier);
  const firstLifecycle = sqlAsync(`begin; set local application_name='public-form-lifecycle-holder'; select id from public.public_forms where id='${formId}' for update; do $$ begin while not exists(select 1 from public.public_form_test_barriers where barrier_key='${lifecycleBarrier}') loop perform pg_sleep(0.05); end loop; end $$; ${ownerContext} ${lifecycleCall} commit;`);
  pendingWorkers = [firstLifecycle];
  await waitForActivity("public-form-lifecycle-holder", "Timeout");
  const secondLifecycle = sqlAsync(`begin; set local application_name='public-form-lifecycle-contender'; ${ownerContext} ${lifecycleCall} commit;`);
  pendingWorkers.push(secondLifecycle);
  await waitForActivity("public-form-lifecycle-contender", "Lock");
  releaseBarrier(lifecycleBarrier);
  const lifecycleResults = (await Promise.all([firstLifecycle, secondLifecycle])).flatMap(booleanRows).sort();
  pendingWorkers = [];
  if (lifecycleResults.join(",") !== "f,t") throw new Error(`Concurrent lifecycle replay mismatch: ${lifecycleResults}`);
  if (Number(sql(`select count(*) from public.public_form_versions where public_form_id='${formId}';`)) !== versionCountBefore + 1) throw new Error("Concurrent publication created more than one version");
  if (Number(sql(`select count(*) from public.public_form_events where command_id='${commandId}';`)) !== 1) throw new Error("Concurrent publication created more than one event");

  const versionReference = sql(`select v.public_reference from public.public_forms f join public.public_form_versions v on v.id=f.published_version_id where f.id='${formId}';`);
  const submissionKey = "86000000-0000-4000-8000-000000000001";
  const submissionCall = `select replayed from public.submit_public_application_v2('elevage-e2e','golden-retriever-2026','${versionReference}','${submissionKey}','Constance','Concurrente',null,'constance.concurrente@example.invalid','+33612349874','10 rue Concurrente',null,'31000','Toulouse','FR','female_only','Notre foyer dispose du temps et du cadre nécessaires pour accueillir un chiot.','website',true,true,null,'concurrency-test','{}'::jsonb,null);`;
  const submissionBarrier = "submission-ready";
  barrierKeys.add(submissionBarrier);
  const firstSubmission = sqlAsync(`begin; set local application_name='public-form-submission-holder'; select id from public.public_forms where id='${formId}' for update; do $$ begin while not exists(select 1 from public.public_form_test_barriers where barrier_key='${submissionBarrier}') loop perform pg_sleep(0.05); end loop; end $$; ${submissionCall} commit;`);
  pendingWorkers = [firstSubmission];
  await waitForActivity("public-form-submission-holder", "Timeout");
  const secondSubmission = sqlAsync(`begin; set local application_name='public-form-submission-contender'; ${submissionCall} commit;`);
  pendingWorkers.push(secondSubmission);
  await waitForActivity("public-form-submission-contender", "Lock");
  releaseBarrier(submissionBarrier);
  const submissionResults = (await Promise.all([firstSubmission, secondSubmission])).flatMap(booleanRows).sort();
  pendingWorkers = [];
  if (submissionResults.join(",") !== "f,t") throw new Error(`Concurrent submission replay mismatch: ${submissionResults}`);
  if (Number(sql(`select count(*) from public.form_submissions where submission_key='${submissionKey}';`)) !== 1) throw new Error("Concurrent retry created more than one submission");
  if (Number(sql("select count(*) from public.applications a join public.form_submissions s on s.id=a.form_submission_id where s.submission_key='86000000-0000-4000-8000-000000000001';")) !== 1) throw new Error("Concurrent retry created more than one application");

  console.log("CONCURRENCY_OK lifecycle=f,t versions=1 events=1 submission=f,t submissions=1 applications=1");
} finally {
  for (const key of barrierKeys) {
    try { releaseBarrier(key); } catch {}
  }
  await Promise.allSettled(pendingWorkers);
  docker(["dropdb", "-U", "postgres", "--if-exists", "--force", database]);
  const remaining = sql(`select count(*) from pg_database where datname='${database}';`, "postgres");
  if (remaining !== "0") throw new Error(`Temporary concurrency database still exists: ${remaining}`);
  console.log("CONCURRENCY_CLEAN temporary_database=0");
}
