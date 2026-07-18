import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f180006-0000-4000-8000-0000000000";
const fixturePrefix = "E2E maternal observations UI";

const ids = {
  mother: `${prefix}01`,
  foreignMother: `${prefix}02`,
  mainLitter: `${prefix}10`,
  foreignLitter: `${prefix}11`,
  otherOrganization: `${prefix}90`,
  foreignObservationCommand: `${prefix}51`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.maternal_observations
    where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
       or client_command_id::text like '9f180006-%';

    delete from public.litters
    where id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
       or name like ${q(`${fixturePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid);

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
        'maternal_observations', (
          select count(*) from public.maternal_observations
          where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
             or client_command_id::text like '9f180006-%'
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
             or name like ${q(`${fixturePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid)
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
  for (const [table, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${table} fixtures must be hard-deleted or restored`).toBe(0);
  }
}

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments),
        'reservations', (select count(*) from public.reservations),
        'applications', (select count(*) from public.applications),
        'litter_care_tasks_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'litter_care_tasks'
        ),
        'whelping_sessions_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_sessions'
        ),
        'whelping_births_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_births'
        ),
        'animal_weight_measurements_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'animal_weight_measurements'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E observations maternelles UI isolée',
      'e2e-observations-maternelles-ui-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       'Mère observations UI E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Mère étrangère observations UI E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixturePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixturePrefix} étrangère`)}, 'dog', 'Golden Retriever',
       ${q(ids.foreignMother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.maternal_observations (
      organization_id, litter_id, mother_id, observation_type, observed_at,
      timezone_name, numeric_value, unit, severity, note, client_command_id,
      created_by, updated_by
    ) values (
      ${q(ids.otherOrganization)}::uuid,
      ${q(ids.foreignLitter)}::uuid,
      ${q(ids.foreignMother)}::uuid,
      'temperature', '2026-07-18T08:00:00.000Z'::timestamptz,
      'Europe/Paris', 37.9, 'celsius', 'routine',
      'Observation étrangère invisible.', ${q(ids.foreignObservationCommand)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
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

function maternalObservationCount() {
  return Number(
    sql(`
      select count(*) from public.maternal_observations
      where litter_id = ${q(ids.mainLitter)}::uuid;
    `),
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

async function openObservationDialog(page: Page) {
  await page.getByRole("button", { name: "Ajouter une observation" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillTemperature(
  dialog: Locator,
  values: {
    observedAt: string;
    numericValue: string;
    unit?: "celsius" | "fahrenheit";
    severity?: "routine" | "watch" | "concern" | "urgent";
    note?: string;
  },
) {
  await dialog.getByLabel("Date et heure").fill(values.observedAt);
  await dialog.getByLabel("Température").fill(values.numericValue);
  if (values.unit) await dialog.getByLabel("Unité").selectOption(values.unit);
  if (values.severity) await dialog.getByLabel("Gravité").selectOption(values.severity);
  if (values.note) await dialog.getByLabel(/Note/).fill(values.note);
}

test("enregistre et affiche les observations maternelles dans le Journal", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);

    const panel = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Suivi de la mère" }),
    });
    await expect(panel.getByText("Aucune observation maternelle enregistrée pour cette portée.")).toBeVisible();
    await expect(panel.getByText("Observation étrangère invisible.")).toHaveCount(0);

    let dialog = await openObservationDialog(page);
    await expect(dialog.getByLabel("Type d’observation")).toHaveValue("temperature");
    await expect(dialog.getByLabel("Gravité")).toHaveValue("routine");
    await expect(dialog.getByLabel("Date et heure")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Température")).toHaveAttribute("required", "");
    await expect(dialog.getByLabel("Unité")).toHaveValue("celsius");
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect(maternalObservationCount()).toBe(0);

    dialog = await openObservationDialog(page);
    await dialog.getByLabel("Date et heure").fill("");
    await expect(dialog.getByLabel("Date et heure")).toHaveJSProperty("validity.valid", false);
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T10:15",
      numericValue: "38.4",
      severity: "watch",
      note: "Température Celsius saisie.",
    });
    const { browserTimezone, expectedObservedAt, formattedObservedAt } =
      await page.evaluate(() => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const observedAt = new Date("2026-07-18T10:15");

        return {
          browserTimezone: timezone,
          expectedObservedAt: observedAt.toISOString(),
          formattedObservedAt: new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: timezone,
          }).format(observedAt),
        };
      });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(page.getByText("L’observation maternelle a été enregistrée.")).toBeVisible();
    await expect(panel.getByText("38,4 °C")).toBeVisible();
    await expect(panel.getByText("Température Celsius saisie.")).toBeVisible();
    await expect(panel.getByText(formattedObservedAt)).toBeVisible();
    expect(maternalObservationCount()).toBe(1);
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'timezone_name', timezone_name,
            'observed_at', observed_at,
            'numeric_value', numeric_value::text,
            'unit', unit,
            'severity', severity,
            'note', note
          )::text
          from public.maternal_observations
          where litter_id = ${q(ids.mainLitter)}::uuid
          order by observed_at desc limit 1;
        `),
      ),
    ).toMatchObject({
      timezone_name: browserTimezone,
      numeric_value: "38.4000",
      unit: "celsius",
      severity: "watch",
      note: "Température Celsius saisie.",
    });
    const storedObservedAt = sql(`
      select observed_at::text
      from public.maternal_observations
      where litter_id = ${q(ids.mainLitter)}::uuid
      order by observed_at desc limit 1;
    `);
    expect(new Date(storedObservedAt).toISOString()).toBe(expectedObservedAt);

    dialog = await openObservationDialog(page);
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T12:20",
      numericValue: "101.2",
      unit: "fahrenheit",
      severity: "routine",
    });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(panel.getByText("101,2 °F")).toBeVisible();
    expect(maternalObservationCount()).toBe(2);

    dialog = await openObservationDialog(page);
    await dialog.getByLabel("Température").fill("39.1");
    await dialog.getByLabel("Type d’observation").selectOption("behavior");
    await expect(dialog.getByLabel("Température")).toHaveCount(0);
    await expect(dialog.getByLabel("Unité")).toHaveCount(0);
    await expect(dialog.getByLabel(/Note/)).toHaveAttribute("required", "");
    await dialog.getByLabel("Date et heure").fill("2026-07-18T14:30");
    await dialog.getByLabel("Gravité").selectOption("concern");
    await dialog.getByLabel(/Note/).fill("Comportement plus calme.");
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(panel.getByText("Comportement plus calme.")).toBeVisible();
    expect(maternalObservationCount()).toBe(3);
    expect(
      JSON.parse(
        sql(`
          select json_build_object('numeric_value', numeric_value, 'unit', unit)::text
          from public.maternal_observations
          where litter_id = ${q(ids.mainLitter)}::uuid
            and observation_type = 'behavior';
        `),
      ),
    ).toEqual({ numeric_value: null, unit: null });

    const historyText = await panel.locator("li").evaluateAll((items) =>
      items.map((item) => item.textContent ?? ""),
    );
    expect(historyText[0]).toContain("Comportement");
    expect(historyText[1]).toContain("101,2 °F");
    expect(historyText[2]).toContain("38,4 °C");

    await page.reload();
    await expect(panel.getByText("Comportement plus calme.")).toBeVisible();
    await expect(panel.getByText("101,2 °F")).toBeVisible();

    const beforeDoubleClick = maternalObservationCount();
    dialog = await openObservationDialog(page);
    await dialog.getByLabel("Type d’observation").selectOption("health");
    await dialog.getByLabel("Date et heure").fill("2026-07-18T15:30");
    await dialog.getByLabel(/Note/).fill("Double clic protégé.");
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).dblclick();
    await expect(page.getByText("L’observation maternelle a été enregistrée.")).toBeVisible();
    expect(maternalObservationCount()).toBe(beforeDoubleClick + 1);

    setOwnerRole("viewer");
    await page.reload();
    await expect(panel.getByText("Double clic protégé.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ajouter une observation" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    setOwnerRole("owner");
    await page.reload();
    dialog = await openObservationDialog(page);
    await dialog.getByLabel("Type d’observation").selectOption("health");
    await dialog.getByLabel("Date et heure").fill("2026-07-18T16:00");
    await dialog.getByLabel(/Note/).fill("Statut modifié pendant la saisie.");
    sql(`update public.litters set status = 'closed' where id = ${q(ids.mainLitter)}::uuid;`);
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Cette portée ne permet plus d’enregistrer une observation.",
    );
    expect(maternalObservationCount()).toBe(beforeDoubleClick + 1);
    sql(`update public.litters set status = 'birth_expected' where id = ${q(ids.mainLitter)}::uuid;`);
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(page.getByText("L’observation maternelle a été enregistrée.")).toBeVisible();
    expect(maternalObservationCount()).toBe(beforeDoubleClick + 2);

    await page.setViewportSize({ width: 375, height: 760 });
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(panel.getByRole("button", { name: /Modifier|Supprimer/ })).toHaveCount(0);
    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
