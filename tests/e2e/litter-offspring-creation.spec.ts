import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  runE2eSql,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sqlUuidArray(ids: string[]) {
  if (ids.length === 0) {
    return "array[]::uuid[]";
  }

  for (const id of ids) {
    if (!uuidPattern.test(id)) {
      throw new Error(`Invalid fixture UUID: ${id}`);
    }
  }

  return `array[${ids.map((id) => `'${id}'::uuid`).join(", ")}]`;
}

async function hardDeleteFixtureWithSql(fixture: {
  litterId: string;
  parentAnimalIds: string[];
  offspringAnimalIds: string[];
}) {
  const parentAnimalIds = sqlUuidArray(fixture.parentAnimalIds);
  const offspringAnimalIds = sqlUuidArray(fixture.offspringAnimalIds);
  const litterIds = sqlUuidArray([fixture.litterId]);
  const sql = `
with
  del_offspring as (
    delete from public.animals where id = any(${offspringAnimalIds}) returning id
  ),
  del_litters as (
    delete from public.litters where id = any(${litterIds}) returning id
  ),
  del_parents as (
    delete from public.animals where id = any(${parentAnimalIds}) returning id
  )
select
  (select count(*) from del_offspring) as offspring_deleted,
  (select count(*) from del_litters) as litters_deleted,
  (select count(*) from del_parents) as parent_animals_deleted;
`;

  const stdout = await runE2eSql(sql);

  return stdout;
}

async function countRemainingFixtureRowsWithSql(fixture: {
  litterId: string;
  parentAnimalIds: string[];
  offspringAnimalIds: string[];
}) {
  const animalIds = sqlUuidArray([
    ...fixture.offspringAnimalIds,
    ...fixture.parentAnimalIds,
  ]);
  const litterIds = sqlUuidArray([fixture.litterId]);
  const sql = `
select json_build_object(
  'animals', (select count(*) from public.animals where id = any(${animalIds})),
  'litters', (select count(*) from public.litters where id = any(${litterIds}))
)::text;
`;

  const stdout = await runE2eSql(sql);

  return JSON.parse(stdout.trim()) as { animals: number; litters: number };
}

test("creates newborn animals from a litter without touching reservations", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const litterId = randomUUID();
  const motherId = randomUUID();
  const fatherId = randomUUID();
  const createdOffspringIds: string[] = [];
  const deletedIds = {
    animals: [] as string[],
    litters: [] as string[],
  };
  const suffix = litterId.slice(0, 8);
  const motherName = `Rosie nom complet tres long ${suffix}`;
  const fatherName = `Rimbaud nom complet tres long ${suffix}`;
  const motherOfficialName = `Nom complet LOF Rosie ${suffix}`;
  const fatherOfficialName = `Nom complet LOF Rimbaud ${suffix}`;
  const motherCallName = `Rosie ${suffix}`;
  const fatherCallName = `Rimbaud ${suffix}`;
  const generatedDisplayName = `Collier bleu — ${motherCallName} × ${fatherCallName}`;
  const firstGeneratedDisplayName = `Collier Rose — ${motherCallName} × ${fatherCallName}`;
  const fallbackGeneratedDisplayName = `Collier vert — ${motherCallName}`;

  try {
    const { error: parentsError } = await supabase.from("animals").insert([
      {
        id: motherId,
        organization_id: organizationId,
        official_name: motherOfficialName,
        call_name: motherCallName,
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
        official_name: fatherOfficialName,
        call_name: fatherCallName,
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
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/litters/${litterId}`);
    await page.getByText("Ajouter des chiots").click();
    await page.locator('select[name="offspring_0_sex"]').selectOption("female");
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
    await expect(page.locator("#animaux-lies")).toContainText(firstGeneratedDisplayName);
    await expect(page.locator("#animaux-lies")).toContainText(generatedDisplayName);
    await expect(page.locator("#animaux-lies")).not.toContainText(motherName);
    await expect(page.locator("#animaux-lies")).not.toContainText(fatherName);
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
          "id, organization_id, litter_id, species, breed, sex, status, ownership_status, call_name, official_name, collar_color_initial, collar_color_current, birth_date, birth_order, birth_weight_grams",
        )
        .eq("litter_id", litterId)
        .eq("birth_order", 1)
        .single(),
      "read created offspring",
    );
    createdOffspringIds.push(createdAnimal.id);

    expect(createdAnimal).toMatchObject({
      organization_id: organizationId,
      litter_id: litterId,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "born",
      ownership_status: "produced",
      call_name: null,
      official_name: null,
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
          "id, call_name, official_name, collar_color_initial, collar_color_current, birth_order",
        )
        .eq("litter_id", litterId)
        .eq("birth_order", 2)
        .single(),
      "read generated collar offspring",
    );
    createdOffspringIds.push(generatedAnimal.id);

    expect(generatedAnimal).toMatchObject({
      call_name: null,
      official_name: null,
      collar_color_initial: "bleu",
      collar_color_current: "bleu",
      birth_order: 2,
    });

    await page.goto(`/animals/${motherId}`);
    await expect(page.getByRole("heading", { name: motherOfficialName })).toBeVisible();
    await expect(page.getByText(motherCallName, { exact: true })).toBeVisible();

    await page.goto("/animals");
    const animalRow = page.locator("tbody tr").filter({
      hasText: firstGeneratedDisplayName,
    });
    await expect(animalRow).toContainText(`Portee creation chiots ${suffix}`);
    await expect(animalRow).toContainText(
      "Chiot né, non encore disponible/réservé",
    );
    await expect(animalRow).toContainText("Origine : Produit à l’élevage");

    await page.goto(`/animals/${createdAnimal.id}`);
    await expect(page.getByRole("heading", { name: firstGeneratedDisplayName })).toBeVisible();
    await expect(page.getByText("Chiot né, non encore disponible/réservé")).toBeVisible();
    await expect(page.getByText("Produit à l’élevage")).toBeVisible();
    await page.locator(`a[href="/litters/${litterId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/litters/${litterId}`));

    const { error: fatherCallNameUpdateError } = await supabase
      .from("animals")
      .update({ call_name: null })
      .eq("id", fatherId)
      .eq("organization_id", organizationId);

    expect(fatherCallNameUpdateError).toBeNull();

    await page.goto(`/litters/${litterId}`);
    await page.getByText("Ajouter des chiots").click();
    await page.locator('input[name="offspring_0_collar_color"]').fill("vert");
    await page.locator('input[name="offspring_0_birth_order"]').fill("3");
    await page.getByRole("button", { name: "Créer les chiots" }).click();
    await expect(page).toHaveURL(/offspring_status=success/);
    await expect(page.locator("#animaux-lies")).toContainText(
      fallbackGeneratedDisplayName,
    );

    const fallbackGeneratedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, call_name, official_name, birth_order")
        .eq("litter_id", litterId)
        .eq("birth_order", 3)
        .single(),
      "read generated collar offspring with missing parent call name",
    );
    createdOffspringIds.push(fallbackGeneratedAnimal.id);

    expect(fallbackGeneratedAnimal).toMatchObject({
      call_name: null,
      official_name: null,
      birth_order: 3,
    });

    const { count: reservationsAfter, error: reservationsAfterError } =
      await supabase
        .from("reservations")
        .select("id", { count: "exact" })
        .eq("litter_id", litterId);

    expect(reservationsAfterError).toBeNull();
    expect(reservationsAfter).toBe(reservationsBefore);
  } finally {
    const offspringToDelete = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("litter_id", litterId),
      "read offspring before cleanup",
    ) ?? [];
    const offspringIdsToDelete = offspringToDelete.map((animal) => animal.id);
    const fixture = {
      litterId,
      parentAnimalIds: [motherId, fatherId],
      offspringAnimalIds: offspringIdsToDelete,
    };
    const cleanupOutput = await hardDeleteFixtureWithSql(fixture);
    deletedIds.animals.push(...offspringIdsToDelete, motherId, fatherId);
    deletedIds.litters.push(litterId);

    const remaining = await countRemainingFixtureRowsWithSql(fixture);
    expect(remaining.animals).toBe(0);
    expect(remaining.litters).toBe(0);

    console.info(
      JSON.stringify({
        fixtureCleanup: {
          created: {
            litters: [litterId],
            parentAnimals: [motherId, fatherId],
            offspringAnimals: createdOffspringIds,
          },
          deleted: deletedIds,
          cleanupOutput,
          remaining,
        },
      }),
    );
  }
});
