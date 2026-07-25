import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestPreReservationScenario,
  registerActualPaymentEffects,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

test("marks a 250 euro pre-reservation payment as paid from the payment detail page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E paiement détail ${suffix}`,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation paiement détail étrangère ${suffix}`,
    });
    const foreign = await createTestPreReservationScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E paiement détail étranger ${suffix}`,
    });

    const beforePayment = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, status, amount_cents, paid_at, payment_type, reservation_id")
        .eq("id", scenario.payment.id)
        .maybeSingle(),
      "read payment before mark",
    );
    expect(beforePayment).toMatchObject({
      id: scenario.payment.id,
      status: "requested",
      amount_cents: 25_000,
      paid_at: null,
      reservation_id: scenario.journey.id,
    });

    await login(page);

    const hiddenForeign = await supabase
      .from("payments")
      .select("id")
      .eq("id", foreign.payment.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", { name: "Demande de pré-réservation", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`E2E paiement détail ${suffix}`).first()).toBeVisible();
    await expect(page.getByText(`E2E paiement détail étranger ${suffix}`)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Consulter la fiche Paiement" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Consulter la fiche Paiement" }).click();
    await expect(page).toHaveURL(new RegExp(`/payments/${scenario.payment.id}`));
    await expect(page.getByRole("heading", { name: "Marquer comme payé" })).toBeVisible();
    await page.locator('input[name="paid_date"]').fill("2026-07-25");
    await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
    await expect(page).toHaveURL(/payment_mark_status=success/);

    const afterPayment = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, status, amount_cents, paid_at, payment_type")
        .eq("id", scenario.payment.id)
        .maybeSingle(),
      "read payment after mark",
    );
    expect(afterPayment).toMatchObject({
      id: scenario.payment.id,
      status: "paid",
      amount_cents: 25_000,
    });
    expect(afterPayment?.paid_at).not.toBeNull();

    const journeyAfter = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, contact_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after payment detail mark",
    );
    expect(journeyAfter).toMatchObject({
      id: scenario.journey.id,
      status: "pre_reservation_paid",
      contact_id: scenario.contact.id,
    });

    const rolesAfter = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles after payment detail mark",
    );
    expect(rolesAfter.filter((role) => role.is_active).map((role) => role.role)).toEqual([
      "pre_reservation_holder",
    ]);
    expect(rolesAfter.find((role) => role.role === "candidate")).toMatchObject({
      is_active: false,
    });

    expect(
      expectSupabaseData(
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "no duplicate payments",
      ),
    ).toHaveLength(1);

    await registerActualPaymentEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      paymentId: scenario.payment.id,
    });

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E paiement détail ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText("Pré-réservation réglée", { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pré-réservation réglée", { exact: true }).first()).toBeVisible();
    expect(
      expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, status, amount_cents")
          .eq("id", scenario.payment.id)
          .maybeSingle(),
        "payment persisted after reload",
      ),
    ).toMatchObject({ id: scenario.payment.id, status: "paid", amount_cents: 25_000 });
  });
});
