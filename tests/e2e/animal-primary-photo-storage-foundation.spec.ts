import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const bucketName = "animal-media";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000099";
const userId = "10000000-0000-4000-8000-000000000001";
const animalId = "90000000-0000-4000-8000-000000001001";
const firstMediaId = "90000000-0000-4000-8000-000000002001";
const secondMediaId = "90000000-0000-4000-8000-000000002002";
const acceptedObjectId = "90000000-0000-4000-8000-000000003001";
const rejectedObjectId = "90000000-0000-4000-8000-000000003002";

function webpPayload() {
  return new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00])], {
    type: "image/webp",
  });
}

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
    {
      encoding: "utf8",
    },
  ).trim();
}

function countPublicRows(table: "animals" | "media", ids: string[]) {
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

function deleteQaMediaRows() {
  const mediaIds = [firstMediaId, secondMediaId]
    .map((id) => `${sqlQuote(id)}::uuid`)
    .join(",");

  runSql(`
    delete from public.media where id in (${mediaIds});
  `);
}

function deleteQaAnimalRow() {
  runSql(`
    delete from public.animals where id = ${sqlQuote(animalId)}::uuid;
  `);
}

async function removeQaStorageObjects(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
  storagePaths: string[],
  label: string,
) {
  const storageDelete = await supabase.storage
    .from(bucketName)
    .remove(storagePaths);
  if (storageDelete.error) {
    throw new Error(`${label}: ${storageDelete.error.message}`);
  }
}

async function cleanupQaFixtures(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
  storagePaths: string[],
  label: string,
) {
  deleteQaMediaRows();
  await removeQaStorageObjects(supabase, storagePaths, label);
  deleteQaAnimalRow();
}

test("validates animal primary photo SQL and Storage foundation", async () => {
  const supabase = await createAuthenticatedSupabaseClient();

  const acceptedPath =
    `organizations/${organizationId}/animals/${animalId}/primary/${acceptedObjectId}.webp`;
  const rejectedPath =
    `organizations/${otherOrganizationId}/animals/${animalId}/primary/${rejectedObjectId}.webp`;
  const storagePaths = [acceptedPath, rejectedPath];

  await cleanupQaFixtures(supabase, storagePaths, "delete initial Storage QA objects");

  try {
    const { error: animalError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      species: "dog",
      breed: "Golden Retriever",
      sex: "unknown",
      call_name: `QA primary photo ${animalId.slice(0, 8)}`,
      status: "available",
      ownership_status: "produced",
      is_breeder: false,
      is_external: false,
      is_retired: false,
      created_by: userId,
      updated_by: userId,
    });

    expect(animalError).toBeNull();

    const acceptedUpload = await supabase.storage
      .from(bucketName)
      .upload(acceptedPath, webpPayload(), {
        contentType: "image/webp",
        upsert: false,
      });

    expect(acceptedUpload.error).toBeNull();

    const rejectedUpload = await supabase.storage
      .from(bucketName)
      .upload(rejectedPath, webpPayload(), {
        contentType: "image/webp",
        upsert: false,
      });

    expect(rejectedUpload.error).not.toBeNull();

    const firstMedia = await supabase.from("media").insert({
      id: firstMediaId,
      organization_id: organizationId,
      animal_id: animalId,
      media_type: "photo",
      source: "manual_upload",
      file_path: acceptedPath,
      file_name: `${acceptedObjectId}.webp`,
      mime_type: "image/webp",
      file_size_bytes: 5,
      is_primary: true,
      width_px: 1200,
      height_px: 800,
      created_by: userId,
      updated_by: userId,
    });

    expect(firstMedia.error).toBeNull();

    const secondMedia = await supabase.from("media").insert({
      id: secondMediaId,
      organization_id: organizationId,
      animal_id: animalId,
      media_type: "photo",
      source: "manual_upload",
      file_path:
        `organizations/${organizationId}/animals/${animalId}/primary/${secondMediaId}.webp`,
      file_name: `${secondMediaId}.webp`,
      mime_type: "image/webp",
      file_size_bytes: 5,
      is_primary: true,
      width_px: 1200,
      height_px: 800,
      created_by: userId,
      updated_by: userId,
    });

    expect(secondMedia.error).not.toBeNull();
  } finally {
    deleteQaMediaRows();
    await removeQaStorageObjects(supabase, storagePaths, "delete Storage QA objects");
    deleteQaAnimalRow();

    const remainingMedia = countPublicRows("media", [
      firstMediaId,
      secondMediaId,
    ]);
    const remainingAnimals = countPublicRows("animals", [animalId]);
    const remainingStorageObjects = countStorageObjects(storagePaths);
    const remainingAcceptedObjects = expectSupabaseData(
      await supabase.storage.from(bucketName).list(
        `organizations/${organizationId}/animals/${animalId}/primary`,
        {
          limit: 100,
        },
      ),
      "list Storage QA folder",
    );

    expect(remainingMedia).toBe(0);
    expect(remainingAnimals).toBe(0);
    expect(remainingStorageObjects).toBe(0);
    expect(remainingAcceptedObjects.map((object) => object.name)).not.toContain(
      `${acceptedObjectId}.webp`,
    );
  }
});
