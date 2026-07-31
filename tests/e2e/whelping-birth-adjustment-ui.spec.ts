import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  closeWhelpingSessionCore,
  correctWhelpingBirthCore,
  listWhelpingBirthsForSessionCore,
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
  recordWhelpingBirthWeightCore,
  recordWhelpingEventCore,
} from "../../src/features/whelping/whelping-core";
import { createLitterCareTaskCore } from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Json } from "../../src/types/database.types";
import { createTestAnimal, createTestLitter, createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import { createE2eFixtureRegistry, type FixtureTable } from "./helpers/fixtures/fixture-registry";
import { registerActualWhelpingCommands } from "./helpers/fixtures/whelping-fixtures";
import { createAuthenticatedSupabaseClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(240_000);
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const ids = {
  mother: "9f220002-0000-4000-8000-000000000001", father: "9f220002-0000-4000-8000-000000000002", litter: "9f220002-0000-4000-8000-000000000011",
  open: "9f220002-0000-4000-8000-000000000021", event: "9f220002-0000-4000-8000-000000000022", first: "9f220002-0000-4000-8000-000000000023", firstWeight: "9f220002-0000-4000-8000-000000000024", second: "9f220002-0000-4000-8000-000000000025", concurrent: "9f220002-0000-4000-8000-000000000026", replacement: "9f220002-0000-4000-8000-000000000027", close: "9f220002-0000-4000-8000-000000000028", downstreamWeight: "9f220002-0000-4000-8000-000000000029",
  foreignOrganization: "9f220002-0000-4000-8000-000000000041", foreignMembership: "9f220002-0000-4000-8000-000000000042", foreignMother: "9f220002-0000-4000-8000-000000000043", foreignLitter: "9f220002-0000-4000-8000-000000000044", foreignOpen: "9f220002-0000-4000-8000-000000000045", foreignBirth: "9f220002-0000-4000-8000-000000000046",
  diagnosticMother: "9f220002-0000-4000-8000-000000000061", diagnosticLitter: "9f220002-0000-4000-8000-000000000062", diagnosticTemplate: "9f220002-0000-4000-8000-000000000063", diagnosticModelCommand: "9f220002-0000-4000-8000-000000000064", diagnosticApplyCommand: "9f220002-0000-4000-8000-000000000065", diagnosticOpen: "9f220002-0000-4000-8000-000000000066", diagnosticBirth: "9f220002-0000-4000-8000-000000000067", diagnosticManualTask: "9f220002-0000-4000-8000-000000000068",
} as const;
const label = "E2E whelping adjustment registry";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const execute = (statement: string) => sql(statement);

function setOwnerRole(role: "owner" | "viewer") { sql(`set session_replication_role=replica; update public.memberships set role=${q(role)} where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`); }
async function login(page: Page) { await page.goto("/login"); await page.getByLabel("Email").fill(E2E_OWNER_EMAIL); await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD); await page.getByRole("button", { name: "Se connecter" }).click(); await expect(page).not.toHaveURL(/\/login$/); }
function panel(page: Page) { return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]"); }
async function dialogFrom(entry: Locator, name: string | RegExp) { await entry.getByRole("button", { name }).click(); const dialog = entry.page().getByRole("dialog"); await expect(dialog).toBeVisible(); return dialog; }
async function register(registry: ReturnType<typeof createE2eFixtureRegistry>, commandIds: string[], adjustments: { birthId: string; resultingRevisionNo: number }[] = []) { await registerActualWhelpingCommands(execute, registry, { organizationId, litterId: ids.litter, commandIds, adjustments }); }
function registerRows(registry: ReturnType<typeof createE2eFixtureRegistry>, table: FixtureTable, where: string) {
  const rows = JSON.parse(sql(`select coalesce(json_agg(id::text order by id), '[]'::json)::text from public.${table} where ${where}`)) as string[];
  for (const id of rows) if (!registry.has(table, id)) registry.register(table, id);
  return rows;
}
async function expectProtectedDiagnostic(page: Page, expectedMessage: string) {
  const whelping = panel(page);
  const card = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
  const dialog = await dialogFrom(card, "Annuler cette saisie");
  await dialog.getByLabel("Motif de l’annulation").fill("Vérification du diagnostic métier");
  await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
  await expect(dialog.getByRole("heading", { name: "Annulation protégée" })).toBeVisible();
  await expect(dialog).toContainText(expectedMessage);
  await expect(dialog).toContainText("Aucune donnée n’a été modifiée.");
  await expect(dialog.getByRole("link", { name: "Voir le planning" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Corriger la naissance" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fermer" })).toBeVisible();
  const dom = await dialog.evaluate((element) => element.outerHTML);
  expect(dom).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(dom).not.toMatch(/WHELPING_REVERSAL_|birth_planning_|pg_exception|sqlstate|litter_care_tasks/i);
  await dialog.getByRole("button", { name: "Fermer" }).click();
}

test("corrige et annule une naissance sans exposer les intentions techniques", async ({ page }) => {
  const registry = createE2eFixtureRegistry(execute, "e2e-whelping-birth-adjustment-ui");
  try {
    const mother = await createTestAnimal(execute, registry, { id: ids.mother, organizationId, ownerId, callName: `${label} mère`, sex: "female" });
    const father = await createTestAnimal(execute, registry, { id: ids.father, organizationId, ownerId, callName: `${label} père`, sex: "male" });
    await createTestLitter(execute, registry, { id: ids.litter, organizationId, ownerId, motherId: mother, fatherId: father, name: `${label} portée`, status: "birth_expected" });
    const owner = await createAuthenticatedSupabaseClient();
    const opened = await openWhelpingSessionCore({ litterId: ids.litter, clientCommandId: ids.open, startedAt: "2026-07-22T08:00:00+02:00", timezoneName: "Europe/Paris" }, owner); expect(opened.outcome).toBe("success"); if (opened.outcome !== "success") throw new Error("open fixture failed"); registry.register("whelping_sessions", opened.sessionId); await register(registry, [ids.open]);
    const genericEvent = await recordWhelpingEventCore({ sessionId: opened.sessionId, clientCommandId: ids.event, occurredAt: "2026-07-22T08:15:00+02:00", eventType: "labor_started" }, owner); expect(genericEvent.outcome).toBe("success"); await register(registry, [ids.event]);
    const first = await recordWhelpingBirthCore({ sessionId: opened.sessionId, clientCommandId: ids.first, occurredAt: "2026-07-22T09:00:00+02:00", sex: "female", viability: "alive", initialCollarColor: "Rose", note: "Note initiale" }, owner);
    const second = await recordWhelpingBirthCore({ sessionId: opened.sessionId, clientCommandId: ids.second, occurredAt: "2026-07-22T09:30:00+02:00", sex: "male", viability: "alive", initialCollarColor: "Bleu", birthWeightGrams: 390, measuredAt: "2026-07-22T09:32:00+02:00", note: "Dernière naissance" }, owner);
    expect(first.outcome).toBe("success"); expect(second.outcome).toBe("success"); if (first.outcome !== "success" || second.outcome !== "success") throw new Error("birth fixtures failed");
    for (const birth of [first, second]) { registry.register("whelping_births", birth.birthId); registry.register("animals", birth.animalId); registry.register("whelping_events", birth.eventId); if (birth.weightMeasurementId) registry.register("animal_weight_measurements", birth.weightMeasurementId); }
    await register(registry, [ids.first, ids.second]);
    const birthWeight = await recordWhelpingBirthWeightCore({ birthId: first.birthId, clientCommandId: ids.firstWeight, weightGrams: 410, measuredAt: "2026-07-22T09:02:00+02:00", note: null }, owner); expect(birthWeight.outcome).toBe("success"); if (birthWeight.outcome === "success") registry.register("animal_weight_measurements", birthWeight.weightMeasurementId); await register(registry, [ids.firstWeight]);
    expect(sql(`select (occurred_at at time zone 'Europe/Paris')::text from public.whelping_births where id=${q(first.birthId)}::uuid`)).toContain("09:00:00");

    const foreignOrganization = await createTestOrganization(execute, registry, { id: ids.foreignOrganization, name: `${label} étrangère`, slug: "e2e-whelping-foreign-9f220002" });
    await execute(`insert into public.memberships(id,organization_id,profile_id,role,status,created_by,updated_by) values(${q(ids.foreignMembership)}::uuid,${q(foreignOrganization)}::uuid,${q(ownerId)}::uuid,'owner','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid)`); registry.register("memberships", ids.foreignMembership);
    const foreignMother = await createTestAnimal(execute, registry, { id: ids.foreignMother, organizationId: foreignOrganization, ownerId, callName: `${label} mère étrangère`, sex: "female" });
    await createTestLitter(execute, registry, { id: ids.foreignLitter, organizationId: foreignOrganization, ownerId, motherId: foreignMother, name: `${label} portée étrangère`, status: "birth_expected" });
    const foreignOpened = await openWhelpingSessionCore({ litterId: ids.foreignLitter, clientCommandId: ids.foreignOpen, startedAt: "2026-08-20T01:10:00+02:00", timezoneName: "Europe/Paris" }, owner); expect(foreignOpened.outcome).toBe("success"); if (foreignOpened.outcome !== "success") throw new Error("foreign open failed"); registry.register("whelping_sessions", foreignOpened.sessionId); await registerActualWhelpingCommands(execute, registry, { organizationId: foreignOrganization, litterId: ids.foreignLitter, commandIds: [ids.foreignOpen] });
    const foreignBirth = await recordWhelpingBirthCore({ sessionId: foreignOpened.sessionId, clientCommandId: ids.foreignBirth, occurredAt: "2026-08-20T01:42:00+02:00", sex: "female", viability: "alive", birthWeightGrams: 999, measuredAt: "2026-08-20T01:43:00+02:00" }, owner); expect(foreignBirth.outcome).toBe("success"); if (foreignBirth.outcome !== "success") throw new Error("foreign birth failed"); registry.register("whelping_births", foreignBirth.birthId); registry.register("animals", foreignBirth.animalId); registry.register("whelping_events", foreignBirth.eventId); if (foreignBirth.weightMeasurementId) registry.register("animal_weight_measurements", foreignBirth.weightMeasurementId); await registerActualWhelpingCommands(execute, registry, { organizationId: foreignOrganization, litterId: ids.foreignLitter, commandIds: [ids.foreignBirth] });
    await execute(`set session_replication_role=replica; delete from public.memberships where id=${q(ids.foreignMembership)}::uuid; set session_replication_role=origin;`);

    await login(page); await page.goto(`/litters/journal?litter=${ids.litter}`); let whelping = panel(page);
    await expect(whelping).toContainText("Naissance n° 1"); await expect(whelping).toContainText("Naissance n° 2"); await expect(whelping).toContainText("09:00"); await expect(whelping).toContainText("Femelle"); await expect(whelping).toContainText("410 g"); await expect(whelping).not.toContainText("999"); await expect(whelping).not.toContainText("étrangère");
    expect(await listWhelpingBirthsForSessionCore({ sessionId: foreignOpened.sessionId }, owner)).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    const firstCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
    const secondCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first();
    await expect(firstCard.getByRole("button", { name: "Annuler cette saisie" })).toBeDisabled();
    await expect(firstCard).toContainText("Annulation indisponible : une naissance plus récente est encore active.");
    await expect(firstCard).toContainText("La naissance la plus récente doit être traitée en premier.");
    await expect(secondCard.getByRole("button", { name: "Annuler cette saisie" })).toBeEnabled();

    const adjustmentCountBeforeDialogs = Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`));
    let dialog = await dialogFrom(secondCard, "Annuler cette saisie");
    await expect(dialog.getByRole("heading", { name: "Annuler la saisie de la naissance n° 2 ?" })).toBeVisible();
    for (const text of [
      "Cette action sert uniquement à corriger une naissance enregistrée par erreur.",
      "Pour modifier l’heure, le sexe, le poids, le collier ou l’état du nouveau-né, utilisez plutôt « Corriger ».",
      "Ce qui va se passer",
      "La naissance et le nouveau-né ne seront plus comptés parmi les données actives.",
      "L’enregistrement initial restera conservé dans l’historique.",
      "Le poids de naissance éventuel sera neutralisé.",
      "Les compteurs de la portée seront recalculés.",
      "Si cette naissance a déclenché le planning postnatal, le SaaS vérifiera s’il peut remettre le planning dans son état précédent.",
      "L’annulation sera refusée si elle risque d’effacer une modification, une tâche ou un rappel enregistré depuis la naissance.",
      "Dans ce cas, aucune donnée ne sera modifiée.",
    ]) await expect(dialog).toContainText(text);
    await expect(dialog.getByRole("button", { name: "Conserver la naissance" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuler cette saisie" })).toBeVisible();
    await dialog.getByRole("button", { name: "Conserver la naissance" }).click();
    await expect(dialog).toBeHidden();
    expect(Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`))).toBe(adjustmentCountBeforeDialogs);

    const mobileHref = await page.getByRole("link", { name: "Ouvrir le mode mobile de mise-bas" }).getAttribute("href");
    expect(mobileHref).toBeTruthy();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(mobileHref!);
    whelping = panel(page);
    const mobileFirstCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
    const mobileSecondCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first();
    await expect(mobileFirstCard.getByRole("button", { name: "Corriger ou annuler cette saisie" })).toHaveCount(1);
    await expect(mobileFirstCard.getByRole("button", { name: "Annuler cette saisie", exact: true })).toHaveCount(0);
    dialog = await dialogFrom(mobileFirstCard, "Corriger ou annuler cette saisie");
    await expect(dialog.getByRole("button", { name: "Corriger les informations" })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Annuler cette saisie" })).toBeDisabled();
    await expect(dialog).toContainText("La naissance la plus récente doit être traitée en premier.");
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(mobileSecondCard.getByRole("button", { name: "Corriger ou annuler cette saisie" })).toHaveCount(1);
    await expect(mobileSecondCard.getByRole("button", { name: "Annuler cette saisie", exact: true })).toHaveCount(0);
    dialog = await dialogFrom(mobileSecondCard, "Corriger ou annuler cette saisie");
    await expect(dialog.getByRole("button", { name: "Corriger les informations" })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Annuler cette saisie" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Fermer" }).click();
    expect(Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`))).toBe(adjustmentCountBeforeDialogs);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/litters/journal?litter=${ids.litter}`);
    whelping = panel(page);
    const originalEvent = sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid`);
    dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first(), "Corriger");
    await expect(dialog).toContainText("Le numéro d’ordre ne changera pas"); await expect(dialog.getByLabel("Date et heure de naissance")).not.toHaveValue(""); await expect(dialog.getByLabel("Poids de naissance (g)")).toHaveValue("410");
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-22T09:05"); await dialog.getByLabel("Sexe").selectOption("male"); await dialog.getByLabel("Viabilité").selectOption("unknown"); await dialog.getByLabel("Couleur ou collier initial").fill("Violet"); await dialog.getByLabel("Note de naissance").fill("État corrigé"); await dialog.getByLabel("Poids de naissance (g)").fill("425"); await dialog.getByLabel("Date et heure de pesée").fill("2026-07-22T09:06"); await dialog.getByLabel("Note du poids").fill("Poids corrigé"); await dialog.getByLabel("Motif de la correction").fill("Erreur de saisie complète"); await dialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(dialog).toBeHidden();
    await register(registry, [], [{ birthId: first.birthId, resultingRevisionNo: 1 }]); await expect(whelping.getByText("État corrigé", { exact: true })).toBeVisible(); await expect(whelping.getByText("425 g", { exact: false }).first()).toBeVisible(); expect(sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid`)).toBe(originalEvent);
    await whelping.getByText("Historique des compléments et rectifications").click(); await expect(whelping.getByText("Motif : Erreur de saisie complète", { exact: true })).toBeVisible(); await expect(whelping.getByText("Femelle → Mâle")).toBeVisible(); await expect(whelping.getByText("410 g → 425 g")).toBeVisible();
    await page.reload(); whelping = panel(page); dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first(), "Compléter la naissance");
    const revision = Number(sql(`select revision_no from public.whelping_births where id=${q(first.birthId)}::uuid`)); const concurrent = await correctWhelpingBirthCore({ birthId: first.birthId, clientCommandId: ids.concurrent, expectedRevisionNo: revision, occurredAt: "2026-07-22T09:06:00+02:00", sex: "male", viability: "unknown", initialCollarColor: "Violet", birthNote: "Modification concurrente", weightGrams: 425, weightMeasuredAt: "2026-07-22T09:06:00+02:00", weightNote: "Poids corrigé", reason: "Seconde session" }, owner); expect(concurrent.outcome).toBe("success"); await register(registry, [], [{ birthId: first.birthId, resultingRevisionNo: revision + 1 }]);
    await dialog.getByLabel("Note de naissance").fill("Ne doit pas écraser"); await dialog.getByLabel("Motif de la correction").fill("Tentative périmée"); await dialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(dialog.getByRole("alert")).toContainText("modifiée depuis l’ouverture de cette fenêtre"); await expect(dialog.getByRole("button", { name: "Recharger les données" })).toBeVisible(); expect(sql(`select note from public.whelping_births where id=${q(first.birthId)}::uuid`)).toBe("Modification concurrente"); await dialog.getByRole("button", { name: "Annuler" }).click();
    await execute(`insert into public.animal_weight_measurements(id,organization_id,animal_id,measured_at,grams,measurement_kind,created_by) values(${q(ids.downstreamWeight)}::uuid,${q(organizationId)}::uuid,${q(second.animalId)}::uuid,'2026-07-22T10:00:00Z',450,'clinical',${q(ownerId)}::uuid)`); registry.register("animal_weight_measurements", ids.downstreamWeight);
    const protectedCountBefore = Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`));
    dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler cette saisie"); await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur"); await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
    await expect(dialog.getByRole("heading", { name: "Annulation protégée" })).toBeVisible();
    await expect(dialog).toContainText("Des informations ont été ajoutées ou modifiées depuis cette naissance.");
    await expect(dialog).toContainText("Aucune donnée n’a été modifiée.");
    await expect(dialog.getByRole("link", { name: "Voir le planning" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Corriger la naissance" })).toBeVisible();
    expect(Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`))).toBe(protectedCountBefore);
    expect(sql(`select cancelled_at is null from public.whelping_births where id=${q(second.birthId)}::uuid`)).toBe("t");
    await dialog.getByRole("button", { name: "Corriger la naissance" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Corriger la naissance n° 2/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler cette saisie");
    await expect(dialog.getByRole("heading", { name: "Annulation protégée" })).toBeVisible();
    const journalPlanningLink = dialog.getByRole("link", { name: "Voir le planning" });
    await expect(journalPlanningLink).toHaveAttribute("href", "#litter-planning");
    await journalPlanningLink.click();
    await expect(page).toHaveURL(new RegExp(`/litters/journal\\?litter=${ids.litter}#litter-planning$`));
    await expect(page.locator("#litter-planning")).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(mobileHref!);
    whelping = panel(page);
    const protectedMobilePanelDom = await whelping.evaluate((element) => element.outerHTML);
    const protectedMobileCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first();
    dialog = await dialogFrom(protectedMobileCard, "Corriger ou annuler cette saisie");
    await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motif de l’annulation").fill("Vérification du refus protégé sur mobile");
    await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
    await expect(dialog.getByRole("heading", { name: "Annulation protégée" })).toBeVisible();
    const mobilePlanningLink = dialog.getByRole("link", { name: "Voir le planning" });
    await expect(mobilePlanningLink).toHaveAttribute("href", "/litters/journal#litter-planning");
    const protectedMobileDom = [
      protectedMobilePanelDom,
      await dialog.evaluate((element) => element.outerHTML),
    ].join("");
    expect(protectedMobileDom).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    await mobilePlanningLink.click();
    await expect(page).toHaveURL(/\/litters\/journal#litter-planning$/);
    await expect(page.locator("#litter-planning")).toBeVisible();
    expect(Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid`))).toBe(protectedCountBefore);

    await execute(`delete from public.animal_weight_measurements where id=${q(ids.downstreamWeight)}::uuid`);
    await page.goto(`/litters/journal?litter=${ids.litter}`); whelping = panel(page); dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler cette saisie"); await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur"); await dialog.getByRole("button", { name: "Annuler cette saisie" }).click(); await expect(dialog).toBeHidden(); await register(registry, [], [{ birthId: second.birthId, resultingRevisionNo: 1 }]);
    await expect(whelping.getByRole("status")).toContainText("Naissance n° 2 annulée.\nUne autre naissance reste active. La date réelle de naissance et le suivi postnatal de la portée ont été conservés.\nLe Journal a été actualisé.");
    expect(await whelping.getByRole("status").innerText()).not.toContain("birth_cancellation_");
    await expect(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2 annulée" }).first()).toBeVisible();
    expect(sql(`select count(*) from public.whelping_births where id=${q(second.birthId)}::uuid`)).toBe("1");
    expect(sql(`select born_total_count from public.litters where id=${q(ids.litter)}::uuid`)).toBe("1");
    await whelping.getByText("Historique des compléments et rectifications").click();
    await expect(whelping.getByText("Motif : Naissance enregistrée par erreur", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(mobileHref!);
    whelping = panel(page);
    const activeSourceCard = whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first();
    dialog = await dialogFrom(activeSourceCard, "Corriger ou annuler cette saisie");
    await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motif de l’annulation").fill("Naissance source enregistrée par erreur");
    await dialog.getByRole("button", { name: "Annuler cette saisie" }).click();
    await expect(dialog).toBeHidden();
    await register(registry, [], [{ birthId: first.birthId, resultingRevisionNo: 3 }]);
    await expect(whelping.getByRole("status")).toContainText("Naissance n° 1 annulée.\nLa date réelle de naissance a été retirée et le suivi de la portée a été remis dans son état antérieur.\nLe Journal a été actualisé.");
    expect(await whelping.getByRole("status").innerText()).not.toContain("birth_cancellation_");
    expect(sql(`select actual_birth_date is null from public.litters where id=${q(ids.litter)}::uuid`)).toBe("t");
    expect(sql(`select current_activation_id is null from public.litter_plan_actual_birth_activation_states where litter_id=${q(ids.litter)}::uuid`)).toBe("t");

    const replacement = await recordWhelpingBirthCore({ sessionId: opened.sessionId, clientCommandId: ids.replacement, occurredAt: "2026-07-22T10:00:00+02:00", sex: "female", viability: "alive" }, owner); expect(replacement).toMatchObject({ outcome: "success", birthOrder: 1 }); if (replacement.outcome === "success") { registry.register("whelping_births", replacement.birthId); registry.register("animals", replacement.animalId); registry.register("whelping_events", replacement.eventId); } await register(registry, [ids.replacement]);
    await page.reload(); whelping = panel(page); const publicDom = await whelping.evaluate((element) => element.outerHTML); expect(publicDom).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); expect(publicDom).not.toMatch(/whelping_births|animal_weight_measurements|cancel_whelping_birth|sql secret/i);
    setOwnerRole("viewer"); await page.reload(); whelping = panel(page); await whelping.getByText("Historique des compléments et rectifications").click(); await expect(whelping.getByText("Naissance corrigée").first()).toBeVisible(); await expect(whelping.getByRole("button", { name: "Corriger" })).toHaveCount(0);
    await expect(whelping.getByRole("button", { name: /Corriger ou annuler cette saisie|Annuler cette saisie|Compléter la naissance/ })).toHaveCount(0);
    setOwnerRole("owner"); const closed = await closeWhelpingSessionCore({ sessionId: opened.sessionId, clientCommandId: ids.close, endedAt: "2026-07-22T10:30:00+02:00" }, owner); expect(closed.outcome).toBe("success"); if (closed.outcome === "success") registry.register("whelping_events", closed.eventId); await register(registry, [ids.close]);

    const diagnosticMother = await createTestAnimal(execute, registry, { id: ids.diagnosticMother, organizationId, ownerId, callName: `${label} mère diagnostics`, sex: "female" });
    await createTestLitter(execute, registry, { id: ids.diagnosticLitter, organizationId, ownerId, motherId: diagnosticMother, name: `${label} portée diagnostics`, status: "birth_expected", expectedBirthDate: "2026-08-24" });
    await execute(`insert into public.litter_care_task_templates(id,organization_id,title,description,category,target_scope,anchor_type,offset_days,species,breed,is_active,sort_order,created_by,updated_by) values(${q(ids.diagnosticTemplate)}::uuid,${q(organizationId)}::uuid,'Contrôle postnatal diagnostic','Fixture navigateur des refus protégés','offspring_health','all_offspring','actual_birth',1,'dog','Golden Retriever',true,0,${q(ownerId)}::uuid,${q(ownerId)}::uuid)`);
    registry.register("litter_care_task_templates", ids.diagnosticTemplate);
    const model = await owner.rpc("create_litter_planning_model", {
      p_organization_id: organizationId,
      p_client_command_id: ids.diagnosticModelCommand,
      p_title: "Modèle diagnostics annulation E2E",
      p_description: null,
      p_species: "dog",
      p_breed: "Golden Retriever",
      p_is_active: true,
      p_items: [{ organizationTemplateId: ids.diagnosticTemplate, itemKind: "task", priority: "important", anchorType: "actual_birth", pointOffsetDays: 1, displayOrder: 0, isRequired: true, isSelectedByDefault: true }] as unknown as Json,
    });
    expect(model.error).toBeNull(); expect(model.data?.[0]?.outcome).toBe("success");
    const modelId = model.data?.[0]?.model_id; if (!modelId) throw new Error("diagnostic model fixture failed");
    registry.register("litter_planning_models", modelId);
    registerRows(registry, "litter_planning_model_commands", `client_command_id=${q(ids.diagnosticModelCommand)}::uuid`);
    registerRows(registry, "litter_planning_model_items", `model_id=${q(modelId)}::uuid`);
    const applied = await owner.rpc("apply_litter_planning_model", { p_litter_id: ids.diagnosticLitter, p_planning_model_id: modelId, p_client_command_id: ids.diagnosticApplyCommand, p_expected_model_revision: 1, p_expected_plan_revision: null, p_selected_model_item_ids: null, p_timezone_name: "Europe/Paris" });
    expect(applied.error).toBeNull(); expect(applied.data?.[0]?.outcome).toBe("success");
    const diagnosticPlanId = applied.data?.[0]?.litter_plan_id; if (!diagnosticPlanId) throw new Error("diagnostic plan fixture failed");
    registry.register("litter_plans", diagnosticPlanId);
    registerRows(registry, "litter_plan_application_commands", `client_command_id=${q(ids.diagnosticApplyCommand)}::uuid`);
    registerRows(registry, "litter_plan_items", `litter_plan_id=${q(diagnosticPlanId)}::uuid`);
    const diagnosticOpened = await openWhelpingSessionCore({ litterId: ids.diagnosticLitter, clientCommandId: ids.diagnosticOpen, startedAt: "2026-08-24T08:00:00+02:00", timezoneName: "Europe/Paris" }, owner);
    expect(diagnosticOpened.outcome).toBe("success"); if (diagnosticOpened.outcome !== "success") throw new Error("diagnostic open fixture failed");
    registry.register("whelping_sessions", diagnosticOpened.sessionId);
    await registerActualWhelpingCommands(execute, registry, { organizationId, litterId: ids.diagnosticLitter, commandIds: [ids.diagnosticOpen] });
    const diagnosticBirth = await recordWhelpingBirthCore({ sessionId: diagnosticOpened.sessionId, clientCommandId: ids.diagnosticBirth, occurredAt: "2026-08-24T09:00:00+02:00", sex: "female", viability: "alive" }, owner);
    expect(diagnosticBirth.outcome).toBe("success"); if (diagnosticBirth.outcome !== "success") throw new Error("diagnostic birth fixture failed");
    registry.register("whelping_births", diagnosticBirth.birthId); registry.register("animals", diagnosticBirth.animalId); registry.register("whelping_events", diagnosticBirth.eventId);
    await registerActualWhelpingCommands(execute, registry, { organizationId, litterId: ids.diagnosticLitter, commandIds: [ids.diagnosticBirth] });
    const diagnosticTaskIds = registerRows(registry, "litter_care_tasks", `litter_id=${q(ids.diagnosticLitter)}::uuid`);
    const diagnosticTaskId = diagnosticTaskIds[0]; if (!diagnosticTaskId) throw new Error("diagnostic task fixture failed");
    const activationId = sql(`select id::text from public.litter_plan_actual_birth_activations where litter_id=${q(ids.diagnosticLitter)}::uuid`);
    const taskSnapshot = sql(`select snapshot_after::text from public.litter_plan_actual_birth_activation_reversal_changes where activation_id=${q(activationId)}::uuid and entity_id=${q(diagnosticTaskId)}::uuid`);
    const adjustmentCount = () => Number(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.diagnosticLitter)}::uuid`));
    const expectNoPartialCancellation = () => {
      expect(sql(`select cancelled_at is null from public.whelping_births where id=${q(diagnosticBirth.birthId)}::uuid`)).toBe("t");
      expect(adjustmentCount()).toBe(0);
      expect(sql(`select actual_birth_date::text from public.litters where id=${q(ids.diagnosticLitter)}::uuid`)).toBe("2026-08-24");
    };

    await execute(`update public.litter_care_tasks set planned_for=planned_for+1,suggested_for=suggested_for+1,revision_no=revision_no+1,updated_by=${q(ownerId)}::uuid where id=${q(diagnosticTaskId)}::uuid`);
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(`/litters/journal?litter=${ids.diagnosticLitter}`);
    await expectProtectedDiagnostic(page, "Le planning a été modifié après cette naissance."); expectNoPartialCancellation();

    await execute(`set session_replication_role=replica; delete from public.litter_care_tasks where id=${q(diagnosticTaskId)}::uuid; insert into public.litter_care_tasks select (pg_catalog.jsonb_populate_record(null::public.litter_care_tasks,${q(taskSnapshot)}::jsonb)).*; set session_replication_role=origin;`);
    const manualTask = await createLitterCareTaskCore({ litterId: ids.diagnosticLitter, clientCommandId: ids.diagnosticManualTask, category: "other", targetScope: "litter", title: "Tâche ajoutée après activation", description: null, plannedFor: "2026-08-26" }, owner);
    expect(manualTask.outcome).toBe("success"); if (manualTask.outcome !== "success") throw new Error("diagnostic manual task fixture failed"); registry.register("litter_care_tasks", manualTask.taskId);
    await page.reload(); await expectProtectedDiagnostic(page, "Une tâche a été ajoutée au planning après cette naissance."); expectNoPartialCancellation();

    await execute(`delete from public.litter_care_tasks where id=${q(manualTask.taskId)}::uuid; begin; set local session_replication_role=replica; set local app.fixture_cleanup='on'; delete from public.litter_plan_actual_birth_activation_reversal_changes where activation_id=${q(activationId)}::uuid; delete from public.litter_plan_actual_birth_activation_reversal_snapshots where activation_id=${q(activationId)}::uuid; commit;`);
    await page.reload(); await expectProtectedDiagnostic(page, "Cette naissance ne possède pas tout l’historique nécessaire à une restauration automatique du planning."); expectNoPartialCancellation();
  } finally {
    setOwnerRole("owner"); await registry.cleanup(); const remaining = await registry.assertEmpty(); console.info(JSON.stringify({ whelpingBirthAdjustmentUiCleanup: { remaining } })); expect(Object.values(remaining).every((count) => count === 0)).toBe(true);
  }
});
