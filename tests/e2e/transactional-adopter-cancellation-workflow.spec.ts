import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterCancellationReadyScenario,
  registerActualCancellationEffects,
} from "./helpers/fixtures/adopter-cancellation-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import {
  createTestAdopterFinalizationReadyScenario,
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

test("cancels an active adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterCancellationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E annulation pilote ${suffix}`,
    });

    const assigned = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E annulation attribuée ${suffix}`,
      animalCallName: `Chiot attribué ${suffix}`,
      journeyStatus: "active",
    });
    await seedAnimalAssignedAdopterJourney(sql, fixtures, {
      organizationId,
      reservationId: assigned.journey.id,
      animalId: assigned.animal.id,
      ownerId,
    });

    const adopted = await createTestAdopterFinalizationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E annulation adoptée ${suffix}`,
      animalCallName: `Chiot adopté ${suffix}`,
    });
    // Fixture-only preparation: mark as adopted so the UI is exercised against a
    // real final status where cancelReservation is refused (status !== active).
    await sql(
      `update public.reservations
       set status = 'adopted',
           adoption_completed_at = '2026-07-25T12:00:00.000Z'::timestamptz,
           updated_by = '${ownerId}'::uuid,
           updated_at = '2026-07-25T12:00:00.000Z'::timestamptz
       where id = '${adopted.journey.id}'::uuid
         and organization_id = '${organizationId}'::uuid
         and status = 'animal_assigned'`,
    );

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation annulation étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterCancellationReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E annulation étrangère ${suffix}`,
    });

    const before = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, animal_id, contact_id, application_id, adoption_completed_at, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before cancellation",
    );
    expect(before).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      animal_id: null,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
    });

    const rolesBefore = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles before cancellation",
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
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "count payments before",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "count documents before",
      ),
    ).toHaveLength(0);

    await login(page);

    await page.goto(`/reservations/${assigned.journey.id}`);
    await expect(
      page.locator("#dossier-summary").getByText("Chiot attribué", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);

    await page.goto(`/reservations/${adopted.journey.id}`);
    await expect(
      page.locator("#dossier-summary").getByText("Adopté", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);

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
        name: `Parcours adoptant de E2E annulation pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E annulation étrangère ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Annuler la réservation" }).first(),
      page.getByRole("heading", {
        name: "Confirmer l’annulation de cette réservation ?",
      }),
    );
    await expect(
      page.getByText(
        "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(page).toHaveURL(/cancellation_status=success/);
    await expect(page.getByText("Dossier adoptant annulé.")).toBeVisible();
    await expect(page.getByText("Annulée", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);

    const after = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, animal_id, contact_id, application_id, adoption_completed_at, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after cancellation",
    );
    expect(after).toMatchObject({
      id: scenario.journey.id,
      status: "cancelled",
      animal_id: null,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
    });
    expect(after?.updated_by).toBe(ownerId);
    expect(after?.updated_at).not.toBe(before?.updated_at);

    const rolesAfter = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles after cancellation",
    );
    expect(rolesAfter).toEqual(rolesBefore);

    expect(
      expectSupabaseData(
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "count payments after",
      ),
    ).toHaveLength(0);
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

    const assignedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", assigned.animal.id)
        .maybeSingle(),
      "assigned animal untouched by other cancellation",
    );
    expect(assignedAnimal).toMatchObject({
      id: assigned.animal.id,
      status: "reserved",
    });
    const assignedJourney = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id")
        .eq("id", assigned.journey.id)
        .maybeSingle(),
      "assigned journey untouched",
    );
    expect(assignedJourney).toMatchObject({
      id: assigned.journey.id,
      status: "animal_assigned",
      animal_id: assigned.animal.id,
    });

    await registerActualCancellationEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    await page.reload();
    await expect(
      page.locator("#dossier-summary").getByText("Annulée", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.locator("#dossier-summary").getByText("Annulée", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la réservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme désistée" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marquer comme expirée" })).toHaveCount(0);

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "cancelled",
      animal_id: null,
      contact_id: scenario.contact.id,
    });
  });
});
