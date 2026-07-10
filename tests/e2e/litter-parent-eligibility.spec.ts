import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createAuthenticatedSupabaseClient } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

type ParentSeed = {
  id: string;
  label: string;
  sex: "female" | "male";
  status: string;
  ownership_status: string;
  is_breeder: boolean;
  is_external?: boolean;
  is_retired?: boolean;
  litter_id?: string | null;
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

async function forceSelectOption(page: Page, name: string, value: string, label: string) {
  await page.locator(`select[name="${name}"]`).evaluate(
    (select, option) => {
      const htmlSelect = select as HTMLSelectElement;
      const htmlOption = document.createElement("option");
      htmlOption.value = option.value;
      htmlOption.textContent = option.label;
      htmlSelect.appendChild(htmlOption);
      htmlSelect.value = option.value;
      htmlSelect.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { value, label },
  );
}

test("secures litter parent choices in UI and server actions", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const suffix = randomUUID().slice(0, 8);
  const sourceLitterId = randomUUID();

  const { error: sourceLitterError } = await supabase.from("litters").insert({
    id: sourceLitterId,
    organization_id: organizationId,
    name: `QA portee source parent ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "closed",
    created_by: ownerId,
    updated_by: ownerId,
  });

  expect(sourceLitterError).toBeNull();

  const parents: ParentSeed[] = [
    {
      id: randomUUID(),
      label: `QA mere maison valide ${suffix}`,
      sex: "female",
      status: "breeding",
      ownership_status: "owned",
      is_breeder: true,
    },
    {
      id: randomUUID(),
      label: `QA pere maison valide ${suffix}`,
      sex: "male",
      status: "breeding",
      ownership_status: "owned",
      is_breeder: true,
    },
    {
      id: randomUUID(),
      label: `QA mere exterieure valide ${suffix}`,
      sex: "female",
      status: "breeding",
      ownership_status: "external_female",
      is_breeder: true,
      is_external: true,
    },
    {
      id: randomUUID(),
      label: `QA pere exterieur valide ${suffix}`,
      sex: "male",
      status: "breeding",
      ownership_status: "external_stud",
      is_breeder: true,
      is_external: true,
    },
    {
      id: randomUUID(),
      label: `QA femelle produite reproductrice ${suffix}`,
      sex: "female",
      status: "breeding",
      ownership_status: "produced",
      is_breeder: true,
      litter_id: sourceLitterId,
    },
    {
      id: randomUUID(),
      label: `QA male produit reproducteur ${suffix}`,
      sex: "male",
      status: "breeding",
      ownership_status: "produced",
      is_breeder: true,
      litter_id: sourceLitterId,
    },
    {
      id: randomUUID(),
      label: `QA mauvais sexe mere ${suffix}`,
      sex: "male",
      status: "breeding",
      ownership_status: "owned",
      is_breeder: true,
    },
    {
      id: randomUUID(),
      label: `QA chiot non reproducteur ${suffix}`,
      sex: "female",
      status: "active",
      ownership_status: "produced",
      is_breeder: false,
      litter_id: sourceLitterId,
    },
    {
      id: randomUUID(),
      label: `QA mere retraitee ${suffix}`,
      sex: "female",
      status: "retired",
      ownership_status: "owned",
      is_breeder: true,
      is_retired: true,
    },
    {
      id: randomUUID(),
      label: `QA mere decedee ${suffix}`,
      sex: "female",
      status: "deceased",
      ownership_status: "owned",
      is_breeder: true,
    },
    {
      id: randomUUID(),
      label: `QA mere archivee ${suffix}`,
      sex: "female",
      status: "archived",
      ownership_status: "owned",
      is_breeder: true,
    },
    {
      id: randomUUID(),
      label: `QA mere adoptee ${suffix}`,
      sex: "female",
      status: "adopted",
      ownership_status: "adopted_out",
      is_breeder: true,
    },
  ];

  const { error: parentInsertError } = await supabase.from("animals").insert(
    parents.map((parent) => ({
      id: parent.id,
      organization_id: organizationId,
      call_name: parent.label,
      species: "dog",
      breed: "Golden Retriever",
      sex: parent.sex,
      status: parent.status,
      ownership_status: parent.ownership_status,
      is_breeder: parent.is_breeder,
      is_external: parent.is_external ?? false,
      is_retired: parent.is_retired ?? false,
      litter_id: parent.litter_id ?? null,
      created_by: ownerId,
      updated_by: ownerId,
    })),
  );

  expect(parentInsertError).toBeNull();

  await login(page);
  await page.goto("/litters/new");

  await expect(page.locator('select[name="mother_id"]')).toContainText(
    parents[0].label,
  );
  await expect(page.locator('select[name="father_id"]')).toContainText(
    parents[1].label,
  );
  await expect(page.locator('select[name="mother_id"]')).toContainText(
    parents[2].label,
  );
  await expect(page.locator('select[name="father_id"]')).toContainText(
    parents[3].label,
  );
  await expect(page.locator('select[name="mother_id"]')).toContainText(
    parents[4].label,
  );
  await expect(page.locator('select[name="father_id"]')).toContainText(
    parents[5].label,
  );

  for (const invalidParent of parents.slice(6)) {
    await expect(page.locator('select[name="mother_id"]')).not.toContainText(
      invalidParent.label,
    );
  }

  const invalidMotherCases = parents.slice(6);

  for (const invalidMother of invalidMotherCases) {
    await page.goto("/litters/new");
    await page.getByLabel("Nom de la portée").fill(
      `Portee parent invalide ${invalidMother.id.slice(0, 8)}`,
    );
    await forceSelectOption(
      page,
      "mother_id",
      invalidMother.id,
      invalidMother.label,
    );
    await page.locator('select[name="father_id"]').selectOption(parents[1].id);
    await page.getByRole("button", { name: "Créer la portée" }).click();
    await expect(page).toHaveURL(/\/litters\/new\?status=invalid_mother$/);
  }

  await page.goto("/litters/new");
  await page.getByLabel("Nom de la portée").fill(`Portee valide ${suffix}`);
  await page.getByLabel("Race").fill("Berger Australien");
  await page.locator('select[name="mother_id"]').selectOption(parents[0].id);
  await page.locator('select[name="father_id"]').selectOption(parents[1].id);
  await page.getByRole("button", { name: "Créer la portée" }).click();
  await expect(page).toHaveURL(/\/litters\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("link", { name: parents[0].label })).toBeVisible();
  await expect(page.getByRole("link", { name: parents[1].label })).toBeVisible();

  await expect(page.locator('select[name="mother_id"]')).toContainText(
    parents[2].label,
  );
  await expect(page.locator('select[name="father_id"]')).toContainText(
    parents[3].label,
  );
  await expect(page.locator('select[name="mother_id"]')).toContainText(
    parents[4].label,
  );
  await expect(page.locator('select[name="father_id"]')).toContainText(
    parents[5].label,
  );

  await page.locator('select[name="mother_id"]').selectOption(parents[4].id);
  await page.locator('select[name="father_id"]').selectOption(parents[5].id);
  await page.getByRole("button", { name: "Enregistrer la portée" }).click();
  await expect(page).toHaveURL(/detail_status=success/);
  await expect(page.getByRole("link", { name: parents[4].label })).toBeVisible();
  await expect(page.getByRole("link", { name: parents[5].label })).toBeVisible();
});
