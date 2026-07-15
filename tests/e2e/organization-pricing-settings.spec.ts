import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const memberUserId = "9f160001-0000-4000-8000-000000000001";
const memberIdentityId = "9f160001-0000-4000-8000-000000000002";
const memberMembershipId = "9f160001-0000-4000-8000-000000000003";
const memberEmail = "pricing-member@saasphase1.invalid";
const memberPassword = "PricingMember-2026!";

const settingsColumns =
  "default_male_puppy_price_cents, default_female_puppy_price_cents, default_puppy_price_cents, default_currency, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents, pre_reservation_response_delay_days, settings_json, updated_at, updated_by";

function sqlLiteral(value: string | number | null) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function formatEuroInputValue(valueCents: number | null) {
  return valueCents === null ? "" : (valueCents / 100).toFixed(2);
}

function cleanupMemberFixture() {
  const deleted = JSON.parse(
    runE2eSqlSync(`
      select json_build_object(
        'memberships', (
          select count(*) from public.memberships
          where id = '${memberMembershipId}'::uuid
        ),
        'auth_identities', (
          select count(*) from auth.identities
          where user_id = '${memberUserId}'::uuid
        ),
        'auth_users', (
          select count(*) from auth.users
          where id = '${memberUserId}'::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;

  runE2eSqlSync(`
    delete from public.memberships
    where id = '${memberMembershipId}'::uuid;

    delete from auth.identities
    where user_id = '${memberUserId}'::uuid;

    delete from auth.users
    where id = '${memberUserId}'::uuid;
  `);

  return deleted;
}

function countRemainingMemberFixture() {
  return Number(
    runE2eSqlSync(`
      select
        (select count(*) from public.memberships where id = '${memberMembershipId}'::uuid)
        + (select count(*) from public.profiles where id = '${memberUserId}'::uuid)
        + (select count(*) from auth.identities where user_id = '${memberUserId}'::uuid)
        + (select count(*) from auth.users where id = '${memberUserId}'::uuid);
    `),
  );
}

function createMemberFixture() {
  runE2eSqlSync(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '${memberUserId}'::uuid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      '${memberEmail}',
      extensions.crypt('${memberPassword}', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Pricing Member E2E"}'::jsonb,
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      '${memberIdentityId}'::uuid,
      '${memberEmail}',
      '${memberUserId}'::uuid,
      jsonb_build_object(
        'sub', '${memberUserId}',
        'email', '${memberEmail}',
        'email_verified', true,
        'phone_verified', false
      ),
      'email', now(), now()
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      '${memberMembershipId}'::uuid,
      '${organizationId}'::uuid,
      '${memberUserId}'::uuid,
      'member',
      'active',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    );
  `);
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("edits animal prices without changing other organization settings", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const supabase = await createAuthenticatedSupabaseClient();
  let originalSettings:
    | Awaited<ReturnType<typeof readSettings>>
    | null = null;

  async function readSettings() {
    return expectSupabaseData(
      await supabase
        .from("organization_settings")
        .select(settingsColumns)
        .eq("organization_id", organizationId)
        .single(),
      "read organization price settings",
    );
  }

  try {
    cleanupMemberFixture();
    expect(countRemainingMemberFixture()).toBe(0);
    originalSettings = await readSettings();
    await loginOwner(page);

    await page.goto("/settings/organization#animal-prices");
    await expect(
      page.getByRole("heading", { name: "Tarifs des animaux" }),
    ).toBeVisible();
    await expect(page.getByLabel("Tarif mâle")).toHaveValue(
      formatEuroInputValue(
        originalSettings.default_male_puppy_price_cents,
      ),
    );
    await expect(page.getByLabel("Tarif femelle")).toHaveValue(
      formatEuroInputValue(
        originalSettings.default_female_puppy_price_cents,
      ),
    );
    await expect(page.getByLabel("Tarif générique de secours")).toHaveValue(
      formatEuroInputValue(originalSettings.default_puppy_price_cents),
    );

    await page.getByLabel("Tarif mâle").fill("1810,50");
    await page.getByLabel("Tarif femelle").fill("2020.75");
    await page.getByLabel("Tarif générique de secours").fill("1900.00");
    await page.getByRole("button", { name: "Enregistrer les tarifs" }).click();
    await expect(page).toHaveURL(/animal_prices_status=success/);
    await expect(page.getByRole("status")).toContainText(
      "Les tarifs des animaux ont bien été mis à jour.",
    );

    const savedSettings = await readSettings();
    expect(savedSettings).toMatchObject({
      default_male_puppy_price_cents: 181050,
      default_female_puppy_price_cents: 202075,
      default_puppy_price_cents: 190000,
    });
    expect({
      default_currency: savedSettings.default_currency,
      default_pre_reservation_deposit_cents:
        savedSettings.default_pre_reservation_deposit_cents,
      default_arrhes_second_payment_cents:
        savedSettings.default_arrhes_second_payment_cents,
      pre_reservation_response_delay_days:
        savedSettings.pre_reservation_response_delay_days,
      settings_json: savedSettings.settings_json,
    }).toEqual({
      default_currency: originalSettings.default_currency,
      default_pre_reservation_deposit_cents:
        originalSettings.default_pre_reservation_deposit_cents,
      default_arrhes_second_payment_cents:
        originalSettings.default_arrhes_second_payment_cents,
      pre_reservation_response_delay_days:
        originalSettings.pre_reservation_response_delay_days,
      settings_json: originalSettings.settings_json,
    });

    await page.goto("/settings/organization#animal-prices");
    await page.getByLabel("Tarif générique de secours").fill("");
    await expect(page.getByLabel("Tarif générique de secours")).toHaveValue("");
    await page.getByRole("button", { name: "Enregistrer les tarifs" }).click();
    await expect(page).toHaveURL(/animal_prices_status=success/);
    const settingsWithNullGenericPrice = await readSettings();
    expect(settingsWithNullGenericPrice).toMatchObject({
      default_male_puppy_price_cents: 181050,
      default_female_puppy_price_cents: 202075,
      default_puppy_price_cents: null,
    });

    await page.getByLabel("Tarif mâle").fill("12.345");
    await page.getByRole("button", { name: "Enregistrer les tarifs" }).click();
    await expect(page).toHaveURL(/animal_prices_status=error/);
    expect(await readSettings()).toEqual(settingsWithNullGenericPrice);

    createMemberFixture();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Mot de passe").fill(memberPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto("/settings/organization#animal-prices");
    await expect(page.getByLabel("Tarif mâle")).toBeDisabled();
    await expect(page.getByLabel("Tarif femelle")).toBeDisabled();
    await expect(page.getByLabel("Tarif générique de secours")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Enregistrer les tarifs" }),
    ).toBeDisabled();

    await page
      .getByLabel("Tarif mâle")
      .evaluate((element) => element.removeAttribute("disabled"));
    await page
      .getByLabel("Tarif femelle")
      .evaluate((element) => element.removeAttribute("disabled"));
    await page
      .getByLabel("Tarif générique de secours")
      .evaluate((element) => element.removeAttribute("disabled"));
    await page.getByLabel("Tarif mâle").fill("999.00");
    await page
      .getByRole("button", { name: "Enregistrer les tarifs" })
      .evaluate((element) => element.removeAttribute("disabled"));
    await page.getByRole("button", { name: "Enregistrer les tarifs" }).click();
    await expect(page).toHaveURL(/animal_prices_status=error/);
  } finally {
    let deletedMemberFixture: Record<string, number> = {};

    if (originalSettings) {
      runE2eSqlSync(`
        set session_replication_role = replica;

        update public.organization_settings
        set
          default_male_puppy_price_cents = ${sqlLiteral(originalSettings.default_male_puppy_price_cents)},
          default_female_puppy_price_cents = ${sqlLiteral(originalSettings.default_female_puppy_price_cents)},
          default_puppy_price_cents = ${sqlLiteral(originalSettings.default_puppy_price_cents)},
          updated_at = ${sqlLiteral(originalSettings.updated_at)}::timestamptz,
          updated_by = ${sqlLiteral(originalSettings.updated_by)}::uuid
        where organization_id = '${organizationId}'::uuid;

        set session_replication_role = origin;
      `);

      expect(await readSettings()).toEqual(originalSettings);
    }

    deletedMemberFixture = cleanupMemberFixture();
    expect(countRemainingMemberFixture()).toBe(0);

    const remaining = JSON.parse(
      runE2eSqlSync(`
        select json_build_object(
          'organization_settings_rows', (
            select count(*)
            from public.organization_settings
            where organization_id = '${organizationId}'::uuid
          ),
          'member_fixture_rows', (
            select count(*) from public.memberships where id = '${memberMembershipId}'::uuid
          ) + (
            select count(*) from public.profiles where id = '${memberUserId}'::uuid
          ) + (
            select count(*) from auth.identities where user_id = '${memberUserId}'::uuid
          ) + (
            select count(*) from auth.users where id = '${memberUserId}'::uuid
          )
        )::text;
      `),
    ) as Record<string, number>;

    expect(remaining).toEqual({
      organization_settings_rows: 1,
      member_fixture_rows: 0,
    });

    console.info(
      JSON.stringify({
        fixtureCleanup: {
          created: {
            authUser: memberUserId,
            authIdentity: memberIdentityId,
            membership: memberMembershipId,
          },
          deleted: deletedMemberFixture,
          restoredOrganizationSettings: Boolean(originalSettings),
          remaining,
        },
      }),
    );
  }
});
