import { expect, test, type Page } from "@playwright/test";

import { createAuthenticatedSupabaseClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(240_000);
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f200004-";
const ids = {
  mother: `${prefix}0000-4000-8000-000000000001`, father: `${prefix}0000-4000-8000-000000000002`,
  litter: `${prefix}0000-4000-8000-000000000003`, animalOne: `${prefix}0000-4000-8000-000000000011`, animalTwo: `${prefix}0000-4000-8000-000000000012`,
  sessionOne: `${prefix}0000-4000-8000-000000000021`, sessionTwo: `${prefix}0000-4000-8000-000000000022`,
  measurementOne: `${prefix}0000-4000-8000-000000000031`, measurementTwo: `${prefix}0000-4000-8000-000000000032`, measurementThree: `${prefix}0000-4000-8000-000000000033`, measurementFour: `${prefix}0000-4000-8000-000000000034`,
  staleCommand: `${prefix}0000-4000-8000-000000000041`,
} as const;
const labelPrefix = "E2E rectification routine UI";
function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }

function setOwnerRole(role: "owner" | "viewer") {
  sql(`set session_replication_role = replica; update public.memberships set role=${q(role)} where id=${q(ownerMembershipId)}::uuid and organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid; set session_replication_role = origin;`);
}
function cleanup() {
  setOwnerRole("owner");
  sql(`
    delete from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f200004-%';
    delete from public.litter_weight_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f200004-%';
    delete from public.animal_weight_measurements where id::text like '9f200004-%' or animal_id::text like '9f200004-%' or litter_weighing_session_id::text like '9f200004-%';
    delete from public.litter_weighing_sessions where id::text like '9f200004-%' or litter_id=${q(ids.litter)}::uuid;
    delete from public.animals where (id::text like '9f200004-%' or call_name like ${q(`${labelPrefix}%`)}) and litter_id is not null;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${labelPrefix}%`)};
    delete from public.animals where id::text like '9f200004-%' or call_name like ${q(`${labelPrefix}%`)};
  `);
}
function remainingCounts() {
  return JSON.parse(sql(`select json_build_object(
    'adjustment_commands',(select count(*) from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f200004-%'),
    'creation_commands',(select count(*) from public.litter_weight_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f200004-%'),
    'measurements',(select count(*) from public.animal_weight_measurements where id::text like '9f200004-%' or animal_id::text like '9f200004-%'),
    'sessions',(select count(*) from public.litter_weighing_sessions where id::text like '9f200004-%' or litter_id=${q(ids.litter)}::uuid),
    'animals',(select count(*) from public.animals where id::text like '9f200004-%' or call_name like ${q(`${labelPrefix}%`)}),
    'litters',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${labelPrefix}%`)}),
    'owner_role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}
function setup() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix} mère`)},'dog','Golden Retriever','female','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix} père`)},'dog','Golden Retriever','male','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,actual_birth_date,created_by,updated_by) values
      (${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${labelPrefix} portée`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'puppies_created','2026-07-10',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.animals(id,organization_id,litter_id,call_name,species,breed,sex,status,ownership_status,mother_id,father_id,birth_date,birth_order,created_by,updated_by) values
      (${q(ids.animalOne)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'UI Alba','dog','Golden Retriever','female','born','produced',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'2026-07-10',1,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.animalTwo)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'UI Basile','dog','Golden Retriever','male','born','produced',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'2026-07-10',2,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_weighing_sessions(id,organization_id,litter_id,measured_at,timezone_name,note,created_by) values
      (${q(ids.sessionOne)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'2026-07-20T08:00Z','Europe/Paris','Contrôle matin',${q(ownerId)}::uuid),
      (${q(ids.sessionTwo)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'2026-07-21T08:00Z','Europe/Paris',null,${q(ownerId)}::uuid);
    insert into public.animal_weight_measurements(id,organization_id,animal_id,litter_weighing_session_id,measured_at,grams,measurement_kind,note,created_by) values
      (${q(ids.measurementOne)}::uuid,${q(organizationId)}::uuid,${q(ids.animalOne)}::uuid,${q(ids.sessionOne)}::uuid,'2026-07-20T08:00Z',500,'routine','Avant',${q(ownerId)}::uuid),
      (${q(ids.measurementTwo)}::uuid,${q(organizationId)}::uuid,${q(ids.animalTwo)}::uuid,${q(ids.sessionOne)}::uuid,'2026-07-20T08:00Z',520,'routine',null,${q(ownerId)}::uuid),
      (${q(ids.measurementThree)}::uuid,${q(organizationId)}::uuid,${q(ids.animalOne)}::uuid,${q(ids.sessionTwo)}::uuid,'2026-07-21T08:00Z',600,'routine',null,${q(ownerId)}::uuid),
      (${q(ids.measurementFour)}::uuid,${q(organizationId)}::uuid,${q(ids.animalTwo)}::uuid,${q(ids.sessionTwo)}::uuid,'2026-07-21T08:00Z',620,'routine',null,${q(ownerId)}::uuid);
  `);
}
async function login(page: Page) {
  await page.goto("/login"); await page.getByLabel("Email").fill(E2E_OWNER_EMAIL); await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD); await page.getByRole("button", { name: "Se connecter" }).click(); await expect(page).not.toHaveURL(/\/login$/);
}

test("corrige, annule, audite, protège les révisions et masque les commandes au viewer", async ({ page }) => {
  cleanup(); for (const count of Object.values(remainingCounts())) expect(count).toBe(0);
  try {
    setup();
    console.log(JSON.stringify({ litterWeightAdjustmentUiFixtures: { created: ids } }));
    await login(page); await page.goto(`/litters/journal?litter=${ids.litter}`);
    const history = page.getByTestId("litter-weight-sessions-history"); await history.locator("summary").click();
    const firstSession = history.locator("ul > li").filter({ hasText: "UI Alba" }).filter({ hasText: "500" }).first();
    await firstSession.getByRole("button", { name: "Corriger" }).click();
    const correction = page.getByRole("dialog", { name: /Corriger la pesée de UI Alba/ });
    await expect(correction.getByLabel("Poids (g)")).toHaveValue("500"); await expect(correction.getByLabel("Note individuelle")).toHaveValue("Avant");
    await correction.getByRole("button", { name: "Enregistrer la correction" }).click(); expect(await correction.getByLabel("Motif de la correction").evaluate((element: HTMLTextAreaElement) => element.validity.valid)).toBe(false);
    await correction.getByLabel("Poids (g)").fill("550"); await correction.getByLabel("Note individuelle").fill("Après contrôle"); await correction.getByLabel("Motif de la correction").fill("Erreur de saisie"); await correction.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(page.getByRole("status")).toContainText("corrigée"); await expect(history).toContainText("550 g");
    await page.getByRole("button", { name: "Annuler la mesure" }).first().click(); const cancelMeasurement = page.getByRole("dialog", { name: /Annuler la mesure/ }); await expect(cancelMeasurement).toContainText("restera active"); await cancelMeasurement.getByLabel("Motif de l’annulation").fill("Mesure attribuée au mauvais chiot"); await cancelMeasurement.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(history).toContainText("Dernière mesure de la séance");
    const audit = page.getByTestId("litter-weight-adjustment-history"); await audit.locator("summary").click(); await expect(audit).toContainText("Poids corrigé"); await expect(audit).toContainText("Mesure annulée");

    await history.getByRole("button", { name: "Corriger" }).last().click();
    const staleDialog = page.getByRole("dialog", { name: /Corriger la pesée/ });
    const owner = await createAuthenticatedSupabaseClient(); const external = await owner.rpc("correct_litter_routine_weight", { p_measurement_id: ids.measurementTwo, p_client_command_id: ids.staleCommand, p_expected_revision_no: 0, p_grams: 525, p_note: null, p_reason: "Modification concurrente" }); expect(external.error).toBeNull();
    await staleDialog.getByLabel("Poids (g)").fill("530"); await staleDialog.getByLabel("Motif de la correction").fill("Tentative périmée"); await staleDialog.getByRole("button", { name: "Enregistrer la correction" }).click(); await expect(staleDialog).toContainText("modifiée depuis son affichage"); await expect(staleDialog).toBeVisible(); expect(sql(`select grams from public.animal_weight_measurements where id=${q(ids.measurementTwo)}::uuid;`)).toBe("525"); await staleDialog.getByRole("button", { name: "Annuler" }).click();

    await history.getByRole("button", { name: "Annuler la séance" }).first().click(); const cancelSession = page.getByRole("dialog", { name: "Annuler toute la séance" }); await expect(cancelSession).toContainText("Rien ne sera supprimé"); await expect(cancelSession).toContainText("nouvelle séance"); await cancelSession.getByLabel("Motif de l’annulation").fill("Heure de séance erronée"); await cancelSession.getByRole("button", { name: "Confirmer l’annulation de la séance" }).click(); await expect(audit).toContainText("Séance annulée");
    const weightPanelHtml = await page.getByTestId("litter-weight-panel").evaluate((element) => element.outerHTML); expect(weightPanelHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i); for (const technicalId of [ids.sessionOne, ids.sessionTwo, ids.measurementOne, ids.measurementTwo, ids.measurementThree, ids.measurementFour, ids.staleCommand]) expect(page.url()).not.toContain(technicalId);
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    setOwnerRole("viewer"); await page.reload(); const viewerAudit = page.getByTestId("litter-weight-adjustment-history"); await viewerAudit.locator("summary").click(); await expect(viewerAudit).toContainText("Poids corrigé"); await expect(page.getByRole("button", { name: "Corriger" })).toHaveCount(0); await expect(page.getByRole("button", { name: /Annuler la (mesure|séance)/ })).toHaveCount(0);
  } finally {
    const commandIds = JSON.parse(sql(`select coalesce(json_agg(client_command_id order by client_command_id),'[]'::json)::text from public.litter_weight_adjustment_commands where litter_id=${q(ids.litter)}::uuid;`));
    cleanup(); const remaining = remainingCounts(); for (const [table, count] of Object.entries(remaining)) expect(count, `${table} fixtures must be hard-deleted`).toBe(0); console.log(JSON.stringify({ litterWeightAdjustmentUiFixtures: { deleted: { ...ids, commandIds }, remaining } }));
  }
});
