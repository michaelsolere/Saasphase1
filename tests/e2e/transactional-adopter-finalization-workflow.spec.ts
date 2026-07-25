import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterFinalizationReadyScenario,
  registerActualFinalizationEffects,
} from "./helpers/fixtures/adopter-finalization-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
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

test("finalizes an animal-assigned adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterFinalizationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E finalisation pilote ${suffix}`,
      animalCallName: `Chiot finalisation ${suffix}`,
    });

    const incomplete = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E finalisation incomplète ${suffix}`,
      animalCallName: `Chiot incomplet ${suffix}`,
      journeyStatus: "active",
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation finalisation étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterFinalizationReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E finalisation étrangère ${suffix}`,
      animalCallName: `Chiot étranger ${suffix}`,
    });

    const before = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id, application_id, adoption_completed_at")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before finalization",
    );
    expect(before).toMatchObject({
      id: scenario.journey.id,
      status: "animal_assigned",
      animal_id: scenario.animal.id,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
    });

    const animalBefore = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, ownership_status")
        .eq("id", scenario.animal.id)
        .maybeSingle(),
      "read animal before finalization",
    );
    expect(animalBefore).toMatchObject({
      id: scenario.animal.id,
      status: "reserved",
      ownership_status: "produced",
    });

    const paymentsBefore = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id")
        .eq("reservation_id", scenario.journey.id),
      "count payments before",
    );
    const documentsBefore = expectSupabaseData(
      await supabase
        .from("documents")
        .select("id")
        .eq("reservation_id", scenario.journey.id),
      "count documents before",
    );
    expect(paymentsBefore).toHaveLength(0);
    expect(documentsBefore).toHaveLength(0);

    await login(page);

    await page.goto(`/reservations/${incomplete.journey.id}`);
    await expect(page.getByRole("button", { name: "Finaliser l’adoption" })).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", { name: `Parcours adoptant de E2E finalisation pilote ${suffix}` }),
    ).toBeVisible();
    await expect(page.getByText(`E2E finalisation étrangère ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Chiot attribué", { exact: true }),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Finaliser l’adoption" }).first(),
      page.getByRole("heading", { name: "Finaliser l’adoption ?" }),
    );
    await page.getByRole("button", { name: "Confirmer la finalisation" }).click();
    await expect(page).toHaveURL(/adoption_status=success/);
    await expect(page.getByText("L’adoption a été finalisée.")).toBeVisible();

    const after = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id, application_id, adoption_completed_at")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after finalization",
    );
    expect(after).toMatchObject({
      id: scenario.journey.id,
      status: "adopted",
      animal_id: scenario.animal.id,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
    });
    expect(after?.adoption_completed_at).not.toBeNull();

    const animalAfter = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, ownership_status")
        .eq("id", scenario.animal.id)
        .maybeSingle(),
      "read animal after finalization",
    );
    expect(animalAfter).toMatchObject({
      id: scenario.animal.id,
      status: "adopted",
      ownership_status: "adopted_out",
    });

    const roles = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read contact roles after finalization",
    );
    const activeRoles = roles.filter((role) => role.is_active).map((role) => role.role);
    expect(activeRoles).toEqual(["adopter"]);
    expect(roles.find((role) => role.role === "reservation_holder")).toMatchObject({
      is_active: false,
    });
    expect(roles.find((role) => role.role === "reservation_holder")?.ended_at).not.toBeNull();

    expect(
      expectSupabaseData(
        await supabase.from("reservations").select("id").eq("contact_id", scenario.contact.id),
        "count reservations for contact",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("animals").select("id").eq("id", scenario.animal.id),
        "count exact animal",
      ),
    ).toHaveLength(1);
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

    await registerActualFinalizationEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });

    await page.reload();
    await expect(
      page.locator("#dossier-summary").getByText("Adopté", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Finaliser l’adoption" })).toHaveCount(0);

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "adopted",
      animal_id: scenario.animal.id,
    });
  });
});
