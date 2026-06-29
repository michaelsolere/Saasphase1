"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type AnimalInsert = Database["public"]["Tables"]["animals"]["Insert"];

const allowedSpecies = new Set(["dog", "cat"]);
const allowedSexes = new Set(["male", "female", "unknown"]);
const allowedManualStatuses = new Set([
  "planned",
  "active",
  "available",
  "reserved",
  "adopted",
  "kept",
  "breeding",
  "retired",
  "deceased",
  "archived",
]);
const allowedManualOwnershipStatuses = new Set([
  "owned",
  "external_stud",
  "external_female",
  "co_owned",
  "sold",
  "adopted_out",
  "unknown",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function animalCreateUrl(
  code:
    | "name_required"
    | "invalid"
    | "invalid_mother"
    | "invalid_father"
    | "same_parents"
    | "error",
) {
  return `/animals/new?status=${code}`;
}

function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength = 255,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeOptionalDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "invalid";
  }

  return trimmed;
}

function parseOptionalUuid(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (!UUID_REGEX.test(trimmed)) {
    return "invalid";
  }

  return trimmed;
}

export async function createManualAnimal(formData: FormData) {
  const displayName = normalizeOptionalText(formData.get("display_name"));

  if (!displayName) {
    redirect(animalCreateUrl("name_required"));
  }

  const rawSpecies = formData.get("species");
  const species =
    typeof rawSpecies === "string" && allowedSpecies.has(rawSpecies.trim())
      ? rawSpecies.trim()
      : "dog";

  const breed =
    normalizeOptionalText(formData.get("breed")) ?? "Golden Retriever";

  const rawSex = formData.get("sex");
  let sex =
    typeof rawSex === "string" && allowedSexes.has(rawSex.trim())
      ? rawSex.trim()
      : "unknown";

  const rawStatus = formData.get("status");
  let status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "active";

  if (!allowedManualStatuses.has(status)) {
    redirect(animalCreateUrl("invalid"));
  }

  const rawOwnershipStatus = formData.get("ownership_status");
  const ownershipStatus =
    typeof rawOwnershipStatus === "string" && rawOwnershipStatus.trim()
      ? rawOwnershipStatus.trim()
      : "owned";

  if (!allowedManualOwnershipStatuses.has(ownershipStatus)) {
    redirect(animalCreateUrl("invalid"));
  }

  const birthDate = normalizeOptionalDate(formData.get("birth_date"));

  if (birthDate === "invalid") {
    redirect(animalCreateUrl("invalid"));
  }

  const motherId = parseOptionalUuid(formData.get("mother_id"));

  if (motherId === "invalid") {
    redirect(animalCreateUrl("invalid_mother"));
  }

  const fatherId = parseOptionalUuid(formData.get("father_id"));

  if (fatherId === "invalid") {
    redirect(animalCreateUrl("invalid_father"));
  }

  if (motherId && fatherId && motherId === fatherId) {
    redirect(animalCreateUrl("same_parents"));
  }

  const isExternal =
    ownershipStatus === "external_stud" ||
    ownershipStatus === "external_female";
  let isBreeder = formData.get("is_breeder") === "yes";
  let isRetired = formData.get("is_retired") === "yes" || status === "retired";

  if (ownershipStatus === "external_stud") {
    sex = "male";
    isBreeder = true;
  }

  if (ownershipStatus === "external_female") {
    sex = "female";
    isBreeder = true;
  }

  if (isRetired) {
    status = "retired";
    isRetired = true;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    redirect(animalCreateUrl("error"));
  }

  const organizationId = membership.organization_id;

  if (motherId) {
    const { data: mother, error: motherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", motherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (motherError || !mother) {
      redirect(animalCreateUrl("invalid_mother"));
    }
  }

  if (fatherId) {
    const { data: father, error: fatherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", fatherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fatherError || !father) {
      redirect(animalCreateUrl("invalid_father"));
    }
  }

  const animalToCreate: AnimalInsert = {
    organization_id: organizationId,
    display_name: displayName,
    species,
    breed,
    sex,
    status,
    ownership_status: ownershipStatus,
    is_breeder: isBreeder,
    is_external: isExternal,
    is_retired: isRetired,
    birth_date: birthDate,
    identification_number: normalizeOptionalText(
      formData.get("identification_number"),
    ),
    color: normalizeOptionalText(formData.get("color")),
    coat_color: normalizeOptionalText(formData.get("coat_color")),
    mother_id: motherId,
    father_id: fatherId,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data: animal, error: insertError } = await supabase
    .from("animals")
    .insert(animalToCreate)
    .select("id")
    .maybeSingle();

  if (insertError || !animal?.id) {
    redirect(animalCreateUrl("error"));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animal.id}`);
  redirect(`/animals/${animal.id}`);
}
