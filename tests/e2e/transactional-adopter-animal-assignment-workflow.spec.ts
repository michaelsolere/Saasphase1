import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
  createTestAssignableProducedAnimal,
  registerActualAnimalAssignmentEffects,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestAdopterLitter,
  createTestLitterGroup,
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

test("assigns an existing produced animal to an adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E attribution pilote ${suffix}`,
      animalCallName: `Chiot pilote ${suffix}`,
      journeyStatus: "active",
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation attribution étrangère ${suffix}`,
    });
    const foreignGroupId = await createTestLitterGroup(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
    });
    const foreignLitterId = await createTestAdopterLitter(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      litterGroupId: foreignGroupId,
    });
    const foreignAnimal = await createTestAssignableProducedAnimal(sql, fixtures, {
      organizationId: foreignOrganizationId,
      litterId: foreignLitterId,
      ownerId,
      callName: `Chiot étranger ${suffix}`,
    });

    const otherGroupId = await createTestLitterGroup(sql, fixtures, {
      organizationId,
      ownerId,
      name: `E2E autre portée group ${suffix}`,
    });
    const otherLitterId = await createTestAdopterLitter(sql, fixtures, {
      organizationId,
      ownerId,
      litterGroupId: otherGroupId,
      name: `E2E autre portée ${suffix}`,
    });
    const incompatibleAnimal = await createTestAssignableProducedAnimal(sql, fixtures, {
      organizationId,
      litterId: otherLitterId,
      ownerId,
      callName: `Chiot autre portée ${suffix}`,
    });

    const rivalContact = await createTestContact(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E rival attribution ${suffix}`,
    });
    const rivalApplication = await createTestApplication(sql, fixtures, {
      organizationId,
      ownerId,
      contactId: rivalContact.id,
      litterGroupId: scenario.groupId,
      litterId: scenario.litterId,
    });
    const rivalJourney = await createTestAdopterJourney(sql, fixtures, {
      organizationId,
      ownerId,
      contactId: rivalContact.id,
      applicationId: rivalApplication.id,
      litterGroupId: scenario.groupId,
      litterId: scenario.litterId,
      status: "active",
    });

    const beforeAnimals = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", [scenario.animal.id, incompatibleAnimal.id]),
      "count local animals before assignment",
    );
    expect(beforeAnimals).toHaveLength(2);

    const beforeReservations = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, status")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before assignment",
    );
    expect(beforeReservations).toMatchObject({
      id: scenario.journey.id,
      animal_id: null,
      status: "active",
    });

    await login(page);
    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(page.getByText("Animal non attribué pour l’instant", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Attribuer un animal")).toBeVisible();
    await expect(page.getByText(`Chiot étranger ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(`Chiot autre portée ${suffix}`)).toHaveCount(0);

    const hiddenForeignAnimal = await supabase
      .from("animals")
      .select("id")
      .eq("id", foreignAnimal.id)
      .maybeSingle();
    expect(hiddenForeignAnimal.error).toBeNull();
    expect(hiddenForeignAnimal.data).toBeNull();

    const animalSelect = page.getByLabel("Attribuer un animal");
    await expect(animalSelect.locator(`option[value="${scenario.animal.id}"]`)).toHaveCount(1);
    await expect(animalSelect.locator(`option[value="${foreignAnimal.id}"]`)).toHaveCount(0);
    await expect(animalSelect.locator(`option[value="${incompatibleAnimal.id}"]`)).toHaveCount(0);

    await animalSelect.selectOption(scenario.animal.id);
    await page.getByRole("button", { name: "Attribuer l’animal" }).click();
    await expect(page).toHaveURL(/animal_assign_status=success/);

    const afterAssign = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, animal_assigned_at, status")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after assignment",
    );
    expect(afterAssign).toMatchObject({
      id: scenario.journey.id,
      animal_id: scenario.animal.id,
      status: "animal_assigned",
    });
    expect(afterAssign?.animal_assigned_at).not.toBeNull();

    const reservedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, ownership_status")
        .eq("id", scenario.animal.id)
        .maybeSingle(),
      "read animal after assignment",
    );
    expect(reservedAnimal).toMatchObject({
      id: scenario.animal.id,
      status: "reserved",
      ownership_status: "produced",
    });

    const animalCount = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", [scenario.animal.id, incompatibleAnimal.id]),
      "count animals after assignment",
    );
    expect(animalCount).toHaveLength(2);

    const reservationCount = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id")
        .in("id", [scenario.journey.id, rivalJourney.id]),
      "count reservations after assignment",
    );
    expect(reservationCount).toHaveLength(2);

    await registerActualAnimalAssignmentEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });

    await page.reload();
    await expect(
      page.locator("#scope-and-animal").getByRole("link", { name: `Chiot pilote ${suffix}` }),
    ).toBeVisible();
    await expect(page.getByLabel("Attribuer un animal")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Attribuer l’animal" })).toHaveCount(0);

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, status")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      animal_id: scenario.animal.id,
      status: "animal_assigned",
    });

    await page.goto(`/reservations/${rivalJourney.id}`);
    await expect(page.getByText("Animal non attribué pour l’instant", { exact: true })).toBeVisible();
    const rivalSelect = page.getByLabel("Attribuer un animal");
    await expect(rivalSelect.locator(`option[value="${scenario.animal.id}"]`)).toHaveCount(0);

    const holders = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id")
        .eq("animal_id", scenario.animal.id)
        .is("deleted_at", null),
      "read reservations holding animal",
    );
    expect(holders.map((row) => row.id)).toEqual([scenario.journey.id]);
  });
});
