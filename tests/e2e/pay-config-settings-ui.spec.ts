import { expect, test, type Page } from "@playwright/test";

import {
  createTestPaidPreReservationScenario,
  registerActualDepositEffects,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { openDialog } from "./helpers/dialogs";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const foreignOrganizationId = "30000000-0000-4000-8000-000000000099";
const ownerId = "10000000-0000-4000-8000-000000000001";
const memberUserId = "9f170001-0000-4000-8000-000000000001";
const memberIdentityId = "9f170001-0000-4000-8000-000000000002";
const memberMembershipId = "9f170001-0000-4000-8000-000000000003";
const memberEmail = "pay-config-member@saasphase1.invalid";
const memberPassword = "PayConfigMember-2026!";

const sql = (statement: string) => runE2eSqlSync(statement);

type SettingsSnapshot = {
  default_pre_reservation_deposit_cents: number;
  default_arrhes_second_payment_cents: number;
  default_male_puppy_price_cents: number | null;
  default_female_puppy_price_cents: number | null;
  default_puppy_price_cents: number | null;
  pre_reservation_response_delay_days: number;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
};

function sqlLiteral(value: string | number | null) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function readSettingsSnapshot(): SettingsSnapshot {
  return JSON.parse(
    sql(`
      select json_build_object(
        'default_pre_reservation_deposit_cents', default_pre_reservation_deposit_cents,
        'default_arrhes_second_payment_cents', default_arrhes_second_payment_cents,
        'default_male_puppy_price_cents', default_male_puppy_price_cents,
        'default_female_puppy_price_cents', default_female_puppy_price_cents,
        'default_puppy_price_cents', default_puppy_price_cents,
        'pre_reservation_response_delay_days', pre_reservation_response_delay_days,
        'updated_at', updated_at,
        'updated_by', updated_by,
        'deleted_at', deleted_at
      )::text
      from public.organization_settings
      where organization_id = '${organizationId}'::uuid
    `),
  ) as SettingsSnapshot;
}

function restoreSettingsSnapshot(snapshot: SettingsSnapshot) {
  sql(`
    set session_replication_role = replica;

    update public.organization_settings
    set
      default_pre_reservation_deposit_cents = ${snapshot.default_pre_reservation_deposit_cents},
      default_arrhes_second_payment_cents = ${snapshot.default_arrhes_second_payment_cents},
      default_male_puppy_price_cents = ${sqlLiteral(snapshot.default_male_puppy_price_cents)},
      default_female_puppy_price_cents = ${sqlLiteral(snapshot.default_female_puppy_price_cents)},
      default_puppy_price_cents = ${sqlLiteral(snapshot.default_puppy_price_cents)},
      pre_reservation_response_delay_days = ${snapshot.pre_reservation_response_delay_days},
      updated_at = ${sqlLiteral(snapshot.updated_at)}::timestamptz,
      updated_by = ${sqlLiteral(snapshot.updated_by)}::uuid,
      deleted_at = ${sqlLiteral(snapshot.deleted_at)}::timestamptz
    where organization_id = '${organizationId}'::uuid;

    set session_replication_role = origin;
  `);
}

function cleanupMemberFixture() {
  const deleted = JSON.parse(
    sql(`
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

  sql(`
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
    sql(`
      select
        (select count(*) from public.memberships where id = '${memberMembershipId}'::uuid)
        + (select count(*) from public.profiles where id = '${memberUserId}'::uuid)
        + (select count(*) from auth.identities where user_id = '${memberUserId}'::uuid)
        + (select count(*) from auth.users where id = '${memberUserId}'::uuid);
    `),
  );
}

function createMemberFixture() {
  sql(`
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
      '{"display_name":"Pay Config Member E2E"}'::jsonb,
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

function cleanupForeignOrganization() {
  sql(`
    delete from public.organization_settings
    where organization_id = '${foreignOrganizationId}'::uuid;

    delete from public.organizations
    where id = '${foreignOrganizationId}'::uuid;
  `);
}

function createForeignOrganization() {
  cleanupForeignOrganization();
  sql(`
    insert into public.organizations (
      id, name, legal_name, legal_form, slug, email, country
    ) values (
      '${foreignOrganizationId}'::uuid,
      'Org étrangère PAY-CONFIG',
      'Org étrangère PAY-CONFIG',
      'other',
      'pay-config-foreign-${foreignOrganizationId.slice(0, 8)}',
      'foreign-pay-config@saasphase1.invalid',
      'FR'
    );

    insert into public.organization_settings (
      organization_id,
      default_pre_reservation_deposit_cents,
      default_arrhes_second_payment_cents,
      created_by,
      updated_by
    ) values (
      '${foreignOrganizationId}'::uuid,
      11100,
      22200,
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    );
  `);
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success|\/candidatures/);
}

async function loginMember(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(memberEmail);
  await page.getByLabel("Mot de passe").fill(memberPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

function preReservationField(page: Page) {
  return page.getByLabel("Premier versement — pré-réservation remboursable");
}

function complementField(page: Page) {
  return page.getByLabel("Deuxième versement — complément à la réservation");
}

test("PAY-CONFIG-02 payment settings UI validation security and deposit totals", async ({
  page,
}) => {
  test.setTimeout(180_000);

  cleanupMemberFixture();
  cleanupForeignOrganization();
  expect(countRemainingMemberFixture()).toBe(0);

  const originalSettings = readSettingsSnapshot();
  expect(originalSettings.default_pre_reservation_deposit_cents).toBe(25_000);
  expect(originalSettings.default_arrhes_second_payment_cents).toBe(25_000);
  expect(originalSettings.deleted_at).toBeNull();

  let deletedMemberFixture: Record<string, number> = {};
  let existingPaymentId: string | null = null;
  let existingPaymentAmount = 0;

  try {
    await withE2eFixtures(sql, async (fixtures) => {
      const supabase = await createAuthenticatedSupabaseClient();
      const suffix = fixtures.namespace.slice(-8);

      const existingScenario = await createTestPaidPreReservationScenario(
        sql,
        fixtures,
        {
          organizationId,
          ownerId,
          amountCents: 25_000,
          displayName: `E2E settings existing ${suffix}`,
        },
      );
      existingPaymentId = existingScenario.payment.id;
      existingPaymentAmount = existingScenario.payment.amountCents;

      await loginOwner(page);
      await page.goto("/payments/settings");
      await expect(
        page.getByRole("heading", { name: "Paramètres de paiement" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Pré-réservation et arrhes" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /Le premier versement est une pré-réservation remboursable/,
        ),
      ).toBeVisible();

      await expect(preReservationField(page)).toHaveValue("250.00");
      await expect(complementField(page)).toHaveValue("250.00");
      await expect(page.getByTestId("deposit-total-preview")).toContainText(
        /500[,.]00\s*€/,
      );

      await preReservationField(page).fill("300");
      await complementField(page).fill("400");
      await expect(page.getByTestId("deposit-total-preview")).toContainText(
        /700[,.]00\s*€/,
      );
      await expect(page.getByTestId("deposit-total-preview")).toContainText(
        /300[,.]00\s*€\s*\+\s*400[,.]00\s*€\s*=\s*700[,.]00\s*€/,
      );

      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=success/);
      await expect(page.getByRole("status")).toContainText(
        "Paramètres de paiement enregistrés.",
      );

      await expect(preReservationField(page)).toHaveValue("300.00");
      await expect(complementField(page)).toHaveValue("400.00");
      await expect(page.getByTestId("deposit-total-preview")).toContainText(
        /700[,.]00\s*€/,
      );
      await expect(
        page.getByRole("definition").filter({ hasText: /700[,.]00\s*€/ }).first(),
      ).toBeVisible();

      const savedSettings = readSettingsSnapshot();
      expect(savedSettings).toMatchObject({
        default_pre_reservation_deposit_cents: 30_000,
        default_arrhes_second_payment_cents: 40_000,
        deleted_at: null,
      });

      const existingPayment = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, amount_cents, status")
          .eq("id", existingPaymentId)
          .single(),
        "existing payment after settings change",
      );
      expect(existingPayment).toMatchObject({
        id: existingPaymentId,
        amount_cents: existingPaymentAmount,
        status: "paid",
      });

      const newScenario = await createTestPaidPreReservationScenario(sql, fixtures, {
        organizationId,
        ownerId,
        amountCents: 30_000,
        displayName: `E2E settings new ${suffix}`,
      });

      await page.goto(`/reservations/${newScenario.journey.id}`);
      await openDialog(
        page
          .locator("#reservation-details")
          .getByRole("button", { name: /Demander le complément 2\/2 — 400\s*€/ }),
        page.getByRole("heading", { name: /Créer le complément 2\/2 — 400\s*€/ }),
      );
      await page.getByRole("button", { name: "Confirmer la demande" }).click();
      await expect(page).toHaveURL(/balance_request_status=success/);

      const newPayments = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, amount_cents, status, payment_type")
          .eq("reservation_id", newScenario.journey.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        "payments after new configured complement",
      );
      expect(newPayments).toHaveLength(2);
      expect(newPayments[0]).toMatchObject({
        amount_cents: 30_000,
        status: "paid",
        payment_type: "pre_reservation_deposit_refundable",
      });
      expect(newPayments[1]).toMatchObject({
        amount_cents: 40_000,
        status: "requested",
        payment_type: "arrhes",
      });

      await registerActualDepositEffects(sql, fixtures, {
        organizationId,
        reservationId: newScenario.journey.id,
        contactId: newScenario.contact.id,
      });
      await registerActualDepositEffects(sql, fixtures, {
        organizationId,
        reservationId: existingScenario.journey.id,
        contactId: existingScenario.contact.id,
      });

      await page.goto("/payments/settings");
      await preReservationField(page).fill("0");
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=invalid_pre_reservation/);
      await expect(
        page.locator("section[role='alert']"),
      ).toContainText("Montant de pré-réservation invalide");
      expect(readSettingsSnapshot()).toMatchObject({
        default_pre_reservation_deposit_cents: 30_000,
        default_arrhes_second_payment_cents: 40_000,
      });

      await page.goto("/payments/settings");
      await preReservationField(page).fill("300");
      await complementField(page).fill("12.345");
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=invalid_complement/);
      await expect(
        page.locator("section[role='alert']"),
      ).toContainText("Complément d’arrhes invalide");
      expect(readSettingsSnapshot()).toMatchObject({
        default_pre_reservation_deposit_cents: 30_000,
        default_arrhes_second_payment_cents: 40_000,
      });

      createForeignOrganization();
      const foreignBefore = JSON.parse(
        sql(`
          select json_build_object(
            'default_pre_reservation_deposit_cents', default_pre_reservation_deposit_cents,
            'default_arrhes_second_payment_cents', default_arrhes_second_payment_cents
          )::text
          from public.organization_settings
          where organization_id = '${foreignOrganizationId}'::uuid
        `),
      ) as SettingsSnapshot;

      await page.goto("/payments/settings");
      await page.locator('input[name="organization_id"]').evaluate(
        (element, nextOrganizationId) => {
          (element as HTMLInputElement).value = nextOrganizationId;
        },
        foreignOrganizationId,
      );
      await preReservationField(page).fill("999");
      await complementField(page).fill("999");
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=error/);
      await expect(
        page.locator("section[role='alert']"),
      ).toContainText("Impossible d’enregistrer les paramètres");

      const foreignAfter = JSON.parse(
        sql(`
          select json_build_object(
            'default_pre_reservation_deposit_cents', default_pre_reservation_deposit_cents,
            'default_arrhes_second_payment_cents', default_arrhes_second_payment_cents
          )::text
          from public.organization_settings
          where organization_id = '${foreignOrganizationId}'::uuid
        `),
      ) as SettingsSnapshot;
      expect(foreignAfter).toEqual(foreignBefore);
      expect(readSettingsSnapshot()).toMatchObject({
        default_pre_reservation_deposit_cents: 30_000,
        default_arrhes_second_payment_cents: 40_000,
      });

      // Soft-delete while the form is still mounted, then submit — no false success.
      await page.goto("/payments/settings");
      await expect(preReservationField(page)).toBeVisible();
      sql(`
        update public.organization_settings
        set deleted_at = now()
        where organization_id = '${organizationId}'::uuid
      `);
      await preReservationField(page).fill("350");
      await complementField(page).fill("350");
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=error/);

      const softDeletedRow = JSON.parse(
        sql(`
          select json_build_object(
            'deleted_at_is_null', deleted_at is null,
            'default_pre_reservation_deposit_cents', default_pre_reservation_deposit_cents,
            'default_arrhes_second_payment_cents', default_arrhes_second_payment_cents
          )::text
          from public.organization_settings
          where organization_id = '${organizationId}'::uuid
        `),
      ) as {
        deleted_at_is_null: boolean;
        default_pre_reservation_deposit_cents: number;
        default_arrhes_second_payment_cents: number;
      };
      expect(softDeletedRow.deleted_at_is_null).toBe(false);
      expect(softDeletedRow.default_pre_reservation_deposit_cents).toBe(30_000);
      expect(softDeletedRow.default_arrhes_second_payment_cents).toBe(40_000);

      sql(`
        update public.organization_settings
        set deleted_at = null
        where organization_id = '${organizationId}'::uuid
      `);

      await page.goto("/payments/settings");
      await expect(
        page.getByRole("heading", { name: "Paramètres de paiement indisponibles" }),
      ).toHaveCount(0);
      await expect(preReservationField(page)).toHaveValue("300.00");

      createMemberFixture();
      await page.getByRole("button", { name: "Se déconnecter" }).click();
      await expect(page).toHaveURL(/\/login/);
      await loginMember(page);

      await page.goto("/payments/settings");
      await expect(preReservationField(page)).toBeDisabled();
      await expect(complementField(page)).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Enregistrer les paramètres" }),
      ).toBeDisabled();
      await expect(
        page.getByText(
          /Seuls les propriétaires et administrateurs peuvent modifier/,
        ),
      ).toBeVisible();

      await preReservationField(page).evaluate((element) =>
        element.removeAttribute("disabled"),
      );
      await complementField(page).evaluate((element) =>
        element.removeAttribute("disabled"),
      );
      await page.locator("form input:disabled").evaluateAll((elements) => {
        for (const element of elements) {
          element.removeAttribute("disabled");
        }
      });
      await page
        .getByRole("button", { name: "Enregistrer les paramètres" })
        .evaluate((element) => element.removeAttribute("disabled"));
      await preReservationField(page).fill("999");
      await complementField(page).fill("999");
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=error/);

      expect(readSettingsSnapshot()).toMatchObject({
        default_pre_reservation_deposit_cents: 30_000,
        default_arrhes_second_payment_cents: 40_000,
        deleted_at: null,
      });

      // Restore canonical 250 + 250 via owner for remaining assertions.
      await page.getByRole("button", { name: "Se déconnecter" }).click();
      await loginOwner(page);
      await page.goto("/payments/settings");
      await preReservationField(page).fill("250");
      await complementField(page).fill("250");
      await expect(page.getByTestId("deposit-total-preview")).toContainText(
        /500[,.]00\s*€/,
      );
      await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
      await expect(page).toHaveURL(/settings_status=success/);
      expect(readSettingsSnapshot()).toMatchObject({
        default_pre_reservation_deposit_cents: 25_000,
        default_arrhes_second_payment_cents: 25_000,
      });
    });
  } finally {
    restoreSettingsSnapshot(originalSettings);
    expect(readSettingsSnapshot()).toEqual(originalSettings);

    deletedMemberFixture = cleanupMemberFixture();
    expect(countRemainingMemberFixture()).toBe(0);
    cleanupForeignOrganization();

    const remainingForeign = Number(
      sql(`
        select
          (select count(*) from public.organization_settings where organization_id = '${foreignOrganizationId}'::uuid)
          + (select count(*) from public.organizations where id = '${foreignOrganizationId}'::uuid);
      `),
    );
    expect(remainingForeign).toBe(0);

    const remainingE2ePercent = Number(
      sql(`
        select count(*) from public.contacts
        where organization_id = '${organizationId}'::uuid
          and display_name like 'E2E settings %';
      `),
    );
    expect(remainingE2ePercent).toBe(0);

    console.info(
      JSON.stringify({
        fixtureCleanup: {
          restoredOrganizationSettings: true,
          deletedMemberFixture,
          foreignOrganizationRemaining: remainingForeign,
          remainingE2eSettingsContacts: remainingE2ePercent,
          existingPaymentPreserved: {
            id: existingPaymentId,
            amountCents: existingPaymentAmount,
          },
        },
      }),
    );
  }
});
