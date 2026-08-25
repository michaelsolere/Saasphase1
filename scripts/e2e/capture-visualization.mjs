// Capture de recette : photographie descriptive T1/T2 (lot individual-visualization).
// Reproduit la scène de la spec e2e public-collection, capture la section en
// screenshot d'élément (2x), puis hard-delete toutes les fixtures.
// Usage : SUPABASE_* env requis (voir assertE2eEnvironment) ; app attendue sur 3100.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

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
};

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = (statement) =>
  execFileSync(
    "docker",
    [
      "exec",
      process.env.SUPABASE_E2E_DB_CONTAINER,
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      statement,
    ],
    { encoding: "utf8" },
  ).trim();
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const publicToken = Buffer.alloc(32, 7).toString("base64url");
const tokenHash = hash(publicToken);
const sessionHash = hash("post-adoption-capture-session");
const parseJsonLine = (output) => {
  const line = output
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.startsWith("{") || value.startsWith("["));
  if (!line) throw new Error(`Résultat JSON absent : ${output}`);
  return JSON.parse(line);
};

function cleanup() {
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
    where bucket_hash in (
      ${q(hash("open:global"))}, ${q(hash("open:token:" + tokenHash))},
      ${q(hash(`submit:${sessionHash}`))}, ${q(hash(`command:${sessionHash}`))}
    );
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
  return parseJsonLine(
    sql(`select json_build_object(
      'commands', (select count(*) from public.post_adoption_questionnaire_public_submission_commands where instance_id = ${q(ids.instance)}::uuid),
      'sessions', (select count(*) from public.post_adoption_questionnaire_public_sessions where access_id in (select id from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid)),
      'accesses', (select count(*) from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid),
      'events', (select count(*) from public.post_adoption_questionnaire_events where instance_id = ${q(ids.instance)}::uuid),
      'responses', (select count(*) from public.post_adoption_questionnaire_response_revisions where instance_id = ${q(ids.instance)}::uuid),
      'instances', (select count(*) from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid),
      'reservations', (select count(*) from public.reservations where id = ${q(ids.reservation)}::uuid),
      'animals', (select count(*) from public.animals where id = ${q(ids.animal)}::uuid),
      'contacts', (select count(*) from public.contacts where id = ${q(ids.contact)}::uuid)
    )::text;`),
  );
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

function completeAnswers(definitionJson) {
  const questions = JSON.parse(definitionJson);
  const answers = {};
  const matches = (condition, answers) => {
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
  };
  for (const question of questions) {
    const visible = question.visibleWhen ? matches(question.visibleWhen, answers) : true;
    const required = question.requiredWhen
      ? visible && matches(question.requiredWhen, answers)
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

async function main() {
  cleanup();
  const before = remainingCounts();
  if (Object.values(before).some((count) => count !== 0)) {
    throw new Error(`Nettoyage initial incomplet : ${JSON.stringify(before)}`);
  }
  createFixture();

  const activation = parseJsonLine(
    sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.create_or_rotate_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid, ${q(tokenHash)}, 'capture') result; commit;`),
  );
  if (activation.outcome !== "success") throw new Error(`Activation refusée : ${JSON.stringify(activation)}`);

  const exchanged = parseJsonLine(
    sql(`select row_to_json(result)::text from public.exchange_post_adoption_questionnaire_public_token(${q(tokenHash)}, ${q(sessionHash)}) result;`),
  );
  if (exchanged.outcome !== "success") throw new Error(`Échange refusé : ${JSON.stringify(exchanged)}`);

  const definitionJson = sql(
    `select (definition->'questions')::text from public.post_adoption_questionnaire_definitions where code = 'post-adoption-t1' and version = 1;`,
  );
  const answers = completeAnswers(definitionJson);
  const payloadHash = hash(JSON.stringify(answers));
  const answersLiteral = q(JSON.stringify(answers));

  const first = parseJsonLine(
    sql(`select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(sessionHash)}, ${q(ids.command)}::uuid, ${q(payloadHash)}, 0, ${answersLiteral}::jsonb, statement_timestamp() - interval '5 minutes', 300) result;`),
  );
  if (first.outcome !== "success") throw new Error(`Soumission 1 refusée : ${JSON.stringify(first)}`);

  const second = parseJsonLine(
    sql(`select row_to_json(result)::text from public.submit_post_adoption_questionnaire_public_response(${q(sessionHash)}, ${q(ids.secondCommand)}::uuid, ${q(payloadHash)}, 1, ${answersLiteral}::jsonb, statement_timestamp() + interval '1 hour', 60) result;`),
  );
  if (second.outcome !== "success") throw new Error(`Soumission 2 refusée : ${JSON.stringify(second)}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 4000 },
    deviceScaleFactor: 2,
  });
  try {
    await page.goto("http://127.0.0.1:3100/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL);
    await page.getByLabel("Mot de passe").fill(process.env.E2E_OWNER_PASSWORD);
    await page.getByRole("button", { name: /connexion|se connecter/i }).click();
    await page.waitForURL(/^(?!.*\/login)/, { timeout: 60_000 });

    await page.goto(`http://127.0.0.1:3100/reservations/${ids.reservation}`, {
      waitUntil: "domcontentloaded",
    });
    const visualization = page.getByTestId("post-adoption-individual-visualization");
    await visualization.waitFor({ state: "visible", timeout: 60_000 });

    const title = await visualization
      .getByRole("heading", { name: /Évolution individuelle/ })
      .textContent();
    const revisionLine = await visualization.getByText(/T1 · révision n°/).textContent();
    console.log(`Section visible : ${title} — ${revisionLine}`);

    const reservationUrl = `http://127.0.0.1:3100/reservations/${ids.reservation}`;

    async function captureElement(locator, path) {
      await page.waitForTimeout(2500);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const box = await locator.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          });
          await page.screenshot({
            path,
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });
          return;
        } catch (error) {
          if (attempt === 1) throw error;
          await page.waitForTimeout(1500);
        }
      }
    }

    await captureElement(visualization, "/tmp/visualization-section-2x.png");
    console.log("Capture 1/3 : section complète (2x).");

    await page.goto(reservationUrl, { waitUntil: "domcontentloaded" });
    const reloaded = page.getByTestId("post-adoption-individual-visualization");
    await reloaded.waitFor({ state: "visible", timeout: 60_000 });
    await captureElement(reloaded.locator(":scope > div").first(), "/tmp/visualization-header-2x.png");
    console.log("Capture 2/3 : en-tête + cartes de révision (2x).");

    await page.goto(reservationUrl, { waitUntil: "domcontentloaded" });
    const reloadedAxes = page.getByTestId("post-adoption-individual-visualization");
    await reloadedAxes.waitFor({ state: "visible", timeout: 60_000 });
    const axisCards = reloadedAxes.locator("[data-axis]");
    const axisCount = await axisCards.count();
    console.log(`Axes affichés : ${axisCount}`);
    if (axisCount > 2) {
      await captureElement(axisCards.nth(2), "/tmp/visualization-axis-novelty-2x.png");
      console.log("Capture 3/3 : axe « Réaction à la nouveauté » (2x).");
    }
  } finally {
    await browser.close();
  }

  cleanup();
  const after = remainingCounts();
  console.log(`Comptes après nettoyage : ${JSON.stringify(after)}`);
  if (Object.values(after).some((count) => count !== 0)) {
    throw new Error(`Nettoyage final incomplet : ${JSON.stringify(after)}`);
  }
  console.log("OK — fixtures supprimées, aucune ligne restante.");
}

main().catch((error) => {
  try {
    cleanup();
  } catch {
    // Le nettoyage de secours échoue : on remonte l'erreur d'origine.
  }
  console.error(error.message ?? error);
  process.exitCode = 1;
});
