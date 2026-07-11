"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  isAcceptedAnimalPhotoMimeType,
  processAnimalPrimaryPhotoFile,
} from "./photo-processor";

export type AnimalPhotoActionCode =
  | "added"
  | "replaced"
  | "deleted"
  | "invalid_type"
  | "unreadable"
  | "too_large"
  | "conflict"
  | "temporary_error";

export type AnimalPhotoActionResult = {
  ok: boolean;
  code: AnimalPhotoActionCode;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type MediaRow = Database["public"]["Tables"]["media"]["Row"];

const bucketName = "animal-media";
const maxInputBytes = 1.5 * 1024 * 1024;

function parseUuid(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    trimmed,
  )
    ? trimmed
    : null;
}

function temporaryError(): AnimalPhotoActionResult {
  return { ok: false, code: "temporary_error" };
}

async function requireUser(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function readActiveAnimal(
  supabase: SupabaseServerClient,
  animalId: string,
) {
  const { data: animal, error } = await supabase
    .from("animals")
    .select("id, organization_id")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !animal?.organization_id) {
    return null;
  }

  return animal;
}

async function readPrimaryPhoto(
  supabase: SupabaseServerClient,
  animalId: string,
) {
  const { data, error } = await supabase
    .from("media")
    .select("*")
    .eq("animal_id", animalId)
    .eq("is_primary", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { ok: false as const, media: null };
  }

  return { ok: true as const, media: data as MediaRow | null };
}

async function removeStorageObject(
  supabase: SupabaseServerClient,
  path: string,
) {
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  return !error;
}

function buildPrimaryPhotoPath(organizationId: string, animalId: string) {
  const objectId = randomUUID();

  return {
    fileName: `${objectId}.webp`,
    filePath:
      `organizations/${organizationId}/animals/${animalId}/primary/${objectId}.webp`,
  };
}

function getUploadFile(formData: FormData) {
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return { ok: false as const, code: "unreadable" as const };
  }

  if (!file.size || file.size > maxInputBytes) {
    return { ok: false as const, code: "too_large" as const };
  }

  if (!isAcceptedAnimalPhotoMimeType(file.type)) {
    return { ok: false as const, code: "invalid_type" as const };
  }

  return { ok: true as const, file };
}

export async function uploadAnimalPrimaryPhoto(
  formData: FormData,
): Promise<AnimalPhotoActionResult> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const animalId = parseUuid(formData.get("animal_id"));

  if (!animalId) {
    return temporaryError();
  }

  const animal = await readActiveAnimal(supabase, animalId);

  if (!animal) {
    return temporaryError();
  }

  const fileResult = getUploadFile(formData);

  if (!fileResult.ok) {
    return { ok: false, code: fileResult.code };
  }

  const processed = await processAnimalPrimaryPhotoFile(fileResult.file);

  if (!processed.ok) {
    return { ok: false, code: processed.code };
  }

  const primaryPhoto = await readPrimaryPhoto(supabase, animal.id);

  if (!primaryPhoto.ok) {
    return temporaryError();
  }

  const { fileName, filePath } = buildPrimaryPhotoPath(
    animal.organization_id,
    animal.id,
  );
  const upload = await supabase.storage.from(bucketName).upload(
    filePath,
    processed.buffer,
    {
      contentType: processed.mimeType,
      upsert: false,
    },
  );

  if (upload.error) {
    return temporaryError();
  }

  if (!primaryPhoto.media) {
    const { error: insertError } = await supabase.from("media").insert({
      organization_id: animal.organization_id,
      animal_id: animal.id,
      media_type: "photo",
      source: "manual_upload",
      is_primary: true,
      visibility: "internal",
      file_path: filePath,
      file_name: fileName,
      mime_type: processed.mimeType,
      file_size_bytes: processed.fileSizeBytes,
      width_px: processed.widthPx,
      height_px: processed.heightPx,
      created_by: user.id,
      updated_by: user.id,
    });

    if (insertError) {
      if (!(await removeStorageObject(supabase, filePath))) {
        console.error("animal primary photo insert compensation failed", {
          animalId: animal.id,
          newPath: filePath,
        });
      }

      return temporaryError();
    }

    revalidatePath(`/animals/${animal.id}`);
    return { ok: true, code: "added" };
  }

  const snapshot = primaryPhoto.media;
  const replacementUpdatedAt = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("media")
    .update({
      file_path: filePath,
      file_name: fileName,
      mime_type: processed.mimeType,
      file_size_bytes: processed.fileSizeBytes,
      width_px: processed.widthPx,
      height_px: processed.heightPx,
      updated_at: replacementUpdatedAt,
      updated_by: user.id,
    })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updated_at)
    .is("deleted_at", null)
    .select("*");

  const updatedMedia = (updatedRows as MediaRow[] | null)?.[0] ?? null;

  if (updateError || !updatedMedia) {
    if (!(await removeStorageObject(supabase, filePath))) {
      console.error("animal primary photo conflict compensation failed", {
        animalId: animal.id,
        newPath: filePath,
      });
    }

    return { ok: false, code: updateError ? "temporary_error" : "conflict" };
  }

  if (!(await removeStorageObject(supabase, snapshot.file_path))) {
    console.error("animal primary photo old object removal failed", {
      animalId: animal.id,
      mediaId: snapshot.id,
      oldPath: snapshot.file_path,
      newPath: filePath,
    });

    const { data: restoredRows, error: restoreError } = await supabase
      .from("media")
      .update({
        file_path: snapshot.file_path,
        file_name: snapshot.file_name,
        mime_type: snapshot.mime_type,
        file_size_bytes: snapshot.file_size_bytes,
        width_px: snapshot.width_px,
        height_px: snapshot.height_px,
        updated_at: new Date().toISOString(),
        updated_by: snapshot.updated_by,
      })
      .eq("id", snapshot.id)
      .eq("updated_at", updatedMedia.updated_at)
      .select("id");

    if (!restoreError && (restoredRows?.length ?? 0) === 1) {
      if (!(await removeStorageObject(supabase, filePath))) {
        console.error("animal primary photo restored new object removal failed", {
          animalId: animal.id,
          mediaId: snapshot.id,
          newPath: filePath,
        });
      }
    }

    return temporaryError();
  }

  revalidatePath(`/animals/${animal.id}`);
  return { ok: true, code: "replaced" };
}

export async function deleteAnimalPrimaryPhoto(
  formData: FormData,
): Promise<AnimalPhotoActionResult> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const animalId = parseUuid(formData.get("animal_id"));

  if (!animalId) {
    return temporaryError();
  }

  const animal = await readActiveAnimal(supabase, animalId);

  if (!animal) {
    return temporaryError();
  }

  const primaryPhoto = await readPrimaryPhoto(supabase, animal.id);

  if (!primaryPhoto.ok || !primaryPhoto.media) {
    return temporaryError();
  }

  const snapshot = primaryPhoto.media;
  const now = new Date().toISOString();
  const { data: deletedRows, error: deleteError } = await supabase
    .from("media")
    .update({
      deleted_at: now,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updated_at)
    .is("deleted_at", null)
    .select("*");

  const deletedMedia = (deletedRows as MediaRow[] | null)?.[0] ?? null;

  if (deleteError || !deletedMedia) {
    return { ok: false, code: deleteError ? "temporary_error" : "conflict" };
  }

  if (!(await removeStorageObject(supabase, snapshot.file_path))) {
    console.error("animal primary photo storage delete failed", {
      animalId: animal.id,
      mediaId: snapshot.id,
      path: snapshot.file_path,
    });

    const { data: restoredRows, error: restoreError } = await supabase
      .from("media")
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
        updated_by: snapshot.updated_by,
      })
      .eq("id", snapshot.id)
      .eq("updated_at", deletedMedia.updated_at)
      .select("id");

    if (restoreError || (restoredRows?.length ?? 0) !== 1) {
      console.error("animal primary photo delete restore failed", {
        animalId: animal.id,
        mediaId: snapshot.id,
        path: snapshot.file_path,
      });
    }

    return temporaryError();
  }

  revalidatePath(`/animals/${animal.id}`);
  return { ok: true, code: "deleted" };
}
