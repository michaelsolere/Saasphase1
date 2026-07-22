import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "WHELPING_EXPRESS_BIRTH_V1_20260722_01";
const ids = {
  mother: "9f2e0001-0000-4000-8000-000000000001",
  father: "9f2e0001-0000-4000-8000-000000000002",
  litter: "9f2e0002-0000-4000-8000-000000000001",
  session: "9f2e0003-0000-4000-8000-000000000001",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

const organizationId = sql("select id from public.organizations where slug='elevage-e2e';");
const ownerId = sql("select id from public.profiles where email='e2e-owner@saasphase1.invalid';");
const ownerMembershipId = sql(
  `select id from public.memberships where organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;`,
);

function cleanup() {
  sql(`
    begin;
    set session_replication_role = replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.animal_weight_measurements where animal_id in (
      select id from public.animals where litter_id=${q(ids.litter)}::uuid
    );
    delete from public.whelping_births where session_id=${q(ids.session)}::uuid;
    delete from public.whelping_events where session_id=${q(ids.session)}::uuid;
    delete from public.animals where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_sessions where id=${q(ids.session)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid)
      or notes like ${q(`${prefix}%`)};
    set session_replication_role = origin;
    commit;
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`select json_build_object(
    'organizations',(select count(*) from public.organizations where name like ${q(`${prefix}%`)}),
    'animals',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or litter_id=${q(ids.litter)}::uuid or notes like ${q(`${prefix}%`)}),
    'litters',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)}),
    'sessions',(select count(*) from public.whelping_sessions where id=${q(ids.session)}::uuid or litter_id=${q(ids.litter)}::uuid),
    'events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid),
    'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
    'commands',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),
    'adjustment_commands',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid),
    'measurements',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),
    'role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = fixtureCounts();
  for (const [name, count] of Object.entries(counts)) {
    expect(count, `${name} must be hard-deleted or restored`).toBe(0);
  }
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Aurore express','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} mother`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'Soleil express','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} father`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,notes,created_by,updated_by)
      values (${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Portée`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_in_progress',current_date,${q(`${prefix} litter`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions (id,organization_id,litter_id,mother_id,status,started_at,timezone_name,note,created_by,updated_by)
      values (${q(ids.session)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,${q(ids.mother)}::uuid,'open',now() - interval '1 hour','Europe/Paris',${q(`${prefix} session`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role=${q(role)} where id=${q(ownerMembershipId)}::uuid;
    set session_replication_role = origin;
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

async function submitSynchronousDoubleClick(button: Locator) {
  await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
}

test("enregistre et complète les naissances express sans doublon", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  const createdIds: Record<string, string[]> = {
    organizations: [],
    users: [],
    roles: [ownerMembershipId],
    animals: [ids.mother, ids.father],
    litters: [ids.litter],
    sessions: [ids.session],
    events: [],
    births: [],
    commands: [],
    measurements: [],
  };

  try {
    createFixtures();
    await login(page);
    await page.goto("/whelping");
    const mobilePanel = panel(page);

    await expect(mobilePanel.getByRole("button", { name: "+ NAISSANCE MÂLE", exact: true })).toBeVisible();
    await expect(mobilePanel.getByRole("button", { name: "+ NAISSANCE FEMELLE", exact: true })).toBeVisible();
    await expect(mobilePanel.getByRole("button", { name: "Saisir tous les détails", exact: true })).toBeVisible();
    await expect(mobilePanel.getByRole("button", { name: "+ NAISSANCE MAINTENANT", exact: true })).toHaveCount(0);

    const beforeMale = Date.now();
    await submitSynchronousDoubleClick(mobilePanel.getByRole("button", { name: "+ NAISSANCE MÂLE", exact: true }));
    await expect(mobilePanel.getByRole("status")).toContainText(/Naissance n° 1 — mâle — enregistrée à \d{2}:\d{2}/);
    const afterMale = Date.now();
    const maleState = JSON.parse(sql(`select json_build_object(
      'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
      'birth_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth'),
      'animals',(select count(*) from public.animals where litter_id=${q(ids.litter)}::uuid),
      'orders',(select count(distinct birth_order) from public.whelping_births where session_id=${q(ids.session)}::uuid and cancelled_at is null),
      'occurred_ms',(select extract(epoch from occurred_at) * 1000 from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=1),
      'sex',(select sex from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=1),
      'viability',(select viability from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=1),
      'color',(select initial_collar_color from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=1),
      'weight',(select weight_grams from public.whelping_commands where litter_id=${q(ids.litter)}::uuid and command_type='record_birth' and result_birth_order=1),
      'note',(select note from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=1),
      'total',(select born_total_count from public.litters where id=${q(ids.litter)}::uuid),
      'male',(select born_male_count from public.litters where id=${q(ids.litter)}::uuid),
      'female',(select born_female_count from public.litters where id=${q(ids.litter)}::uuid),
      'alive',(select alive_count from public.litters where id=${q(ids.litter)}::uuid)
    )::text;`)) as Record<string, number | string | null>;
    expect(maleState).toMatchObject({ births: 1, birth_events: 1, animals: 1, orders: 1, sex: "male", viability: "unknown", color: null, weight: null, note: null, total: 1, male: 1, female: 0, alive: 0 });
    expect(Number(maleState.occurred_ms)).toBeGreaterThanOrEqual(beforeMale - 1_000);
    expect(Number(maleState.occurred_ms)).toBeLessThanOrEqual(afterMale + 1_000);
    await expect(mobilePanel.getByText("Mâle", { exact: true })).toBeVisible();
    await expect(mobilePanel.getByText("État à confirmer", { exact: true }).first()).toBeVisible();
    await expect(mobilePanel.getByText("Sexe à compléter", { exact: true })).toHaveCount(0);

    const beforeFemale = Date.now();
    await submitSynchronousDoubleClick(mobilePanel.getByRole("button", { name: "+ NAISSANCE FEMELLE", exact: true }));
    await expect(mobilePanel.getByRole("status")).toContainText(/Naissance n° 2 — femelle — enregistrée à \d{2}:\d{2}/);
    const afterFemale = Date.now();
    const femaleState = JSON.parse(sql(`select json_build_object(
      'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
      'birth_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth'),
      'animals',(select count(*) from public.animals where litter_id=${q(ids.litter)}::uuid),
      'orders',(select count(distinct birth_order) from public.whelping_births where session_id=${q(ids.session)}::uuid and cancelled_at is null),
      'occurred_ms',(select extract(epoch from occurred_at) * 1000 from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=2),
      'sex',(select sex from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=2),
      'viability',(select viability from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=2),
      'color',(select initial_collar_color from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=2),
      'weight',(select weight_grams from public.whelping_commands where litter_id=${q(ids.litter)}::uuid and command_type='record_birth' and result_birth_order=2),
      'note',(select note from public.whelping_births where session_id=${q(ids.session)}::uuid and birth_order=2),
      'stillborn',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid and viability='stillborn' and cancelled_at is null),
      'total',(select born_total_count from public.litters where id=${q(ids.litter)}::uuid),
      'male',(select born_male_count from public.litters where id=${q(ids.litter)}::uuid),
      'female',(select born_female_count from public.litters where id=${q(ids.litter)}::uuid),
      'alive',(select alive_count from public.litters where id=${q(ids.litter)}::uuid)
    )::text;`)) as Record<string, number | string>;
    expect(femaleState).toMatchObject({ births: 2, birth_events: 2, animals: 2, orders: 2, sex: "female", viability: "unknown", color: null, weight: null, note: null, stillborn: 0, total: 2, male: 1, female: 1, alive: 0 });
    expect(Number(femaleState.occurred_ms)).toBeGreaterThanOrEqual(beforeFemale - 1_000);
    expect(Number(femaleState.occurred_ms)).toBeLessThanOrEqual(afterFemale + 1_000);

    await mobilePanel.getByRole("button", { name: "Saisir tous les détails", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Enregistrer une naissance" });
    await expect(dialog.getByLabel("Sexe").locator("option[value=unknown]")).toHaveCount(1);
    await expect(dialog.getByLabel("Viabilité").locator("option[value=stillborn]")).toHaveCount(1);
    await expect(dialog.getByText("Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.")).toBeVisible();
    await dialog.getByLabel("Sexe").selectOption("unknown");
    await dialog.getByLabel("Viabilité").selectOption("stillborn");
    await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();
    await expect(mobilePanel.getByText("Naissance n° 3").first()).toBeVisible();
    expect(sql(`select count(distinct client_command_id) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid and command_type='record_birth';`)).toBe("3");

    const original = JSON.parse(sql(`select json_build_object('birth_id',b.id,'animal_id',b.animal_id,'event_id',b.event_id,'birth_order',b.birth_order)
      from public.whelping_births b where b.session_id=${q(ids.session)}::uuid and b.birth_order=1;`)) as Record<string, string | number>;
    const firstBirthCard = mobilePanel.locator("li").filter({ hasText: "Naissance n° 1" }).first();
    await firstBirthCard.getByRole("button", { name: "Compléter la naissance", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Compléter la naissance n° 1" });
    await expect(dialog.getByLabel("Sexe")).toHaveValue("male");
    await expect(dialog.getByLabel("Viabilité")).toHaveValue("unknown");
    await expect(dialog.getByLabel("Motif de la correction")).toHaveValue("Complément après naissance express");
    await expect(dialog.getByText("Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.")).toBeVisible();
    await dialog.getByLabel("Sexe").selectOption("female");
    await dialog.getByLabel("Viabilité").selectOption("alive");
    await dialog.getByLabel("Couleur ou collier initial").fill("Orange");
    await dialog.getByLabel("Poids de naissance (g)").fill("430");
    await dialog.getByLabel("Note de naissance").fill(`${prefix} completed`);
    await dialog.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(mobilePanel.getByText(`${prefix} completed`, { exact: true })).toBeVisible();

    const completed = JSON.parse(sql(`select json_build_object(
      'birth_id',b.id,'animal_id',b.animal_id,'event_id',b.event_id,'birth_order',b.birth_order,
      'sex',b.sex,'viability',b.viability,'color',b.initial_collar_color,
      'animal_sex',a.sex,'animal_weight',a.birth_weight_grams,
      'birth_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth'),
      'correction_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth_corrected'),
      'measurements',(select count(*) from public.animal_weight_measurements where source_birth_id=b.id and cancelled_at is null),
      'total',(select born_total_count from public.litters where id=${q(ids.litter)}::uuid),
      'male',(select born_male_count from public.litters where id=${q(ids.litter)}::uuid),
      'female',(select born_female_count from public.litters where id=${q(ids.litter)}::uuid),
      'alive',(select alive_count from public.litters where id=${q(ids.litter)}::uuid)
    ) from public.whelping_births b join public.animals a on a.id=b.animal_id where b.id=${q(String(original.birth_id))}::uuid;`)) as Record<string, string | number>;
    expect(completed).toMatchObject({ ...original, sex: "female", viability: "alive", color: "Orange", animal_sex: "female", animal_weight: 430, birth_events: 3, correction_events: 1, measurements: 1, total: 3, male: 0, female: 2, alive: 1 });

    await page.goto(`/litters/journal?litter=${ids.litter}`);
    const journalPanel = panel(page);
    await expect(journalPanel.getByRole("button", { name: "+ ENREGISTRER UNE NAISSANCE", exact: true })).toBeVisible();
    await expect(journalPanel.getByRole("button", { name: "+ NAISSANCE MÂLE", exact: true })).toHaveCount(0);
    await expect(journalPanel.getByRole("button", { name: "+ NAISSANCE FEMELLE", exact: true })).toHaveCount(0);

    await page.goto("/whelping");
    const mainHtml = await page.locator("main").evaluate((node) => node.outerHTML);
    expect(mainHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(mainHtml).not.toMatch(/revision|client_command|command_id|record_whelping|whelping_births|snapshot|supabase/i);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    const expressActions = panel(page).getByTestId("express-birth-actions");
    const expressButtons = expressActions.getByRole("button");
    const availableWidth = (await expressActions.boundingBox())?.width ?? 0;
    expect(await expressButtons.count()).toBe(2);
    for (const button of await expressButtons.all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(56);
      expect(box?.width).toBeGreaterThanOrEqual(availableWidth - 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(async () => "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0)).toBe(0);

    setOwnerRole("viewer");
    await page.reload();
    await expect(panel(page).getByText(`${prefix} completed`, { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("button")).toHaveCount(0);
    setOwnerRole("owner");

    Object.assign(createdIds, JSON.parse(sql(`select json_build_object(
      'events',coalesce((select json_agg(id::text) from public.whelping_events where session_id=${q(ids.session)}::uuid),'[]'::json),
      'births',coalesce((select json_agg(id::text) from public.whelping_births where session_id=${q(ids.session)}::uuid),'[]'::json),
      'offspring',coalesce((select json_agg(id::text) from public.animals where litter_id=${q(ids.litter)}::uuid),'[]'::json),
      'commands',coalesce((select json_agg(id::text) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),'[]'::json),
      'measurements',coalesce((select json_agg(m.id::text) from public.animal_weight_measurements m join public.animals a on a.id=m.animal_id where a.litter_id=${q(ids.litter)}::uuid),'[]'::json)
    )::text;`)));
    console.info(`E2E express birth created fixture IDs: ${JSON.stringify(createdIds)}`);
  } finally {
    cleanup();
    const counts = expectCleanupAtZero();
    console.info(`E2E express birth final fixture counts: ${JSON.stringify(counts)}`);
  }
});
