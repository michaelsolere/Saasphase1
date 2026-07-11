import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

import { processAnimalPrimaryPhotoFile } from "../../src/features/animals/photo-processor";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const bucketName = "animal-media";
const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const qaReportPath = "/tmp/animal-primary-photo-qa-report.json";

type MediaRow = {
  id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  width_px: number | null;
  height_px: number | null;
  is_primary: boolean;
  deleted_at: string | null;
  updated_at: string;
};

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
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

function countMediaRowsByAnimal(animalId: string) {
  return Number(
    runSql(`
      select count(*)
      from public.media
      where animal_id = ${sqlQuote(animalId)}::uuid;
    `),
  );
}

function countStorageObjectsInFolder(folder: string) {
  return Number(
    runSql(`
      select count(*)
      from storage.objects
      where bucket_id = ${sqlQuote(bucketName)}
        and name like ${sqlQuote(`${folder}/%`)};
    `),
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

async function createQaAnimal(supabase: SupabaseTestClient, animalId: string) {
  const { error } = await supabase.from("animals").insert({
    id: animalId,
    organization_id: organizationId,
    species: "dog",
    breed: "Golden Retriever",
    sex: "female",
    call_name: `QA primary photo ${animalId.slice(0, 8)}`,
    birth_date: "2026-01-20",
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

async function createJpegFixture(
  fileName: string,
  width: number,
  height: number,
  color: string,
) {
  const path = join(tmpdir(), fileName);
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 92 })
    .withMetadata({ orientation: 6 })
    .toBuffer();

  writeFileSync(path, buffer);

  return path;
}

async function readActivePrimaryMedia(
  supabase: SupabaseTestClient,
  animalId: string,
) {
  const rows = expectSupabaseData(
    await supabase
      .from("media")
      .select(
        "id, file_path, file_name, mime_type, file_size_bytes, width_px, height_px, is_primary, deleted_at, updated_at",
      )
      .eq("animal_id", animalId)
      .eq("is_primary", true)
      .is("deleted_at", null),
    "read active primary media",
  ) as MediaRow[];

  expect(rows).toHaveLength(1);

  return rows[0];
}

async function readAllMedia(supabase: SupabaseTestClient, animalId: string) {
  return expectSupabaseData(
    await supabase
      .from("media")
      .select(
        "id, file_path, file_name, mime_type, file_size_bytes, width_px, height_px, is_primary, deleted_at, updated_at",
      )
      .eq("animal_id", animalId),
    "read all media",
  ) as MediaRow[];
}

async function discoverCleanupTargets(
  supabase: SupabaseTestClient,
  animalId: string,
) {
  const folder = `organizations/${organizationId}/animals/${animalId}/primary`;
  const mediaRows = await readAllMedia(supabase, animalId);
  const storageObjects = expectSupabaseData(
    await supabase.storage.from(bucketName).list(folder, { limit: 100 }),
    "discover Storage cleanup targets",
  );

  return {
    folder,
    mediaIds: mediaRows.map((media) => media.id),
    storagePaths: [
      ...mediaRows.map((media) => media.file_path),
      ...storageObjects.map((object) => `${folder}/${object.name}`),
    ],
  };
}

async function expectStorageObjectPresent(
  supabase: SupabaseTestClient,
  path: string,
) {
  const parts = path.split("/");
  const objectName = parts.at(-1);
  const folder = parts.slice(0, -1).join("/");
  const objects = expectSupabaseData(
    await supabase.storage.from(bucketName).list(folder, { limit: 100 }),
    "list Storage folder",
  );

  expect(objects.map((object) => object.name)).toContain(objectName);
  expect(countStorageObjects([path])).toBe(1);
}

async function expectStorageObjectAbsent(
  supabase: SupabaseTestClient,
  path: string,
) {
  const parts = path.split("/");
  const objectName = parts.at(-1);
  const folder = parts.slice(0, -1).join("/");
  const objects = expectSupabaseData(
    await supabase.storage.from(bucketName).list(folder, { limit: 100 }),
    "list Storage folder",
  );

  expect(objects.map((object) => object.name)).not.toContain(objectName);
  expect(countStorageObjects([path])).toBe(0);
}

async function removeStorageObjects(
  supabase: SupabaseTestClient,
  paths: string[],
) {
  const uniquePaths = Array.from(new Set(paths));

  if (uniquePaths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(bucketName).remove(uniquePaths);

  if (error) {
    throw new Error(`Storage cleanup failed: ${error.message}`);
  }
}

test("server processor rejects corrupted non-image content", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "broken.jpg", {
    type: "image/jpeg",
  });

  const result = await processAnimalPrimaryPhotoFile(file);

  expect(result).toEqual({ ok: false, code: "unreadable" });
});

test("adds, replaces and deletes an animal primary photo", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const mediaIds = new Set<string>();
  const storagePaths = new Set<string>();
  let finalCounts = {
    media: -1,
    animals: -1,
    storageObjects: -1,
    storageApiObjects: -1,
  };

  mkdirSync(tmpdir(), { recursive: true });

  try {
    await createQaAnimal(supabase, animalId);

    const firstImagePath = await createJpegFixture(
      `animal-primary-photo-${animalId}-first.jpg`,
      2400,
      1600,
      "#d8a24a",
    );
    const secondImagePath = await createJpegFixture(
      `animal-primary-photo-${animalId}-second.jpg`,
      2100,
      1500,
      "#4b8fb8",
    );

    await login(page);
    await page.goto(`/animals/${animalId}`);
    await expect(page.getByTestId("animal-primary-photo-placeholder")).toBeVisible();

    await page.getByRole("button", { name: "Ajouter une photo" }).click();
    await page.locator("#animal-primary-photo-file").setInputFiles(firstImagePath);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Photo ajoutée.")).toBeVisible();
    await expect(page.getByTestId("animal-primary-photo")).toBeVisible();

    const firstMedia = await readActivePrimaryMedia(supabase, animalId);
    mediaIds.add(firstMedia.id);
    storagePaths.add(firstMedia.file_path);

    expect(firstMedia.mime_type).toBe("image/webp");
    expect(firstMedia.width_px).toBeLessThanOrEqual(1800);
    expect(firstMedia.height_px).toBeLessThanOrEqual(1800);
    expect(firstMedia.file_size_bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(firstMedia.file_path).toMatch(
      new RegExp(
        `^organizations/${organizationId}/animals/${animalId}/primary/[0-9a-f-]+\\.webp$`,
      ),
    );
    expect(firstMedia.file_path).not.toContain("primary-photo.webp");
    await expectStorageObjectPresent(supabase, firstMedia.file_path);

    await page.getByRole("button", { name: "Remplacer la photo" }).click();
    await page.locator("#animal-primary-photo-file").setInputFiles(secondImagePath);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Photo remplacée.")).toBeVisible();
    await expect(page.getByTestId("animal-primary-photo")).toBeVisible();

    const replacedMedia = await readActivePrimaryMedia(supabase, animalId);
    mediaIds.add(replacedMedia.id);
    storagePaths.add(replacedMedia.file_path);

    expect(replacedMedia.id).toBe(firstMedia.id);
    expect(replacedMedia.file_path).not.toBe(firstMedia.file_path);
    expect(replacedMedia.mime_type).toBe("image/webp");
    expect(replacedMedia.width_px).toBeLessThanOrEqual(1800);
    expect(replacedMedia.height_px).toBeLessThanOrEqual(1800);
    expect(replacedMedia.file_size_bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    await expectStorageObjectAbsent(supabase, firstMedia.file_path);
    await expectStorageObjectPresent(supabase, replacedMedia.file_path);

    await page.getByRole("button", { name: "Supprimer la photo" }).click();
    runSql(`
      delete from public.media
      where id = ${sqlQuote(replacedMedia.id)}::uuid;
    `);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Supprimer" })
      .click();
    await expect(
      page.getByText("Erreur temporaire. Réessayez dans quelques instants."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Remplacer la photo" }).click();
    await page.locator("#animal-primary-photo-file").setInputFiles(secondImagePath);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Photo ajoutée.")).toBeVisible();

    const restoredMedia = await readActivePrimaryMedia(supabase, animalId);
    mediaIds.add(restoredMedia.id);
    storagePaths.add(restoredMedia.file_path);
    expect(restoredMedia.id).not.toBe(replacedMedia.id);
    await expectStorageObjectPresent(supabase, restoredMedia.file_path);

    await page.getByRole("button", { name: "Supprimer la photo" }).click();
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Photo supprimée.")).toBeVisible();
    await expect(page.getByTestId("animal-primary-photo-placeholder")).toBeVisible();

    const mediaRowsAfterDelete = await readAllMedia(supabase, animalId);
    expect(mediaRowsAfterDelete).toHaveLength(1);
    expect(mediaRowsAfterDelete[0].id).toBe(restoredMedia.id);
    expect(mediaRowsAfterDelete[0].deleted_at).not.toBeNull();
    await expectStorageObjectAbsent(supabase, restoredMedia.file_path);
  } finally {
    const discoveredTargets = await discoverCleanupTargets(supabase, animalId);

    for (const mediaId of discoveredTargets.mediaIds) {
      mediaIds.add(mediaId);
    }

    for (const storagePath of discoveredTargets.storagePaths) {
      storagePaths.add(storagePath);
    }

    const exactMediaIds = Array.from(mediaIds);
    const exactStoragePaths = Array.from(storagePaths);

    if (exactMediaIds.length > 0) {
      runSql(`
        delete from public.media
        where id in (${exactMediaIds.map((id) => `${sqlQuote(id)}::uuid`).join(",")});
      `);
    }

    await removeStorageObjects(supabase, exactStoragePaths);

    runSql(`
      delete from public.animals
      where id = ${sqlQuote(animalId)}::uuid;
    `);

    finalCounts = {
      media: countMediaRowsByAnimal(animalId),
      animals: countRows("animals", [animalId]),
      storageObjects: countStorageObjectsInFolder(discoveredTargets.folder),
      storageApiObjects: expectSupabaseData(
        await supabase.storage
          .from(bucketName)
          .list(discoveredTargets.folder, { limit: 100 }),
        "final Storage API folder verification",
      ).length,
    };

    writeFileSync(
      qaReportPath,
      JSON.stringify(
        {
          animalId,
          mediaIds: exactMediaIds,
          storagePaths: exactStoragePaths,
          finalCounts,
        },
        null,
        2,
      ),
    );

    expect(finalCounts).toEqual({
      media: 0,
      animals: 0,
      storageObjects: 0,
      storageApiObjects: 0,
    });
  }
});
