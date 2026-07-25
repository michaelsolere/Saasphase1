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
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);

type SettingsSnapshot = {
  default_pre_reservation_deposit_cents: number;
  default_arrhes_second_payment_cents: number;
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

function readSettingsSnapshot(): SettingsSnapshot {
  return JSON.parse(
    sql(
      `select json_build_object(
         'default_pre_reservation_deposit_cents', default_pre_reservation_deposit_cents,
         'default_arrhes_second_payment_cents', default_arrhes_second_payment_cents
       )::text
       from public.organization_settings
       where organization_id = '${organizationId}'::uuid
         and deleted_at is null`,
    ),
  ) as SettingsSnapshot;
}

function writeDepositSettings(preCents: number, secondCents: number) {
  sql(
    `update public.organization_settings
     set default_pre_reservation_deposit_cents = ${preCents},
         default_arrhes_second_payment_cents = ${secondCents},
         updated_by = '${ownerId}'::uuid,
         updated_at = now()
     where organization_id = '${organizationId}'::uuid
       and deleted_at is null`,
  );
}

function restoreDepositSettings(snapshot: SettingsSnapshot) {
  writeDepositSettings(
    snapshot.default_pre_reservation_deposit_cents,
    snapshot.default_arrhes_second_payment_cents,
  );
}

test("configured organization uses 300 + 400 = 700 euro deposit path", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const settingsSnapshot = readSettingsSnapshot();

  try {
    await withE2eFixtures(sql, async (fixtures) => {
      writeDepositSettings(30_000, 40_000);
      const supabase = await createAuthenticatedSupabaseClient();
      const suffix = fixtures.namespace.slice(-8);

      const scenario = await createTestPaidPreReservationScenario(sql, fixtures, {
        organizationId,
        ownerId,
        amountCents: 30_000,
        displayName: `E2E config 700 ${suffix}`,
      });

      const rolesBefore = expectSupabaseData(
        await supabase
          .from("contact_roles")
          .select("id, role, is_active")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null),
        "roles before complement at 300 euro",
      );
      expect(rolesBefore.filter((role) => role.is_active).map((role) => role.role)).toEqual([
        "pre_reservation_holder",
      ]);
      expect(rolesBefore.filter((role) => role.role === "reservation_holder")).toHaveLength(0);

      await login(page);
      await page.goto(`/reservations/${scenario.journey.id}`);
      await expect(
        page.getByRole("heading", {
          name: `Parcours adoptant de E2E config 700 ${suffix}`,
        }),
      ).toBeVisible();
      await expect(page.getByText("250 €")).toHaveCount(0);
      await expect(page.getByText("500 €")).toHaveCount(0);

      await openDialog(
        page
          .locator("#reservation-details")
          .getByRole("button", { name: /Demander le complément 2\/2 — 400\s*€/ }),
        page.getByRole("heading", { name: /Créer le complément 2\/2 — 400\s*€/ }),
      );
      await page.getByRole("button", { name: "Confirmer la demande" }).click();
      await expect(page).toHaveURL(/balance_request_status=success/);
      await expect(page.getByText(/Le complément 2\/2 — 400\s*€ a bien été créé/)).toBeVisible();

      const afterRequest = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, amount_cents, status, payment_type")
          .eq("reservation_id", scenario.journey.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        "payments after configured complement request",
      );
      expect(afterRequest).toHaveLength(2);
      expect(afterRequest[0]).toMatchObject({
        id: scenario.payment.id,
        amount_cents: 30_000,
        status: "paid",
        payment_type: "pre_reservation_deposit_refundable",
      });
      expect(afterRequest[1]).toMatchObject({
        amount_cents: 40_000,
        status: "requested",
        payment_type: "arrhes",
      });

      const rolesMid = expectSupabaseData(
        await supabase
          .from("contact_roles")
          .select("role, is_active")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null),
        "roles after complement request only",
      );
      expect(rolesMid.filter((role) => role.is_active).map((role) => role.role)).toEqual([
        "pre_reservation_holder",
      ]);

      await page.goto(`/reservations/${scenario.journey.id}`);
      await expect(page.getByText(/Complément 2\/2 — 400\s*€ demandé/)).toBeVisible();
      await openDialog(
        page.getByRole("button", { name: "Marquer payé" }).first(),
        page.getByRole("heading", { name: "Confirmer le paiement reçu" }),
      );
      await page.getByRole("button", { name: "Confirmer le paiement" }).click();
      await expect(page).toHaveURL(/payment_mark_status=success/);

      const afterPaid = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, amount_cents, status, payment_type")
          .eq("reservation_id", scenario.journey.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        "payments after configured complement paid",
      );
      expect(afterPaid).toHaveLength(2);
      expect(afterPaid.every((payment) => payment.status === "paid")).toBe(true);
      expect(afterPaid.reduce((total, payment) => total + payment.amount_cents, 0)).toBe(
        70_000,
      );

      const rolesAfter = expectSupabaseData(
        await supabase
          .from("contact_roles")
          .select("id, role, is_active, ended_at")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null)
          .order("created_at"),
        "roles after 700 euro complete",
      );
      expect(rolesAfter.filter((role) => role.is_active).map((role) => role.role)).toEqual([
        "reservation_holder",
      ]);
      expect(
        rolesAfter.find((role) => role.role === "pre_reservation_holder"),
      ).toMatchObject({
        id: scenario.holderRoleId,
        is_active: false,
      });

      await page.goto(`/reservations/${scenario.journey.id}`);
      await expect(page.getByText("Arrhes complètes", { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/700\s*€/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Demander le complément/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);
      await expect(page.getByText("250 €")).toHaveCount(0);
      await expect(page.getByText("500 €")).toHaveCount(0);

      await registerActualDepositEffects(sql, fixtures, {
        organizationId,
        reservationId: scenario.journey.id,
        contactId: scenario.contact.id,
      });
    });
  } finally {
    restoreDepositSettings(settingsSnapshot);
    const restored = readSettingsSnapshot();
    expect(restored).toEqual(settingsSnapshot);
  }
});

test("default organization still uses 250 + 250 = 500 euro labels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E défaut 500 ${suffix}`,
    });

    await login(page);
    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page
        .locator("#reservation-details")
        .getByRole("button", { name: /Demander le complément 2\/2 — 250\s*€/ }),
    ).toBeVisible();

    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
  });
});
