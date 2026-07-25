import { expect, test, type Page } from "@playwright/test";

import { listLitterWeightHistoryCore } from "../../src/features/litter-weights/litter-weights-core";
import { createTestAnimal, createTestLitter, createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
import { createTestPuppy, createTestWeighingSession, createTestWeightMeasurement } from "./helpers/fixtures/weighing-fixtures";
import { createAuthenticatedSupabaseClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(240_000);
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const ids = {
  mother: "9f200004-0000-4000-8000-000000000001", father: "9f200004-0000-4000-8000-000000000002", litter: "9f200004-0000-4000-8000-000000000003", animalOne: "9f200004-0000-4000-8000-000000000011", animalTwo: "9f200004-0000-4000-8000-000000000012", sessionOne: "9f200004-0000-4000-8000-000000000021", sessionTwo: "9f200004-0000-4000-8000-000000000022", measurementOne: "9f200004-0000-4000-8000-000000000031", measurementTwo: "9f200004-0000-4000-8000-000000000032", measurementThree: "9f200004-0000-4000-8000-000000000033", measurementFour: "9f200004-0000-4000-8000-000000000034", staleCommand: "9f200004-0000-4000-8000-000000000041", foreignOrganization: "9f200004-0000-4000-8000-000000000051", foreignMother: "9f200004-0000-4000-8000-000000000052", foreignLitter: "9f200004-0000-4000-8000-000000000053", foreignPuppy: "9f200004-0000-4000-8000-000000000054", foreignSession: "9f200004-0000-4000-8000-000000000055", foreignMeasurement: "9f200004-0000-4000-8000-000000000056",
} as const;
const labelPrefix = "E2E rectification routine UI";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function setOwnerRole(role: "owner" | "viewer") {
  sql(`set session_replication_role = replica; update public.memberships set role=${q(role)} where id=${q(ownerMembershipId)}::uuid and organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid; set session_replication_role = origin;`);
}

function registerActualCommands(registry: ReturnType<typeof createE2eFixtureRegistry>, registered: Set<string>) {
  const rows = JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'table','litter_weight_adjustment_commands') order by id),'[]'::json)::text from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid;`)) as { id: string; table: "litter_weight_adjustment_commands" }[];
  for (const row of rows) if (!registered.has(row.id)) { registry.register(row.table, row.id); registered.add(row.id); }
}

async function setup(registry: ReturnType<typeof createE2eFixtureRegistry>) {
  const execute = (statement: string) => sql(statement);
  const mother = await createTestAnimal(execute, registry, { id: ids.mother, organizationId, ownerId, callName: `${labelPrefix} mère`, sex: "female" });
  const father = await createTestAnimal(execute, registry, { id: ids.father, organizationId, ownerId, callName: `${labelPrefix} père`, sex: "male" });
  await createTestLitter(execute, registry, { id: ids.litter, organizationId, ownerId, motherId: mother, fatherId: father, name: `${labelPrefix} portée`, status: "puppies_created", actualBirthDate: "2026-07-10" });
  const alba = await createTestPuppy(execute, registry, { id: ids.animalOne, organizationId, litterId: ids.litter, ownerId, motherId: mother, fatherId: father, name: "UI Alba", sex: "female", birthDate: "2026-07-10", birthOrder: 1 });
  const basile = await createTestPuppy(execute, registry, { id: ids.animalTwo, organizationId, litterId: ids.litter, ownerId, motherId: mother, fatherId: father, name: "UI Basile", sex: "male", birthDate: "2026-07-10", birthOrder: 2 });
  const first = await createTestWeighingSession(execute, registry, { id: ids.sessionOne, organizationId, litterId: ids.litter, ownerId, measuredAt: "2026-07-20T08:00:00.000Z", note: "Contrôle matin" });
  const second = await createTestWeighingSession(execute, registry, { id: ids.sessionTwo, organizationId, litterId: ids.litter, ownerId, measuredAt: "2026-07-21T08:00:00.000Z" });
  await createTestWeightMeasurement(execute, registry, { id: ids.measurementOne, organizationId, ownerId, puppyId: alba.id, sessionId: first.id, grams: 500, note: "Avant" });
  await createTestWeightMeasurement(execute, registry, { id: ids.measurementTwo, organizationId, ownerId, puppyId: basile.id, sessionId: first.id, grams: 520 });
  await createTestWeightMeasurement(execute, registry, { id: ids.measurementThree, organizationId, ownerId, puppyId: alba.id, sessionId: second.id, grams: 600 });
  await createTestWeightMeasurement(execute, registry, { id: ids.measurementFour, organizationId, ownerId, puppyId: basile.id, sessionId: second.id, grams: 620 });

  const foreignOrganization = await createTestOrganization(execute, registry, { id: ids.foreignOrganization, name: `${labelPrefix} étrangère`, slug: "e2e-weight-foreign-9f200004" });
  const foreignMother = await createTestAnimal(execute, registry, { id: ids.foreignMother, organizationId: foreignOrganization, ownerId, callName: `${labelPrefix} mère étrangère` });
  await createTestLitter(execute, registry, { id: ids.foreignLitter, organizationId: foreignOrganization, ownerId, motherId: foreignMother, name: `${labelPrefix} portée étrangère`, status: "puppies_created", actualBirthDate: "2026-07-10" });
  const foreignPuppy = await createTestPuppy(execute, registry, { id: ids.foreignPuppy, organizationId: foreignOrganization, litterId: ids.foreignLitter, ownerId, motherId: foreignMother, name: "UI Étranger", birthDate: "2026-07-10", birthOrder: 1 });
  const foreignSession = await createTestWeighingSession(execute, registry, { id: ids.foreignSession, organizationId: foreignOrganization, litterId: ids.foreignLitter, ownerId, measuredAt: "2026-07-20T08:00:00.000Z" });
  await createTestWeightMeasurement(execute, registry, { id: ids.foreignMeasurement, organizationId: foreignOrganization, ownerId, puppyId: foreignPuppy.id, sessionId: foreignSession.id, grams: 999 });
}

async function login(page: Page) {
  await page.goto("/login"); await page.getByLabel("Email").fill(E2E_OWNER_EMAIL); await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD); await page.getByRole("button", { name: "Se connecter" }).click(); await expect(page).not.toHaveURL(/\/login$/);
}

test("corrige, annule, audite, protège les révisions et isole les pesées d’une autre organisation", async ({ page }) => {
  const registry = createE2eFixtureRegistry((statement) => sql(statement), "e2e-weighing-adjustment-ui");
  const registeredCommands = new Set<string>();
  try {
    await setup(registry);
    await login(page); await page.goto(`/litters/journal?litter=${ids.litter}`);
    const owner = await createAuthenticatedSupabaseClient();
    const authorized = await listLitterWeightHistoryCore({ litterId: ids.litter }, owner);
    expect(authorized).toMatchObject({ outcome: "success" });
    expect(JSON.stringify(authorized)).not.toContain(ids.foreignMeasurement); expect(JSON.stringify(authorized)).not.toContain("999");
    expect(await listLitterWeightHistoryCore({ litterId: ids.foreignLitter }, owner)).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    await expect(page.getByTestId("litter-weight-panel")).not.toContainText("UI Étranger"); await expect(page.getByTestId("litter-weight-panel")).not.toContainText("999");

    const history = page.getByTestId("litter-weight-sessions-history"); await history.locator("summary").click();
    const firstSession = history.locator("ul > li").filter({ hasText: "UI Alba" }).filter({ hasText: "500" }).first();
    await firstSession.getByRole("button", { name: "Corriger" }).click();
    const correction = page.getByRole("dialog", { name: /Corriger la pesée de UI Alba/ });
    await expect(correction.getByLabel("Poids (g)")).toHaveValue("500"); await expect(correction.getByLabel("Note individuelle")).toHaveValue("Avant");
    await correction.getByRole("button", { name: "Enregistrer la correction" }).click(); expect(await correction.getByLabel("Motif de la correction").evaluate((element: HTMLTextAreaElement) => element.validity.valid)).toBe(false);
    await correction.getByLabel("Poids (g)").fill("550"); await correction.getByLabel("Note individuelle").fill("Après contrôle"); await correction.getByLabel("Motif de la correction").fill("Erreur de saisie"); await correction.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(page.getByRole("status")).toContainText("corrigée"); await expect(history).toContainText("550 g"); registerActualCommands(registry, registeredCommands);
    await page.getByRole("button", { name: "Annuler la mesure" }).first().click(); const cancelMeasurement = page.getByRole("dialog", { name: /Annuler la mesure/ }); await expect(cancelMeasurement).toContainText("restera active"); await cancelMeasurement.getByLabel("Motif de l’annulation").fill("Mesure attribuée au mauvais chiot"); await cancelMeasurement.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(history).toContainText("Dernière mesure de la séance");
    const audit = page.getByTestId("litter-weight-adjustment-history"); await audit.locator("summary").click(); await expect(audit).toContainText("Poids corrigé"); await expect(audit).toContainText("Mesure annulée"); registerActualCommands(registry, registeredCommands);
    await history.getByRole("button", { name: "Corriger" }).last().click(); const staleDialog = page.getByRole("dialog", { name: /Corriger la pesée/ });
    const external = await owner.rpc("correct_litter_routine_weight", { p_measurement_id: ids.measurementTwo, p_client_command_id: ids.staleCommand, p_expected_revision_no: 0, p_grams: 525, p_note: null, p_reason: "Modification concurrente" }); expect(external.error).toBeNull(); registerActualCommands(registry, registeredCommands);
    await staleDialog.getByLabel("Poids (g)").fill("530"); await staleDialog.getByLabel("Motif de la correction").fill("Tentative périmée"); await staleDialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(staleDialog).toContainText("modifiée depuis son affichage"); await expect(staleDialog).toBeVisible(); expect(sql(`select grams from public.animal_weight_measurements where id=${q(ids.measurementTwo)}::uuid;`)).toBe("525"); await staleDialog.getByRole("button", { name: "Annuler" }).click();
    await history.getByRole("button", { name: "Annuler la séance" }).first().click(); const cancelSession = page.getByRole("dialog", { name: "Annuler toute la séance" }); await expect(cancelSession).toContainText("Rien ne sera supprimé"); await cancelSession.getByLabel("Motif de l’annulation").fill("Heure de séance erronée"); await cancelSession.getByRole("button", { name: "Confirmer l’annulation de la séance" }).click(); await expect(audit).toContainText("Séance annulée"); registerActualCommands(registry, registeredCommands);
    const weightPanelHtml = await page.getByTestId("litter-weight-panel").evaluate((element) => element.outerHTML); expect(weightPanelHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i); for (const technicalId of [ids.sessionOne, ids.sessionTwo, ids.measurementOne, ids.measurementTwo, ids.measurementThree, ids.measurementFour, ids.staleCommand]) expect(page.url()).not.toContain(technicalId);
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    setOwnerRole("viewer"); await page.reload(); const viewerAudit = page.getByTestId("litter-weight-adjustment-history"); await viewerAudit.locator("summary").click(); await expect(viewerAudit).toContainText("Poids corrigé"); await expect(page.getByRole("button", { name: "Corriger" })).toHaveCount(0); await expect(page.getByRole("button", { name: /Annuler la (mesure|séance)/ })).toHaveCount(0);
  } finally {
    setOwnerRole("owner"); registerActualCommands(registry, registeredCommands); await registry.cleanup(); const remaining = await registry.assertEmpty(); console.log(JSON.stringify({ litterWeightAdjustmentUiFixtures: { deleted: [...registeredCommands], remaining } }));
  }
});
