import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterRefundReadyScenario,
  registerActualRefundEffects,
} from "./helpers/fixtures/adopter-refund-fixtures";
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

const PAID_CENTS = 25_000;
const FIRST_REFUND_CENTS = 10_000;
const OVER_REFUND_EUROS = "200";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

async function submitRefund(page: Page, amountEuros: string) {
  await openDialog(
    page.getByRole("button", { name: "+ Enregistrer un remboursement" }).first(),
    page.getByRole("heading", { name: "Enregistrer un remboursement" }),
  );
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="amount"]').fill(amountEuros);
  await dialog.getByRole("button", { name: "Enregistrer le remboursement" }).click();
}

test("records a partial refund then refuses over-refund through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: PAID_CENTS,
      displayName: `E2E remboursement pilote ${suffix}`,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation remboursement étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      amountCents: PAID_CENTS,
      displayName: `E2E remboursement étranger ${suffix}`,
    });

    const beforePayments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, payment_type, status, contact_id, reservation_id")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read payments before refund",
    );
    expect(beforePayments).toHaveLength(1);
    expect(beforePayments[0]).toMatchObject({
      id: scenario.payment.id,
      amount_cents: PAID_CENTS,
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
      contact_id: scenario.contact.id,
      reservation_id: scenario.journey.id,
    });

    const beforeOverview = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select(
          "id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview before refund",
    );
    expect(beforeOverview).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      paid_cents: PAID_CENTS,
      refunded_cents: 0,
    });

    const rolesBefore = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles before refund",
    );
    expect(rolesBefore).toHaveLength(1);
    expect(rolesBefore[0]).toMatchObject({
      id: scenario.holderRoleId,
      role: "reservation_holder",
      is_active: true,
      ended_at: null,
    });

    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "count documents before",
      ),
    ).toHaveLength(0);

    await login(page);

    const foreignResponse = await page.goto(`/reservations/${foreign.journey.id}`);
    expect(foreignResponse?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Dossier adoptant introuvable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "+ Enregistrer un remboursement" }),
    ).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E remboursement pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E remboursement étranger ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#payments").getByText("250,00 €").first()).toBeVisible();
    await expect(page.locator("#payments").getByText(/remboursé/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ Enregistrer un remboursement" }),
    ).toBeVisible();

    await submitRefund(page, "100");
    await expect(page).toHaveURL(/payment_refund_status=success/);
    await expect(
      page.getByText("Remboursement enregistré. Le solde du dossier a été mis à jour."),
    ).toBeVisible();

    const afterValid = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, payment_type, status, contact_id, reservation_id")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read payments after valid refund",
    );
    expect(afterValid).toHaveLength(2);
    const initialAfter = afterValid.find((row) => row.id === scenario.payment.id);
    const refundRow = afterValid.find((row) => row.payment_type === "refund");
    expect(initialAfter).toMatchObject({
      id: scenario.payment.id,
      amount_cents: PAID_CENTS,
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
      contact_id: scenario.contact.id,
      reservation_id: scenario.journey.id,
    });
    expect(refundRow).toMatchObject({
      amount_cents: FIRST_REFUND_CENTS,
      payment_type: "refund",
      status: "paid",
      contact_id: scenario.contact.id,
      reservation_id: scenario.journey.id,
    });
    expect(refundRow?.id).toEqual(expect.any(String));
    expect(refundRow?.id).not.toBe(scenario.payment.id);
    fixtures.register("payments", refundRow!.id);

    const overviewAfterValid = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select(
          "id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview after valid refund",
    );
    expect(overviewAfterValid).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      paid_cents: PAID_CENTS,
      refunded_cents: FIRST_REFUND_CENTS,
    });

    await expect(page.locator("#payments").getByText("Type : Remboursement")).toBeVisible();
    await expect(
      page.locator("#payments").locator("span.font-semibold", { hasText: "100,00" }),
    ).toBeVisible();
    await expect(page.locator("#payments").getByText("2 liés · 2 payés")).toBeVisible();
    await expect(
      page
        .locator("#payments")
        .getByRole("definition")
        .filter({ hasText: /^250,00/ })
        .first(),
    ).toBeVisible();

    await submitRefund(page, OVER_REFUND_EUROS);
    await expect(page).toHaveURL(/payment_refund_status=exceeds_refundable/);
    await expect(
      page.getByText(
        "Le montant du remboursement dépasse le solde encore remboursable sur ce dossier. Aucune autre donnée n’a été modifiée.",
      ),
    ).toBeVisible();

    const afterRejected = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, amount_cents, payment_type, status")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read payments after rejected over-refund",
    );
    expect(afterRejected).toHaveLength(2);
    expect(afterRejected.filter((row) => row.payment_type === "refund")).toHaveLength(1);
    expect(afterRejected.find((row) => row.id === scenario.payment.id)).toMatchObject({
      amount_cents: PAID_CENTS,
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
    });

    const overviewAfterRejected = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, paid_cents, refunded_cents, contact_id, application_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview after rejected over-refund",
    );
    expect(overviewAfterRejected).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      paid_cents: PAID_CENTS,
      refunded_cents: FIRST_REFUND_CENTS,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
    });

    const rolesAfter = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles after refunds",
    );
    expect(rolesAfter).toEqual(rolesBefore);

    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "count documents after",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase.from("reservations").select("id").eq("contact_id", scenario.contact.id),
        "count reservations for contact",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("contacts").select("id").eq("id", scenario.contact.id),
        "exact contact preserved",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("applications").select("id").eq("id", scenario.application.id),
        "exact application preserved",
      ),
    ).toHaveLength(1);

    const foreignPayments = Number(
      await sql(
        `select count(*)::text from public.payments
         where reservation_id = '${foreign.journey.id}'::uuid
           and organization_id = '${foreignOrganizationId}'::uuid`,
      ),
    );
    expect(foreignPayments).toBe(1);

    await registerActualRefundEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
    expect(fixtures.has("payments", refundRow!.id)).toBe(true);

    await page.reload();
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#payments").getByText("Type : Remboursement")).toBeVisible();
    await expect(
      page.locator("#payments").locator("span.font-semibold", { hasText: "100,00" }),
    ).toBeVisible();
    await expect(page.locator("#payments").getByText("2 liés · 2 payés")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "+ Enregistrer un remboursement" }),
    ).toBeVisible();

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, paid_cents, refunded_cents, contact_id, animal_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "active",
      paid_cents: PAID_CENTS,
      refunded_cents: FIRST_REFUND_CENTS,
      contact_id: scenario.contact.id,
      animal_id: null,
    });
    expect(
      expectSupabaseData(
        await supabase
          .from("payments")
          .select("id")
          .eq("reservation_id", scenario.journey.id)
          .eq("payment_type", "refund")
          .is("deleted_at", null),
        "count refunds after reload",
      ),
    ).toHaveLength(1);
  });
});
