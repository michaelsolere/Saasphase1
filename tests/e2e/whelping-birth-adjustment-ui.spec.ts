import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  correctWhelpingBirthCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f220002-0000-4000-8000-0000000000";
const fixturePrefix = "E2E whelping birth adjustment UI 20260722";
const ids = {
  mother: `${prefix}01`, father: `${prefix}02`, litter: `${prefix}11`, session: `${prefix}21`,
  firstCommand: `${prefix}31`, secondCommand: `${prefix}32`, concurrentCommand: `${prefix}33`,
  replacementCommand: `${prefix}34`, downstreamWeight: `${prefix}41`,
} as const;
const created = { births: [] as string[], animals: [] as string[], events: [] as string[], weights: [] as string[] };

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }
function uuidList(values: string[]) { return values.length ? values.map((value) => `${q(value)}::uuid`).join(",") : "null::uuid"; }

function cleanup() {
  sql(`
    begin;
    set local app.fixture_cleanup = 'on';
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f220002-%';
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f220002-%';
    delete from public.animal_weight_measurements where id=${q(ids.downstreamWeight)}::uuid or source_birth_id in (${uuidList(created.births)}) or animal_id in (${uuidList(created.animals)});
    delete from public.whelping_births where session_id=${q(ids.session)}::uuid or id in (${uuidList(created.births)});
    delete from public.whelping_events where session_id=${q(ids.session)}::uuid or id in (${uuidList(created.events)});
    delete from public.animals where litter_id=${q(ids.litter)}::uuid or id in (${uuidList(created.animals)});
    delete from public.whelping_sessions where id=${q(ids.session)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${fixturePrefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid);
    set local session_replication_role = replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid and organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;
    set local session_replication_role = origin;
    commit;
  `);
}

function remaining() {
  return JSON.parse(sql(`select json_build_object(
    'adjustment_commands',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f220002-%'),
    'commands',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f220002-%'),
    'weights',(select count(*) from public.animal_weight_measurements where id=${q(ids.downstreamWeight)}::uuid or source_birth_id in (${uuidList(created.births)}) or animal_id in (${uuidList(created.animals)})),
    'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
    'events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid),
    'animals',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or litter_id=${q(ids.litter)}::uuid),
    'sessions',(select count(*) from public.whelping_sessions where id=${q(ids.session)}::uuid),
    'litters',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${fixturePrefix}%`)}),
    'role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function fixtures() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'${fixturePrefix} mother','dog','Golden Retriever','female','breeding','owned',true,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'${fixturePrefix} father','dog','Golden Retriever','male','breeding','owned',true,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${fixturePrefix} litter`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_expected','2026-07-22',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions(id,organization_id,litter_id,mother_id,status,started_at,timezone_name,created_by,updated_by)
      values(${q(ids.session)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,${q(ids.mother)}::uuid,'open','2026-07-22T08:00:00Z','Europe/Paris',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

function panel(page: Page) {
  return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]");
}

async function dialogFrom(entry: Locator, name: string | RegExp) {
  await entry.getByRole("button", { name }).click();
  const dialog = entry.page().getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("corrige et annule une naissance sans exposer les intentions techniques", async ({ page }) => {
  cleanup();
  expect(Object.values(remaining()).every((count) => count === 0)).toBe(true);
  try {
    fixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const first = await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.firstCommand, occurredAt: "2026-07-22T09:00:00Z", sex: "female", viability: "alive", initialCollarColor: "Rose", birthWeightGrams: 410, measuredAt: "2026-07-22T09:02:00Z", note: "Note initiale" }, owner);
    const second = await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.secondCommand, occurredAt: "2026-07-22T09:30:00Z", sex: "male", viability: "alive", initialCollarColor: "Bleu", birthWeightGrams: 390, measuredAt: "2026-07-22T09:32:00Z", note: "Dernière naissance" }, owner);
    if (first.outcome !== "success" || second.outcome !== "success") throw new Error("fixture birth failed");
    for (const birth of [first, second]) {
      created.births.push(birth.birthId); created.animals.push(birth.animalId); created.events.push(birth.eventId);
      if (birth.weightMeasurementId) created.weights.push(birth.weightMeasurementId);
    }
    const originalEvent = sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid;`);

    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);
    let whelping = panel(page);
    const firstEntry = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
    const secondEntry = whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first();
    await expect(firstEntry.getByRole("button", { name: "Corriger" })).toBeVisible();
    await expect(firstEntry.getByRole("button", { name: "Annuler la naissance" })).toHaveCount(0);
    await expect(secondEntry.getByRole("button", { name: "Annuler la naissance" })).toBeVisible();

    let dialog = await dialogFrom(firstEntry, "Corriger");
    await expect(dialog).toContainText("Le numéro d’ordre ne changera pas");
    await expect(dialog.getByLabel("Date et heure de naissance")).not.toHaveValue("");
    await expect(dialog.getByLabel("Sexe")).toHaveValue("female");
    await expect(dialog.getByLabel("Viabilité")).toHaveValue("alive");
    await expect(dialog.getByLabel("Couleur ou collier initial")).toHaveValue("Rose");
    await expect(dialog.getByLabel("Note de naissance")).toHaveValue("Note initiale");
    await expect(dialog.getByLabel("Poids de naissance (g)")).toHaveValue("410");
    await expect(dialog.getByLabel("Date et heure de pesée")).not.toHaveValue("");
    await expect(dialog.getByLabel("Note du poids")).toHaveValue("");
    await expect(dialog.getByLabel("Motif de la correction")).toHaveAttribute("required", "");
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-22T11:05");
    await dialog.getByLabel("Sexe").selectOption("male");
    await dialog.getByLabel("Viabilité").selectOption("unknown");
    await dialog.getByLabel("Couleur ou collier initial").fill("Violet");
    await dialog.getByLabel("Note de naissance").fill("État corrigé");
    await dialog.getByLabel("Poids de naissance (g)").fill("425");
    await dialog.getByLabel("Date et heure de pesée").fill("2026-07-22T11:06");
    await dialog.getByLabel("Note du poids").fill("Poids corrigé");
    await dialog.getByLabel("Motif de la correction").fill("Erreur de saisie complète");
    await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(dialog).toBeHidden();
    await expect(whelping.locator("ol").first().locator("li").filter({ hasText: "Naissance corrigée" })).toBeVisible();
    await expect(whelping.getByText("État corrigé", { exact: true })).toBeVisible();
    await expect(whelping.locator("ol").first().getByText("425 g", { exact: false })).toBeVisible();
    expect(sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid;`)).toBe(originalEvent);
    await whelping.getByText("Historique des rectifications").click();
    await expect(whelping.getByText("Motif : Erreur de saisie complète", { exact: true })).toBeVisible();
    await expect(whelping.getByText("Femelle → Mâle")).toBeVisible();
    await expect(whelping.getByText("410 g → 425 g")).toBeVisible();

    await page.reload();
    whelping = panel(page);
    const currentFirst = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
    dialog = await dialogFrom(currentFirst, "Corriger");
    const revision = Number(sql(`select revision_no from public.whelping_births where id=${q(first.birthId)}::uuid;`));
    const concurrent = await correctWhelpingBirthCore({ birthId: first.birthId, clientCommandId: ids.concurrentCommand, expectedRevisionNo: revision, occurredAt: "2026-07-22T09:06:00Z", sex: "male", viability: "unknown", initialCollarColor: "Violet", birthNote: "Modification concurrente", weightGrams: 425, weightMeasuredAt: "2026-07-22T09:06:00Z", weightNote: "Poids corrigé", reason: "Seconde session" }, owner);
    expect(concurrent.outcome).toBe("success");
    if (concurrent.outcome === "success") created.events.push(concurrent.eventId);
    await dialog.getByLabel("Note de naissance").fill("Ne doit pas écraser");
    await dialog.getByLabel("Motif de la correction").fill("Tentative périmée");
    await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("modifiée depuis son affichage");
    expect(sql(`select note from public.whelping_births where id=${q(first.birthId)}::uuid;`)).toBe("Modification concurrente");
    await dialog.getByRole("button", { name: "Annuler" }).click();

    sql(`insert into public.animal_weight_measurements(id,organization_id,animal_id,measured_at,grams,measurement_kind,created_by) values(${q(ids.downstreamWeight)}::uuid,${q(organizationId)}::uuid,${q(second.animalId)}::uuid,'2026-07-22T10:00:00Z',450,'clinical',${q(ownerId)}::uuid);`);
    const currentSecond = whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first();
    dialog = await dialogFrom(currentSecond, "Annuler la naissance");
    await expect(dialog).toContainText("Aucune ligne ne sera physiquement supprimée");
    await expect(dialog.getByLabel("Motif de l’annulation")).toHaveAttribute("required", "");
    await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur");
    await dialog.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("données ultérieures");
    sql(`delete from public.animal_weight_measurements where id=${q(ids.downstreamWeight)}::uuid;`);
    await page.reload();
    whelping = panel(page);
    dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler la naissance");
    await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur");
    await dialog.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(dialog).toBeHidden();
    await expect(whelping.getByText("Naissances enregistrées")).toContainText("1");
    await expect(whelping.getByText("Naissance n° 2 annulée")).toBeVisible();
    await expect(whelping.getByText("Annulée", { exact: true })).toBeVisible();
    expect(sql(`select deleted_at is not null from public.animals where id=${q(second.animalId)}::uuid;`)).toBe("t");
    expect(sql(`select cancelled_at is not null from public.animal_weight_measurements where source_birth_id=${q(second.birthId)}::uuid;`)).toBe("t");

    const replacement = await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.replacementCommand, occurredAt: "2026-07-22T10:00:00Z", sex: "female", viability: "alive" }, owner);
    expect(replacement).toMatchObject({ outcome: "success", birthOrder: 2 });
    if (replacement.outcome === "success") { created.births.push(replacement.birthId); created.animals.push(replacement.animalId); created.events.push(replacement.eventId); }

    await page.reload();
    whelping = panel(page);
    const outerHtml = await whelping.evaluate((element) => element.outerHTML);
    expect(outerHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(page.url()).not.toMatch(/birth|session|animal|command|revision/i);
    sql(`set session_replication_role=replica; update public.memberships set role='viewer' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    await page.reload();
    whelping = panel(page);
    await whelping.getByText("Historique des rectifications").click();
    await expect(whelping.getByText("Naissance corrigée").first()).toBeVisible();
    await expect(whelping.getByRole("button", { name: "Corriger" })).toHaveCount(0);
    await expect(whelping.getByRole("button", { name: "Annuler la naissance" })).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    console.info(JSON.stringify({ whelpingBirthAdjustmentUiFixtures: { prefix, staticIds: ids, created } }));
  } finally {
    cleanup();
    const counts = remaining();
    console.info(JSON.stringify({ whelpingBirthAdjustmentUiCleanup: { prefix, deleted: created, remaining: counts } }));
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  }
});
