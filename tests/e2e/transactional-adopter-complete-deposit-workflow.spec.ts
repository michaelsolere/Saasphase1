import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestPaidPreReservationScenario,
  createTestPreReservationScenario,
  createTestReceivedPayment,
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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

test("modern refundable deposit enables complement then reaches complete 500 euro", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E arrhes complètes ${suffix}`,
    });
    expect(scenario.paymentType).toBe("pre_reservation_deposit_refundable");

    const unpaidFirst = await createTestPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E complément bloqué ${suffix}`,
      paymentType: "pre_reservation_deposit_refundable",
    });

    const alreadyComplete = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 50_000,
      displayName: `E2E déjà complètes ${suffix}`,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation arrhes étrangères ${suffix}`,
    });
    const foreign = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E arrhes étrangères ${suffix}`,
    });

    const rolesBefore = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "roles before complement",
    );
    expect(rolesBefore).toHaveLength(1);
    expect(rolesBefore[0]).toMatchObject({
      id: scenario.holderRoleId,
      role: "pre_reservation_holder",
      is_active: true,
    });

    await login(page);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${unpaidFirst.journey.id}`);
    await expect(page.getByRole("button", { name: /Demander le complément/ })).toHaveCount(0);

    await page.goto(`/reservations/${alreadyComplete.journey.id}`);
    await expect(page.getByText("Arrhes complètes", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Demander le complément/ })).toHaveCount(0);

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E arrhes complètes ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E arrhes étrangères ${suffix}`)).toHaveCount(0);
    await expect(page.getByText("Pré-réservation réglée", { exact: true }).first()).toBeVisible();

    await openDialog(
      page
        .locator("#reservation-details")
        .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
      page.getByRole("heading", { name: "Créer le complément 2/2 — 250 € ?" }),
    );
    await expect(
      page.getByText(
        "Cette action crée uniquement une demande de paiement en statut demandé. Elle ne change pas le statut de réservation, n’attribue aucun animal, ne finalise pas l’adoption et n’envoie aucun email.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la demande" }).click();
    await expect(page).toHaveURL(/balance_request_status=success/);
    await expect(page.getByText("Le complément 2/2 — 250 € a bien été créé.")).toBeVisible();

    const afterRequest = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, status, payment_type, paid_at, notes")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      "payments after complement request",
    );
    expect(afterRequest).toHaveLength(2);
    expect(afterRequest[0]).toMatchObject({
      id: scenario.payment.id,
      amount_cents: 25_000,
      status: "paid",
      payment_type: "pre_reservation_deposit_refundable",
    });
    const complement = afterRequest.find(
      (payment) => payment.id !== scenario.payment.id && payment.status === "requested",
    );
    expect(complement).toMatchObject({
      amount_cents: 25_000,
      payment_type: "arrhes",
      paid_at: null,
    });
    expect(complement?.notes ?? "").toMatch(/Demande 2\/2/);

    const journeyUnchanged = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "journey unchanged by complement request",
    );
    expect(journeyUnchanged).toMatchObject({
      id: scenario.journey.id,
      status: "pre_reservation_paid",
      animal_id: null,
    });

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(page.getByText("Complément 2/2 — 250 € demandé.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Demander le complément/ })).toHaveCount(0);

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
      "payments after complement paid",
    );
    expect(afterPaid).toHaveLength(2);
    expect(afterPaid.every((payment) => payment.status === "paid")).toBe(true);
    expect(afterPaid.reduce((total, payment) => total + payment.amount_cents, 0)).toBe(50_000);
    expect(afterPaid.map((payment) => payment.payment_type).sort()).toEqual([
      "arrhes",
      "pre_reservation_deposit_refundable",
    ]);

    const rolesAfter = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "roles after complete deposit",
    );
    // Real implementation: complete deposit does not promote reservation_holder.
    expect(rolesAfter.filter((role) => role.is_active).map((role) => role.role)).toEqual([
      "pre_reservation_holder",
    ]);
    expect(rolesAfter.filter((role) => role.role === "reservation_holder")).toHaveLength(0);
    expect(rolesAfter).toHaveLength(1);

    const journeyAfter = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "journey after complete deposit",
    );
    expect(journeyAfter).toMatchObject({
      id: scenario.journey.id,
      status: "pre_reservation_paid",
      animal_id: null,
      contact_id: scenario.contact.id,
    });

    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "no documents created",
      ),
    ).toHaveLength(0);

    const emailCount = Number(
      sql(
        `select count(*)::text from public.email_delivery_attempts where reservation_id = '${scenario.journey.id}'::uuid`,
      ),
    );
    expect(emailCount).toBe(0);

    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: unpaidFirst.journey.id,
      contactId: unpaidFirst.contact.id,
    });
    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: alreadyComplete.journey.id,
      contactId: alreadyComplete.contact.id,
    });

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(page.getByText("Arrhes complètes réglées", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Arrhes complètes", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Demander le complément/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Arrhes complètes réglées", { exact: true }).first()).toBeVisible();
    expect(
      expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, status, amount_cents")
          .eq("reservation_id", scenario.journey.id)
          .is("deleted_at", null),
        "payments persisted after reload",
      ),
    ).toHaveLength(2);
  });
});

test("historical arrhes first deposit still enables complement request", async ({ page }) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E historique arrhes ${suffix}`,
      paymentType: "arrhes",
    });

    await login(page);
    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page
        .locator("#reservation-details")
        .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
    ).toBeVisible();

    await openDialog(
      page
        .locator("#reservation-details")
        .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
      page.getByRole("heading", { name: "Créer le complément 2/2 — 250 € ?" }),
    );
    await page.getByRole("button", { name: "Confirmer la demande" }).click();
    await expect(page).toHaveURL(/balance_request_status=success/);

    const supabase = await createAuthenticatedSupabaseClient();
    const payments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, status, payment_type")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      "historical arrhes complement",
    );
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({
      id: scenario.payment.id,
      payment_type: "arrhes",
      status: "paid",
      amount_cents: 25_000,
    });
    expect(payments[1]).toMatchObject({
      payment_type: "arrhes",
      status: "requested",
      amount_cents: 25_000,
    });

    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
  });
});

test("cancelled complement allows a new active complement request", async ({ page }) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestPaidPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E complément annulé ${suffix}`,
    });
    const cancelledComplement = await createTestReceivedPayment(sql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
      paymentType: "arrhes",
    });
    await sql(
      `update public.payments
       set status = 'cancelled',
           paid_at = null,
           updated_by = '${ownerId}'::uuid
       where id = '${cancelledComplement.id}'::uuid
         and organization_id = '${organizationId}'::uuid`,
    );

    await login(page);
    await page.goto(`/reservations/${scenario.journey.id}`);
    await openDialog(
      page
        .locator("#reservation-details")
        .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
      page.getByRole("heading", { name: "Créer le complément 2/2 — 250 € ?" }),
    );
    await page.getByRole("button", { name: "Confirmer la demande" }).click();
    await expect(page).toHaveURL(/balance_request_status=success/);

    const payments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, status, payment_type")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      "payments after cancelled complement re-request",
    );
    expect(payments).toHaveLength(3);
    expect(payments.filter((payment) => payment.status === "cancelled")).toHaveLength(1);
    expect(
      payments.filter(
        (payment) =>
          payment.payment_type === "arrhes" && payment.status === "requested",
      ),
    ).toHaveLength(1);

    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
  });
});

test("does not treat a paid non-arrhes 500 euro payment as complete deposit", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestPreReservationScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 50_000,
      displayName: `E2E hors arrhes ${suffix}`,
      paymentType: "arrhes",
    });
    // Force a non-arrhes type while keeping the same amount threshold.
    await sql(
      `update public.payments
       set payment_type = 'balance',
           updated_by = '${ownerId}'::uuid
       where id = '${scenario.payment.id}'::uuid
         and organization_id = '${organizationId}'::uuid`,
    );

    await login(page);
    await page.goto(`/payments/${scenario.payment.id}`);
    await expect(page.getByRole("heading", { name: "Marquer comme payé" })).toBeVisible();
    await page.locator('input[name="paid_date"]').fill("2026-07-25");
    await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
    await expect(page).toHaveURL(/payment_mark_status=success/);

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(page.getByText("Arrhes complètes", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Arrhes complètes réglées", { exact: true })).toHaveCount(0);

    const payment = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, status, amount_cents, payment_type")
        .eq("id", scenario.payment.id)
        .maybeSingle(),
      "non-arrhes payment after mark",
    );
    expect(payment).toMatchObject({
      id: scenario.payment.id,
      status: "paid",
      amount_cents: 50_000,
      payment_type: "balance",
    });

    await registerActualDepositEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
  });
});
