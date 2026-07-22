import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(360_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f220003-0000-4000-8000-0000000000";
const labelPrefix = "E2E_WHELPING_FINAL_20260722";
const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  litter: `${prefix}03`,
} as const;

type CreatedIds = {
  sessions: string[];
  events: string[];
  births: string[];
  animals: string[];
  measurements: string[];
  weighingSessions: string[];
  whelpingCommands: string[];
  birthAdjustmentCommands: string[];
  litterWeightCommands: string[];
};

const created: CreatedIds = {
  sessions: [], events: [], births: [], animals: [], measurements: [],
  weighingSessions: [], whelpingCommands: [], birthAdjustmentCommands: [],
  litterWeightCommands: [],
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function json<T>(statement: string): T {
  return JSON.parse(sql(statement)) as T;
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role=${q(role)}
    where id=${q(ownerMembershipId)}::uuid
      and organization_id=${q(organizationId)}::uuid
      and profile_id=${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function cleanup() {
  sql(`
    begin;
    set local app.fixture_cleanup = 'on';
    delete from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.litter_weight_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.animal_weight_measurements
      where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)
         or litter_weighing_session_id in (select id from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid);
    delete from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_births
      where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid);
    delete from public.whelping_events
      where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid);
    delete from public.animals where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${labelPrefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid)
      or call_name like ${q(`${labelPrefix}%`)};
    set local session_replication_role = replica;
    update public.memberships set role='owner'
      where id=${q(ownerMembershipId)}::uuid
        and organization_id=${q(organizationId)}::uuid
        and profile_id=${q(ownerId)}::uuid;
    set local session_replication_role = origin;
    commit;
  `);
}

function remainingCounts() {
  return json<Record<string, number>>(`select json_build_object(
    'litter_weight_adjustments',(select count(*) from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid),
    'litter_weight_commands',(select count(*) from public.litter_weight_commands where litter_id=${q(ids.litter)}::uuid),
    'weights',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid) or litter_weighing_session_id in (select id from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid)),
    'weighing_sessions',(select count(*) from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid),
    'birth_adjustments',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid),
    'whelping_commands',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),
    'births',(select count(*) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),
    'events',(select count(*) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),
    'produced_animals',(select count(*) from public.animals where litter_id=${q(ids.litter)}::uuid),
    'sessions',(select count(*) from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid),
    'litters',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${labelPrefix}%`)}),
    'parents',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or call_name like ${q(`${labelPrefix}%`)}),
    'role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`);
}

function createBaseFixture() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix}_MOTHER`)},'dog','Golden Retriever','female','breeding','owned',true,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix}_FATHER`)},'dog','Golden Retriever','male','breeding','owned',true,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix}_LITTER`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_expected',current_date,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function collectCreatedIds() {
  const inventory = json<CreatedIds>(`select json_build_object(
    'sessions',coalesce((select json_agg(id::text order by created_at) from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid),'[]'::json),
    'events',coalesce((select json_agg(id::text order by sequence_no) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),'[]'::json),
    'births',coalesce((select json_agg(id::text order by created_at) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),'[]'::json),
    'animals',coalesce((select json_agg(id::text order by created_at) from public.animals where litter_id=${q(ids.litter)}::uuid),'[]'::json),
    'measurements',coalesce((select json_agg(id::text order by created_at) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),'[]'::json),
    'weighingSessions',coalesce((select json_agg(id::text order by created_at) from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid),'[]'::json),
    'whelpingCommands',coalesce((select json_agg(id::text order by created_at) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json),
    'birthAdjustmentCommands',coalesce((select json_agg(id::text order by created_at) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json),
    'litterWeightCommands',coalesce((select json_agg(id::text order by created_at) from public.litter_weight_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json)
  )::text;`);
  Object.assign(created, inventory);
  return inventory;
}

function businessState() {
  return json<{
    sessionCount: number; sessionId: string; sessionStatus: string;
    counters: { total: number; male: number; female: number; alive: number; date: string | null };
    activeAnimals: number; activeBirths: number;
    eventTypes: string[]; sequenceNos: number[];
  }>(`select json_build_object(
    'sessionCount',(select count(*) from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid),
    'sessionId',(select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid limit 1),
    'sessionStatus',(select status from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid limit 1),
    'counters',(select json_build_object('total',born_total_count,'male',born_male_count,'female',born_female_count,'alive',alive_count,'date',actual_birth_date) from public.litters where id=${q(ids.litter)}::uuid),
    'activeAnimals',(select count(*) from public.animals where litter_id=${q(ids.litter)}::uuid and deleted_at is null),
    'activeBirths',(select count(*) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid) and cancelled_at is null),
    'eventTypes',coalesce((select json_agg(event_type order by sequence_no) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),'[]'::json),
    'sequenceNos',coalesce((select json_agg(sequence_no order by sequence_no) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),'[]'::json)
  )::text;`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

function whelpingPanel(page: Page) {
  return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]");
}

function weightPanel(page: Page) {
  return page.getByTestId("litter-weight-panel");
}

function birthCard(panel: Locator, order: number) {
  return panel.locator("h3", { hasText: "Chronologie" }).locator("xpath=following-sibling::ol[1]/li")
    .filter({ hasText: `Naissance n° ${order}` }).first();
}

async function openDialogFrom(scope: Locator, buttonName: string | RegExp) {
  await scope.getByRole("button", { name: buttonName }).click();
  const dialog = scope.page().getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeInViewport();
  return dialog;
}

async function recordBirth(panel: Locator, values: { sex: "female" | "male"; weight?: string; note: string }) {
  const dialog = await openDialogFrom(panel, /ENREGISTRER UNE NAISSANCE/);
  await dialog.getByLabel("Sexe").selectOption(values.sex);
  await dialog.getByLabel("Viabilité").selectOption("alive");
  await dialog.getByLabel("Note (facultative)").fill(values.note);
  if (values.weight) await dialog.getByLabel("Poids en grammes (facultatif)").fill(values.weight);
  await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText(values.note, { exact: true })).toBeVisible();
}

async function closeSession(panel: Locator, note: string) {
  const dialog = await openDialogFrom(panel, "Clôturer la mise-bas");
  await dialog.getByLabel("Note (facultative)").fill(note);
  await dialog.getByRole("button", { name: "Clôturer la mise-bas" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText(note, { exact: true })).toBeVisible();
}

async function reopenSession(panel: Locator, reason: string) {
  const dialog = await openDialogFrom(panel, "Rouvrir la session");
  await dialog.getByLabel("Motif de la réouverture").fill(reason);
  await dialog.getByRole("button", { name: "Confirmer la réouverture" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText(reason, { exact: true })).toBeVisible();
}

async function correctFirstBirth(panel: Locator, values: { weight: string; viability: "alive" | "unknown"; reason: string; note: string }) {
  const dialog = await openDialogFrom(birthCard(panel, 1), "Corriger");
  await dialog.getByLabel("Sexe").selectOption("male");
  await dialog.getByLabel("Viabilité").selectOption(values.viability);
  await dialog.getByLabel("Note de naissance").fill(values.note);
  await dialog.getByLabel("Poids de naissance (g)").fill(values.weight);
  await dialog.getByLabel("Motif de la correction").fill(values.reason);
  await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText(values.note, { exact: true })).toBeVisible();
}

test("consolide le workflow transversal du Journal, des rectifications et de la croissance", async ({ page }) => {
  cleanup();
  expect(Object.values(remainingCounts()).every((count) => count === 0)).toBe(true);
  try {
    createBaseFixture();
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);
    let whelping = whelpingPanel(page);

    let dialog = await openDialogFrom(whelping, "Démarrer la mise-bas");
    await dialog.getByLabel("Note (facultative)").fill("Ouverture consolidation finale");
    await dialog.getByRole("button", { name: "Démarrer la mise-bas" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openDialogFrom(whelping, "Ajouter un événement");
    await dialog.getByLabel("Type").selectOption("labor_started");
    await dialog.getByLabel("Note (facultative)").fill("Travail commencé");
    await dialog.getByRole("button", { name: "Ajouter l’événement" }).click();
    await expect(dialog).toBeHidden();

    await recordBirth(whelping, { sex: "female", weight: "410", note: "Première naissance initiale" });
    await recordBirth(whelping, { sex: "male", note: "Deuxième naissance sans poids" });
    await expect(whelping.getByText("Naissances enregistrées")).toContainText("2");
    expect(businessState()).toMatchObject({
      sessionCount: 1, sessionStatus: "open", activeAnimals: 2, activeBirths: 2,
      counters: { total: 2, male: 1, female: 1, alive: 2 },
    });

    dialog = await openDialogFrom(birthCard(whelping, 2), "Renseigner le poids");
    await dialog.getByLabel("Poids en grammes").fill("420");
    await dialog.getByLabel("Note (facultative)").fill("Complément ultérieur");
    await dialog.getByRole("button", { name: "Enregistrer le poids" }).click();
    await expect(dialog).toBeHidden();
    await expect(birthCard(whelping, 2)).toContainText("420 g");

    const firstBirth = json<{ id: string; eventId: string; animalId: string }>(`select json_build_object('id',id,'eventId',event_id,'animalId',animal_id)::text from public.whelping_births where session_id=(select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid) and birth_order=1 and cancelled_at is null;`);
    const originalBirthEvent = sql(`select row_to_json(event)::text from public.whelping_events event where id=${q(firstBirth.eventId)}::uuid;`);
    const originalSessionId = businessState().sessionId;

    await closeSession(whelping, "Première clôture");
    await expect(whelping).toContainText("La session est clôturée. Les informations des naissances peuvent encore être rectifiées et les poids manquants renseignés.");
    await expect(whelping).not.toContainText("Seuls les poids de naissance manquants peuvent encore être renseignés");
    await correctFirstBirth(whelping, { weight: "430", viability: "unknown", reason: "Première rectification fermée", note: "État effectif intermédiaire" });
    await correctFirstBirth(whelping, { weight: "435", viability: "alive", reason: "Seconde rectification fermée", note: "État effectif final" });

    const afterCorrections = businessState();
    expect(afterCorrections).toMatchObject({ sessionId: originalSessionId, sessionStatus: "closed", activeAnimals: 2, activeBirths: 2, counters: { total: 2, male: 2, female: 0, alive: 2 } });
    expect(sql(`select row_to_json(event)::text from public.whelping_events event where id=${q(firstBirth.eventId)}::uuid;`)).toBe(originalBirthEvent);
    expect(sql(`select revision_no from public.whelping_births where id=${q(firstBirth.id)}::uuid;`)).toBe("2");
    expect(json<{ active: number; grams: number[]; projection: number }>(`select json_build_object(
      'active',(select count(*) from public.animal_weight_measurements where source_birth_id=${q(firstBirth.id)}::uuid and measurement_kind='birth' and cancelled_at is null),
      'grams',(select json_agg(grams) from public.animal_weight_measurements where source_birth_id=${q(firstBirth.id)}::uuid and cancelled_at is null),
      'projection',(select birth_weight_grams from public.animals where id=${q(firstBirth.animalId)}::uuid)
    )::text;`)).toEqual({ active: 1, grams: [435], projection: 435 });
    await expect(birthCard(whelping, 1)).toContainText("État effectif final");
    await expect(birthCard(whelping, 1)).not.toContainText("État effectif intermédiaire");
    await expect(birthCard(whelping, 1)).toContainText("435 g");
    await whelping.getByText("Historique des rectifications").click();
    const auditItems = await whelping.locator("details").filter({ hasText: "Historique des rectifications" }).locator("ol > li").allTextContents();
    expect(auditItems[0]).toContain("Seconde rectification fermée");
    expect(auditItems[1]).toContain("Première rectification fermée");

    await reopenSession(whelping, "Reprise après contrôle");
    expect(businessState()).toMatchObject({ sessionCount: 1, sessionId: originalSessionId, sessionStatus: "open" });
    await recordBirth(whelping, { sex: "female", weight: "390", note: "Naissance à annuler" });
    await closeSession(whelping, "Deuxième clôture");
    const cancelledCandidate = json<{ id: string; eventId: string; animalId: string }>(`select json_build_object('id',id,'eventId',event_id,'animalId',animal_id)::text from public.whelping_births where session_id=${q(originalSessionId)}::uuid and birth_order=3 and cancelled_at is null;`);
    dialog = await openDialogFrom(birthCard(whelping, 3), "Annuler la naissance");
    await dialog.getByLabel("Motif de l’annulation").fill("Doublon confirmé");
    await dialog.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(dialog).toBeHidden();
    await expect(whelping).toContainText("Naissance n° 3 annulée");
    expect(json<{ birthRows: number; deleted: boolean; weightRows: number; activeWeights: number }>(`select json_build_object(
      'birthRows',(select count(*) from public.whelping_births where id=${q(cancelledCandidate.id)}::uuid),
      'deleted',(select deleted_at is not null from public.animals where id=${q(cancelledCandidate.animalId)}::uuid),
      'weightRows',(select count(*) from public.animal_weight_measurements where source_birth_id=${q(cancelledCandidate.id)}::uuid),
      'activeWeights',(select count(*) from public.animal_weight_measurements where source_birth_id=${q(cancelledCandidate.id)}::uuid and cancelled_at is null)
    )::text;`)).toEqual({ birthRows: 1, deleted: true, weightRows: 1, activeWeights: 0 });
    expect(businessState()).toMatchObject({ sessionStatus: "closed", activeAnimals: 2, activeBirths: 2, counters: { total: 2, male: 2, female: 0, alive: 2 } });

    await reopenSession(whelping, "Remplacement de l’ordre libéré");
    await recordBirth(whelping, { sex: "female", weight: "400", note: "Naissance de remplacement" });
    await closeSession(whelping, "Clôture finale");
    const finalState = businessState();
    expect(finalState).toMatchObject({ sessionCount: 1, sessionId: originalSessionId, sessionStatus: "closed", activeAnimals: 3, activeBirths: 3, counters: { total: 3, male: 2, female: 1, alive: 3 } });
    expect(finalState.counters.date).not.toBeNull();
    expect(finalState.sequenceNos).toEqual(finalState.sequenceNos.map((_, index) => index + 1));
    expect(new Set(finalState.sequenceNos).size).toBe(finalState.sequenceNos.length);
    expect(finalState.eventTypes).toEqual([
      "labor_started", "birth", "birth", "session_closed", "birth_corrected", "birth_corrected",
      "session_reopened", "birth", "session_closed", "birth_cancelled", "session_reopened", "birth", "session_closed",
    ]);
    const domSequence = (await whelping.locator("h3", { hasText: "Chronologie" }).locator("xpath=following-sibling::ol[1]/li").allTextContents())
      .map((text) => Number(text.match(/#(\d+)/)?.[1]));
    expect(domSequence).toEqual(finalState.sequenceNos);
    const timeline = whelping.locator("h3", { hasText: "Chronologie" }).locator("xpath=following-sibling::ol[1]");
    await expect(timeline.locator("li").filter({ hasText: "Naissance corrigée" })).toHaveCount(2);
    await expect(timeline.locator(":scope > li").nth(9)).toContainText("Naissance annulée");

    let weights = weightPanel(page);
    await expect(weights.getByTestId("litter-weight-main-view-table")).toContainText("435 g");
    await expect(weights.getByTestId("litter-weight-main-view-table")).toContainText("420 g");
    await expect(weights.getByTestId("litter-weight-main-view-table")).toContainText("400 g");
    const eventStateBeforeRoutine = JSON.stringify({ types: finalState.eventTypes, sequence: finalState.sequenceNos });
    dialog = await openDialogFrom(weights, "Nouvelle pesée");
    const fields = dialog.locator("fieldset");
    await expect(fields).toHaveCount(3);
    await expect(dialog).not.toContainText("Naissance à annuler");
    for (let index = 0; index < 3; index += 1) {
      await fields.nth(index).getByLabel("Poids en grammes").fill(String(500 + index * 10));
    }
    await dialog.getByLabel("Note commune (facultative)").fill("Routine après consolidation");
    await dialog.getByRole("button", { name: "Enregistrer la pesée" }).click();
    await expect(dialog).toBeHidden();
    weights = weightPanel(page);
    await expect(weights).toContainText("Routine après consolidation");
    await expect(weights).toContainText("500 g");
    expect(JSON.stringify({ types: businessState().eventTypes, sequence: businessState().sequenceNos })).toBe(eventStateBeforeRoutine);
    expect(sql(`select count(*) from public.animal_weight_measurements where litter_weighing_session_id in (select id from public.litter_weighing_sessions where litter_id=${q(ids.litter)}::uuid) and measurement_kind='routine' and cancelled_at is null;`)).toBe("3");
    expect(sql(`select count(*) from public.animal_weight_measurements where animal_id=${q(cancelledCandidate.animalId)}::uuid and measurement_kind='routine';`)).toBe("0");

    setOwnerRole("viewer");
    await page.reload();
    whelping = whelpingPanel(page);
    weights = weightPanel(page);
    await expect(whelping).toContainText("Naissance n° 3 annulée");
    await whelping.getByText("Historique des rectifications").click();
    await expect(whelping).toContainText("Doublon confirmé");
    await expect(weights).toContainText("Routine après consolidation");
    for (const button of [/ENREGISTRER UNE NAISSANCE/, "Ajouter un événement", "Clôturer la mise-bas", "Rouvrir la session", "Renseigner le poids", "Corriger", "Annuler la naissance"]) {
      await expect(whelping.getByRole("button", { name: button })).toHaveCount(0);
    }
    await expect(weights.getByRole("button", { name: "Nouvelle pesée" })).toHaveCount(0);
    await expect(weights.getByRole("button", { name: /Corriger|Annuler la mesure|Annuler la séance/ })).toHaveCount(0);
    const whelpingHtml = await whelping.evaluate((element) => element.outerHTML);
    const weightsHtml = await weights.evaluate((element) => element.outerHTML);
    for (const html of [whelpingHtml, weightsHtml]) {
      expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(html).not.toMatch(/revision|client_command|snapshot|record_whelping|whelping_births|animal_weight_measurements|litter_weighing_sessions/i);
    }
    expect(page.url()).toBe(`http://127.0.0.1:3100/litters/journal?litter=${ids.litter}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    console.info(JSON.stringify({ finalConsolidationFixtures: { prefix, staticIds: ids, created: collectCreatedIds() } }));
  } finally {
    collectCreatedIds();
    cleanup();
    const remaining = remainingCounts();
    console.info(JSON.stringify({ finalConsolidationCleanup: { prefix, deleted: created, remaining } }));
    expect(Object.values(remaining).every((count) => count === 0)).toBe(true);
  }
});
