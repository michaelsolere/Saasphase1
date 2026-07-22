import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const fixturePrefix = "E2E_MATERNAL_DROP_POLICY_20260722_V1";

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function setRole(role: "owner" | "admin" | "member" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(membershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function policyValue() {
  const value = sql(`
    select coalesce(maternal_temperature_drop_policy::text, 'null')
    from public.organization_settings
    where organization_id = ${q(organizationId)}::uuid;
  `);
  return value ? JSON.parse(value) : undefined;
}

function settingsRows() {
  return JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'id', id,
      'deleted', deleted_at is not null
    ) order by id), '[]'::json)::text
    from public.organization_settings
    where organization_id = ${q(organizationId)}::uuid;
  `)) as Array<{ id: string; deleted: boolean }>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function section(page: Page) {
  return page.locator("#maternal-temperature-drop-policy");
}

async function savePolicy(
  page: Page,
  referenceMeasurementCount: string,
  dropThresholdCelsius: string,
) {
  const policySection = section(page);
  const enabled = policySection.getByLabel("Activer le repère");
  if (!(await enabled.isChecked())) await enabled.check();
  await policySection
    .getByLabel("Nombre de mesures précédentes utilisées")
    .fill(referenceMeasurementCount);
  await policySection
    .getByLabel("Baisse minimale à matérialiser en °C")
    .fill(dropThresholdCelsius);
  await expect(policySection.locator('input[name="policy_json"]')).toHaveValue(
    JSON.stringify({
      version: 1,
      referenceMeasurementCount: Number(referenceMeasurementCount),
      dropThresholdCelsius: Number(dropThresholdCelsius),
    }),
  );
  await policySection
    .getByRole("button", { name: "Enregistrer le repère" })
    .click();
  await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=success/);
}

test("configure le repère personnel avec permissions, concurrence et restauration stricte", async ({
  page,
  context,
}) => {
  const originalSettingsJson = sql(`
    select to_jsonb(settings)::text
    from public.organization_settings settings
    where organization_id = ${q(organizationId)}::uuid;
  `);
  expect(originalSettingsJson).toBeTruthy();
  const temporarySettingsIds = new Set<string>();
  let businessSettingsAfterCreation = "";

  try {
    setRole("owner");
    sql(`delete from public.organization_settings where organization_id = ${q(organizationId)}::uuid;`);
    expect(settingsRows()).toEqual([]);

    await login(page);
    await page.goto("/settings/organization#maternal-temperature-drop-policy");
    let policySection = section(page);
    await expect(policySection.getByLabel("Activer le repère")).not.toBeChecked();
    await expect(policySection).toContainText("un exemple modifiable, pas un seuil vétérinaire");
    await expect(policySection.locator('input[name="organization_id"]')).toHaveCount(0);

    await policySection.getByLabel("Activer le repère").check();
    await expect(policySection.getByLabel("Nombre de mesures précédentes utilisées")).toHaveValue("3");
    await expect(policySection.getByLabel("Baisse minimale à matérialiser en °C")).toHaveValue("0.7");
    await policySection.getByRole("button", { name: "Enregistrer le repère" }).click();
    await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=success/);
    expect(policyValue()).toEqual({
      version: 1,
      referenceMeasurementCount: 3,
      dropThresholdCelsius: 0.7,
    });
    for (const row of settingsRows()) temporarySettingsIds.add(row.id);
    expect(settingsRows()).toHaveLength(1);
    businessSettingsAfterCreation = sql(`
      select (to_jsonb(settings)
        - 'id' - 'created_at' - 'created_by' - 'updated_at' - 'updated_by'
        - 'deleted_at' - 'maternal_temperature_drop_policy')::text
      from public.organization_settings settings
      where organization_id = ${q(organizationId)}::uuid;
    `);

    await page.reload();
    policySection = section(page);
    await expect(policySection.getByLabel("Activer le repère")).toBeChecked();
    await expect(policySection.getByLabel("Nombre de mesures précédentes utilisées")).toHaveValue("3");
    await expect(policySection.getByLabel("Baisse minimale à matérialiser en °C")).toHaveValue("0.7");

    setRole("admin");
    await page.goto("/settings/organization#maternal-temperature-drop-policy");
    await savePolicy(page, "4", "1.25");
    expect(policyValue()).toEqual({
      version: 1,
      referenceMeasurementCount: 4,
      dropThresholdCelsius: 1.25,
    });

    // Client and server reject the same canonical bounds.
    policySection = section(page);
    await policySection.getByLabel("Nombre de mesures précédentes utilisées").fill("1");
    await expect(policySection.getByRole("button", { name: "Enregistrer le repère" })).toBeDisabled();
    await policySection.getByLabel("Nombre de mesures précédentes utilisées").fill("4");
    await policySection.getByLabel("Baisse minimale à matérialiser en °C").fill("3.001");
    await expect(policySection.getByRole("button", { name: "Enregistrer le repère" })).toBeDisabled();
    await policySection.getByLabel("Baisse minimale à matérialiser en °C").fill("1.25");
    await policySection.locator('input[name="policy_json"]').evaluate((element) => {
      (element as HTMLInputElement).value = JSON.stringify({
        version: 1,
        referenceMeasurementCount: 1,
        dropThresholdCelsius: 0.01,
      });
    });
    await policySection.getByRole("button", { name: "Enregistrer le repère" }).click();
    await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=error/);
    expect(policyValue()).toEqual({
      version: 1,
      referenceMeasurementCount: 4,
      dropThresholdCelsius: 1.25,
    });
    expect(() => sql(`
      update public.organization_settings
      set maternal_temperature_drop_policy =
        '{"version":1,"referenceMeasurementCount":3,"dropThresholdCelsius":0.123}'::jsonb
      where organization_id = ${q(organizationId)}::uuid;
    `)).toThrow();

    // Member and viewer retain the exact read-only view and cannot forge a write.
    for (const role of ["member", "viewer"] as const) {
      setRole(role);
      await page.goto(`/settings/organization?role_check=${role}#maternal-temperature-drop-policy`);
      policySection = section(page);
      await expect(policySection.getByLabel("Activer le repère")).toBeDisabled();
      await expect(policySection.getByLabel("Nombre de mesures précédentes utilisées")).toBeDisabled();
      await expect(policySection.getByRole("button", { name: "Enregistrer le repère" })).toHaveCount(0);
      await expect(policySection).toContainText("lecture seule");

      setRole("owner");
      await page.reload();
      policySection = section(page);
      setRole(role);
      await policySection.getByRole("button", { name: "Enregistrer le repère" }).click();
      await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=error/);
      expect(policyValue()).toEqual({
        version: 1,
        referenceMeasurementCount: 4,
        dropThresholdCelsius: 1.25,
      });
    }

    // Disabling stores null; reactivation persists only the explicitly submitted values.
    setRole("owner");
    await page.goto("/settings/organization#maternal-temperature-drop-policy");
    policySection = section(page);
    await policySection.getByLabel("Activer le repère").uncheck();
    await policySection.getByRole("button", { name: "Enregistrer le repère" }).click();
    await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=disabled/);
    expect(policyValue()).toBeNull();
    await savePolicy(page, "5", "0.9");
    expect(policyValue()).toEqual({
      version: 1,
      referenceMeasurementCount: 5,
      dropThresholdCelsius: 0.9,
    });

    // A soft-deleted row is safely reactivated.
    sql(`update public.organization_settings set deleted_at = now() where organization_id = ${q(organizationId)}::uuid;`);
    await page.goto("/settings/organization#maternal-temperature-drop-policy");
    await savePolicy(page, "3", "0.65");
    expect(settingsRows()).toEqual([{ id: settingsRows()[0].id, deleted: false }]);
    expect(policyValue()).toEqual({
      version: 1,
      referenceMeasurementCount: 3,
      dropThresholdCelsius: 0.65,
    });

    // Two authenticated forms may race to create, but the organization remains unique.
    const secondPage = await context.newPage();
    await page.goto("/settings/organization#maternal-temperature-drop-policy");
    await secondPage.goto("/settings/organization#maternal-temperature-drop-policy");
    sql(`delete from public.organization_settings where organization_id = ${q(organizationId)}::uuid;`);
    await Promise.all([
      section(page).getByRole("button", { name: "Enregistrer le repère" }).click(),
      section(secondPage).getByRole("button", { name: "Enregistrer le repère" }).click(),
    ]);
    await expect(page).toHaveURL(/maternal_temperature_drop_policy_status=success/);
    await expect(secondPage).toHaveURL(/maternal_temperature_drop_policy_status=success/);
    expect(settingsRows()).toHaveLength(1);
    for (const row of settingsRows()) temporarySettingsIds.add(row.id);
    await secondPage.close();

    expect(sql(`
      select (to_jsonb(settings)
        - 'id' - 'created_at' - 'created_by' - 'updated_at' - 'updated_by'
        - 'deleted_at' - 'maternal_temperature_drop_policy')::text
      from public.organization_settings settings
      where organization_id = ${q(organizationId)}::uuid;
    `)).toBe(businessSettingsAfterCreation);
  } finally {
    setRole("owner");
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

    const temporaryIdList = [...temporarySettingsIds];
    const remainingTemporarySettings = temporaryIdList.length === 0
      ? 0
      : Number(sql(`
          select count(*) from public.organization_settings
          where id in (${temporaryIdList.map((id) => `${q(id)}::uuid`).join(", ")});
        `));
    const verification = JSON.parse(sql(`
      select json_build_object(
        'temporary_settings', ${remainingTemporarySettings},
        'organization_settings_rows', (select count(*) from public.organization_settings
          where organization_id = ${q(organizationId)}::uuid),
        'role_changes', (select count(*) from public.memberships
          where id = ${q(membershipId)}::uuid and role <> 'owner'),
        'restored_exactly', (select count(*) from public.organization_settings settings
          where organization_id = ${q(organizationId)}::uuid
            and to_jsonb(settings) = ${q(originalSettingsJson)}::jsonb)
      )::text;
    `)) as Record<string, number>;
    expect(verification).toEqual({
      temporary_settings: 0,
      organization_settings_rows: 1,
      role_changes: 0,
      restored_exactly: 1,
    });
    console.info(JSON.stringify({
      fixturePrefix,
      fixtureCleanup: {
        createdSettingsIds: temporaryIdList,
        hardDeletedSettingsIds: temporaryIdList,
        verification,
      },
    }));
  }
});
