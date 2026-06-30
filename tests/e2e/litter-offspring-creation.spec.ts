import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

test("creates newborn animals from a litter without touching reservations", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const litterId = randomUUID();
  const motherId = randomUUID();
  const fatherId = randomUUID();
  const suffix = litterId.slice(0, 8);
  const motherName = `Rosie ${suffix}`;
  const fatherName = `Rimbaud ${suffix}`;
  const generatedDisplayName = `Collier bleu — ${motherName} × ${fatherName}`;

  const { error: parentsError } = await supabase.from("animals").insert([
    {
      id: motherId,
      organization_id: organizationId,
      display_name: motherName,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "active",
      ownership_status: "owned",
      is_breeder: true,
      created_by: ownerId,
      updated_by: ownerId,
    },
    {
      id: fatherId,
      organization_id: organizationId,
      display_name: fatherName,
      species: "dog",
      breed: "Golden Retriever",
      sex: "male",
      status: "active",
      ownership_status: "owned",
      is_breeder: true,
      created_by: ownerId,
      updated_by: ownerId,
    },
  ]);

  expect(parentsError).toBeNull();

  const { error: litterError } = await supabase.from("litters").insert({
    id: litterId,
    organization_id: organizationId,
    name: `Portee creation chiots ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "born",
    mother_id: motherId,
    father_id: fatherId,
    actual_birth_date: "2026-06-20",
    created_by: ownerId,
    updated_by: ownerId,
  });

  expect(litterError).toBeNull();

  const { count: reservationsBefore, error: reservationsBeforeError } =
    await supabase
      .from("reservations")
      .select("id", { count: "exact" })
      .eq("litter_id", litterId);

  expect(reservationsBeforeError).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/litters/${litterId}`);
  await page.getByText("Ajouter des chiots").click();
  await page.locator('select[name="offspring_0_sex"]').selectOption("female");
  await page
    .locator('input[name="offspring_0_temporary_name"]')
    .fill(`Femelle ${suffix}`);
  await page.locator('input[name="offspring_0_collar_color"]').fill("Rose");
  await page.locator('input[name="offspring_0_birth_order"]').fill("1");
  await page.locator('input[name="offspring_0_birth_weight_grams"]').fill("420");
  await page.locator('input[name="offspring_1_collar_color"]').fill("bleu");
  await page.locator('input[name="offspring_1_birth_order"]').fill("2");

  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Créer les chiots");
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Créer les chiots" }).click();
  await expect(page).toHaveURL(/offspring_status=success/);
  await expect(page.locator("#animaux-lies")).toContainText(`Femelle ${suffix}`);
  await expect(page.locator("#animaux-lies")).toContainText(generatedDisplayName);
  await expect(page.locator("#animaux-lies")).toContainText(
    "Chiot né, non encore disponible/réservé",
  );
  await expect(page.locator("#animaux-lies")).toContainText(
    "Origine : Produit à l’élevage",
  );

  const createdAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select(
        "id, organization_id, litter_id, species, breed, sex, status, ownership_status, display_name, temporary_name, collar_color_initial, collar_color_current, birth_date, birth_order, birth_weight_grams",
      )
      .eq("litter_id", litterId)
      .eq("display_name", `Femelle ${suffix}`)
      .single(),
    "read created offspring",
  );

  expect(createdAnimal).toMatchObject({
    organization_id: organizationId,
    litter_id: litterId,
    species: "dog",
    breed: "Golden Retriever",
    sex: "female",
    status: "born",
    ownership_status: "produced",
    display_name: `Femelle ${suffix}`,
    temporary_name: `Femelle ${suffix}`,
    collar_color_initial: "Rose",
    collar_color_current: "Rose",
    birth_date: "2026-06-20",
    birth_order: 1,
    birth_weight_grams: 420,
  });

  const generatedAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select(
        "display_name, temporary_name, collar_color_initial, collar_color_current, birth_order",
      )
      .eq("litter_id", litterId)
      .eq("display_name", generatedDisplayName)
      .single(),
    "read generated collar offspring",
  );

  expect(generatedAnimal).toMatchObject({
    display_name: generatedDisplayName,
    temporary_name: null,
    collar_color_initial: "bleu",
    collar_color_current: "bleu",
    birth_order: 2,
  });

  await page.goto("/animals");
  const animalRow = page.locator("tbody tr").filter({
    hasText: `Femelle ${suffix}`,
  });
  await expect(animalRow).toContainText(`Portee creation chiots ${suffix}`);
  await expect(animalRow).toContainText(
    "Chiot né, non encore disponible/réservé",
  );
  await expect(animalRow).toContainText("Origine : Produit à l’élevage");

  await page.goto(`/animals/${createdAnimal.id}`);
  await expect(page.getByRole("heading", { name: `Femelle ${suffix}` })).toBeVisible();
  await expect(page.getByText("Chiot né, non encore disponible/réservé")).toBeVisible();
  await expect(page.getByText("Produit à l’élevage")).toBeVisible();
  await page.getByRole("link", { name: "Consulter la portée" }).click();
  await expect(page).toHaveURL(new RegExp(`/litters/${litterId}`));

  const { count: reservationsAfter, error: reservationsAfterError } =
    await supabase
      .from("reservations")
      .select("id", { count: "exact" })
      .eq("litter_id", litterId);

  expect(reservationsAfterError).toBeNull();
  expect(reservationsAfter).toBe(reservationsBefore);
});
