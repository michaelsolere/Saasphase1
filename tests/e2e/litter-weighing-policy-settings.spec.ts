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
const foreignOrganizationId = "9f210001-0000-4000-8000-000000000001";
const bornLitterId = "9f210001-0000-4000-8000-000000000011";
const unbornLitterId = "9f210001-0000-4000-8000-000000000012";

const customPolicy = {
  phases: [
    { startAgeDay: 0, endAgeDay: 6, intervalDays: 2 },
    { startAgeDay: 10, endAgeDay: 15, intervalDays: 3 },
  ],
};

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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function policySection(page: Page) {
  return page.locator("#litter-weighing-policy");
}

function currentPolicy() {
  const value = sql(`
    select coalesce(litter_weighing_schedule_policy::text, 'null')
    from public.organization_settings
    where organization_id = ${q(organizationId)}::uuid;
  `);
  return value ? JSON.parse(value) : undefined;
}

function settingsCount() {
  return Number(sql(`
    select count(*) from public.organization_settings
    where organization_id = ${q(organizationId)}::uuid;
  `));
}

function restorePolicyConstraint() {
  sql(`
    update public.organization_settings
    set litter_weighing_schedule_policy = null
    where organization_id = ${q(organizationId)}::uuid
      and not public.is_valid_litter_weighing_schedule_policy(
        litter_weighing_schedule_policy
      );
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'organization_settings_litter_weighing_schedule_policy_check'
          and conrelid = 'public.organization_settings'::regclass
      ) then
        alter table public.organization_settings
          add constraint organization_settings_litter_weighing_schedule_policy_check
          check (
            litter_weighing_schedule_policy is null
            or public.is_valid_litter_weighing_schedule_policy(
              litter_weighing_schedule_policy
            )
          );
      end if;
    end $$;
  `);
}

test("configure la cadence, sécurise les mutations et préserve les snapshots", async ({
  page,
}) => {
  const originalSettingsJson = sql(`
    select to_jsonb(settings)::text
    from public.organization_settings settings
    where organization_id = ${q(organizationId)}::uuid;
  `);
  expect(originalSettingsJson).toBeTruthy();

  try {
    restorePolicyConstraint();
    setRole("owner");
    sql(`
      delete from public.litters
      where id in (${q(bornLitterId)}::uuid, ${q(unbornLitterId)}::uuid);
      delete from public.organizations where id = ${q(foreignOrganizationId)}::uuid;

      insert into public.organizations (
        id, name, slug
      ) values (
        ${q(foreignOrganizationId)}, 'Organisation étrangère E2E',
        'e2e-litter-policy-foreign'
      );

      insert into public.litters (
        id, organization_id, name, species, breed, status,
        actual_birth_date, created_by, updated_by
      ) values
        (${q(bornLitterId)}, ${q(organizationId)}, 'Portée née cadence UI E2E',
         'dog', 'Golden Retriever', 'born', '2026-07-01', ${q(ownerId)}, ${q(ownerId)}),
        (${q(unbornLitterId)}, ${q(organizationId)}, 'Portée non née cadence UI E2E',
         'dog', 'Golden Retriever', 'birth_expected', null, ${q(ownerId)}, ${q(ownerId)});
    `);

    const bornSnapshotBefore = sql(`
      select litter_weighing_schedule_policy_snapshot::text
      from public.litters where id = ${q(bornLitterId)}::uuid;
    `);
    expect(JSON.parse(bornSnapshotBefore)).toMatchObject({ phases: expect.any(Array) });

    await login(page);

    // No active settings row: recommended is effective and reset is a no-op.
    sql(`delete from public.organization_settings where organization_id = ${q(organizationId)}::uuid;`);
    expect(settingsCount()).toBe(0);
    await page.goto("/settings/organization#litter-weighing-policy");
    let section = policySection(page);
    await expect(section.getByText("Cadence recommandée du logiciel", { exact: true })).toBeVisible();
    await expect(section.getByText("41 échéance(s)")).toBeVisible();
    await section.getByRole("button", { name: "Rétablir la cadence recommandée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=reset/);
    expect(settingsCount()).toBe(0);

    // First owner save creates the row and exposes the exact preview.
    section = policySection(page);
    await section.getByLabel("Fin en jours · phase 1").fill("6");
    await section.getByLabel("Intervalle en jours · phase 1").fill("2");
    await section.getByLabel("Début en jours · phase 2").fill("10");
    await section.getByLabel("Fin en jours · phase 2").fill("15");
    await section.getByLabel("Intervalle en jours · phase 2").fill("3");
    await expect(section.getByText("6 échéance(s)")).toBeVisible();
    await expect(section.getByTestId("litter-weighing-generated-days")).toHaveText(
      "J0 · J2 · J4 · J6 · J10 · J13",
    );
    await section.getByRole("button", { name: "Enregistrer la cadence personnalisée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=success/);
    expect(currentPolicy()).toEqual(customPolicy);
    expect(settingsCount()).toBe(1);

    await page.goto(`/litters/journal?litter=${unbornLitterId}`);
    await expect(page.getByTestId("litter-weighing-schedule-summary")).toContainText(
      "Cadence personnalisée de l’organisation",
    );
    await page.goto(`/litters/journal?litter=${bornLitterId}`);
    await expect(page.getByTestId("litter-weighing-schedule-summary")).toContainText(
      "Cadence figée pour cette portée",
    );
    expect(sql(`select litter_weighing_schedule_policy_snapshot::text from public.litters where id = ${q(bornLitterId)}::uuid;`))
      .toBe(bornSnapshotBefore);

    // Reset stores null and leaves the born litter strictly untouched.
    await page.goto("/settings/organization#litter-weighing-policy");
    await policySection(page).getByRole("button", { name: "Rétablir la cadence recommandée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=reset/);
    expect(currentPolicy()).toBeNull();
    expect(sql(`select litter_weighing_schedule_policy_snapshot::text from public.litters where id = ${q(bornLitterId)}::uuid;`))
      .toBe(bornSnapshotBefore);
    await page.goto(`/litters/journal?litter=${unbornLitterId}`);
    await expect(page.getByTestId("litter-weighing-schedule-summary")).toContainText(
      "Cadence recommandée du logiciel",
    );

    // A soft-deleted row is reactivated by an admin save.
    sql(`update public.organization_settings set deleted_at = now() where organization_id = ${q(organizationId)}::uuid;`);
    setRole("admin");
    await page.goto("/settings/organization#litter-weighing-policy");
    section = policySection(page);
    await section.getByLabel("Fin en jours · phase 1").fill("2");
    await section.getByRole("button", { name: "Supprimer la phase 2" }).click();
    await section.getByRole("button", { name: "Enregistrer la cadence personnalisée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=success/);
    expect(sql(`select (deleted_at is null)::text from public.organization_settings where organization_id = ${q(organizationId)}::uuid;`)).toBe("true");
    expect(currentPolicy()).toEqual({
      phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 1 }],
    });

    // Add/remove behavior, one-phase guard, canonical validation and 375 px layout.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/settings/organization#litter-weighing-policy");
    section = policySection(page);
    await expect(section.getByRole("button", { name: "Supprimer la phase 1" })).toBeDisabled();
    await section.getByRole("button", { name: "Ajouter une phase" }).click();
    await expect(section.getByRole("group", { name: "Phase 2" })).toBeVisible();
    await section.getByLabel("Début en jours · phase 2").fill("2");
    await expect(section.getByText("Les phases ne doivent pas se chevaucher.")).toBeVisible();
    await expect(section.getByRole("button", { name: "Enregistrer la cadence personnalisée" })).toBeDisabled();
    await section.getByLabel("Début en jours · phase 2").fill("4.5");
    await expect(section.getByText("Utilisez uniquement des jours entiers.")).toBeVisible();
    await section.getByRole("button", { name: "Supprimer la phase 2" }).click();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(0);

    // Member and viewer can read but not edit; forged in-page submissions fail.
    for (const role of ["member", "viewer"] as const) {
      setRole(role);
      expect(sql(`select role from public.memberships where id = ${q(membershipId)}::uuid;`)).toBe(role);
      await page.goto(`/settings/organization?role_check=${role}#litter-weighing-policy`);
      section = policySection(page);
      await expect(section.getByLabel("Début en jours · phase 1")).toBeDisabled();
      await expect(section.getByRole("button", { name: "Enregistrer la cadence personnalisée" })).toHaveCount(0);
      await expect(section).toContainText("lecture seule");

      setRole("owner");
      await page.goto(`/settings/organization?forge_check=${role}#litter-weighing-policy`);
      section = policySection(page);
      setRole(role);
      await section.locator('input[name="policy_json"]').evaluate((element) => {
        (element as HTMLInputElement).value = JSON.stringify({
          phases: [{ startAgeDay: 20, endAgeDay: 21, intervalDays: 1 }],
        });
      });
      await section.getByRole("button", { name: "Enregistrer la cadence personnalisée" }).click();
      await expect(page).toHaveURL(/litter_weighing_policy_status=error/);
      expect(currentPolicy()).toEqual({
        phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 1 }],
      });
    }

    // Foreign organization, malformed JSON and foreign properties are rejected.
    setRole("owner");
    await page.goto("/settings/organization#litter-weighing-policy");
    section = policySection(page);
    await section.locator('input[name="organization_id"]').evaluate(
      (element, value) => ((element as HTMLInputElement).value = value),
      foreignOrganizationId,
    );
    await section.getByRole("button", { name: "Enregistrer la cadence personnalisée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=error/);
    expect(Number(sql(`select count(*) from public.organization_settings where organization_id = ${q(foreignOrganizationId)}::uuid;`))).toBe(0);

    for (const forgedPolicy of ["{not-json", JSON.stringify({ ...customPolicy, extra: true })]) {
      await page.goto("/settings/organization#litter-weighing-policy");
      section = policySection(page);
      await section.locator('input[name="policy_json"]').evaluate(
        (element, value) => ((element as HTMLInputElement).value = value),
        forgedPolicy,
      );
      await section.getByRole("button", { name: "Enregistrer la cadence personnalisée" }).click();
      await expect(page).toHaveURL(/litter_weighing_policy_status=error/);
    }

    // Invalid persisted data is neutral, never injected, and repairable by reset.
    sql(`
      alter table public.organization_settings
        drop constraint organization_settings_litter_weighing_schedule_policy_check;
      update public.organization_settings
      set litter_weighing_schedule_policy = '{"phases":[]}'::jsonb
      where organization_id = ${q(organizationId)}::uuid;
    `);
    await page.goto("/settings/organization#litter-weighing-policy");
    section = policySection(page);
    await expect(section.getByText("État de configuration à corriger", { exact: true })).toBeVisible();
    await expect(section.getByText("La cadence enregistrée ne peut pas être lue.")).toBeVisible();
    await expect(section.getByLabel("Début en jours · phase 1")).toHaveValue("0");
    await expect(section.getByText("41 échéance(s)")).toBeVisible();
    await expect(section).not.toContainText(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    await section.getByRole("button", { name: "Rétablir la cadence recommandée" }).click();
    await expect(page).toHaveURL(/litter_weighing_policy_status=reset/);
    expect(currentPolicy()).toBeNull();
    restorePolicyConstraint();
  } finally {
    restorePolicyConstraint();
    setRole("owner");
    sql(`
      delete from public.litters
      where id in (${q(bornLitterId)}::uuid, ${q(unbornLitterId)}::uuid);
      delete from public.organization_settings
      where organization_id = ${q(organizationId)}::uuid;
      insert into public.organization_settings
      select restored.*
      from jsonb_populate_record(
        null::public.organization_settings,
        ${q(originalSettingsJson)}::jsonb
      ) restored;
      delete from public.organization_settings
      where organization_id = ${q(foreignOrganizationId)}::uuid;
      delete from public.organizations where id = ${q(foreignOrganizationId)}::uuid;
    `);

    const remaining = JSON.parse(sql(`
      select json_build_object(
        'litters', (select count(*) from public.litters
          where id in (${q(bornLitterId)}::uuid, ${q(unbornLitterId)}::uuid)),
        'foreign_settings', (select count(*) from public.organization_settings
          where organization_id = ${q(foreignOrganizationId)}::uuid),
        'foreign_organization', (select count(*) from public.organizations
          where id = ${q(foreignOrganizationId)}::uuid),
        'role_changes', (select count(*) from public.memberships
          where id = ${q(membershipId)}::uuid and role <> 'owner'),
        'restored_settings', (select count(*) from public.organization_settings
          where organization_id = ${q(organizationId)}::uuid)
      )::text;
    `)) as Record<string, number>;
    expect(remaining).toEqual({
      litters: 0,
      foreign_settings: 0,
      foreign_organization: 0,
      role_changes: 0,
      restored_settings: 1,
    });
    console.info(JSON.stringify({
      fixtureCleanup: {
        created: { bornLitterId, unbornLitterId, foreignOrganizationId },
        deleted: { bornLitterId, unbornLitterId, foreignOrganizationId },
        remaining,
      },
    }));
  }
});
