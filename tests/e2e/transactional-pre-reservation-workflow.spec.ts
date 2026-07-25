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

test("pre-reservation payment transitions the adopter journey through the real RPC", async ({ page }) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E paiement pilote ${suffix}`,
    });
    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation étrangère ${suffix}`,
    });
    const foreignScenario = await createTestPreReservationScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      amountCents: 99_900,
      displayName: `E2E paiement étranger ${suffix}`,
    });

    await login(page);
    await page.goto(`/candidatures/${scenario.application.id}`);
    await expect(page.getByText("Pré-réservation en attente de règlement")).toBeVisible();
    await expect(page.getByText("250,00 €", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Marquer la pré-réservation de 250,00 € comme payée/ })).toBeVisible();

    await page.goto("/payments");
    await expect(page.getByText(`E2E paiement étranger ${suffix}`)).toHaveCount(0);
    await expect(page.getByText("999,00 €", { exact: false })).toHaveCount(0);
    const hiddenForeignPayment = await supabase
      .from("payments")
      .select("id")
      .eq("id", foreignScenario.payment.id)
      .maybeSingle();
    expect(hiddenForeignPayment.error).toBeNull();
    expect(hiddenForeignPayment.data).toBeNull();

    await page.goto(`/candidatures/${scenario.application.id}`);
    await page.getByRole("button", { name: /Marquer la pré-réservation de 250,00 € comme payée/ }).click();
    await page.getByRole("button", { name: "Confirmer le règlement" }).click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${scenario.journey.id}`));
    await expect(page.getByRole("heading", { name: `Parcours adoptant de E2E paiement pilote ${suffix}` })).toBeVisible();

    const paymentAfter = expectSupabaseData(await supabase.from("payments").select("id,status,amount_cents,paid_at").eq("reservation_id", scenario.journey.id).is("deleted_at", null), "read received pre-reservation payment");
    expect(paymentAfter).toHaveLength(1);
    expect(paymentAfter[0]).toMatchObject({ id: scenario.payment.id, status: "paid", amount_cents: 25_000 });
    expect(paymentAfter[0].paid_at).not.toBeNull();
    const reservationAfter = expectSupabaseData(await supabase.from("reservations").select("status").eq("id", scenario.journey.id).maybeSingle(), "read transitioned adopter journey");
    expect(reservationAfter?.status).toBe("pre_reservation_paid");
    const rolesAfter = expectSupabaseData(await supabase.from("contact_roles").select("id,role,is_active,ended_at").eq("contact_id", scenario.contact.id).is("deleted_at", null).order("created_at"), "read automated contact roles");
    expect(rolesAfter.filter((role) => role.is_active).map((role) => role.role)).toEqual(["pre_reservation_holder"]);
    expect(rolesAfter.find((role) => role.role === "candidate")).toMatchObject({ is_active: false });
    expect(rolesAfter.find((role) => role.role === "candidate")?.ended_at).not.toBeNull();
    await registerActualPaymentEffects(sql, fixtures, { organizationId, reservationId: scenario.journey.id, contactId: scenario.contact.id, paymentId: scenario.payment.id });

    const replay = await supabase.rpc("mark_pre_reservation_payment_paid", { p_payment_id: scenario.payment.id, p_paid_at: "2026-07-25T12:00:00.000Z", p_payment_method: "bank_transfer" });
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]?.outcome).toBe("already_paid");
    const afterReplayPayments = expectSupabaseData(await supabase.from("payments").select("id,amount_cents").eq("reservation_id", scenario.journey.id).is("deleted_at", null), "read payment after idempotent replay");
    const afterReplayRoles = expectSupabaseData(await supabase.from("contact_roles").select("id,role,is_active").eq("contact_id", scenario.contact.id).is("deleted_at", null), "read roles after idempotent replay");
    expect(afterReplayPayments).toEqual([{ id: scenario.payment.id, amount_cents: 25_000 }]);
    expect(afterReplayRoles.filter((role) => role.role === "pre_reservation_holder")).toHaveLength(1);

    await page.reload();
    await expect(page.getByRole("heading", { name: `Parcours adoptant de E2E paiement pilote ${suffix}` })).toBeVisible();
    expect((await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id).is("deleted_at", null)).data).toHaveLength(1);
  });
});
