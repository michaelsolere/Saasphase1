import { expect, test, type Locator, type Page } from "@playwright/test";

import { correctWhelpingBirthCore } from "../../src/features/whelping/whelping-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const prefix = "WHELPING_QUICK_UI_V1_20260722_01";
const ids = {
  mother: "9f270201-0000-4000-8000-000000000001",
  father: "9f270201-0000-4000-8000-000000000002",
  litter: "9f270202-0000-4000-8000-000000000001",
  session: "9f270203-0000-4000-8000-000000000001",
  staleCommand: "9f270204-0000-4000-8000-000000000001",
};

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }
const organizationId = sql("select id from public.organizations where slug='elevage-e2e';");
const ownerId = sql("select id from public.profiles where email='e2e-owner@saasphase1.invalid';");
const ownerMembershipId = sql(`select id from public.memberships where organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;`);

function cleanup() {
  sql(`
    begin;
    set local session_replication_role=replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id=${q(ids.staleCommand)}::uuid;
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid);
    delete from public.whelping_births where session_id=${q(ids.session)}::uuid;
    delete from public.whelping_events where session_id=${q(ids.session)}::uuid;
    delete from public.animals where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_sessions where id=${q(ids.session)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or notes like ${q(`${prefix}%`)};
    commit;
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`select json_build_object(
    'organisations',(select count(*) from public.organizations where name like ${q(`${prefix}%`)}),
    'animaux',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or litter_id=${q(ids.litter)}::uuid or notes like ${q(`${prefix}%`)}),
    'portees',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)}),
    'sessions',(select count(*) from public.whelping_sessions where id=${q(ids.session)}::uuid),
    'evenements',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid),
    'naissances',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
    'commandes',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),
    'rectifications',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id=${q(ids.staleCommand)}::uuid),
    'mesures',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),
    'changements_role',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectClean() {
  const counts = fixtureCounts();
  for (const [name, count] of Object.entries(counts)) expect(count, `${name} cleanup`).toBe(0);
  return counts;
}

function fixtures() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Aube quick UI','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} mother`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'Atlas quick UI','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} father`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,notes,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Portée`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_in_progress',current_date,${q(`${prefix} litter`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions(id,organization_id,litter_id,mother_id,status,started_at,timezone_name,note,created_by,updated_by)
      values(${q(ids.session)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,${q(ids.mother)}::uuid,'open',now()-interval '1 hour','Europe/Paris',${q(`${prefix} session`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

function panel(page: Page) {
  return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]");
}

function quickCard(scope: Locator, order: number) {
  return scope.getByTestId("quick-completion-card").filter({ hasText: `Naissance n°${order}` });
}

function expressBirthButton(scope: Locator, name: "+ NAISSANCE MÂLE" | "+ NAISSANCE FEMELLE") {
  return scope.getByTestId("express-birth-actions").last().getByRole("button", { name, exact: true });
}

async function doubleClickSynchronously(button: Locator) {
  await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
}

function birthState(order: number) {
  return JSON.parse(sql(`select json_build_object(
    'birth_id',b.id,'animal_id',b.animal_id,'event_id',b.event_id,'birth_order',b.birth_order,
    'sex',b.sex,'viability',b.viability,'occurred_at',b.occurred_at,'note',b.note,'revision',b.revision_no,
    'color',b.initial_collar_color,'animal_color_initial',a.collar_color_initial,'animal_color_current',a.collar_color_current,
    'animal_weight',a.birth_weight_grams,'measurement_id',m.id,'measurement_grams',m.grams,'measured_at',m.measured_at
  ) from public.whelping_births b join public.animals a on a.id=b.animal_id
  left join public.animal_weight_measurements m on m.source_birth_id=b.id and m.cancelled_at is null
  where b.session_id=${q(ids.session)}::uuid and b.birth_order=${order};`)) as Record<string, string | number | null>;
}

test("gère la file mobile de compléments rapides sans altérer le Journal", async ({ page }) => {
  const duplicateKeyWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Encountered two children with the same key")) {
      duplicateKeyWarnings.push(message.text());
    }
  });
  const checkpoint = (step: string) => {
    console.info(JSON.stringify({ quickCompletionDuplicateKeyCheckpoint: { step, warnings: duplicateKeyWarnings.length } }));
    expect(duplicateKeyWarnings, `duplicate React key warning at ${step}`).toEqual([]);
  };
  cleanup();
  expectClean();
  const createdIds: Record<string, string[]> = { births: [], animals: [], events: [], commands: [], adjustments: [], measurements: [] };
  try {
    fixtures();
    await login(page);
    await page.goto("/whelping");
    checkpoint("initial-load");
    let mobilePanel = panel(page);
    await expressBirthButton(mobilePanel, "+ NAISSANCE MÂLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 1");
    checkpoint("male-birth-action-complete");
    await expect(mobilePanel.getByRole("heading", { name: "Naissances à compléter" })).toBeVisible();
    await expect(quickCard(mobilePanel, 1)).toBeVisible();
    checkpoint("male-birth-refresh-complete");

    await expressBirthButton(mobilePanel, "+ NAISSANCE FEMELLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 2");
    checkpoint("female-birth-refresh-complete");
    const cards = mobilePanel.getByTestId("quick-completion-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Naissance n°2 — Femelle");
    await expect(cards.nth(1)).toContainText("Naissance n°1 — Mâle");
    await expect(quickCard(mobilePanel, 2).getByLabel("Poids de naissance")).toBeVisible();
    await expect(quickCard(mobilePanel, 1).getByLabel("Poids de naissance")).toHaveCount(0);

    const expressBox = await mobilePanel.getByTestId("express-birth-actions").last().boundingBox();
    const queueBox = await mobilePanel.getByRole("heading", { name: "Naissances à compléter" }).boundingBox();
    expect(expressBox!.y + expressBox!.height).toBeLessThan(queueBox!.y);

    const latest = quickCard(mobilePanel, 2);
    const paletteLabels = ["Rouge", "Bleu", "Vert", "Jaune", "Orange", "Rose", "Violet", "Turquoise", "Blanc", "Noir", "Autre"];
    for (const label of paletteLabels) await expect(latest.getByRole("button", { name: label, exact: true })).toBeVisible();
    await latest.getByRole("button", { name: "Orange", exact: true }).click();
    await expect(latest.getByRole("button", { name: "Orange", exact: true })).toHaveAttribute("aria-pressed", "true");
    await latest.getByRole("button", { name: "Autre", exact: true }).click();
    await expect(latest.getByLabel("Couleur personnalisée")).toBeVisible();
    await latest.getByLabel("Couleur personnalisée").fill("  Cuivre  ");
    await latest.getByRole("button", { name: "Bleu", exact: true }).click();
    const weightInput = latest.getByLabel("Poids de naissance");
    await expect(weightInput).toHaveAttribute("type", "number");
    await expect(weightInput).toHaveAttribute("inputmode", "numeric");
    await expect(weightInput).toHaveAttribute("min", "1");
    await expect(weightInput).toHaveAttribute("max", "100000");
    await expect(weightInput).toHaveAttribute("step", "1");
    await expect(latest.getByText("Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.")).toBeVisible();

    const beforeLater = sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid;`);
    await latest.getByRole("button", { name: "Plus tard" }).click();
    await expect(latest.getByLabel("Poids de naissance")).toHaveCount(0);
    expect(sql(`select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid;`)).toBe(beforeLater);
    await latest.getByRole("button", { name: /Naissance n°2/ }).click();

    await latest.getByLabel("Poids de naissance").fill("430");
    await latest.getByRole("button", { name: "Bleu", exact: true }).click();
    const beforeSubmit = Date.now();
    await doubleClickSynchronously(latest.getByRole("button", { name: "Enregistrer le complément" }));
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°2 complétée : 430 g · collier bleu.");
    checkpoint("female-full-completion-refresh-complete");
    const afterSubmit = Date.now();
    await expect(quickCard(mobilePanel, 2)).toHaveCount(0);
    const second = birthState(2);
    expect(new Date(String(second.measured_at)).getTime()).toBeGreaterThanOrEqual(beforeSubmit - 1_000);
    expect(new Date(String(second.measured_at)).getTime()).toBeLessThanOrEqual(afterSubmit + 1_000);
    expect(second).toMatchObject({ sex: "female", viability: "unknown", color: "Bleu", animal_color_initial: "Bleu", animal_color_current: "Bleu", animal_weight: 430 });

    const first = quickCard(mobilePanel, 1);
    await first.getByRole("button", { name: "Bleu", exact: true }).click();
    await expect(first.getByText("Cette couleur est déjà attribuée à la naissance n°2.")).toBeVisible();
    await expect(first.getByRole("button", { name: "Enregistrer le complément" })).toBeDisabled();
    await first.getByLabel("Utiliser quand même cette couleur").check();
    await first.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°1 complétée : collier bleu.");
    checkpoint("male-color-only-refresh-complete");
    await expect(first).toBeVisible();
    await expect(first.getByText(/Bleu.*déjà enregistrée/)).toBeVisible();
    await expect(first.getByRole("button", { name: "Bleu", exact: true })).toHaveCount(0);

    await first.getByLabel("Poids de naissance").fill("425");
    await first.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°1 complétée : 425 g.");
    checkpoint("male-weight-only-refresh-complete");
    await expect(quickCard(mobilePanel, 1)).toHaveCount(0);

    await expressBirthButton(mobilePanel, "+ NAISSANCE MÂLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 3");
    let third = quickCard(mobilePanel, 3);
    await third.getByLabel("Poids de naissance").fill("440");
    await third.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°3 complétée : 440 g.");
    third = quickCard(mobilePanel, 3);
    await expect(third.getByText(/440 g.*déjà enregistré/)).toBeVisible();
    await expect(third.getByLabel("Poids de naissance")).toHaveCount(0);
    await third.getByRole("button", { name: "Autre", exact: true }).click();
    await third.getByLabel("Couleur personnalisée").fill(" Cuivre ");
    await third.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°3 complétée : collier cuivre.");
    await expect(quickCard(mobilePanel, 3)).toHaveCount(0);

    await expressBirthButton(mobilePanel, "+ NAISSANCE FEMELLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 4");
    await page.reload();
    mobilePanel = panel(page);
    const fourthBefore = birthState(4);
    const owner = await createAuthenticatedSupabaseClient();
    const concurrent = await correctWhelpingBirthCore({
      birthId: String(fourthBefore.birth_id), clientCommandId: ids.staleCommand, expectedRevisionNo: 0,
      occurredAt: String(fourthBefore.occurred_at), sex: "female", viability: "unknown",
      initialCollarColor: null, birthNote: "Modification concurrente", weightGrams: null,
      weightMeasuredAt: null, weightNote: null, reason: "Test de concurrence",
    }, owner);
    expect(concurrent.outcome).toBe("success");
    const fourth = quickCard(mobilePanel, 4);
    await fourth.getByRole("button", { name: "Orange", exact: true }).click();
    await fourth.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(fourth.getByRole("alert")).toContainText("Rechargez les données");
    await expect(fourth.getByRole("button", { name: "Recharger les données" })).toBeVisible();
    expect(birthState(4)).toMatchObject({ color: null, sex: "female", viability: "unknown", note: "Modification concurrente" });

    const database = JSON.parse(sql(`select json_build_object(
      'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
      'birth_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth'),
      'quick_corrections',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid and reason='Complément rapide du poids et du collier'),
      'quick_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth_corrected' and note='Complément rapide du poids et du collier'),
      'active_measures',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid) and measurement_kind='birth' and cancelled_at is null),
      'duplicate_measures',(select count(*) from (select source_birth_id from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid) and measurement_kind='birth' and cancelled_at is null group by source_birth_id having count(*)>1) duplicated)
    )::text;`));
    expect(database).toEqual({ births: 4, birth_events: 4, quick_corrections: 5, quick_events: 5, active_measures: 3, duplicate_measures: 0 });

    await page.reload();
    mobilePanel = panel(page);
    const html = await page.locator("main").evaluate((node) => node.outerHTML);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(html).not.toMatch(/clientCommand|command_id|revision|supabase|rpc|whelping_births|storage/i);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(async () => "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0)).toBe(0);
    await page.getByText("Installer sur l’écran d’accueil").click();
    await expect(page.getByText("Une connexion réseau est requise pour consulter ou enregistrer les données.")).toBeVisible();

    sql(`set session_replication_role=replica; update public.memberships set role='viewer' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    await page.reload();
    await expect(panel(page).getByRole("heading", { name: "Naissances à compléter" })).toHaveCount(0);
    await expect(panel(page).locator('input[type="number"]')).toHaveCount(0);
    await expect(panel(page).getByRole("button")).toHaveCount(0);
    sql(`set session_replication_role=replica; update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);

    await page.goto(`/litters/journal?litter=${ids.litter}`);
    const journalPanel = panel(page);
    await expect(journalPanel.getByRole("heading", { name: "Naissances à compléter" })).toHaveCount(0);
    await expect(journalPanel.getByRole("button", { name: "+ ENREGISTRER UNE NAISSANCE", exact: true })).toBeVisible();
    await expect(journalPanel.getByRole("button", { name: "Compléter la naissance", exact: true }).first()).toBeVisible();

    Object.assign(createdIds, JSON.parse(sql(`select json_build_object(
      'births',coalesce((select json_agg(id::text) from public.whelping_births where session_id=${q(ids.session)}::uuid),'[]'::json),
      'animals',coalesce((select json_agg(id::text) from public.animals where litter_id=${q(ids.litter)}::uuid),'[]'::json),
      'events',coalesce((select json_agg(id::text) from public.whelping_events where session_id=${q(ids.session)}::uuid),'[]'::json),
      'commands',coalesce((select json_agg(id::text) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json),
      'adjustments',coalesce((select json_agg(id::text) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json),
      'measurements',coalesce((select json_agg(id::text) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),'[]'::json)
    )::text;`)));
    console.info(JSON.stringify({ quickCompletionUiCreatedIds: createdIds }));
  } finally {
    cleanup();
    console.info(JSON.stringify({ quickCompletionUiCleanup: { prefix, remaining: expectClean() } }));
  }
});
