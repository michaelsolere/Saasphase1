"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const allowedLitterGroupStatuses = new Set([
  "planned",
  "open_for_applications",
  "pregnancy_pending",
  "births_in_progress",
  "born",
  "closed",
  "cancelled",
  "archived",
]);

const allowedSpecies = new Set(["dog", "cat"]);

const allowedLitterStatuses = new Set([
  "planned",
  "mating_done",
  "pregnancy_unconfirmed",
  "pregnancy_confirmed",
  "not_pregnant",
  "pregnancy_lost",
  "birth_expected",
  "birth_in_progress",
  "born",
  "puppies_created",
  "choice_period",
  "ready_to_leave",
  "closed",
  "cancelled",
  "archived",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

function litterGroupErrorUrl(
  code: "name_required" | "invalid_dates" | "error",
) {
  return `/litter-groups/new?status=${code}`;
}

function litterErrorUrl(
  code:
    | "name_required"
    | "same_parents"
    | "invalid_group"
    | "invalid_mother"
    | "invalid_father"
    | "error",
) {
  return `/litters/new?status=${code}`;
}

function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength = 2_000,
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

  // Les inputs <input type="date"> produisent un format ISO YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Crée un groupe de portées (période) depuis l'interface Portées.
 *
 * Décisions (Lot 1) :
 *   - `name` obligatoire ; `status` validé ; `species` validé (défaut dog).
 *   - Période optionnelle : si début ET fin sont fournis, la fin ne peut pas
 *     précéder le début.
 *   - `organization_id` résolu via la membership active, jamais depuis le client.
 *   - Aucune portée, réservation, candidature, paiement ou document créés ici.
 */
export async function createLitterGroup(formData: FormData) {
  const name = normalizeOptionalText(formData.get("name"), 255);

  if (!name) {
    redirect(litterGroupErrorUrl("name_required"));
  }

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "planned";

  if (!allowedLitterGroupStatuses.has(status)) {
    redirect(litterGroupErrorUrl("error"));
  }

  const rawSpecies = formData.get("species");
  const species =
    typeof rawSpecies === "string" && allowedSpecies.has(rawSpecies.trim())
      ? rawSpecies.trim()
      : "dog";

  const expectedPeriodStart = normalizeOptionalDate(
    formData.get("expected_period_start"),
  );
  const expectedPeriodEnd = normalizeOptionalDate(
    formData.get("expected_period_end"),
  );

  if (
    expectedPeriodStart &&
    expectedPeriodEnd &&
    expectedPeriodEnd < expectedPeriodStart
  ) {
    redirect(litterGroupErrorUrl("invalid_dates"));
  }

  const description = normalizeOptionalText(formData.get("description"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Résolution de l'organisation via la membership active de l'utilisateur.
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
    redirect(litterGroupErrorUrl("error"));
  }

  const { error: insertError } = await supabase.from("litter_groups").insert({
    organization_id: membership.organization_id,
    name,
    status,
    species,
    expected_period_start: expectedPeriodStart,
    expected_period_end: expectedPeriodEnd,
    description,
    created_by: user.id,
    updated_by: user.id,
  });

  if (insertError) {
    redirect(litterGroupErrorUrl("error"));
  }

  revalidatePath("/litters");
  redirect("/litters?group_status=created");
}

/**
 * Crée une portée depuis l'interface Portées.
 *
 * Décisions (Lot 2) :
 *   - `name` obligatoire ; `species` validé (défaut dog) ; `breed` défaut
 *     Golden Retriever si vide ; `status` validé (défaut planned).
 *   - `litter_group_id`, `mother_id`, `father_id` optionnels mais vérifiés
 *     comme appartenant à la même organisation s'ils sont fournis.
 *   - Mère et père doivent être différents.
 *   - `organization_id` résolu via la membership active, jamais depuis le client.
 *   - Aucun animal, réservation, document ou événement créé ici.
 */
export async function createLitter(formData: FormData) {
  const name = normalizeOptionalText(formData.get("name"), 255);

  if (!name) {
    redirect(litterErrorUrl("name_required"));
  }

  const rawSpecies = formData.get("species");
  const species =
    typeof rawSpecies === "string" && allowedSpecies.has(rawSpecies.trim())
      ? rawSpecies.trim()
      : "dog";

  // Race : texte simple, défaut Golden Retriever si vide (non bloquant).
  const breed = normalizeOptionalText(formData.get("breed"), 255) ??
    "Golden Retriever";

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "planned";

  if (!allowedLitterStatuses.has(status)) {
    redirect(litterErrorUrl("error"));
  }

  function parseOptionalUuid(value: FormDataEntryValue | null) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const trimmed = value.trim();
    if (!isUuid(trimmed)) {
      return "invalid";
    }
    return trimmed;
  }

  const litterGroupId = parseOptionalUuid(formData.get("litter_group_id"));
  if (litterGroupId === "invalid") {
    redirect(litterErrorUrl("invalid_group"));
  }

  const motherId = parseOptionalUuid(formData.get("mother_id"));
  if (motherId === "invalid") {
    redirect(litterErrorUrl("invalid_mother"));
  }

  const fatherId = parseOptionalUuid(formData.get("father_id"));
  if (fatherId === "invalid") {
    redirect(litterErrorUrl("invalid_father"));
  }

  // Mère et père doivent être distincts (cohérent avec la contrainte SQL).
  if (motherId && fatherId && motherId === fatherId) {
    redirect(litterErrorUrl("same_parents"));
  }

  const matingDate = normalizeOptionalDate(formData.get("mating_date"));
  const matingDate2 = normalizeOptionalDate(formData.get("mating_date_2"));
  const estimatedOvulationDate = normalizeOptionalDate(
    formData.get("estimated_ovulation_date"),
  );
  const expectedBirthDate = normalizeOptionalDate(
    formData.get("expected_birth_date"),
  );
  const actualBirthDate = normalizeOptionalDate(
    formData.get("actual_birth_date"),
  );

  const notes = normalizeOptionalText(formData.get("notes"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Résolution de l'organisation via la membership active de l'utilisateur.
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
    redirect(litterErrorUrl("error"));
  }

  const organizationId = membership.organization_id;

  // Le groupe éventuel doit appartenir à la même organisation.
  if (litterGroupId) {
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", litterGroupId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(litterErrorUrl("invalid_group"));
    }
  }

  // La mère éventuelle doit appartenir à la même organisation.
  if (motherId) {
    const { data: mother, error: motherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", motherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (motherError || !mother) {
      redirect(litterErrorUrl("invalid_mother"));
    }
  }

  // Le père éventuel doit appartenir à la même organisation.
  if (fatherId) {
    const { data: father, error: fatherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", fatherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fatherError || !father) {
      redirect(litterErrorUrl("invalid_father"));
    }
  }

  const { data: createdLitter, error: insertError } = await supabase
    .from("litters")
    .insert({
      organization_id: organizationId,
      name,
      species,
      breed,
      status,
      litter_group_id: litterGroupId,
      mother_id: motherId,
      father_id: fatherId,
      mating_date: matingDate,
      mating_date_2: matingDate2,
      estimated_ovulation_date: estimatedOvulationDate,
      expected_birth_date: expectedBirthDate,
      actual_birth_date: actualBirthDate,
      notes,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    redirect(litterErrorUrl("error"));
  }

  revalidatePath("/litters");

  if (createdLitter?.id) {
    revalidatePath(`/litters/${createdLitter.id}`);
    redirect(`/litters/${createdLitter.id}`);
  }

  redirect("/litters?litter_status=created");
}

function litterDetailEditUrl(
  litterId: string,
  code:
    | "success"
    | "name_required"
    | "invalid_species"
    | "invalid_status"
    | "same_parents"
    | "invalid_mother"
    | "invalid_father"
    | "error",
) {
  return `/litters/${litterId}?detail_status=${code}#modifier-portee`;
}

/**
 * Met à jour les informations principales d'une portée existante depuis sa
 * fiche, en cohérence avec le formulaire de création /litters/new.
 *
 * Décisions (Lot 4) :
 *   - `name` obligatoire ; `species` validé (dog/cat) ; `breed` défaut
 *     Golden Retriever si vide ; `status` validé.
 *   - `mother_id`/`father_id` optionnels, vérifiés dans la même organisation,
 *     et obligatoirement distincts.
 *   - Le `litter_group_id` n'est PAS géré ici : le rattachement au groupe reste
 *     piloté par la section dédiée (updateLitterGroupAssignment).
 *   - `organization_id` jamais accepté du client : déduit de la portée en base.
 *   - Met à jour uniquement les champs du périmètre + `updated_at`/`updated_by`.
 *   - Aucun objet lié (candidatures, réservations, animaux, documents…) modifié.
 */
export async function updateLitterDetails(formData: FormData) {
  const rawLitterId = formData.get("litter_id");

  if (typeof rawLitterId !== "string" || !isUuid(rawLitterId.trim())) {
    redirect("/litters");
  }

  const litterId = (rawLitterId as string).trim();

  const name = normalizeOptionalText(formData.get("name"), 255);

  if (!name) {
    redirect(litterDetailEditUrl(litterId, "name_required"));
  }

  const rawSpecies = formData.get("species");
  const species = typeof rawSpecies === "string" ? rawSpecies.trim() : "";

  if (!allowedSpecies.has(species)) {
    redirect(litterDetailEditUrl(litterId, "invalid_species"));
  }

  // Race : texte simple, défaut Golden Retriever si vide (cohérent createLitter).
  const breed =
    normalizeOptionalText(formData.get("breed"), 255) ?? "Golden Retriever";

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "planned";

  if (!allowedLitterStatuses.has(status)) {
    redirect(litterDetailEditUrl(litterId, "invalid_status"));
  }

  function parseOptionalUuid(value: FormDataEntryValue | null) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const trimmed = value.trim();
    if (!isUuid(trimmed)) {
      return "invalid";
    }
    return trimmed;
  }

  const motherId = parseOptionalUuid(formData.get("mother_id"));
  if (motherId === "invalid") {
    redirect(litterDetailEditUrl(litterId, "invalid_mother"));
  }

  const fatherId = parseOptionalUuid(formData.get("father_id"));
  if (fatherId === "invalid") {
    redirect(litterDetailEditUrl(litterId, "invalid_father"));
  }

  if (motherId && fatherId && motherId === fatherId) {
    redirect(litterDetailEditUrl(litterId, "same_parents"));
  }

  const matingDate = normalizeOptionalDate(formData.get("mating_date"));
  const matingDate2 = normalizeOptionalDate(formData.get("mating_date_2"));
  const estimatedOvulationDate = normalizeOptionalDate(
    formData.get("estimated_ovulation_date"),
  );
  const expectedBirthDate = normalizeOptionalDate(
    formData.get("expected_birth_date"),
  );
  const actualBirthDate = normalizeOptionalDate(
    formData.get("actual_birth_date"),
  );

  const notes = normalizeOptionalText(formData.get("notes"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // La portée doit exister, ne pas être supprimée ; son organisation fait foi.
  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter?.organization_id) {
    redirect(litterDetailEditUrl(litterId, "error"));
  }

  const organizationId = litter.organization_id;

  // La mère éventuelle doit appartenir à la même organisation.
  if (motherId) {
    const { data: mother, error: motherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", motherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (motherError || !mother) {
      redirect(litterDetailEditUrl(litterId, "invalid_mother"));
    }
  }

  // Le père éventuel doit appartenir à la même organisation.
  if (fatherId) {
    const { data: father, error: fatherError } = await supabase
      .from("animals")
      .select("id")
      .eq("id", fatherId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fatherError || !father) {
      redirect(litterDetailEditUrl(litterId, "invalid_father"));
    }
  }

  const { error: updateError } = await supabase
    .from("litters")
    .update({
      name,
      species,
      breed,
      status,
      mother_id: motherId,
      father_id: fatherId,
      mating_date: matingDate,
      mating_date_2: matingDate2,
      estimated_ovulation_date: estimatedOvulationDate,
      expected_birth_date: expectedBirthDate,
      actual_birth_date: actualBirthDate,
      notes,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", litterId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (updateError) {
    redirect(litterDetailEditUrl(litterId, "error"));
  }

  revalidatePath("/litters");
  revalidatePath(`/litters/${litterId}`);
  redirect(litterDetailEditUrl(litterId, "success"));
}

function litterGroupAssignmentUrl(
  litterId: string,
  outcome: "success" | "error" | "invalid_group",
) {
  return `/litters/${litterId}?group_assignment_status=${outcome}#groupe-portees`;
}

/**
 * Rattache, change ou détache le groupe de portées d'une portée existante.
 *
 * Décisions :
 *   - Valeur de groupe vide => détachement (`litter_group_id = null`).
 *   - `organization_id` jamais accepté du client : déduit de la portée en base.
 *   - Met à jour uniquement `litter_group_id`, `updated_at`, `updated_by`.
 *   - Ne touche ni au statut de la portée, ni aux candidatures/réservations,
 *     ni aux événements.
 */
export async function updateLitterGroupAssignment(formData: FormData) {
  const rawLitterId = formData.get("litter_id");

  if (typeof rawLitterId !== "string" || !isUuid(rawLitterId.trim())) {
    redirect("/litters");
  }

  const litterId = (rawLitterId as string).trim();

  const rawGroupId = formData.get("litter_group_id");
  let requestedGroupId: string | null = null;

  if (typeof rawGroupId === "string" && rawGroupId.trim()) {
    const trimmed = rawGroupId.trim();
    if (!isUuid(trimmed)) {
      redirect(litterGroupAssignmentUrl(litterId, "invalid_group"));
    }
    requestedGroupId = trimmed;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // La portée doit exister, ne pas être supprimée ; son organisation fait foi.
  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter?.organization_id) {
    redirect(litterGroupAssignmentUrl(litterId, "error"));
  }

  const organizationId = litter.organization_id;

  // Le groupe éventuel doit appartenir à la même organisation.
  if (requestedGroupId) {
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", requestedGroupId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(litterGroupAssignmentUrl(litterId, "invalid_group"));
    }
  }

  const { error: updateError } = await supabase
    .from("litters")
    .update({
      litter_group_id: requestedGroupId,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", litterId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (updateError) {
    redirect(litterGroupAssignmentUrl(litterId, "error"));
  }

  revalidatePath("/litters");
  revalidatePath(`/litters/${litterId}`);
  redirect(litterGroupAssignmentUrl(litterId, "success"));
}

function litterGroupDetailEditUrl(
  groupId: string,
  code:
    | "success"
    | "name_required"
    | "invalid_species"
    | "invalid_status"
    | "invalid_dates"
    | "error",
) {
  return `/litter-groups/${groupId}?group_detail_status=${code}#modifier-groupe`;
}

/**
 * Met à jour les informations principales d'un groupe de portées depuis sa
 * fiche, en cohérence avec le formulaire de création /litter-groups/new.
 *
 * Décisions :
 *   - `name` obligatoire ; `species` validé (dog/cat) ; `status` validé parmi
 *     les statuts de groupes ; période optionnelle (fin ≥ début si les deux).
 *   - `organization_id` jamais accepté du client : déduit du groupe en base.
 *   - Met à jour uniquement name, species, status, expected_period_start,
 *     expected_period_end, description + `updated_at`/`updated_by`.
 *   - Aucun objet lié (portées, candidatures, réservations, animaux, documents,
 *     paiements, événements) modifié ; aucune propagation de statut.
 */
export async function updateLitterGroupDetails(formData: FormData) {
  const rawGroupId = formData.get("group_id");

  if (typeof rawGroupId !== "string" || !isUuid(rawGroupId.trim())) {
    redirect("/litter-groups");
  }

  const groupId = (rawGroupId as string).trim();

  const name = normalizeOptionalText(formData.get("name"), 255);

  if (!name) {
    redirect(litterGroupDetailEditUrl(groupId, "name_required"));
  }

  const rawSpecies = formData.get("species");
  const species = typeof rawSpecies === "string" ? rawSpecies.trim() : "";

  if (!allowedSpecies.has(species)) {
    redirect(litterGroupDetailEditUrl(groupId, "invalid_species"));
  }

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "planned";

  if (!allowedLitterGroupStatuses.has(status)) {
    redirect(litterGroupDetailEditUrl(groupId, "invalid_status"));
  }

  const expectedPeriodStart = normalizeOptionalDate(
    formData.get("expected_period_start"),
  );
  const expectedPeriodEnd = normalizeOptionalDate(
    formData.get("expected_period_end"),
  );

  if (
    expectedPeriodStart &&
    expectedPeriodEnd &&
    expectedPeriodEnd < expectedPeriodStart
  ) {
    redirect(litterGroupDetailEditUrl(groupId, "invalid_dates"));
  }

  const description = normalizeOptionalText(formData.get("description"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Le groupe doit exister, ne pas être supprimé ; son organisation fait foi.
  const { data: group, error: groupError } = await supabase
    .from("litter_groups")
    .select("id, organization_id")
    .eq("id", groupId)
    .is("deleted_at", null)
    .maybeSingle();

  if (groupError || !group?.organization_id) {
    redirect(litterGroupDetailEditUrl(groupId, "error"));
  }

  const organizationId = group.organization_id;

  const { error: updateError } = await supabase
    .from("litter_groups")
    .update({
      name,
      species,
      status,
      expected_period_start: expectedPeriodStart,
      expected_period_end: expectedPeriodEnd,
      description,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", groupId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (updateError) {
    redirect(litterGroupDetailEditUrl(groupId, "error"));
  }

  revalidatePath("/litters");
  revalidatePath("/litter-groups");
  revalidatePath(`/litter-groups/${groupId}`);
  redirect(litterGroupDetailEditUrl(groupId, "success"));
}
