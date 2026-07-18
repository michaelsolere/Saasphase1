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
const fixturePrefix = "E2E reproductive cycles UI";
const ids = {
  mother: "9f180002-0000-4000-8000-000000000001",
  male: "9f180002-0000-4000-8000-000000000002",
  otherOrganization: "9f180002-0000-4000-8000-000000000090",
  otherMother: "9f180002-0000-4000-8000-000000000003",
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function fixtureAnimalIdsSql() {
  return Object.values(ids)
    .filter((id) => id !== ids.otherOrganization)
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    delete from public.progesterone_measurements
    where cycle_id in (
      select id from public.reproductive_cycles
      where mother_id in (${fixtureAnimalIdsSql()})
         or notes like ${q(`${fixturePrefix}%`)}
    )
       or id::text like '9f180002-%';

    delete from public.reproductive_cycles
    where mother_id in (${fixtureAnimalIdsSql()})
       or notes like ${q(`${fixturePrefix}%`)}
       or id::text like '9f180002-%';

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
        'progesterone_measurements', (
          select count(*) from public.progesterone_measurements
          where cycle_id in (
            select id from public.reproductive_cycles
            where mother_id in (${fixtureAnimalIdsSql()})
               or notes like ${q(`${fixturePrefix}%`)}
          ) or id::text like '9f180002-%'
        ),
        'reproductive_cycles', (
          select count(*) from public.reproductive_cycles
          where mother_id in (${fixtureAnimalIdsSql()})
             or notes like ${q(`${fixturePrefix}%`)}
             or id::text like '9f180002-%'
        ),
        'animals', (
          select count(*) from public.animals where id in (${fixtureAnimalIdsSql()})
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
        ),
        'litters', (
          select count(*) from public.litters
          where mother_id in (${fixtureAnimalIdsSql()})
        ),
        'events', (
          select count(*) from public.events
          where animal_id in (${fixtureAnimalIdsSql()})
        ),
        'notes', (
          select count(*) from public.notes
          where animal_id in (${fixtureAnimalIdsSql()})
        ),
        'documents', (
          select count(*) from public.documents
          where animal_id in (${fixtureAnimalIdsSql()})
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
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E reproduction UI isolée',
      'e2e-reproduction-ui-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, is_breeder, created_by, updated_by
    ) values
      (
        ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
        'Mère reproduction UI E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.male)}::uuid, ${q(organizationId)}::uuid,
        'Mâle reproduction UI E2E', 'dog', 'Golden Retriever', 'male',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.otherMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
        'Mère inaccessible UI E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
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
        'cycles', coalesce((
          select json_agg(id::text order by started_on)
          from public.reproductive_cycles where mother_id = ${q(ids.mother)}::uuid
        ), '[]'::json),
        'measurements', coalesce((
          select json_agg(id::text order by measured_at)
          from public.progesterone_measurements measurement
          join public.reproductive_cycles cycle on cycle.id = measurement.cycle_id
          where cycle.mother_id = ${q(ids.mother)}::uuid
        ), '[]'::json)
      )::text;
    `),
  ) as { cycles: string[]; measurements: string[] };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("gère les cycles reproductifs et dosages dans une interface sécurisée", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    await login(page);

    await page.goto(`/animals/${ids.mother}`);
    await expect(page.getByRole("link", { name: "Reproduction" })).toHaveAttribute(
      "href",
      `/animals/${ids.mother}/reproduction`,
    );
    await page.goto(`/animals/${ids.male}`);
    await expect(page.getByRole("link", { name: "Reproduction" })).toHaveCount(0);

    await page.goto(`/animals/${ids.mother}/reproduction`);
    await expect(page.getByRole("heading", { name: "Mère reproduction UI E2E" })).toBeVisible();
    await expect(page.getByText("Chien · Golden Retriever")).toBeVisible();
    await expect(page.getByText("Aucun cycle reproductif enregistré pour cette femelle.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter un cycle" })).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un cycle" }).click();
    const cycleDialog = page.getByRole("dialog");
    await expect(cycleDialog.getByLabel("Date de début")).toHaveAttribute("required", "");
    await expect(cycleDialog.getByLabel("Date de début")).toHaveJSProperty("validity.valid", false);
    await expect(cycleDialog.getByLabel("Statut")).toHaveValue("in_progress");
    await expect(cycleDialog.locator('option[value="mated"]')).toHaveCount(0);
    await cycleDialog.getByLabel("Date de début").fill("2026-07-12");
    await cycleDialog.getByLabel("Notes").fill(`${fixturePrefix} cycle principal`);
    await cycleDialog.getByRole("button", { name: "Créer le cycle" }).click();
    await expect(cycleDialog.getByText("Le cycle reproductif a été créé.")).toBeVisible();
    await expect(page.getByText("Cycle débuté le 12 juillet 2026")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Ajouter un cycle" }).click();
    await cycleDialog.getByLabel("Date de début").fill("2026-07-13");
    await cycleDialog.getByLabel("Notes").fill(`${fixturePrefix} conflit actif`);
    await cycleDialog.getByRole("button", { name: "Créer le cycle" }).click();
    await expect(cycleDialog.getByRole("alert")).toHaveText("Un cycle actif existe déjà pour cette reproductrice.");
    await page.keyboard.press("Escape");

    const cycleCard = page.getByText("Cycle débuté le 12 juillet 2026").locator("..").locator("..");
    await cycleCard.getByRole("button", { name: "Ajouter un dosage" }).click();
    let dosageDialog = page.getByRole("dialog");
    await expect(dosageDialog.getByLabel("Prélèvement")).toHaveAttribute("required", "");
    await expect(dosageDialog.getByLabel("Valeur")).toHaveAttribute("required", "");
    await expect(dosageDialog.getByLabel("Unité")).toHaveValue("ng_ml");
    await dosageDialog.getByLabel("Prélèvement").fill("2026-07-13T08:15");
    await dosageDialog.getByLabel("Valeur").fill("2.45");
    await dosageDialog.getByLabel("Laboratoire").fill("Laboratoire UI E2E");
    await dosageDialog.getByLabel("Observation").fill(`${fixturePrefix} dosage un`);
    await dosageDialog.getByRole("button", { name: "Ajouter le dosage" }).click();
    await expect(dosageDialog.getByText("Le dosage de progestérone a été ajouté.")).toBeVisible();
    await page.keyboard.press("Escape");

    await cycleCard.getByRole("button", { name: "Ajouter un dosage" }).click();
    dosageDialog = page.getByRole("dialog");
    await dosageDialog.getByLabel("Prélèvement").fill("2026-07-14T08:20");
    await dosageDialog.getByLabel("Valeur").fill("18.7");
    await dosageDialog.getByLabel("Unité").selectOption("nmol_l");
    await dosageDialog.getByLabel("Observation").fill(`${fixturePrefix} dosage deux`);
    await dosageDialog.getByRole("button", { name: "Ajouter le dosage" }).click();
    await expect(dosageDialog.getByText("Le dosage de progestérone a été ajouté.")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(cycleCard.getByText("2,45 ng/mL")).toBeVisible();
    await expect(cycleCard.getByText("18,7 nmol/L")).toBeVisible();
    const values = await cycleCard.locator("li").evaluateAll((items) =>
      items.map((item) => item.textContent ?? "").filter((text) => text.includes("ng/mL") || text.includes("nmol/L")),
    );
    expect(values[0]).toContain("2,45 ng/mL");
    expect(values[1]).toContain("18,7 nmol/L");

    await page.reload();
    await expect(page.getByText("2,45 ng/mL")).toBeVisible();
    await expect(page.getByText("18,7 nmol/L")).toBeVisible();

    await page.goto(`/animals/${ids.male}/reproduction`);
    await expect(page.getByRole("heading", { name: "Reproduction indisponible" })).toBeVisible();
    await page.goto(`/animals/${ids.otherMother}/reproduction`);
    await expect(page.getByRole("heading", { name: "Reproduction indisponible" })).toBeVisible();

    setOwnerRole("viewer");
    await page.goto(`/animals/${ids.mother}/reproduction`);
    await expect(page.getByText("2,45 ng/mL")).toBeVisible();
    await expect(page.getByText("Lecture seule")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter un cycle" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter un dosage" })).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    expect(JSON.parse(sql(`
      select json_build_object(
        'cycles', (select count(*) from public.reproductive_cycles where mother_id = ${q(ids.mother)}::uuid),
        'measurements', (select count(*) from public.progesterone_measurements measurement join public.reproductive_cycles cycle on cycle.id = measurement.cycle_id where cycle.mother_id = ${q(ids.mother)}::uuid),
        'litters', (select count(*) from public.litters where mother_id = ${q(ids.mother)}::uuid),
        'events', (select count(*) from public.events where animal_id = ${q(ids.mother)}::uuid),
        'notes', (select count(*) from public.notes where animal_id = ${q(ids.mother)}::uuid),
        'documents', (select count(*) from public.documents where animal_id = ${q(ids.mother)}::uuid)
      )::text;
    `))).toEqual({
      cycles: 1,
      measurements: 2,
      litters: 0,
      events: 0,
      notes: 0,
      documents: 0,
    });
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
