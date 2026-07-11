"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { FINAL_RESERVATION_STATUSES } from "@/features/reservations/statuses";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type AnimalInsert = Database["public"]["Tables"]["animals"]["Insert"];
type AnimalUpdate = Database["public"]["Tables"]["animals"]["Update"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

const allowedSpecies = new Set(["dog", "cat"]);
const allowedSexes = new Set(["male", "female", "unknown"]);
const allowedManualStatuses = new Set([
  "planned",
  "active",
  "available",
  "reserved",
  "adopted",
  "kept",
  "retired",
  "deceased",
  "archived",
]);
const editableAdministrativeStatuses = new Set([
  "active",
  "breeding",
  "retired",
  "deceased",
  "archived",
]);
const allowedAdministrativeStatusUpdates = new Set([
  "active",
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
const allowedAnimalHealthEventTypes = new Set([
  "vaccination",
  "xray",
  "ultrasound",
  "pregnancy_check",
  "other",
]);
const allowedEventStatuses = new Set([
  "planned",
  "todo",
  "in_progress",
  "done",
  "late",
  "cancelled",
  "postponed",
  "not_applicable",
]);
const allowedEventPriorities = new Set(["low", "normal", "high", "urgent"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOME_BREEDER_MIN_AGE_MONTHS = 15;

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

function animalIdentityEditUrl(
  animalId: string,
  code: "name_required" | "invalid_date" | "invalid" | "error",
) {
  return `/animals/${animalId}/edit?status=${code}`;
}

function animalFinalIdentityUrl(animalId: string, code: "success" | "error") {
  return `/animals/${animalId}?final_identity_status=${code}#identite-definitive`;
}

function animalHealthEventUrl(
  animalId: string,
  code: "success" | "title_required" | "invalid_date" | "error",
) {
  return `/animals/${animalId}?health_event_status=${code}#sante`;
}

function animalHomeBreederPromotionUrl(
  animalId: string,
  code: "success" | "not_allowed" | "error",
) {
  return `/animals/${animalId}?home_breeder_promotion_status=${code}`;
}

function animalKeepAtKennelUrl(
  animalId: string,
  code: "success" | "not_allowed" | "error",
) {
  return `/animals/${animalId}?keep_at_kennel_status=${code}`;
}

function animalMakeAvailableUrl(
  animalId: string,
  code: "success" | "not_allowed" | "error",
) {
  return `/animals/${animalId}?make_available_status=${code}`;
}

function animalAvailabilityStatusUrl(
  animalId: string,
  code: "success" | "not_allowed" | "error",
  litterId?: string | null,
) {
  if (litterId) {
    return `/litters/${litterId}?animal_availability_status=${code}#animaux-lies`;
  }

  return `/animals/${animalId}?availability_status=${code}`;
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

function normalizeOptionalHttpUrl(value: FormDataEntryValue | null) {
  const text = normalizeOptionalText(value, 2048);

  if (!text) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    return "invalid";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "invalid";
  }

  return url.toString();
}

function parseDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + 1, 0),
  ).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}

function todayDateOnly() {
  const today = new Date();

  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
}

function latestHomeBreederEligibleBirthDate() {
  return formatDateOnly(
    addMonths(todayDateOnly(), -HOME_BREEDER_MIN_AGE_MONTHS),
  );
}

function hasReachedHomeBreederMinimumAge(birthDate: string | null) {
  const parsedBirthDate = parseDateOnly(birthDate);

  if (!parsedBirthDate) {
    return false;
  }

  return (
    addMonths(parsedBirthDate, HOME_BREEDER_MIN_AGE_MONTHS) <= todayDateOnly()
  );
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
  const callName = normalizeOptionalText(formData.get("call_name"));
  const officialName = normalizeOptionalText(formData.get("official_name"));

  if (!callName && !officialName) {
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

  const pedigreeUrl = normalizeOptionalHttpUrl(formData.get("pedigree_url"));

  if (pedigreeUrl === "invalid") {
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
    call_name: callName,
    official_name: officialName,
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
    pedigree_url: pedigreeUrl,
    lof_number: normalizeOptionalText(formData.get("lof_number")),
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

export async function updateAnimalIdentity(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  const callName = normalizeOptionalText(formData.get("call_name"));
  const officialName = normalizeOptionalText(formData.get("official_name"));
  const speciesRaw = formData.get("species");
  const species =
    typeof speciesRaw === "string" && allowedSpecies.has(speciesRaw.trim())
      ? speciesRaw.trim()
      : "invalid";
  const breed = normalizeOptionalText(formData.get("breed"));
  const sexRaw = formData.get("sex");
  const sex =
    typeof sexRaw === "string" && allowedSexes.has(sexRaw.trim())
      ? sexRaw.trim()
      : "invalid";

  if (!callName && !officialName) {
    redirect(animalIdentityEditUrl(animalId, "name_required"));
  }

  const pedigreeUrl = normalizeOptionalHttpUrl(formData.get("pedigree_url"));

  if (
    pedigreeUrl === "invalid" ||
    species === "invalid" ||
    sex === "invalid" ||
    !breed
  ) {
    redirect(animalIdentityEditUrl(animalId, "invalid"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select("id, organization_id, litter_id, status")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalIdentityEditUrl(animalId, "error"));
  }

  const statusRaw = formData.get("status");
  let nextAdministrativeStatus: string | null = null;

  if (statusRaw !== null) {
    if (typeof statusRaw !== "string") {
      redirect(animalIdentityEditUrl(animalId, "invalid"));
    }

    const currentStatus = String(animal.status ?? "");
    const requestedStatus = statusRaw.trim();

    if (!editableAdministrativeStatuses.has(currentStatus)) {
      redirect(animalIdentityEditUrl(animalId, "invalid"));
    }

    if (requestedStatus === "breeding" && currentStatus === "breeding") {
      nextAdministrativeStatus = null;
    } else if (allowedAdministrativeStatusUpdates.has(requestedStatus)) {
      nextAdministrativeStatus = requestedStatus;
    } else {
      redirect(animalIdentityEditUrl(animalId, "invalid"));
    }
  }

  const animalToUpdate: AnimalUpdate = {
    call_name: callName,
    official_name: officialName,
    species,
    breed,
    sex,
    identification_number: normalizeOptionalText(
      formData.get("identification_number"),
    ),
    pedigree_url: pedigreeUrl,
    lof_number: normalizeOptionalText(formData.get("lof_number")),
    coat_color: normalizeOptionalText(formData.get("coat_color")),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (nextAdministrativeStatus) {
    animalToUpdate.status = nextAdministrativeStatus;
    animalToUpdate.is_retired = nextAdministrativeStatus === "retired";
  }

  if (!animal.litter_id) {
    const birthDate = normalizeOptionalDate(formData.get("birth_date"));
    const motherId = parseOptionalUuid(formData.get("mother_id"));
    const fatherId = parseOptionalUuid(formData.get("father_id"));

    if (
      birthDate === "invalid" ||
      motherId === "invalid" ||
      fatherId === "invalid" ||
      motherId === animal.id ||
      fatherId === animal.id ||
      (motherId && fatherId && motherId === fatherId)
    ) {
      redirect(
        animalIdentityEditUrl(
          animalId,
          birthDate === "invalid" ? "invalid_date" : "invalid",
        ),
      );
    }

    const parentIds = [motherId, fatherId].filter(Boolean) as string[];
    const { data: parents, error: parentsError } = parentIds.length
      ? await supabase
          .from("animals")
          .select("id")
          .eq("organization_id", animal.organization_id)
          .in("id", parentIds)
          .is("deleted_at", null)
      : { data: [], error: null };
    const foundParentIds = new Set((parents ?? []).map((parent) => parent.id));

    if (
      parentsError ||
      parentIds.some((parentId) => !foundParentIds.has(parentId))
    ) {
      redirect(animalIdentityEditUrl(animalId, "invalid"));
    }

    if (birthDate === "invalid") {
      redirect(animalIdentityEditUrl(animalId, "invalid_date"));
    }

    animalToUpdate.birth_date = birthDate;
    animalToUpdate.mother_id = motherId;
    animalToUpdate.father_id = fatherId;
  }

  const { error: updateError } = await supabase
    .from("animals")
    .update(animalToUpdate)
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(animalIdentityEditUrl(animalId, "error"));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  revalidatePath(`/animals/${animalId}/edit`);
  redirect(`/animals/${animalId}?identity_status=success`);
}

export async function updateAnimalFinalIdentity(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select("id, organization_id")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalFinalIdentityUrl(animalId, "error"));
  }

  const animalToUpdate: AnimalUpdate = {
    identification_number: normalizeOptionalText(
      formData.get("identification_number"),
    ),
    official_name: normalizeOptionalText(formData.get("official_name")),
    call_name: normalizeOptionalText(formData.get("call_name")),
    lof_number: normalizeOptionalText(formData.get("lof_number")),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  const { error: updateError } = await supabase
    .from("animals")
    .update(animalToUpdate)
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(animalFinalIdentityUrl(animalId, "error"));
  }

  const { data: relatedReservations } = await supabase
    .from("reservations")
    .select("id")
    .eq("animal_id", animalId)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null);

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  revalidatePath(`/animals/${animalId}/edit`);

  for (const reservation of relatedReservations ?? []) {
    revalidatePath(`/reservations/${reservation.id}`);
  }

  redirect(animalFinalIdentityUrl(animalId, "success"));
}

export async function promoteAnimalToHomeBreeder(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  if (formData.get("confirm_home_breeder_promotion") !== "yes") {
    redirect(animalHomeBreederPromotionUrl(animalId, "not_allowed"));
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
    redirect(animalHomeBreederPromotionUrl(animalId, "error"));
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, organization_id, sex, status, ownership_status, birth_date, litter_id, identification_number, is_breeder, is_external, is_retired",
    )
    .eq("id", animalId)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalHomeBreederPromotionUrl(animalId, "error"));
  }

  const isEligibleStatus =
    animal.status === "kept" ||
    ["owned", "produced"].includes(String(animal.ownership_status)) ||
    Boolean(animal.litter_id);
  const isAdoptedOut = ["adopted_out", "sold"].includes(
    String(animal.ownership_status),
  );

  const canPromote =
    animal.sex === "female" &&
    !animal.is_external &&
    !animal.is_breeder &&
    !animal.is_retired &&
    animal.status !== "adopted" &&
    animal.status !== "deceased" &&
    animal.status !== "archived" &&
    animal.status !== "retired" &&
    !isAdoptedOut &&
    hasReachedHomeBreederMinimumAge(animal.birth_date) &&
    Boolean(animal.identification_number?.trim()) &&
    isEligibleStatus;

  if (!canPromote) {
    redirect(animalHomeBreederPromotionUrl(animalId, "not_allowed"));
  }

  const { data: promotedAnimal, error: updateError } = await supabase
    .from("animals")
    .update({ is_breeder: true })
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null)
    .eq("sex", "female")
    .eq("is_external", false)
    .eq("is_breeder", false)
    .eq("is_retired", false)
    .not("birth_date", "is", null)
    .lte("birth_date", latestHomeBreederEligibleBirthDate())
    .not("identification_number", "is", null)
    .neq("identification_number", "")
    .not("status", "in", "(adopted,deceased,archived,retired)")
    .select("id")
    .maybeSingle();

  if (updateError || !promotedAnimal?.id) {
    redirect(animalHomeBreederPromotionUrl(animalId, "error"));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  revalidatePath("/cheptel");
  redirect(animalHomeBreederPromotionUrl(animalId, "success"));
}

export async function keepAnimalAtKennel(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  if (formData.get("confirm_keep_at_kennel") !== "yes") {
    redirect(animalKeepAtKennelUrl(animalId, "not_allowed"));
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
    redirect(animalKeepAtKennelUrl(animalId, "error"));
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, organization_id, status, ownership_status, is_breeder, is_external, is_retired",
    )
    .eq("id", animalId)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalKeepAtKennelUrl(animalId, "error"));
  }

  const isAdoptedOut = ["adopted_out", "sold"].includes(
    String(animal.ownership_status),
  );
  const canKeep =
    ["born", "active", "available"].includes(animal.status) &&
    !animal.is_breeder &&
    !animal.is_external &&
    !animal.is_retired &&
    !isAdoptedOut;

  if (!canKeep) {
    redirect(animalKeepAtKennelUrl(animalId, "not_allowed"));
  }

  const { data: keptAnimal, error: updateError } = await supabase
    .from("animals")
    .update({ status: "kept" })
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null)
    .in("status", ["born", "active", "available"])
    .eq("is_breeder", false)
    .eq("is_external", false)
    .eq("is_retired", false)
    .not("ownership_status", "in", "(adopted_out,sold)")
    .select("id")
    .maybeSingle();

  if (updateError || !keptAnimal?.id) {
    redirect(animalKeepAtKennelUrl(animalId, "error"));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  revalidatePath("/cheptel");
  redirect(animalKeepAtKennelUrl(animalId, "success"));
}

export async function makeKeptAnimalAvailable(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  if (formData.get("confirm_make_available") !== "yes") {
    redirect(animalMakeAvailableUrl(animalId, "not_allowed"));
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
    redirect(animalMakeAvailableUrl(animalId, "error"));
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, organization_id, status, ownership_status, is_breeder, is_external, is_retired",
    )
    .eq("id", animalId)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalMakeAvailableUrl(animalId, "error"));
  }

  const isAdoptedOut = ["adopted_out", "sold"].includes(
    String(animal.ownership_status),
  );
  const canMakeAvailable =
    animal.status === "kept" &&
    !animal.is_breeder &&
    !animal.is_external &&
    !animal.is_retired &&
    !isAdoptedOut;

  if (!canMakeAvailable) {
    redirect(animalMakeAvailableUrl(animalId, "not_allowed"));
  }

  const { data: activeReservations, error: reservationsError } = await supabase
    .from("reservations")
    .select("id")
    .eq("organization_id", animal.organization_id)
    .eq("animal_id", animal.id)
    .is("deleted_at", null)
    .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`)
    .limit(1);

  if (reservationsError) {
    redirect(animalMakeAvailableUrl(animalId, "error"));
  }

  if (activeReservations && activeReservations.length > 0) {
    redirect(animalMakeAvailableUrl(animalId, "not_allowed"));
  }

  const { data: availableAnimal, error: updateError } = await supabase
    .from("animals")
    .update({ status: "available" })
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .is("deleted_at", null)
    .eq("status", "kept")
    .eq("is_breeder", false)
    .eq("is_external", false)
    .eq("is_retired", false)
    .not("ownership_status", "in", "(adopted_out,sold)")
    .select("id")
    .maybeSingle();

  if (updateError || !availableAnimal?.id) {
    redirect(animalMakeAvailableUrl(animalId, "error"));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  revalidatePath("/cheptel");
  redirect(animalMakeAvailableUrl(animalId, "success"));
}

export async function updateProducedOffspringAvailability(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  const sourceLitterId = parseOptionalUuid(formData.get("source_litter_id"));
  const litterRedirectId = sourceLitterId === "invalid" ? null : sourceLitterId;
  const rawNextStatus = formData.get("next_status");
  const nextStatus =
    typeof rawNextStatus === "string" ? rawNextStatus.trim() : "";

  if (nextStatus !== "born" && nextStatus !== "available") {
    redirect(animalAvailabilityStatusUrl(animalId, "not_allowed", litterRedirectId));
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
    redirect(animalAvailabilityStatusUrl(animalId, "error", litterRedirectId));
  }

  const { data: animal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, organization_id, litter_id, status, ownership_status, is_breeder, is_external, is_retired",
    )
    .eq("id", animalId)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !animal) {
    redirect(animalAvailabilityStatusUrl(animalId, "error", litterRedirectId));
  }

  const canToggle =
    Boolean(animal.litter_id) &&
    animal.ownership_status === "produced" &&
    (animal.status === "born" || animal.status === "available") &&
    !animal.is_breeder &&
    !animal.is_external &&
    !animal.is_retired;

  if (!canToggle) {
    redirect(animalAvailabilityStatusUrl(animalId, "not_allowed", litterRedirectId));
  }

  if (animal.status === nextStatus) {
    redirect(animalAvailabilityStatusUrl(animalId, "success", litterRedirectId));
  }

  if (nextStatus === "born") {
    const { data: activeReservations, error: reservationsError } = await supabase
      .from("reservations")
      .select("id")
      .eq("organization_id", animal.organization_id)
      .eq("animal_id", animal.id)
      .is("deleted_at", null)
      .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`)
      .limit(1);

    if (reservationsError) {
      redirect(animalAvailabilityStatusUrl(animalId, "error", litterRedirectId));
    }

    if (activeReservations && activeReservations.length > 0) {
      redirect(animalAvailabilityStatusUrl(animalId, "not_allowed", litterRedirectId));
    }
  }

  const { data: updatedAnimal, error: updateError } = await supabase
    .from("animals")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", animal.id)
    .eq("organization_id", animal.organization_id)
    .eq("status", animal.status)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedAnimal?.id) {
    redirect(animalAvailabilityStatusUrl(animalId, "error", litterRedirectId));
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);

  if (animal.litter_id) {
    revalidatePath(`/litters/${animal.litter_id}`);
  }

  revalidatePath("/cheptel");
  redirect(animalAvailabilityStatusUrl(animalId, "success", litterRedirectId));
}

export async function createAnimalHealthEvent(formData: FormData) {
  const animalId = parseOptionalUuid(formData.get("animal_id"));

  if (!animalId || animalId === "invalid") {
    redirect("/animals");
  }

  const title = normalizeOptionalText(formData.get("title"), 255);

  if (!title) {
    redirect(animalHealthEventUrl(animalId, "title_required"));
  }

  const plannedDate = normalizeOptionalDate(formData.get("planned_date"));

  if (!plannedDate || plannedDate === "invalid") {
    redirect(animalHealthEventUrl(animalId, "invalid_date"));
  }

  const rawEventType = formData.get("event_type");
  const eventType =
    typeof rawEventType === "string" &&
    allowedAnimalHealthEventTypes.has(rawEventType.trim())
      ? rawEventType.trim()
      : "vaccination";

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && allowedEventStatuses.has(rawStatus.trim())
      ? rawStatus.trim()
      : "planned";

  const rawPriority = formData.get("priority");
  const priority =
    typeof rawPriority === "string" &&
    allowedEventPriorities.has(rawPriority.trim())
      ? rawPriority.trim()
      : "normal";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: animal, error: animalError } = await supabase
    .from("animals")
    .select("id, organization_id")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (animalError || !animal?.organization_id) {
    redirect(animalHealthEventUrl(animalId, "error"));
  }

  const eventToCreate: EventInsert = {
    organization_id: animal.organization_id,
    animal_id: animal.id,
    event_type: eventType,
    title,
    description: normalizeOptionalText(formData.get("description"), 2_000),
    planned_date: plannedDate,
    status,
    priority,
    is_task: formData.get("is_task") === "on",
    created_by: user.id,
    updated_by: user.id,
  };

  const { error: insertError } = await supabase
    .from("events")
    .insert(eventToCreate);

  if (insertError) {
    redirect(animalHealthEventUrl(animalId, "error"));
  }

  revalidatePath(`/animals/${animalId}`);
  redirect(animalHealthEventUrl(animalId, "success"));
}
