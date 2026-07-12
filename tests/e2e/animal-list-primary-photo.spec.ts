import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import {
  runE2eSqlSync,
  createAuthenticatedSupabaseClient,
  type SupabaseTestClient,
} from "./helpers/supabase";

const bucketName = "animal-media";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000099";
const userId = "10000000-0000-4000-8000-000000000001";

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

function countRows(table: "animals" | "media", ids: string[]) {
  if (ids.length === 0) {
    return 0;
  }

  const values = ids.map((id) => `(${sqlQuote(id)}::uuid)`).join(",");

  return Number(
    runSql(`
      select count(*)
      from public.${table}
      where id in (select column1 from (values ${values}) as fixture_ids);
    `),
  );
}

function countMediaRowsForAnimals(animalIds: string[]) {
  if (animalIds.length === 0) {
    return 0;
  }

  const values = animalIds.map((id) => `(${sqlQuote(id)}::uuid)`).join(",");

  return Number(
    runSql(`
      select count(*)
      from public.media
      where animal_id in (select column1 from (values ${values}) as fixture_ids);
    `),
  );
}

function countStorageObjects(paths: string[]) {
  if (paths.length === 0) {
    return 0;
  }

  const values = paths.map((path) => `(${sqlQuote(path)})`).join(",");

  return Number(
    runSql(`
      select count(*)
      from storage.objects
      where bucket_id = ${sqlQuote(bucketName)}
        and name in (select column1 from (values ${values}) as fixture_paths);
    `),
  );
}

async function createQaAnimal(
  supabase: SupabaseTestClient,
  animalId: string,
  callName: string,
  sex: "male" | "female",
  options: {
    officialName?: string | null;
    identificationNumber?: string | null;
    lofNumber?: string | null;
  } = {},
) {
  const { error } = await supabase.from("animals").insert({
    id: animalId,
    organization_id: organizationId,
    species: "dog",
    breed: "Golden Retriever",
    sex,
    call_name: callName,
    official_name: options.officialName ?? null,
    identification_number: options.identificationNumber ?? null,
    lof_number: options.lofNumber ?? null,
    birth_date: "2026-02-14",
    status: "available",
    ownership_status: "produced",
    is_breeder: false,
    is_external: false,
    is_retired: false,
    created_by: userId,
    updated_by: userId,
  });

  expect(error).toBeNull();
}

async function uploadWebpFixture(
  supabase: SupabaseTestClient,
  storagePath: string,
) {
  const buffer = await sharp({
    create: {
      width: 320,
      height: 400,
      channels: 3,
      background: "#b86b42",
    },
  })
    .webp({ quality: 86 })
    .toBuffer();
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, new Blob([buffer], { type: "image/webp" }), {
      contentType: "image/webp",
      upsert: false,
    });

  expect(error).toBeNull();
}

async function createPrimaryMedia(
  supabase: SupabaseTestClient,
  mediaId: string,
  animalId: string,
  filePath: string,
) {
  const { error } = await supabase.from("media").insert({
    id: mediaId,
    organization_id: organizationId,
    animal_id: animalId,
    media_type: "photo",
    source: "manual_upload",
    file_path: filePath,
    file_name: `${mediaId}.webp`,
    mime_type: "image/webp",
    file_size_bytes: 256,
    is_primary: true,
    width_px: 320,
    height_px: 400,
    created_by: userId,
    updated_by: userId,
  });

  expect(error).toBeNull();
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("shows animal list primary photo thumbnails with grouped media loading", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const withPhotoAnimalId = "30000000-0000-4000-8000-000000000001";
  const withoutPhotoAnimalId = "30000000-0000-4000-8000-000000000002";
  const brokenPhotoAnimalId = "30000000-0000-4000-8000-000000000003";
  const withPhotoMediaId = "40000000-0000-4000-8000-000000000001";
  const brokenPhotoMediaId = "40000000-0000-4000-8000-000000000003";
  const withPhotoName = `QA list photo ${withPhotoAnimalId.slice(0, 8)}`;
  const withoutPhotoName = `QA list no photo ${withoutPhotoAnimalId.slice(0, 8)}`;
  const brokenPhotoName = `QA list broken photo ${brokenPhotoAnimalId.slice(0, 8)}`;
  const withPhotoPath =
    `organizations/${organizationId}/animals/${withPhotoAnimalId}/primary/${withPhotoMediaId}.webp`;
  const brokenPhotoPath =
    `organizations/${otherOrganizationId}/animals/${brokenPhotoAnimalId}/primary/${brokenPhotoMediaId}.webp`;
  const animalIds = [
    withPhotoAnimalId,
    withoutPhotoAnimalId,
    brokenPhotoAnimalId,
  ];
  const mediaIds = [withPhotoMediaId, brokenPhotoMediaId];
  const storagePaths = [withPhotoPath];
  let finalCounts = {
    animals: -1,
    media: -1,
    mediaByAnimal: -1,
    storageObjects: -1,
  };

  try {
    await createQaAnimal(supabase, withPhotoAnimalId, withPhotoName, "male");
    await createQaAnimal(supabase, withoutPhotoAnimalId, withoutPhotoName, "female");
    await createQaAnimal(supabase, brokenPhotoAnimalId, brokenPhotoName, "female");
    await uploadWebpFixture(supabase, withPhotoPath);
    await createPrimaryMedia(
      supabase,
      withPhotoMediaId,
      withPhotoAnimalId,
      withPhotoPath,
    );
    await createPrimaryMedia(
      supabase,
      brokenPhotoMediaId,
      brokenPhotoAnimalId,
      brokenPhotoPath,
    );

    const source = readFileSync("src/app/animals/page.tsx", "utf8");
    expect(source.match(/createSignedUrls\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/animals\.map\(async[\s\S]*createSignedUrl/);

    await login(page);
    await page.goto("/animals");
    await expect(page.getByText(withPhotoName)).toBeVisible();
    await expect(page.getByText(withoutPhotoName)).toBeVisible();
    await expect(page.getByText(brokenPhotoName)).toBeVisible();
    await expect(
      page.getByTestId(`animal-list-primary-photo-${withPhotoAnimalId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `animal-list-primary-photo-placeholder-${withoutPhotoAnimalId}`,
      ),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `animal-list-primary-photo-placeholder-${brokenPhotoAnimalId}`,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Impossible de charger les animaux",
      }),
    ).toHaveCount(0);

    await page.goto("/animals?sex=male");
    await expect(page.getByText(withPhotoName)).toBeVisible();
    await expect(page.getByText(withoutPhotoName)).toHaveCount(0);
    await expect(page.getByText(brokenPhotoName)).toHaveCount(0);

    await page.goto("/animals");
    const withPhotoRow = page.locator("tr", {
      has: page.getByText(withPhotoName),
    });
    await withPhotoRow.getByRole("link", { name: "Fiche" }).click();
    await expect(page).toHaveURL(`/animals/${withPhotoAnimalId}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/animals");
    const thumbnailBox = await page
      .getByTestId(`animal-list-primary-photo-${withPhotoAnimalId}`)
      .boundingBox();
    expect(thumbnailBox?.width).toBeGreaterThan(40);
    expect(thumbnailBox?.height).toBeGreaterThan(56);
    await expect(page.getByText(withoutPhotoName)).toBeVisible();
  } finally {
    runSql(`
      delete from public.media
      where id in (${mediaIds.map((id) => `${sqlQuote(id)}::uuid`).join(",")});
    `);

    const storageDelete = await supabase.storage
      .from(bucketName)
      .remove(storagePaths);
    if (storageDelete.error) {
      throw new Error(`Storage cleanup failed: ${storageDelete.error.message}`);
    }

    runSql(`
      delete from public.animals
      where id in (${animalIds.map((id) => `${sqlQuote(id)}::uuid`).join(",")});
    `);

    finalCounts = {
      animals: countRows("animals", animalIds),
      media: countRows("media", mediaIds),
      mediaByAnimal: countMediaRowsForAnimals(animalIds),
      storageObjects: countStorageObjects(storagePaths),
    };

    expect(finalCounts).toEqual({
      animals: 0,
      media: 0,
      mediaByAnimal: 0,
      storageObjects: 0,
    });
  }
});

test("filters animals with URL text search before loading primary photos", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const animalIds = [
    "30000000-0000-4000-8000-000000000101",
    "30000000-0000-4000-8000-000000000102",
    "30000000-0000-4000-8000-000000000103",
    "30000000-0000-4000-8000-000000000104",
    "30000000-0000-4000-8000-000000000105",
  ];
  const mediaIds = [
    "40000000-0000-4000-8000-000000000101",
    "40000000-0000-4000-8000-000000000105",
  ];
  const [salomeId, officialId, identifiedId, lofId, decoyId] = animalIds;
  const [salomeMediaId, decoyMediaId] = mediaIds;
  const salomeName = "QA Recherche Salomé Rubis";
  const officialName = "Princesse Officielle Boréale QA";
  const identifiedName = "QA Recherche Identification";
  const lofName = "QA Recherche LOF";
  const decoyName = "QA Recherche Photo hors filtre";
  const identificationNumber = "250 269 610 123 456";
  const lofNumber = "LOF-SEARCH-2026-XYZ";
  const salomePath =
    `organizations/${organizationId}/animals/${salomeId}/primary/${salomeMediaId}.webp`;
  const decoyPath =
    `organizations/${organizationId}/animals/${decoyId}/primary/${decoyMediaId}.webp`;
  const storagePaths = [salomePath, decoyPath];
  const imageRequests: string[] = [];
  let finalCounts = {
    animals: -1,
    media: -1,
    mediaByAnimal: -1,
    storageObjects: -1,
  };

  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("/storage/v1/object/sign/animal-media/")) {
      imageRequests.push(url);
    }
  });

  try {
    await createQaAnimal(supabase, salomeId, salomeName, "female");
    await createQaAnimal(supabase, officialId, "QA Recherche Nom officiel", "male", {
      officialName,
    });
    await createQaAnimal(
      supabase,
      identifiedId,
      identifiedName,
      "female",
      { identificationNumber },
    );
    await createQaAnimal(supabase, lofId, lofName, "male", { lofNumber });
    await createQaAnimal(supabase, decoyId, decoyName, "female");
    await uploadWebpFixture(supabase, salomePath);
    await uploadWebpFixture(supabase, decoyPath);
    await createPrimaryMedia(supabase, salomeMediaId, salomeId, salomePath);
    await createPrimaryMedia(supabase, decoyMediaId, decoyId, decoyPath);

    await login(page);

    await page.goto("/animals?q=salome");
    await expect(page.getByText(salomeName)).toBeVisible();
    await expect(page.getByText(decoyName)).toHaveCount(0);
    await expect(
      page.getByTestId(`animal-list-primary-photo-${salomeId}`),
    ).toBeVisible();
    expect(imageRequests.some((url) => url.includes(salomeId))).toBe(true);
    expect(imageRequests.some((url) => url.includes(decoyId))).toBe(false);

    await page.goto("/animals?q=officielle%20boreale");
    await expect(page.getByText(officialName)).toBeVisible();
    await expect(page.getByText(salomeName)).toHaveCount(0);

    await page.goto("/animals?q=250%20269%20610");
    await expect(page.getByText(identifiedName)).toBeVisible();
    await expect(page.getByText(lofName)).toHaveCount(0);

    await page.goto("/animals?q=lof-search-2026");
    await expect(page.getByText(lofName)).toBeVisible();
    await expect(page.getByText(identifiedName)).toHaveCount(0);

    await page.goto("/animals?q=qa%20recherche&sex=male");
    await expect(page.getByText(officialName)).toBeVisible();
    await expect(page.getByText(lofName)).toBeVisible();
    await expect(page.getByText(salomeName)).toHaveCount(0);
    await expect(page.getByText(identifiedName)).toHaveCount(0);

    await page.goto("/animals?q=aucun-resultat-qa-recherche");
    await expect(page.getByText("Aucun animal trouvé.")).toBeVisible();

    await page.goto("/animals?q=salome");
    await page.getByRole("link", { name: "Disponibles" }).click();
    await expect(page).toHaveURL(/\/animals\?filter=available&q=salome/);
    await expect(page.getByText(salomeName)).toBeVisible();

    await page.getByRole("link", { name: "Réinitialiser" }).click();
    await expect(page).toHaveURL("/animals");

    await page.getByLabel("Rechercher un animal").fill("   ");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL("/animals");
  } finally {
    runSql(`
      delete from public.media
      where id in (${mediaIds.map((id) => `${sqlQuote(id)}::uuid`).join(",")});
    `);

    const storageDelete = await supabase.storage
      .from(bucketName)
      .remove(storagePaths);
    if (storageDelete.error) {
      throw new Error(`Storage cleanup failed: ${storageDelete.error.message}`);
    }

    runSql(`
      delete from public.animals
      where id in (${animalIds.map((id) => `${sqlQuote(id)}::uuid`).join(",")});
    `);

    finalCounts = {
      animals: countRows("animals", animalIds),
      media: countRows("media", mediaIds),
      mediaByAnimal: countMediaRowsForAnimals(animalIds),
      storageObjects: countStorageObjects(storagePaths),
    };

    expect(finalCounts).toEqual({
      animals: 0,
      media: 0,
      mediaByAnimal: 0,
      storageObjects: 0,
    });
  }
});
