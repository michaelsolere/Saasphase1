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
import { createTestAnimal, createTestLitter, createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
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
    const originalEvent = sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid`);
    let dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first(), "Corriger");
    await expect(dialog).toContainText("Le numéro d’ordre ne changera pas"); await expect(dialog.getByLabel("Date et heure de naissance")).not.toHaveValue(""); await expect(dialog.getByLabel("Poids de naissance (g)")).toHaveValue("410");
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-22T09:05"); await dialog.getByLabel("Sexe").selectOption("male"); await dialog.getByLabel("Viabilité").selectOption("unknown"); await dialog.getByLabel("Couleur ou collier initial").fill("Violet"); await dialog.getByLabel("Note de naissance").fill("État corrigé"); await dialog.getByLabel("Poids de naissance (g)").fill("425"); await dialog.getByLabel("Date et heure de pesée").fill("2026-07-22T09:06"); await dialog.getByLabel("Note du poids").fill("Poids corrigé"); await dialog.getByLabel("Motif de la correction").fill("Erreur de saisie complète"); await dialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(dialog).toBeHidden();
    await register(registry, [], [{ birthId: first.birthId, resultingRevisionNo: 1 }]); await expect(whelping.getByText("État corrigé", { exact: true })).toBeVisible(); await expect(whelping.getByText("425 g", { exact: false }).first()).toBeVisible(); expect(sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(first.eventId)}::uuid`)).toBe(originalEvent);
    await whelping.getByText("Historique des compléments et rectifications").click(); await expect(whelping.getByText("Motif : Erreur de saisie complète", { exact: true })).toBeVisible(); await expect(whelping.getByText("Femelle → Mâle")).toBeVisible(); await expect(whelping.getByText("410 g → 425 g")).toBeVisible();
    await page.reload(); whelping = panel(page); dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 1" }).first(), "Compléter la naissance");
    const revision = Number(sql(`select revision_no from public.whelping_births where id=${q(first.birthId)}::uuid`)); const concurrent = await correctWhelpingBirthCore({ birthId: first.birthId, clientCommandId: ids.concurrent, expectedRevisionNo: revision, occurredAt: "2026-07-22T09:06:00+02:00", sex: "male", viability: "unknown", initialCollarColor: "Violet", birthNote: "Modification concurrente", weightGrams: 425, weightMeasuredAt: "2026-07-22T09:06:00+02:00", weightNote: "Poids corrigé", reason: "Seconde session" }, owner); expect(concurrent.outcome).toBe("success"); await register(registry, [], [{ birthId: first.birthId, resultingRevisionNo: revision + 1 }]);
    await dialog.getByLabel("Note de naissance").fill("Ne doit pas écraser"); await dialog.getByLabel("Motif de la correction").fill("Tentative périmée"); await dialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(dialog.getByRole("alert")).toContainText("modifiée depuis son affichage"); expect(sql(`select note from public.whelping_births where id=${q(first.birthId)}::uuid`)).toBe("Modification concurrente"); await dialog.getByRole("button", { name: "Annuler" }).click();
    await execute(`insert into public.animal_weight_measurements(id,organization_id,animal_id,measured_at,grams,measurement_kind,created_by) values(${q(ids.downstreamWeight)}::uuid,${q(organizationId)}::uuid,${q(second.animalId)}::uuid,'2026-07-22T10:00:00Z',450,'clinical',${q(ownerId)}::uuid)`); registry.register("animal_weight_measurements", ids.downstreamWeight);
    dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler la naissance"); await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur"); await dialog.getByRole("button", { name: "Confirmer l’annulation" }).click(); await expect(dialog.getByRole("alert")).toContainText("données ultérieures"); await execute(`delete from public.animal_weight_measurements where id=${q(ids.downstreamWeight)}::uuid`);
    await page.reload(); whelping = panel(page); dialog = await dialogFrom(whelping.locator("ol > li").filter({ hasText: "Naissance n° 2" }).first(), "Annuler la naissance"); await dialog.getByLabel("Motif de l’annulation").fill("Naissance enregistrée par erreur"); await dialog.getByRole("button", { name: "Confirmer l’annulation" }).click(); await expect(dialog).toBeHidden(); await register(registry, [], [{ birthId: second.birthId, resultingRevisionNo: 1 }]); await expect(whelping.getByText("Naissance n° 2 annulée")).toBeVisible();
    const replacement = await recordWhelpingBirthCore({ sessionId: opened.sessionId, clientCommandId: ids.replacement, occurredAt: "2026-07-22T10:00:00+02:00", sex: "female", viability: "alive" }, owner); expect(replacement).toMatchObject({ outcome: "success", birthOrder: 2 }); if (replacement.outcome === "success") { registry.register("whelping_births", replacement.birthId); registry.register("animals", replacement.animalId); registry.register("whelping_events", replacement.eventId); } await register(registry, [ids.replacement]);
    await page.reload(); whelping = panel(page); expect(await whelping.evaluate((element) => element.outerHTML)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    setOwnerRole("viewer"); await page.reload(); whelping = panel(page); await whelping.getByText("Historique des compléments et rectifications").click(); await expect(whelping.getByText("Naissance corrigée").first()).toBeVisible(); await expect(whelping.getByRole("button", { name: "Corriger" })).toHaveCount(0);
    setOwnerRole("owner"); const closed = await closeWhelpingSessionCore({ sessionId: opened.sessionId, clientCommandId: ids.close, endedAt: "2026-07-22T10:30:00+02:00" }, owner); expect(closed.outcome).toBe("success"); if (closed.outcome === "success") registry.register("whelping_events", closed.eventId); await register(registry, [ids.close]);
  } finally {
    setOwnerRole("owner"); await registry.cleanup(); const remaining = await registry.assertEmpty(); console.info(JSON.stringify({ whelpingBirthAdjustmentUiCleanup: { remaining } })); expect(Object.values(remaining).every((count) => count === 0)).toBe(true);
  }
});
