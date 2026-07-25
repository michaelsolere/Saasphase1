import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterCancellationReadyScenario,
  registerActualExpirationEffects,
} from "./helpers/fixtures/adopter-cancellation-fixtures";
import {
  createTestReceivedPayment,
} from "./helpers/fixtures/adopter-payment-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import {
  seedAnimalAssignedAdopterJourney,
} from "./helpers/fixtures/adopter-finalization-fixtures";
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

test("expires an active adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterCancellationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E expiration pilote ${suffix}`,
    });
    const payment = await createTestReceivedPayment(sql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
    });

    const assigned = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E expiration attribuée ${suffix}`,
      animalCallName: `Chiot expiration ${suffix}`,
      journeyStatus: "active",
    });
    await seedAnimalAssignedAdopterJourney(sql, fixtures, {
      organizationId,
      reservationId: assigned.journey.id,
      animalId: assigned.animal.id,
      ownerId,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation expiration étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterCancellationReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E expiration étrangère ${suffix}`,
    });

    const before = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, animal_id, contact_id, application_id, adoption_completed_at, reservation_confirmed_at, price_cents, internal_comment, pre_reservation_deadline, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before expiration",
    );
    expect(before).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      animal_id: null,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
    });

    const paymentBefore = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, status, amount_cents, payment_type")
        .eq("id", payment.id)
        .maybeSingle(),
      "read payment before expiration",
    );
    expect(paymentBefore).toMatchObject({
      id: payment.id,
      status: "paid",
      amount_cents: 25_000,
    });

    const rolesBefore = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles before expiration",
    );
    expect(rolesBefore).toHaveLength(1);
    expect(rolesBefore[0]).toMatchObject({
      id: scenario.holderRoleId,
      role: "reservation_holder",
      is_active: true,
      ended_at: null,
    });

    await login(page);

    await page.goto(`/reservations/${assigned.journey.id}`);
    await expect(
      page.locator("#dossier-summary").getByText("Chiot attribué", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toHaveCount(0);

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
        name: `Parcours adoptant de E2E expiration pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E expiration étrangère ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Marquer comme expirée" }),
      page.getByRole("heading", {
        name: "Confirmer l’expiration de cette réservation ?",
      }),
    );
    await expect(
      page.getByText(
        "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer l’expiration" }).click();
    await expect(page).toHaveURL(/expiration_status=success/);
    await expect(page.getByText("Dossier adoptant marqué comme expiré.")).toBeVisible();
    await expect(page.getByText("Expirée", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toHaveCount(0);

    const after = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, animal_id, contact_id, application_id, adoption_completed_at, reservation_confirmed_at, price_cents, internal_comment, pre_reservation_deadline, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after expiration",
    );
    expect(after).toMatchObject({
      id: scenario.journey.id,
      status: "expired",
      animal_id: null,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
      reservation_confirmed_at: before?.reservation_confirmed_at ?? null,
      price_cents: before?.price_cents ?? null,
      internal_comment: before?.internal_comment ?? null,
      pre_reservation_deadline: before?.pre_reservation_deadline ?? null,
    });
    expect(after?.updated_by).toBe(ownerId);
    expect(after?.updated_at).not.toBe(before?.updated_at);

    expect(
      expectSupabaseData(
        await supabase
          .from("payments")
          .select("id, status, amount_cents, payment_type")
          .eq("id", payment.id)
          .maybeSingle(),
        "payment preserved after expiration",
      ),
    ).toEqual(paymentBefore);
    expect(
      expectSupabaseData(
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "no extra payments after expiration",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "no documents after expiration",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("contact_roles")
          .select("id, role, is_active, ended_at")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null)
          .order("created_at"),
        "roles unchanged after expiration",
      ),
    ).toEqual(rolesBefore);

    const assignedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", assigned.animal.id)
        .maybeSingle(),
      "assigned animal untouched",
    );
    expect(assignedAnimal).toMatchObject({
      id: assigned.animal.id,
      status: "reserved",
    });

    await registerActualExpirationEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    await page.reload();
    await expect(page.getByText("Expirée", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, contact_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "expired",
      contact_id: scenario.contact.id,
    });
  });
});
