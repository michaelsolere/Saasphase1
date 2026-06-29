import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const litterId = "c0000000-0000-4000-8000-000000000001";

type ManualAnimalCase = {
  label: string;
  expected: {
    sex: "female" | "male" | "unknown";
    status: string;
    ownership_status: string;
    is_breeder: boolean;
    is_external: boolean;
    is_retired: boolean;
    litter_id: null;
  };
  fill: (page: Page) => Promise<void>;
};

test("creates manual animals without confusing them with litter offspring", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const suffix = Date.now().toString(36);

  const cases: ManualAnimalCase[] = [
    {
      label: `QA reproductrice maison ${suffix}`,
      expected: {
        sex: "female",
        status: "breeding",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.getByLabel("Sexe", { exact: true }).selectOption("female");
        await formPage
          .getByLabel("Statut", { exact: true })
          .selectOption("breeding");
        await formPage.locator('input[name="is_breeder"]').check();
      },
    },
    {
      label: `QA male reproducteur maison ${suffix}`,
      expected: {
        sex: "male",
        status: "breeding",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.getByLabel("Sexe", { exact: true }).selectOption("male");
        await formPage
          .getByLabel("Statut", { exact: true })
          .selectOption("breeding");
        await formPage.locator('input[name="is_breeder"]').check();
      },
    },
    {
      label: `QA etalon exterieur ${suffix}`,
      expected: {
        sex: "male",
        status: "active",
        ownership_status: "external_stud",
        is_breeder: true,
        is_external: true,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("external_stud");
      },
    },
    {
      label: `QA femelle exterieure ${suffix}`,
      expected: {
        sex: "female",
        status: "active",
        ownership_status: "external_female",
        is_breeder: true,
        is_external: true,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("external_female");
      },
    },
    {
      label: `QA animal retraite ${suffix}`,
      expected: {
        sex: "unknown",
        status: "retired",
        ownership_status: "owned",
        is_breeder: false,
        is_external: false,
        is_retired: true,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.locator('input[name="is_retired"]').check();
      },
    },
    {
      label: `QA animal historique ${suffix}`,
      expected: {
        sex: "unknown",
        status: "archived",
        ownership_status: "unknown",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Statut", { exact: true })
          .selectOption("archived");
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("unknown");
      },
    },
  ];

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  for (const manualCase of cases) {
    await page.goto("/animals/new");
    await expect(
      page.getByText("ce formulaire ne crée pas de chiot/chaton"),
    ).toBeVisible();
    await page.getByLabel("Nom affiché").fill(manualCase.label);
    await manualCase.fill(page);
    await page.getByRole("button", { name: "Créer l’animal" }).click();
    await expect(page).toHaveURL(/\/animals\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { name: manualCase.label }),
    ).toBeVisible();
    await expect(page.getByText("Aucune portée liée")).toBeVisible();

    const animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select(
          "display_name, sex, status, ownership_status, is_breeder, is_external, is_retired, litter_id",
        )
        .eq("display_name", manualCase.label)
        .single(),
      `read ${manualCase.label}`,
    );

    expect(animal).toMatchObject({
      display_name: manualCase.label,
      ...manualCase.expected,
    });
  }

  await page.goto("/animals");
  for (const manualCase of cases) {
    const row = page.locator("tbody tr").filter({ hasText: manualCase.label });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Portée : Non renseigné");
  }

  await page.goto("/animals?filter=home_breeders");
  await expect(page.getByText(cases[0].label)).toBeVisible();
  await expect(page.getByText(cases[1].label)).toBeVisible();
  await expect(page.getByText(cases[2].label)).not.toBeVisible();

  await page.goto("/animals?filter=external_breeders");
  await expect(page.getByText(cases[2].label)).toBeVisible();
  await expect(page.getByText(cases[3].label)).toBeVisible();
  await expect(page.getByText(cases[0].label)).not.toBeVisible();

  await page.goto("/animals?filter=retired");
  await expect(page.getByText(cases[4].label)).toBeVisible();
  await expect(page.getByText(cases[5].label)).not.toBeVisible();

  await page.goto("/animals?origin=external");
  await expect(page.getByText(cases[2].label)).toBeVisible();
  await expect(page.getByText(cases[3].label)).toBeVisible();
  await expect(page.getByText(cases[1].label)).not.toBeVisible();

  const forcedProducedName = `QA produced force ${suffix}`;
  await page.goto("/animals/new");
  await page.getByLabel("Nom affiché").fill(forcedProducedName);
  await page.locator('select[name="ownership_status"]').evaluate((select) => {
    const option = document.createElement("option");
    option.value = "produced";
    option.textContent = "Né à l’élevage";
    select.append(option);
    (select as HTMLSelectElement).value = "produced";
  });
  await page.getByRole("button", { name: "Créer l’animal" }).click();
  await expect(page).toHaveURL(/\/animals\/new\?status=invalid$/);

  const { count, error } = await supabase
    .from("animals")
    .select("id", { count: "exact", head: true })
    .eq("display_name", forcedProducedName);

  expect(error).toBeNull();
  expect(count).toBe(0);
});

test("edits only lightweight animal identity fields", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const manualAnimalId = randomUUID();
  const litterAnimalId = randomUUID();
  const suffix = manualAnimalId.slice(0, 8);

  const { error: manualInsertError } = await supabase.from("animals").insert({
    id: manualAnimalId,
    organization_id: organizationId,
    display_name: `QA edition legere ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    sex: "female",
    status: "active",
    ownership_status: "owned",
    birth_date: "2023-01-10",
    identification_number: "OLD-ID",
    color: "Sable",
    coat_color: "Claire",
    created_by: ownerId,
    updated_by: ownerId,
  });

  expect(manualInsertError).toBeNull();

  const { error: litterAnimalInsertError } = await supabase
    .from("animals")
    .insert({
      id: litterAnimalId,
      organization_id: organizationId,
      litter_id: litterId,
      display_name: `QA edition chiot ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      sex: "male",
      status: "born",
      ownership_status: "produced",
      birth_date: "2026-04-15",
      created_by: ownerId,
      updated_by: ownerId,
    });

  expect(litterAnimalInsertError).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/animals/${manualAnimalId}`);
  await page.getByRole("link", { name: "Modifier les informations" }).click();
  await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit`);
  await page.getByLabel("Nom principal").fill(`QA edition modifiee ${suffix}`);
  await page.getByLabel("Identification").fill("NEW-ID");
  await page.getByLabel("Couleur").fill("Doré");
  await page.getByLabel("Robe").fill("Fauve clair");
  await page.getByLabel("Date de naissance").fill("2023-02-11");
  await page.locator("form").evaluate((form) => {
    for (const [name, value] of [
      ["status", "adopted"],
      ["ownership_status", "adopted_out"],
      ["sex", "male"],
      ["species", "cat"],
      ["breed", "Persan"],
      ["litter_id", "c0000000-0000-4000-8000-000000000001"],
      ["is_breeder", "yes"],
      ["is_external", "yes"],
      ["is_retired", "yes"],
    ]) {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      form.append(input);
    }
  });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(
    `/animals/${manualAnimalId}?identity_status=success`,
  );
  await expect(page.getByText("Les informations de l’animal ont été mises à jour.")).toBeVisible();

  const updatedManualAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select(
        "display_name, identification_number, color, coat_color, birth_date, status, ownership_status, sex, species, breed, litter_id, is_breeder, is_external, is_retired",
      )
      .eq("id", manualAnimalId)
      .single(),
    "read updated manual animal",
  );

  expect(updatedManualAnimal).toMatchObject({
    display_name: `QA edition modifiee ${suffix}`,
    identification_number: "NEW-ID",
    color: "Doré",
    coat_color: "Fauve clair",
    birth_date: "2023-02-11",
    status: "active",
    ownership_status: "owned",
    sex: "female",
    species: "dog",
    breed: "Golden Retriever",
    litter_id: null,
    is_breeder: false,
    is_external: false,
    is_retired: false,
  });

  await page.goto(`/animals/${litterAnimalId}/edit`);
  await expect(page.locator('input[name="birth_date"]')).toHaveCount(0);
  await page.getByLabel("Nom principal").fill(`QA edition chiot modifie ${suffix}`);
  await page.locator("form").evaluate((form) => {
    const input = document.createElement("input");
    input.name = "birth_date";
    input.value = "2026-05-20";
    form.append(input);
  });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(
    `/animals/${litterAnimalId}?identity_status=success`,
  );

  const updatedLitterAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select("display_name, birth_date, litter_id, status, ownership_status")
      .eq("id", litterAnimalId)
      .single(),
    "read updated litter animal",
  );

  expect(updatedLitterAnimal).toMatchObject({
    display_name: `QA edition chiot modifie ${suffix}`,
    birth_date: "2026-04-15",
    litter_id: litterId,
    status: "born",
    ownership_status: "produced",
  });
});
