"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  actionTargets,
  transitions,
  type QualificationAction,
} from "./transitions";
import { createClient } from "@/lib/supabase/server";

const desiredSexPreferences = new Set([
  "male_only",
  "female_only",
  "male_preferred_female_possible",
  "female_preferred_male_possible",
  "no_preference",
  "unknown",
]);

function isQualificationAction(value: string): value is QualificationAction {
  return value in actionTargets;
}

function normalizeOptionalText(value: FormDataEntryValue | null, maxLength = 255) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

function detailUrl(applicationId: string, outcome: "success" | "error") {
  return `/candidatures/${applicationId}?action=${outcome}`;
}

function reservationUrl(
  applicationId: string,
  outcome: "created" | "already_exists" | "not_qualified" | "error",
) {
  return `/candidatures/${applicationId}?reservation_status=${outcome}`;
}

function contactApplicationUrl(contactId: string, outcome: "error") {
  return `/contacts/${contactId}/applications/new?status=${outcome}`;
}

function applicationRoleUrl(applicationId: string) {
  return `/candidatures/${applicationId}?role_status=error`;
}

function reservationRoleUrl(reservationId: string) {
  return `/reservations/${reservationId}?role_status=error`;
}

export async function createApplicationForContact(formData: FormData) {
  const contactId = formData.get("contact_id");

  if (typeof contactId !== "string" || !contactId) {
    redirect("/contacts?erreur=candidature");
  }

  const species = normalizeOptionalText(formData.get("species")) ?? "dog";
  const breed =
    normalizeOptionalText(formData.get("breed")) ?? "Golden Retriever";
  const desiredSexPreferenceValue =
    normalizeOptionalText(formData.get("desired_sex_preference")) ?? "unknown";
  const desiredSexPreference = desiredSexPreferences.has(
    desiredSexPreferenceValue,
  )
    ? desiredSexPreferenceValue
    : "unknown";
  const projectDescription = normalizeOptionalText(
    formData.get("project_description"),
    2_000,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contact, error: contactReadError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactReadError || !contact?.organization_id) {
    redirect(contactApplicationUrl(contactId, "error"));
  }

  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      organization_id: contact.organization_id,
      contact_id: contact.id,
      species,
      breed,
      desired_sex_preference: desiredSexPreference,
      project_description: projectDescription,
      status: "new",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !application?.id) {
    redirect(contactApplicationUrl(contactId, "error"));
  }

  const { data: existingCandidateRole, error: existingRoleError } =
    await supabase
      .from("contact_roles")
      .select("id")
      .eq("organization_id", contact.organization_id)
      .eq("contact_id", contact.id)
      .eq("role", "candidate")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

  if (existingRoleError) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/candidatures");
    revalidatePath(`/candidatures/${application.id}`);
    redirect(applicationRoleUrl(application.id));
  }

  let candidateRoleWasAdded = false;

  if (!existingCandidateRole) {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const { error: roleInsertError } = await supabase
      .from("contact_roles")
      .insert({
        organization_id: contact.organization_id,
        contact_id: contact.id,
        role: "candidate",
        started_at: today,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      });

    if (roleInsertError && roleInsertError.code !== "23505") {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${contactId}`);
      revalidatePath("/candidatures");
      revalidatePath(`/candidatures/${application.id}`);
      redirect(applicationRoleUrl(application.id));
    }

    candidateRoleWasAdded = !roleInsertError;

    if (candidateRoleWasAdded) {
      const { error: prospectDeactivateError } = await supabase
        .from("contact_roles")
        .update({
          is_active: false,
          ended_at: today,
          updated_at: now,
          updated_by: user.id,
        })
        .eq("organization_id", contact.organization_id)
        .eq("contact_id", contact.id)
        .eq("role", "prospect")
        .eq("is_active", true)
        .is("deleted_at", null);

      if (prospectDeactivateError) {
        revalidatePath("/contacts");
        revalidatePath(`/contacts/${contactId}`);
        revalidatePath("/candidatures");
        revalidatePath(`/candidatures/${application.id}`);
        redirect(applicationRoleUrl(application.id));
      }
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${application.id}`);
  redirect(`/candidatures/${application.id}`);
}

export async function updateApplicationStatus(formData: FormData) {
  const applicationId = formData.get("application_id");
  const requestedAction = formData.get("qualification_action");

  if (
    typeof applicationId !== "string" ||
    typeof requestedAction !== "string" ||
    !isQualificationAction(requestedAction)
  ) {
    redirect("/candidatures?erreur=action");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError || !application) {
    redirect(detailUrl(applicationId, "error"));
  }

  const allowedActions = transitions[application.status] ?? [];

  if (!allowedActions.includes(requestedAction)) {
    redirect(detailUrl(applicationId, "error"));
  }

  const nextStatus = actionTargets[requestedAction];
  const now = new Date().toISOString();
  const isFirstReview =
    (application.status === "to_review" || application.status === "new") &&
    nextStatus !== "archived";

  const reviewFields = isFirstReview
    ? {
        reviewed_at: now,
        reviewed_by: user.id,
      }
    : {};

  const { data: updatedApplication, error: updateError } = await supabase
    .from("applications")
    .update({
      status: nextStatus,
      updated_at: now,
      updated_by: user.id,
      ...reviewFields,
    })
    .eq("id", applicationId)
    .eq("status", application.status)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedApplication) {
    redirect(detailUrl(applicationId, "error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(detailUrl(applicationId, "success"));
}

export async function createReservationFromApplication(formData: FormData) {
  const applicationId = formData.get("application_id");

  if (typeof applicationId !== "string" || !applicationId) {
    redirect("/candidatures?erreur=reservation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select(
      "id, organization_id, contact_id, species, breed, desired_litter_group_id, desired_litter_id, desired_sex_preference, status",
    )
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !application) {
    redirect(reservationUrl(applicationId, "error"));
  }

  if (application.status !== "qualified") {
    redirect(reservationUrl(applicationId, "not_qualified"));
  }

  const { data: existingReservation, error: reservationReadError } =
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

  if (reservationReadError) {
    redirect(reservationUrl(applicationId, "error"));
  }

  if (existingReservation) {
    redirect(reservationUrl(applicationId, "already_exists"));
  }

  const { data: createdReservation, error: insertError } = await supabase
    .from("reservations")
    .insert({
      organization_id: application.organization_id,
      contact_id: application.contact_id,
      application_id: application.id,
      species: application.species,
      breed: application.breed,
      litter_group_id: application.desired_litter_group_id,
      litter_id: application.desired_litter_id,
      reserved_sex_preference: application.desired_sex_preference,
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !createdReservation?.id) {
    redirect(reservationUrl(applicationId, "error"));
  }

  const createdReservationId = createdReservation.id;

  const { data: existingPreReservationRole, error: existingRoleError } =
    await supabase
      .from("contact_roles")
      .select("id")
      .eq("organization_id", application.organization_id)
      .eq("contact_id", application.contact_id)
      .eq("role", "pre_reservation_holder")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

  if (existingRoleError) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${application.contact_id}`);
    revalidatePath("/candidatures");
    revalidatePath(`/candidatures/${applicationId}`);
    revalidatePath("/reservations");
    redirect(reservationRoleUrl(createdReservationId));
  }

  if (!existingPreReservationRole) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: roleInsertError } = await supabase
      .from("contact_roles")
      .insert({
        organization_id: application.organization_id,
        contact_id: application.contact_id,
        role: "pre_reservation_holder",
        started_at: today,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      });

    if (roleInsertError && roleInsertError.code !== "23505") {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${application.contact_id}`);
      revalidatePath("/candidatures");
      revalidatePath(`/candidatures/${applicationId}`);
      revalidatePath("/reservations");
      redirect(reservationRoleUrl(createdReservationId));
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${application.contact_id}`);
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  revalidatePath("/reservations");
  redirect(`/reservations/${createdReservationId}`);
}

export async function createApplicationNote(formData: FormData) {
  const applicationId = formData.get("application_id");
  const organizationId = formData.get("organization_id");
  const body = formData.get("body");

  if (
    typeof applicationId !== "string" ||
    typeof organizationId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    if (typeof applicationId === "string") {
      redirect(`/candidatures/${applicationId}?note_status=error`);
    } else {
      redirect("/candidatures?erreur=note");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: insertError } = await supabase
    .from("notes")
    .insert({
      application_id: applicationId,
      organization_id: organizationId,
      body: body.trim(),
      note_type: "internal",
      visibility: "internal",
      created_by: user.id,
    });

  if (insertError) {
    redirect(`/candidatures/${applicationId}?note_status=error`);
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(`/candidatures/${applicationId}?note_status=success`);
}

// ---------------------------------------------------------------------------
// Rattachement portée / groupe de portées
// ---------------------------------------------------------------------------

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function desiredLitterUrl(
  applicationId: string,
  outcome: "success" | "error",
) {
  return `/candidatures/${applicationId}?litter_status=${outcome}#portee-souhaitee`;
}

/**
 * Met à jour les champs desired_litter_id et desired_litter_group_id
 * sur une candidature existante.
 *
 * - Accepte une valeur vide pour supprimer le lien.
 * - Ne touche pas aux réservations, paiements, rôles, animaux.
 * - Vérifie que la portée et le groupe appartiennent à la même organisation.
 */
export async function updateApplicationDesiredLitter(formData: FormData) {
  const applicationId = formData.get("application_id");

  if (typeof applicationId !== "string" || !applicationId) {
    redirect("/candidatures?erreur=portee");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire la candidature (organisation)
  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id, organization_id")
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !application) {
    redirect(desiredLitterUrl(applicationId, "error"));
  }

  // Valider desired_litter_id (peut être vide)
  const rawLitterId = formData.get("desired_litter_id");
  let desiredLitterId: string | null = null;
  // Groupe auquel appartient la portée choisie (source de vérité métier).
  let litterGroupOfLitter: string | null = null;

  if (typeof rawLitterId === "string" && rawLitterId.trim()) {
    const trimmed = rawLitterId.trim();
    if (!isUuid(trimmed)) {
      redirect(desiredLitterUrl(applicationId, "error"));
    }
    // Vérifier que la portée appartient à la même organisation
    const { data: litter, error: litterError } = await supabase
      .from("litters")
      .select("id, litter_group_id")
      .eq("id", trimmed)
      .eq("organization_id", application.organization_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (litterError || !litter) {
      redirect(desiredLitterUrl(applicationId, "error"));
    }
    desiredLitterId = trimmed;
    litterGroupOfLitter = litter.litter_group_id ?? null;
  }

  // Valider desired_litter_group_id (peut être vide)
  const rawGroupId = formData.get("desired_litter_group_id");
  let desiredLitterGroupId: string | null = null;

  if (typeof rawGroupId === "string" && rawGroupId.trim()) {
    const trimmed = rawGroupId.trim();
    if (!isUuid(trimmed)) {
      redirect(desiredLitterUrl(applicationId, "error"));
    }
    // Vérifier que le groupe appartient à la même organisation
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", trimmed)
      .eq("organization_id", application.organization_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(desiredLitterUrl(applicationId, "error"));
    }
    desiredLitterGroupId = trimmed;
  }

  // Règle métier : une portée appartient nécessairement à un groupe de portées.
  // - Si une portée est choisie, le groupe enregistré est celui de la portée
  //   (source de vérité), pas un groupe arbitraire envoyé par le client.
  // - Si un groupe est aussi fourni, il doit correspondre à celui de la portée.
  if (desiredLitterId) {
    if (
      desiredLitterGroupId &&
      litterGroupOfLitter &&
      desiredLitterGroupId !== litterGroupOfLitter
    ) {
      // Incohérence : la portée appartient à un autre groupe.
      redirect(desiredLitterUrl(applicationId, "error"));
    }

    // Le groupe de la portée fait foi (peut être null si la portée n'a pas
    // encore de groupe : on enregistre alors la portée seule, sans inventer).
    desiredLitterGroupId = litterGroupOfLitter;
  }

  // Mettre à jour la candidature
  const { error: updateError } = await supabase
    .from("applications")
    .update({
      desired_litter_id: desiredLitterId,
      desired_litter_group_id: desiredLitterGroupId,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", applicationId)
    .eq("organization_id", application.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(desiredLitterUrl(applicationId, "error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);

  // Revalider la fiche portée si une portée est liée
  if (desiredLitterId) {
    revalidatePath(`/litters/${desiredLitterId}`);
  }

  redirect(desiredLitterUrl(applicationId, "success"));
}
