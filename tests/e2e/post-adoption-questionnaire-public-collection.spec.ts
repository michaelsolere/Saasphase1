import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f350001-0000-4000-8000-0000000000";
const ids = {
  contact: `${prefix}01`,
  animal: `${prefix}02`,
  reservation: `${prefix}03`,
  instance: `${prefix}04`,
  createdEvent: `${prefix}05`,
  dueEvent: `${prefix}06`,
  command: `${prefix}07`,
  secondCommand: `${prefix}08`,
  thirdCommand: `${prefix}09`,
  invalidCommand: `${prefix}10`,
  raceCommand: `${prefix}11`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const parseSqlJson = (output: string) => {
  const line = output
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.startsWith("{") || value.startsWith("["));
  if (!line) throw new Error(`Résultat JSON absent : ${output}`);
  return JSON.parse(line) as Record<string, unknown>;
};
async function waitForDatabaseMarker(marker: string, waitEventType: "Timeout" | "Lock") {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const count = Number(
      sql(`select count(*) from pg_catalog.pg_stat_activity where application_name = ${q(marker)} and wait_event_type = ${q(waitEventType)};`),
    );
    if (count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Barrière PostgreSQL non atteinte : ${marker}`);
}
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const publicToken = Buffer.alloc(32, 7).toString("base64url");
const replacementPublicToken = Buffer.alloc(32, 11).toString("base64url");
const tokenHash = hash(publicToken);
const replacementTokenHash = hash(replacementPublicToken);
const sessionHash = hash("post-adoption-e2e-session");
const e2eClientAddress = "203.0.113.35";
const concurrencyBarrierHash = hash("post-adoption-e2e-concurrency-release");
const replacementBarrierHash = hash("post-adoption-e2e-replacement-release");
const rateBucketHashes = new Set([
  hash("open:global"),
  hash(`open:client:${e2eClientAddress}`),
  hash(`open:token:${tokenHash}`),
  hash("post-adoption-e2e-rate-probe"),
  concurrencyBarrierHash,
  replacementBarrierHash,
]);

type Question = {
  key: string;
  type: string;
  required: boolean;
  options?: Array<{ value: string }>;
  rows?: Array<{ key: string }>;
  eventCategories?: Array<{ value: string }>;
  fields?: Array<{ key: string; required: boolean; options?: string[] }>;
  visibleWhen?: Condition;
  requiredWhen?: Condition;
};
type Condition = {
  question?: string;
  equals?: string;
  notEquals?: string;
  in?: string[];
  anyQuestion?: string[];
  notIn?: string[];
  matrixQuestion?: string;
};

function conditionMatches(condition: Condition, answers: Record<string, unknown>) {
  if (condition.question) {
    const answer = answers[condition.question];
    if (answer === undefined) return false;
    if (condition.equals !== undefined) return answer === condition.equals;
    if (condition.notEquals !== undefined) return answer !== condition.notEquals;
    if (condition.in) return condition.in.includes(String(answer));
  }
  if (condition.anyQuestion && condition.notIn) {
    return condition.anyQuestion.some(
      (key) => key in answers && !condition.notIn?.includes(String(answers[key])),
    );
  }
  if (condition.matrixQuestion && condition.in) {
    const matrix = answers[condition.matrixQuestion];
    return typeof matrix === "object" && matrix !== null
      ? Object.values(matrix).some((value) => condition.in?.includes(String(value)))
      : false;
  }
  return false;
}

function completeAnswers(questions: Question[]) {
  const answers: Record<string, unknown> = {};
  for (const question of questions) {
    const visible = question.visibleWhen
      ? conditionMatches(question.visibleWhen, answers)
      : true;
    const required = question.requiredWhen
      ? visible && conditionMatches(question.requiredWhen, answers)
      : visible && question.required;
    if (!required) continue;
    if (question.type === "single_choice") answers[question.key] = question.options?.[0]?.value;
    else if (question.type === "multi_choice") answers[question.key] = [question.options?.[0]?.value];
    else if (["short_text", "long_text", "date_or_period"].includes(question.type)) answers[question.key] = "Réponse complète E2E";
    else if (question.type === "decimal") answers[question.key] = 25;
    else if (question.type === "matrix_single_choice") {
      answers[question.key] = Object.fromEntries(
        (question.rows ?? []).map((row) => [row.key, question.options?.[0]?.value]),
      );
    } else if (question.type === "repeater") {
      answers[question.key] = [
        Object.fromEntries(
          (question.fields ?? [])
            .filter((field) => field.required)
            .map((field) => [
              field.key,
              field.key === "category"
                ? question.eventCategories?.[0]?.value
                : field.options?.[0] ?? "Réponse complète E2E",
            ]),
        ),
      ];
    }
  }
  return answers;
}

function cleanup() {
  const rateBuckets = Array.from(rateBucketHashes).map(q).join(", ");
  sql(`
    begin;
    set local app.qa_hard_delete = 'on';
    delete from public.post_adoption_questionnaire_public_submission_commands
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_public_sessions
    where access_id in (
      select id from public.post_adoption_questionnaire_public_accesses
      where instance_id = ${q(ids.instance)}::uuid
    );
    delete from public.post_adoption_questionnaire_public_accesses
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_public_rate_limits
    where bucket_hash in (${rateBuckets});
    delete from public.post_adoption_questionnaire_events
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_response_revisions
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_instances
    where id = ${q(ids.instance)}::uuid;
    delete from public.reservations where id = ${q(ids.reservation)}::uuid;
    delete from public.animals where id = ${q(ids.animal)}::uuid;
    delete from public.contacts where id = ${q(ids.contact)}::uuid;
    commit;
  `);
}

function remainingCounts() {
  const rateBuckets = Array.from(rateBucketHashes).map(q).join(", ");
  return JSON.parse(
    sql(`select json_build_object(
      'commands', (select count(*) from public.post_adoption_questionnaire_public_submission_commands where instance_id = ${q(ids.instance)}::uuid),
      'sessions', (select count(*) from public.post_adoption_questionnaire_public_sessions where access_id in (select id from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid)),
      'accesses', (select count(*) from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid),
      'rate_limits', (select count(*) from public.post_adoption_questionnaire_public_rate_limits where bucket_hash in (${rateBuckets})),
      'events', (select count(*) from public.post_adoption_questionnaire_events where instance_id = ${q(ids.instance)}::uuid),
      'responses', (select count(*) from public.post_adoption_questionnaire_response_revisions where instance_id = ${q(ids.instance)}::uuid),
      'instances', (select count(*) from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid),
      'reservations', (select count(*) from public.reservations where id = ${q(ids.reservation)}::uuid),
      'animals', (select count(*) from public.animals where id = ${q(ids.animal)}::uuid),
      'contacts', (select count(*) from public.contacts where id = ${q(ids.contact)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

function createFixture() {
  sql(`
    begin;
    insert into public.contacts (id, organization_id, display_name, email, origin_channel, primary_status, created_by, updated_by)
    values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Famille E2E collecte publique', 'e2e-public-questionnaire@example.test', 'other', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.animals (id, organization_id, call_name, official_name, species, breed, sex, birth_date, status, ownership_status, created_by, updated_by)
    values (${q(ids.animal)}::uuid, ${q(organizationId)}::uuid, 'Nova', 'Nova E2E', 'dog', 'Golden Retriever', 'female', '2025-01-01', 'active', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    set local session_replication_role = replica;
    insert into public.reservations (id, organization_id, contact_id, animal_id, species, breed, status, adoption_completed_at, created_by, updated_by)
    values (${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.animal)}::uuid, 'dog', 'Golden Retriever', 'adopted', statement_timestamp() - interval '60 days', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    set local session_replication_role = origin;
    insert into public.post_adoption_questionnaire_instances (id, organization_id, questionnaire_code, questionnaire_version, contact_id, reservation_id, animal_id, due_at, status, created_by, updated_by)
    values (${q(ids.instance)}::uuid, ${q(organizationId)}::uuid, 'post-adoption-t1', 1, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid, ${q(ids.animal)}::uuid, statement_timestamp(), 'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.post_adoption_questionnaire_events (id, organization_id, instance_id, event_type, actor_kind, actor_profile_id, details)
    values (${q(ids.createdEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid, 'instance_created', 'member', ${q(ownerId)}::uuid, '{}'::jsonb);
    insert into public.post_adoption_questionnaire_events (id, organization_id, instance_id, event_type, from_status, to_status, actor_kind, details)
    values (${q(ids.dueEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid, 'became_due', 'planned', 'due', 'system', '{}'::jsonb);
    commit;
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
}

test("collecte publique : activation, rendu guidé, session 2 h, idempotence, concurrence et remplacement", async ({ page }) => {
  try {
    cleanup();
    expect(Object.values(remainingCounts()).every((count) => count === 0)).toBe(true);
    expect(
      JSON.parse(
        sql(`select json_build_object(
          'anon_table_select', has_table_privilege('anon', 'public.post_adoption_questionnaire_public_sessions', 'select'),
          'authenticated_table_select', has_table_privilege('authenticated', 'public.post_adoption_questionnaire_public_sessions', 'select'),
          'service_sessions_insert', has_table_privilege('service_role', 'public.post_adoption_questionnaire_public_sessions', 'insert'),
          'service_sessions_update', has_table_privilege('service_role', 'public.post_adoption_questionnaire_public_sessions', 'update'),
          'service_sessions_delete', has_table_privilege('service_role', 'public.post_adoption_questionnaire_public_sessions', 'delete'),
          'service_sessions_truncate', has_table_privilege('service_role', 'public.post_adoption_questionnaire_public_sessions', 'truncate'),
          'service_responses_truncate', has_table_privilege('service_role', 'public.post_adoption_questionnaire_response_revisions', 'truncate'),
          'anon_exchange', has_function_privilege('anon', 'public.exchange_post_adoption_questionnaire_public_token(text,text)', 'execute'),
          'authenticated_exchange', has_function_privilege('authenticated', 'public.exchange_post_adoption_questionnaire_public_token(text,text)', 'execute'),
          'service_exchange', has_function_privilege('service_role', 'public.exchange_post_adoption_questionnaire_public_token(text,text)', 'execute'),
          'authenticated_manage', has_function_privilege('authenticated', 'public.create_or_rotate_post_adoption_questionnaire_public_access(uuid,text,text)', 'execute'),
          'rls_sessions', (select relrowsecurity from pg_class where oid = 'public.post_adoption_questionnaire_public_sessions'::regclass),
          'rls_commands', (select relrowsecurity from pg_class where oid = 'public.post_adoption_questionnaire_public_submission_commands'::regclass)
        )::text;`),
      ),
    ).toEqual({
      anon_table_select: false,
      authenticated_table_select: false,
      service_sessions_insert: false,
      service_sessions_update: false,
      service_sessions_delete: false,
      service_sessions_truncate: false,
      service_responses_truncate: false,
      anon_exchange: false,
      authenticated_exchange: false,
      service_exchange: true,
      authenticated_manage: true,
      rls_sessions: true,
      rls_commands: true,
    });
    const rateProbeOutput = sql(`begin;
        set local role service_role;
        with recursive attempts(number, allowed) as (
          select 1, public.allow_post_adoption_questionnaire_public_request(${q(hash("post-adoption-e2e-rate-probe"))}, 2, 60)
          union all
          select attempts.number + 1,
            public.allow_post_adoption_questionnaire_public_request(${q(hash("post-adoption-e2e-rate-probe"))}, 2, 60)
          from attempts where attempts.number < 3
        )
        select json_agg(allowed order by number)::text from attempts;
        commit;`);
    const rateProbe = JSON.parse(
      rateProbeOutput.split("\n").find((line) => line.trim().startsWith("[")) ?? "null",
    );
    expect(rateProbe).toEqual([true, true, false]);
    createFixture();

    const activation = parseSqlJson(
      sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.create_or_rotate_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid, ${q(tokenHash)}, 'e2e1') result; commit;`),
    );
    expect(activation.outcome).toBe("success");
    expect(activation.response_deadline_at).toBeTruthy();

    const failedRotation = parseSqlJson(
      sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.create_or_rotate_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid, ${q(tokenHash)}, 'duplicate') result; commit;`),
    );
    expect(failedRotation.outcome).toBe("conflict");

    const exchanged = JSON.parse(
      sql(`select row_to_json(result)::text from public.exchange_post_adoption_questionnaire_public_token(${q(tokenHash)}, ${q(sessionHash)}) result;`),
    );
    expect(exchanged.outcome).toBe("success");
    expect(exchanged.animal_name).toBe("Nova");
    expect(exchanged.milestone).toBe("t1");
    expect(new Date(exchanged.session_expires_at).getTime() - new Date(exchanged.session_created_at).getTime()).toBe(7_200_000);
    expect(JSON.stringify(exchanged)).not.toContain("e2e-public-questionnaire@example.test");

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const serviceExchange = await serviceClient.rpc(
      "exchange_post_adoption_questionnaire_public_token" as never,
      {
        p_token_hash: tokenHash,
        p_session_hash: hash("post-adoption-e2e-service-session"),
      } as never,
    );
    expect(serviceExchange.error).toBeNull();
    expect((serviceExchange.data as Array<{ outcome: string }>)[0]?.outcome).toBe("success");

    await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": e2eClientAddress });
    await page.goto(`/suivi/${publicToken}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/suivi\/questionnaire$/);
    const browserSessionToken = (await page.context().cookies()).find(
      (cookie) => cookie.name === "post_adoption_questionnaire_session",
    )?.value;
    expect(browserSessionToken).toBeTruthy();
    const browserSessionHash = hash(browserSessionToken!);
    rateBucketHashes.add(hash(`submit:${browserSessionHash}`));
    rateBucketHashes.add(hash(`command:${browserSessionHash}`));
    await expect(page.getByRole("heading", { name: /Questionnaire post-adoption T1 de Nova/i })).toBeVisible();
    await expect(page.getByText("Section 1 sur 7")).toBeVisible();
    await expect(page.getByText("e2e-public-questionnaire@example.test")).toHaveCount(0);

    const questions = JSON.parse(
      sql(`select (definition->'questions')::text from public.post_adoption_questionnaire_definitions where code = 'post-adoption-t1' and version = 1;`),
    ) as Question[];
    const answers = completeAnswers(questions);
    const payloadHash = hash(JSON.stringify(answers));
    const invalidCompletion = JSON.parse(
      sql(`select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(browserSessionHash)}, ${q(ids.invalidCommand)}::uuid, ${q(payloadHash)}, 0, ${q(JSON.stringify(answers))}::jsonb, statement_timestamp(), 7201) result;`),
    );
    expect(invalidCompletion.outcome).toBe("invalid");
    const apiSubmission = await page.request.post("/api/suivi/questionnaire", {
      data: {
        clientCommandId: ids.command,
        baseRevisionNo: 0,
        answers,
        completionStartedAt: new Date(Date.now() - 300_000).toISOString(),
        completionDurationSeconds: 300,
      },
    });
    expect(apiSubmission.status()).toBe(200);
    await expect(apiSubmission.json()).resolves.toMatchObject({
      outcome: "success",
      revisionNo: 1,
      replayed: false,
    });
    const submitSql = `select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(browserSessionHash)}, ${q(ids.command)}::uuid, ${q(payloadHash)}, 0, ${q(JSON.stringify(answers))}::jsonb, statement_timestamp() - interval '5 minutes', 300) result;`;
    const replay = JSON.parse(sql(submitSql));
    expect(replay).toMatchObject({ outcome: "success", revision_no: 1, replayed: true });

    const resultLookup = JSON.parse(
      sql(`select row_to_json(result)::text from public.read_post_adoption_questionnaire_public_submission_result(${q(browserSessionHash)}, ${q(ids.command)}::uuid) result;`),
    );
    expect(resultLookup).toMatchObject({ outcome: "success", revision_no: 1 });
    const crossSessionLookup = JSON.parse(
      sql(`select row_to_json(result)::text from public.read_post_adoption_questionnaire_public_submission_result(${q(sessionHash)}, ${q(ids.command)}::uuid) result;`),
    );
    expect(crossSessionLookup.outcome).toBe("not_found");

    const conflict = JSON.parse(
      sql(`select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(browserSessionHash)}, ${q(ids.secondCommand)}::uuid, ${q(payloadHash)}, 0, ${q(JSON.stringify(answers))}::jsonb, null, null) result;`),
    );
    expect(conflict.outcome).toBe("conflict");

    const concurrentSql = (commandId: string) =>
      `select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(browserSessionHash)}, ${q(commandId)}::uuid, ${q(payloadHash)}, 1, ${q(JSON.stringify(answers))}::jsonb, statement_timestamp() + interval '1 hour', 60) result;`;
    const concurrencyMarker = "post_adoption_public_concurrency_holder";
    const contenderMarker = "post_adoption_public_concurrency_contender";
    const concurrencyHolder = runE2eSql(`begin;
      set local application_name = ${q(concurrencyMarker)};
      select 1 from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid for update;
      do $$ begin
        while not exists (select 1 from public.post_adoption_questionnaire_public_rate_limits where bucket_hash = ${q(concurrencyBarrierHash)}) loop
          perform pg_sleep(0.05);
        end loop;
      end $$;
      ${concurrentSql(ids.secondCommand)}
      commit;`);
    await waitForDatabaseMarker(concurrencyMarker, "Timeout");
    const contender = runE2eSql(`begin; set local application_name = ${q(contenderMarker)}; ${concurrentSql(ids.thirdCommand)} commit;`);
    await waitForDatabaseMarker(contenderMarker, "Lock");
    sql(`insert into public.post_adoption_questionnaire_public_rate_limits(bucket_hash, window_started_at, attempt_count, updated_at)
      values (${q(concurrencyBarrierHash)}, statement_timestamp(), 1, statement_timestamp());`);
    const concurrent = await Promise.all([concurrencyHolder, contender]);
    const concurrentResults = concurrent.map(parseSqlJson);
    expect(concurrentResults.map((result) => result.outcome).sort()).toEqual([
      "conflict",
      "success",
    ]);
    expect(
      concurrentResults.find((result) => result.outcome === "success"),
    ).toMatchObject({ revision_no: 2, replayed: false });

    sql(`insert into public.post_adoption_questionnaire_events (
      organization_id, instance_id, event_type, from_status, to_status,
      actor_kind, details, occurred_at
    ) values (${q(organizationId)}, ${q(ids.instance)}, 'suspended', 'submitted', 'suspended',
      'system', '{"reason":"E2E suspension"}'::jsonb, statement_timestamp());`);
    expect(
      JSON.parse(sql(`select row_to_json(result)::text from public.read_post_adoption_questionnaire_public_submission_result(${q(browserSessionHash)}, ${q(ids.command)}::uuid) result;`)).outcome,
    ).toBe("unavailable");
    expect(JSON.parse(sql(submitSql)).outcome).toBe("unavailable");
    sql(`insert into public.post_adoption_questionnaire_events (
      organization_id, instance_id, event_type, from_status, to_status,
      response_revision_no, actor_kind, details, occurred_at
    ) values (${q(organizationId)}, ${q(ids.instance)}, 'resumed', 'suspended', 'submitted',
      2, 'system', '{}'::jsonb, statement_timestamp());`);

    await login(page);
    await page.goto(`/reservations/${ids.reservation}`);
    const internalSection = page.locator("#post-adoption-questionnaires");
    await expect(internalSection).toBeVisible({ timeout: 60_000 });
    await expect(
      internalSection.getByText("Questionnaire post-adoption T1"),
    ).toBeVisible();
    await expect(internalSection.getByText("Nova · T1")).toBeVisible();
    await expect(
      internalSection.getByText("Révision n° 2", { exact: true }),
    ).toBeVisible();
    await expect(internalSection.getByText(/Soumise le/)).toBeVisible();
    const resultsLink = internalSection.getByRole("link", {
      name: "Voir les résultats détaillés de Nova",
    });
    await expect(resultsLink).toBeVisible();
    await expect(resultsLink).toHaveAttribute(
      "href",
      `/post-adoption/animals/${ids.animal}`,
    );
    await resultsLink.focus();
    await expect(resultsLink).toBeFocused();
    await expect(
      internalSection.getByTestId("post-adoption-individual-visualization"),
    ).toHaveCount(0);
    await expect(internalSection.getByText("Lire les réponses", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/post-adoption-individual-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(resultsLink).toBeVisible();
    await page.screenshot({
      path: "/tmp/post-adoption-individual-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "400%";
    });
    await expect(resultsLink).toBeVisible();
    await page.screenshot({
      path: "/tmp/post-adoption-individual-zoom-400.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    const replacementMarker = "post_adoption_public_replacement_holder";
    const replacementContenderMarker = "post_adoption_public_replacement_contender";
    const racingSubmissionPromise = runE2eSql(`begin;
      set local application_name = ${q(replacementMarker)};
      select 1 from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid for update;
      do $$ begin
        while not exists (select 1 from public.post_adoption_questionnaire_public_rate_limits where bucket_hash = ${q(replacementBarrierHash)}) loop
          perform pg_sleep(0.05);
        end loop;
      end $$;
      select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(browserSessionHash)}, ${q(ids.raceCommand)}::uuid, ${q(payloadHash)}, 2, ${q(JSON.stringify(answers))}::jsonb, null, null) result;
      commit;`);
    await waitForDatabaseMarker(replacementMarker, "Timeout");
    const replacementPromise = runE2eSql(`begin; set local application_name = ${q(replacementContenderMarker)}; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.create_or_rotate_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid, ${q(replacementTokenHash)}, 'e2e2') result; commit;`);
    await waitForDatabaseMarker(replacementContenderMarker, "Lock");
    sql(`insert into public.post_adoption_questionnaire_public_rate_limits(bucket_hash, window_started_at, attempt_count, updated_at)
      values (${q(replacementBarrierHash)}, statement_timestamp(), 1, statement_timestamp());`);
    const [racingSubmissionOutput, replacementOutput] = await Promise.all([
      racingSubmissionPromise,
      replacementPromise,
    ]);
    const replacement = parseSqlJson(replacementOutput);
    const racingSubmission = parseSqlJson(racingSubmissionOutput);
    expect(replacement.outcome).toBe("success");
    expect(["success", "unavailable"]).toContain(racingSubmission.outcome);

    sql(`update public.post_adoption_questionnaire_public_sessions candidate_session
      set created_at = statement_timestamp() - interval '100 days',
          expires_at = statement_timestamp() - interval '100 days' + interval '2 hours'
      where candidate_session.access_id in (
        select access.id
        from public.post_adoption_questionnaire_public_accesses access
        where access.instance_id = ${q(ids.instance)}::uuid
      );`);
    const productionCleanup = parseSqlJson(
      sql(`begin; set local role service_role; select row_to_json(result)::text
        from public.cleanup_post_adoption_questionnaire_public_sessions(500, interval '90 days') result; commit;`),
    );
    expect(productionCleanup.sessions_deleted).toBe(3);
    expect(productionCleanup.commands_deleted).toBeGreaterThanOrEqual(2);
    expect(Number(sql(`select count(*) from public.post_adoption_questionnaire_response_revisions where instance_id = ${q(ids.instance)};`))).toBeGreaterThanOrEqual(2);
    expect(
      sql(`select outcome from public.exchange_post_adoption_questionnaire_public_token(${q(tokenHash)}, ${q(hash("old-session"))});`),
    ).toBe("unavailable");
  } finally {
    cleanup();
    expect(remainingCounts()).toEqual({
      commands: 0,
      sessions: 0,
      accesses: 0,
      rate_limits: 0,
      events: 0,
      responses: 0,
      instances: 0,
      reservations: 0,
      animals: 0,
      contacts: 0,
    });
  }
});
