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
const prefix = "b8d22003-0000-4000-8000-0000000000";
const uuidPrefix = "b8d22003-%";
const previousUuidPrefix = "a7c24022-%";
const historicalUuidPrefix = "9f180006-%";
const fixturePrefix = "E2E maternal temperature drop marker 20260722";
const previousFixturePrefix = "E2E maternal temperature chart 20260722";
const historicalFixturePrefix = "E2E maternal observations UI";

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

function restoreTemperatureDropPolicyConstraint() {
  sql(`
    update public.organization_settings
    set maternal_temperature_drop_policy = null
    where maternal_temperature_drop_policy is not null
      and not public.is_valid_maternal_temperature_drop_policy(
        maternal_temperature_drop_policy
      );
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'organization_settings_maternal_temperature_drop_policy_check'
          and conrelid = 'public.organization_settings'::regclass
      ) then
        alter table public.organization_settings
          add constraint organization_settings_maternal_temperature_drop_policy_check
          check (
            maternal_temperature_drop_policy is null
            or public.is_valid_maternal_temperature_drop_policy(
              maternal_temperature_drop_policy
            )
          );
      end if;
    end $$;
  `);
}

function cleanup() {
  sql(`
    delete from public.maternal_observations
    where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
       or litter_id::text like ${q(previousUuidPrefix)}
       or litter_id::text like ${q(historicalUuidPrefix)}
       or client_command_id::text like ${q(uuidPrefix)}
       or client_command_id::text like ${q(previousUuidPrefix)}
       or client_command_id::text like ${q(historicalUuidPrefix)};

    delete from public.litters
    where id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
       or id::text like ${q(previousUuidPrefix)}
       or id::text like ${q(historicalUuidPrefix)}
       or name like ${q(`${fixturePrefix}%`)}
       or name like ${q(`${previousFixturePrefix}%`)}
       or name like ${q(`${historicalFixturePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid)
       or id::text like ${q(previousUuidPrefix)}
       or id::text like ${q(historicalUuidPrefix)};

    delete from public.organization_settings
    where organization_id = ${q(ids.otherOrganization)}::uuid
       or organization_id::text like ${q(previousUuidPrefix)}
       or organization_id::text like ${q(historicalUuidPrefix)};

    delete from public.organizations
    where id = ${q(ids.otherOrganization)}::uuid
       or id::text like ${q(previousUuidPrefix)}
       or id::text like ${q(historicalUuidPrefix)};

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
             or litter_id::text like ${q(previousUuidPrefix)}
             or litter_id::text like ${q(historicalUuidPrefix)}
             or client_command_id::text like ${q(uuidPrefix)}
             or client_command_id::text like ${q(previousUuidPrefix)}
             or client_command_id::text like ${q(historicalUuidPrefix)}
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
             or id::text like ${q(previousUuidPrefix)}
             or id::text like ${q(historicalUuidPrefix)}
             or name like ${q(`${fixturePrefix}%`)}
             or name like ${q(`${previousFixturePrefix}%`)}
             or name like ${q(`${historicalFixturePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid)
             or id::text like ${q(previousUuidPrefix)}
             or id::text like ${q(historicalUuidPrefix)}
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
             or id::text like ${q(previousUuidPrefix)}
             or id::text like ${q(historicalUuidPrefix)}
        ),
        'organization_settings', (
          select count(*) from public.organization_settings
          where organization_id = ${q(ids.otherOrganization)}::uuid
             or organization_id::text like ${q(previousUuidPrefix)}
             or organization_id::text like ${q(historicalUuidPrefix)}
        ),
        'membership_role_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function fixtureIdentifiers() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'organizations', coalesce((
          select json_agg(id order by id) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
             or id::text like ${q(previousUuidPrefix)}
        ), '[]'::json),
        'animals', coalesce((
          select json_agg(id order by id) from public.animals
          where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid)
        ), '[]'::json),
        'litters', coalesce((
          select json_agg(id order by id) from public.litters
          where id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
        ), '[]'::json),
        'organization_settings', coalesce((
          select json_agg(id order by id) from public.organization_settings
          where organization_id = ${q(ids.otherOrganization)}::uuid
        ), '[]'::json),
        'maternal_observations', coalesce((
          select json_agg(id order by observed_at, id)
          from public.maternal_observations
          where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.foreignLitter)}::uuid)
        ), '[]'::json)
      )::text;
    `),
  ) as Record<string, string[]>;
}

function logFixtureIdentifiers(stage: string) {
  const inventory = fixtureIdentifiers();
  console.info(`[maternal-temperature-chart fixtures:${stage}] ${JSON.stringify(inventory)}`);
  return inventory;
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

    insert into public.organization_settings (
      organization_id, maternal_temperature_drop_policy, created_by, updated_by
    ) values (
      ${q(ids.otherOrganization)}::uuid,
      '{"version":1,"referenceMeasurementCount":2,"dropThresholdCelsius":2}'::jsonb,
      ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid
    );

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
  restoreTemperatureDropPolicyConstraint();
  const originalSettingsJson = sql(`
    select to_jsonb(settings)::text
    from public.organization_settings settings
    where organization_id = ${q(organizationId)}::uuid;
  `);
  expect(originalSettingsJson).toBeTruthy();
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    sql(`
      update public.organization_settings
      set maternal_temperature_drop_policy =
        '{"version":1,"referenceMeasurementCount":3,"dropThresholdCelsius":0.7}'::jsonb
      where organization_id = ${q(organizationId)}::uuid;
    `);
    logFixtureIdentifiers("created-base");
    const outOfScopeBefore = outOfScopeCounts();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);

    const panel = page.getByTestId("maternal-observations-panel");
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
      numericValue: "38.2",
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
    await expect(panel.locator("li").getByText("38,2 °C", { exact: true })).toBeVisible();
    await expect(panel.locator("li").getByText("Température Celsius saisie.", { exact: true })).toBeVisible();
    await expect(
      panel.locator("li").filter({ hasText: "Température Celsius saisie." }),
    ).toContainText(formattedObservedAt);
    expect(maternalObservationCount()).toBe(1);
    logFixtureIdentifiers("temperature-celsius");
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
      numeric_value: "38.2000",
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
    await expect(
      dialog.getByText("L’observation maternelle a été enregistrée."),
    ).toHaveCount(0);
    await expect(dialog.getByLabel("Type d’observation")).toHaveValue("temperature");
    await expect(dialog.getByLabel("Gravité")).toHaveValue("routine");
    await expect(dialog.getByLabel("Unité")).toHaveValue("celsius");
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T12:20",
      numericValue: "100.76",
      unit: "fahrenheit",
      severity: "routine",
    });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(panel.locator("li").getByText("100,76 °F", { exact: true })).toBeVisible();
    expect(maternalObservationCount()).toBe(2);
    logFixtureIdentifiers("temperature-fahrenheit");

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
    logFixtureIdentifiers("behavior");
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

    dialog = await openObservationDialog(page);
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T18:20",
      numericValue: "38.2",
      severity: "urgent",
      note: "Troisième température saisie.",
    });
    const formattedLatestTemperatureDate = await page.evaluate(() => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date("2026-07-18T18:20"));
    });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(panel.locator("li").getByText("Troisième température saisie.", { exact: true })).toBeVisible();
    expect(maternalObservationCount()).toBe(4);
    logFixtureIdentifiers("temperature-latest");

    const chartSection = panel.getByTestId("maternal-temperature-chart-section");
    await expect(chartSection.getByRole("heading", { name: "Courbe de température" })).toBeVisible();
    const chart = chartSection.getByTestId("maternal-temperature-chart");
    await expect(chart).toBeVisible();
    const chartPoints = chart.getByTestId("maternal-temperature-point");
    await expect(chartPoints).toHaveCount(3);
    await expect(chartPoints.nth(0)).toHaveAttribute("data-temperature-point-index", "1");
    await expect(chartPoints.nth(1)).toHaveAttribute("data-temperature-point-index", "2");
    await expect(chartPoints.nth(2)).toHaveAttribute("data-temperature-point-index", "3");
    const pointTitles = await chartPoints.evaluateAll((points) =>
      points.map((point) => point.querySelector("title")?.textContent ?? ""),
    );
    expect(pointTitles[0]).toContain("38,2 °C");
    expect(pointTitles[1]).toContain("100,76 °F · 38,2 °C après harmonisation graphique");
    expect(pointTitles[2]).toContain("38,2 °C");
    expect(pointTitles.join(" ")).not.toContain("Comportement plus calme.");
    await expect(chartSection.getByTestId("maternal-temperature-latest")).toContainText("38,2 °C");
    await expect(chartSection.getByTestId("maternal-temperature-latest-date")).toContainText(formattedLatestTemperatureDate);
    await expect(chartSection.getByTestId("maternal-temperature-previous")).toContainText("38,2 °C");
    await expect(chartSection.getByTestId("maternal-temperature-count")).toContainText("3");
    await expect(chartSection.getByTestId("maternal-temperature-difference")).toContainText("0 °C");
    await expect(chartSection.getByTestId("maternal-temperature-interval")).toContainText("6 h");
    await expect(chartSection.getByTestId("maternal-temperature-minimum")).toContainText("38,2 °C");
    await expect(chartSection.getByTestId("maternal-temperature-maximum")).toContainText("38,2 °C");
    await expect(chartSection.getByTestId("maternal-temperature-severity")).toHaveText("Appréciation saisie : Urgent");

    const waitingMarker = chartSection.getByTestId("maternal-temperature-drop-marker");
    await expect(waitingMarker).toHaveAttribute("data-temperature-drop-status", "insufficient_history");
    await expect(waitingMarker).toContainText("2 mesures de référence disponibles sur les 3 nécessaires");

    dialog = await openObservationDialog(page);
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T20:20",
      numericValue: "37.8",
      severity: "watch",
      note: "Repère non atteint.",
    });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(
      panel.locator("li").getByText("Repère non atteint.", { exact: true }),
    ).toBeVisible();
    expect(maternalObservationCount()).toBe(5);
    const nonReachedMarker = chartSection.getByTestId("maternal-temperature-drop-marker");
    await expect(nonReachedMarker).toHaveAttribute("data-temperature-drop-status", "not_reached");
    await expect(nonReachedMarker.getByTestId("maternal-temperature-drop-reference")).toHaveText("38,2 °C");
    await expect(nonReachedMarker.getByTestId("maternal-temperature-drop-latest")).toHaveText("37,8 °C");
    await expect(nonReachedMarker.getByTestId("maternal-temperature-drop-observed")).toHaveText("−0,4 °C");
    await expect(nonReachedMarker.getByTestId("maternal-temperature-drop-threshold")).toContainText("0,7 °C");
    await expect(nonReachedMarker.getByTestId("maternal-temperature-drop-result")).toHaveText("Repère non atteint");
    await expect(chartSection.getByTestId("maternal-temperature-drop-segment")).toHaveCount(0);
    await expect(chartSection.getByTestId("maternal-temperature-drop-point-outline")).toHaveCount(0);
    expect((await panel.textContent()) ?? "").not.toMatch(/24\s*(?:à|–|-)\s*36|mise-bas imminente|chute annonciatrice|alerte médicale|température anormale/i);

    dialog = await openObservationDialog(page);
    await fillTemperature(dialog, {
      observedAt: "2026-07-18T22:20",
      numericValue: "37.3",
      severity: "routine",
      note: "Repère atteint sans prédiction.",
    });
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(
      panel.locator("li").getByText("Repère atteint sans prédiction.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(maternalObservationCount()).toBe(6);
    const reachedMarker = chartSection.getByTestId("maternal-temperature-drop-marker");
    await expect(reachedMarker).toHaveAttribute("data-temperature-drop-status", "reached");
    await expect(reachedMarker.getByTestId("maternal-temperature-drop-reference")).toHaveText("38,2 °C");
    await expect(reachedMarker.getByTestId("maternal-temperature-drop-latest")).toHaveText("37,3 °C");
    await expect(reachedMarker.getByTestId("maternal-temperature-drop-observed")).toHaveText("0,9 °C");
    await expect(reachedMarker.getByTestId("maternal-temperature-drop-threshold")).toContainText("0,7 °C");
    await expect(reachedMarker.getByTestId("maternal-temperature-drop-result")).toHaveText("Repère personnel de baisse atteint");
    await expect(chartSection.getByTestId("maternal-temperature-drop-segment")).toHaveAttribute("data-temperature-segment", "latest");
    await expect(chartSection.getByTestId("maternal-temperature-drop-point-outline")).toHaveCount(1);
    const reachedPoints = chartSection.getByTestId("maternal-temperature-point");
    await expect(reachedPoints).toHaveCount(5);
    for (let index = 0; index < 4; index += 1) {
      await expect(reachedPoints.nth(index)).not.toHaveAttribute("data-temperature-drop-marker", "reached");
    }
    await expect(reachedPoints.nth(4)).toHaveAttribute("data-temperature-drop-marker", "reached");
    const latestTitle = await reachedPoints.nth(4).locator("title").textContent();
    expect(latestTitle).toContain("Repère personnel de baisse atteint");
    expect(latestTitle).toContain("Référence récente : 38,2 °C");
    expect(latestTitle).toContain("Baisse observée : 0,9 °C");
    expect(latestTitle).toContain("Seuil configuré : 0,7 °C");

    // An invalid persisted policy is isolated from the authorized observations.
    sql(`
      alter table public.organization_settings
        drop constraint organization_settings_maternal_temperature_drop_policy_check;
      update public.organization_settings
      set maternal_temperature_drop_policy =
        '{"version":1,"referenceMeasurementCount":3,"dropThresholdCelsius":0.7,"technical":"hidden"}'::jsonb
      where organization_id = ${q(organizationId)}::uuid;
    `);
    await page.reload();
    await expect(panel.getByTestId("maternal-temperature-chart")).toBeVisible();
    const unavailableMarker = panel.getByTestId("maternal-temperature-drop-marker");
    await expect(unavailableMarker).toHaveAttribute(
      "data-temperature-drop-status",
      "policy_unavailable",
    );
    await expect(unavailableMarker).toContainText(
      "Le paramètre du repère n’est momentanément pas disponible",
    );
    await expect(
      panel.getByText("Repère atteint sans prédiction.", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByTestId("maternal-temperature-drop-segment")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Ajouter une observation" })).toHaveCount(1);
    sql(`
      update public.organization_settings
      set maternal_temperature_drop_policy =
        '{"version":1,"referenceMeasurementCount":3,"dropThresholdCelsius":0.7}'::jsonb
      where organization_id = ${q(organizationId)}::uuid;
    `);
    restoreTemperatureDropPolicyConstraint();
    await page.reload();
    await expect(panel.getByTestId("maternal-temperature-drop-result")).toHaveText(
      "Repère personnel de baisse atteint",
    );

    const historyText = await panel.locator("li").evaluateAll((items) =>
      items.map((item) => item.textContent ?? ""),
    );
    expect(historyText[0]).toContain("37,3 °C");
    expect(historyText[1]).toContain("37,8 °C");
    expect(historyText[2]).toContain("38,2 °C");
    expect(historyText[3]).toContain("Comportement");
    expect(historyText[4]).toContain("100,76 °F");
    expect(historyText[5]).toContain("38,2 °C");

    await page.reload();
    await expect(panel.getByText("Comportement plus calme.")).toBeVisible();
    await expect(panel.locator("li").getByText("100,76 °F", { exact: true })).toBeVisible();

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
    await expect(panel.getByTestId("maternal-temperature-chart")).toBeVisible();
    await expect(panel.getByTestId("maternal-temperature-drop-result")).toHaveText("Repère personnel de baisse atteint");
    await expect(panel.getByText("Comportement plus calme.")).toBeVisible();
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
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await page.reload();
    dialog = await openObservationDialog(page);
    await dialog.getByLabel("Type d’observation").selectOption("health");
    await dialog.getByLabel("Date et heure").fill("2026-07-18T16:00");
    await dialog.getByLabel(/Note/).fill("Statut modifié pendant la saisie.");
    await dialog.getByRole("button", { name: "Enregistrer l’observation" }).click();
    await expect(page.getByText("L’observation maternelle a été enregistrée.")).toBeVisible();
    expect(maternalObservationCount()).toBe(beforeDoubleClick + 2);

    const panelHtml = await panel.innerHTML();
    expect(panelHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(panelHtml).not.toMatch(/clientCommandId|created_by|createdBy|maternal_observations|record_maternal_observation|rpc/i);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(panel.getByRole("button", { name: /Modifier|Supprimer/ })).toHaveCount(0);
    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    logFixtureIdentifiers("before-cleanup");
    restoreTemperatureDropPolicyConstraint();
    cleanup();
    sql(`
      delete from public.organization_settings
      where organization_id = ${q(organizationId)}::uuid;
      insert into public.organization_settings
      select restored.*
      from jsonb_populate_record(
        null::public.organization_settings,
        ${q(originalSettingsJson)}::jsonb
      ) restored;
    `);
    expectCleanupAtZero();
    console.info(`[maternal-temperature-chart fixtures:after-cleanup] ${JSON.stringify(remainingFixtureCounts())}`);
  }
});
