import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const fixturePrefix = "E2E reproductive cycle matings UI";
const ids = {
  mother: "9f180003-0000-4000-8000-000000000001",
  eligibleFather: "9f180003-0000-4000-8000-000000000002",
  retiredFather: "9f180003-0000-4000-8000-000000000003",
  catFather: "9f180003-0000-4000-8000-000000000004",
  otherOrganization: "9f180003-0000-4000-8000-000000000090",
  foreignFather: "9f180003-0000-4000-8000-000000000005",
  activeCycle: "9f180003-0000-4000-8000-000000000010",
  closedCycle: "9f180003-0000-4000-8000-000000000011",
  cancelledCycle: "9f180003-0000-4000-8000-000000000012",
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function fixtureAnimalIdsSql() {
  return [ids.mother, ids.eligibleFather, ids.retiredFather, ids.catFather, ids.foreignFather]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function fixtureCycleIdsSql() {
  return [ids.activeCycle, ids.closedCycle, ids.cancelledCycle]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    delete from public.reproductive_cycle_matings
    where cycle_id in (${fixtureCycleIdsSql()})
       or id::text like '9f180003-%';

    delete from public.progesterone_measurements
    where cycle_id in (${fixtureCycleIdsSql()});

    update public.reproductive_cycles
    set litter_id = null
    where id in (${fixtureCycleIdsSql()});

    delete from public.litters
    where mother_id = ${q(ids.mother)}::uuid
       or name like ${q(`${fixturePrefix}%`)};

    delete from public.reproductive_cycles
    where id in (${fixtureCycleIdsSql()})
       or notes like ${q(`${fixturePrefix}%`)};

    delete from public.animals where id in (${fixtureAnimalIdsSql()});
    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;

    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'reproductive_cycle_matings', (
          select count(*) from public.reproductive_cycle_matings
          where cycle_id in (${fixtureCycleIdsSql()}) or id::text like '9f180003-%'
        ),
        'progesterone_measurements', (
          select count(*) from public.progesterone_measurements
          where cycle_id in (${fixtureCycleIdsSql()})
        ),
        'reproductive_cycles', (
          select count(*) from public.reproductive_cycles
          where id in (${fixtureCycleIdsSql()}) or notes like ${q(`${fixturePrefix}%`)}
        ),
        'litters', (
          select count(*) from public.litters
          where mother_id = ${q(ids.mother)}::uuid or name like ${q(`${fixturePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals where id in (${fixtureAnimalIdsSql()})
        ),
        'organizations', (
          select count(*) from public.organizations where id = ${q(ids.otherOrganization)}::uuid
        ),
        'membership_role_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const remaining = remainingFixtureCounts();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `${table} fixtures must be hard-deleted or restored`).toBe(0);
  }
  return remaining;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.otherOrganization)}::uuid, 'Organisation E2E saillies UI isolée', 'e2e-saillies-ui-isolee');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, is_retired, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère saillies UI E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.eligibleFather)}::uuid, ${q(organizationId)}::uuid, 'Étalon éligible UI E2E', 'dog', 'Golden Retriever', 'male', 'breeding', 'owned', true, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.retiredFather)}::uuid, ${q(organizationId)}::uuid, 'Étalon retraité UI E2E', 'dog', 'Golden Retriever', 'male', 'retired', 'owned', true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.catFather)}::uuid, ${q(organizationId)}::uuid, 'Étalon chat UI E2E', 'cat', 'Maine Coon', 'male', 'breeding', 'owned', true, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignFather)}::uuid, ${q(ids.otherOrganization)}::uuid, 'Étalon autre organisation UI E2E', 'dog', 'Golden Retriever', 'male', 'breeding', 'owned', true, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reproductive_cycles (
      id, organization_id, mother_id, species, breed, status, started_on, notes, created_by, updated_by
    ) values
      (${q(ids.activeCycle)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever', 'in_progress', '2026-07-12', ${q(`${fixturePrefix} active`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedCycle)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever', 'closed', '2026-06-12', ${q(`${fixturePrefix} closed`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelledCycle)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever', 'cancelled', '2026-05-12', ${q(`${fixturePrefix} cancelled`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function createdRecordIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'matings', coalesce((select json_agg(id::text order by sequence_no) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid), '[]'::json),
        'litters', coalesce((select json_agg(id::text order by created_at) from public.litters where mother_id = ${q(ids.mother)}::uuid), '[]'::json)
      )::text;
    `),
  ) as { matings: string[]; litters: string[] };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("enregistre et affiche les saillies sans sortir du périmètre reproductif", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    await login(page);
    await page.goto(`/animals/${ids.mother}/reproduction`);

    const activeCycle = page.locator("li").filter({ hasText: "Cycle débuté le 12 juillet 2026" });
    await expect(activeCycle.getByText("Aucune saillie enregistrée pour ce cycle.")).toBeVisible();
    await activeCycle.getByRole("button", { name: "Enregistrer une saillie" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Étalon")).toHaveAttribute("required", "");
    await expect(dialog.getByRole("option", { name: "Étalon éligible UI E2E" })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Étalon retraité UI E2E" })).toHaveCount(0);
    await expect(dialog.getByRole("option", { name: "Étalon chat UI E2E" })).toHaveCount(0);
    await expect(dialog.getByRole("option", { name: "Étalon autre organisation UI E2E" })).toHaveCount(0);
    await expect(dialog.getByLabel("Date et heure")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Méthode")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Nom de la portée")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Date et heure")).toHaveJSProperty("validity.valid", false);
    await expect(dialog.getByLabel("Nom de la portée")).toHaveJSProperty("validity.valid", false);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect(JSON.parse(sql(`select json_build_object('matings', (select count(*) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid), 'litters', (select count(*) from public.litters where mother_id = ${q(ids.mother)}::uuid))::text;`))).toEqual({ matings: 0, litters: 0 });

    await activeCycle.getByRole("button", { name: "Enregistrer une saillie" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Étalon").selectOption(ids.eligibleFather);
    await dialog.getByLabel("Date et heure").fill("2026-07-14T10:30");
    await dialog.getByLabel("Méthode").selectOption("ai_fresh");
    await dialog.getByLabel("Nom de la portée").fill(`${fixturePrefix} portée`);
    await dialog.getByLabel("Lieu").fill("Clinique E2E");
    await dialog.getByLabel("Note").fill("Première saillie E2E");
    await dialog.getByRole("button", { name: "Enregistrer la saillie" }).click();
    await expect(page.getByRole("status").filter({ hasText: "La saillie a été enregistrée." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir la portée" })).toBeVisible();
    await expect(activeCycle.getByText("Saillie n° 1")).toBeVisible();
    await expect(activeCycle.getByText("Étalon éligible UI E2E")).toBeVisible();
    await expect(activeCycle.getByText("Insémination — semence fraîche")).toBeVisible();
    await expect(activeCycle.getByText("Clinique E2E")).toBeVisible();
    await expect(activeCycle.getByText("Première saillie E2E")).toBeVisible();
    await expect(activeCycle.getByText("14 juil. 2026", { exact: false })).toBeVisible();
    expect(JSON.parse(sql(`select json_build_object('matings', (select count(*) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid), 'litters', (select count(*) from public.litters where mother_id = ${q(ids.mother)}::uuid), 'mated', (select count(*) from public.reproductive_cycles where id = ${q(ids.activeCycle)}::uuid and status = 'mated'))::text;`))).toEqual({ matings: 1, litters: 1, mated: 1 });

    await page.reload();
    await expect(page.getByText("Saillie n° 1")).toBeVisible();
    await activeCycle.getByRole("button", { name: "Enregistrer une saillie" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Étalon déjà fixé")).toBeVisible();
    await expect(dialog.getByText("Étalon éligible UI E2E")).toBeVisible();
    await expect(dialog.getByLabel("Étalon")).toHaveCount(0);
    await expect(dialog.getByLabel("Nom de la portée")).toHaveCount(0);
    await dialog.getByLabel("Date et heure").fill("2026-07-15T11:45");
    await dialog.getByLabel("Méthode").selectOption("natural");
    await dialog.getByLabel("Lieu").fill("Élevage E2E");
    await dialog.getByLabel("Note").fill("Seconde saillie E2E");
    await dialog.getByRole("button", { name: "Enregistrer la saillie" }).dblclick();
    await expect(page.getByRole("status").filter({ hasText: "La saillie a été enregistrée." })).toBeVisible();
    await expect(activeCycle.getByText("Saillie n° 2")).toBeVisible();
    await expect(activeCycle.getByText("Saillie naturelle")).toBeVisible();
    expect(JSON.parse(sql(`select json_build_object('matings', (select count(*) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid), 'litters', (select count(*) from public.litters where mother_id = ${q(ids.mother)}::uuid), 'same_father', (select count(*) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid and father_id = ${q(ids.eligibleFather)}::uuid))::text;`))).toEqual({ matings: 2, litters: 1, same_father: 2 });

    await expect(page.getByText("Saillie n° 1")).toBeVisible();
    await expect(page.getByText("Saillie n° 2")).toBeVisible();
    const closedCycle = page.locator("li").filter({ hasText: "Cycle débuté le 12 juin 2026" });
    const cancelledCycle = page.locator("li").filter({ hasText: "Cycle débuté le 12 mai 2026" });
    await expect(closedCycle.getByRole("button", { name: "Enregistrer une saillie" })).toHaveCount(0);
    await expect(cancelledCycle.getByRole("button", { name: "Enregistrer une saillie" })).toHaveCount(0);

    setOwnerRole("viewer");
    await page.goto(`/animals/${ids.mother}/reproduction`);
    await expect(page.getByText("Saillie n° 1")).toBeVisible();
    await expect(page.getByText("Saillie n° 2")).toBeVisible();
    await expect(page.getByText("Lecture seule")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer une saillie" })).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    expect(JSON.parse(sql(`
      select json_build_object(
        'matings', (select count(*) from public.reproductive_cycle_matings where cycle_id = ${q(ids.activeCycle)}::uuid),
        'litters', (select count(*) from public.litters where mother_id = ${q(ids.mother)}::uuid),
        'events', (select count(*) from public.events where animal_id = ${q(ids.mother)}::uuid),
        'notes', (select count(*) from public.notes where animal_id = ${q(ids.mother)}::uuid),
        'documents', (select count(*) from public.documents where animal_id = ${q(ids.mother)}::uuid),
        'payments', (select count(*) from public.payments where organization_id = ${q(organizationId)}::uuid and created_by = ${q(ownerId)}::uuid and created_at > now() - interval '10 minutes')
      )::text;
    `))).toEqual({ matings: 2, litters: 1, events: 0, notes: 0, documents: 0, payments: 0 });
  } finally {
    const created = createdRecordIds();
    cleanup();
    const remaining = expectCleanupAtZero();
    console.info(JSON.stringify({
      fixtureCleanup: {
        created: { fixedIds: ids, ...created },
        deleted: "hard-delete in dependency order; owner membership role restored",
        remaining,
      },
    }));
  }
});
