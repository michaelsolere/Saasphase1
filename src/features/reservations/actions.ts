"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  FINAL_RESERVATION_STATUSES,
  isFinalReservationStatus,
} from "@/features/reservations/statuses";
import {
  promoteContactJourneyRole,
} from "@/features/contacts/roles";
import { PRE_RESERVATION_PAYMENT_AMOUNT_CENTS } from "@/features/payments/deposit-thresholds";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

function priceUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?price_status=${outcome}#reservation-details`;
}

function commentUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?comment_status=${outcome}#reservation-details`;
}

function deadlineUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?deadline_status=${outcome}#reservation-details`;
}

function noteUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?note_status=${outcome}#notes`;
}

function appointmentUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?appointment_status=${outcome}#appointments`;
}

function activationUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?activation_status=${outcome}#reservation-details`;
}

function adoptionUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?adoption_status=${outcome}#reservation-details`;
}

function adoptionRoleUrl(reservationId: string) {
  return `/reservations/${reservationId}?adoption_status=success&role_status=error#reservation-details`;
}

function adoptionAnimalUrl(reservationId: string) {
  return `/reservations/${reservationId}?adoption_status=success&animal_status=error#reservation-details`;
}

function cancellationUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?cancellation_status=${outcome}#reservation-details`;
}

function withdrawalUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?withdrawal_status=${outcome}#reservation-details`;
}

function expirationUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?expiration_status=${outcome}#reservation-details`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parsePriceCents(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { ok: false as const };
  }

  const normalizedValue = value.trim().replace(",", ".");

  if (!normalizedValue) {
    return { ok: true as const, priceCents: null };
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
    return { ok: false as const };
  }

  const price = Number(normalizedValue);

  if (!Number.isFinite(price) || price < 0) {
    return { ok: false as const };
  }

  return { ok: true as const, priceCents: Math.round(price * 100) };
}

function parsePreReservationDeadline(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { ok: false as const };
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { ok: true as const, deadline: null };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (!match) {
    return { ok: false as const };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false as const };
  }

  return { ok: true as const, deadline: date.toISOString() };
}

function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength = 2_000,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

function parseOptionalDateTimeLocal(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { ok: false as const };
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { ok: true as const, value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmedValue)) {
    return { ok: false as const };
  }

  const date = new Date(trimmedValue);

  if (!Number.isFinite(date.getTime())) {
    return { ok: false as const };
  }

  return { ok: true as const, value: date.toISOString() };
}

export async function updateReservationPrice(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=prix");
  }

  const parsedPrice = parsePriceCents(formData.get("price"));

  if (!parsedPrice.ok) {
    redirect(priceUrl(reservationId, "error"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(priceUrl(reservationId, "error"));
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      price_cents: parsedPrice.priceCents,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(priceUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(priceUrl(reservationId, "success"));
}

export async function updateReservationInternalComment(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=commentaire");
  }

  const commentValue = formData.get("internal_comment");

  if (typeof commentValue !== "string") {
    redirect(commentUrl(reservationId, "error"));
  }

  const trimmedComment = commentValue.trim();

  if (trimmedComment.length > 2_000) {
    redirect(commentUrl(reservationId, "error"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(commentUrl(reservationId, "error"));
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      internal_comment: trimmedComment || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(commentUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(commentUrl(reservationId, "success"));
}

export async function updateReservationPreReservationDeadline(
  formData: FormData,
) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=echeance");
  }

  const parsedDeadline = parsePreReservationDeadline(
    formData.get("pre_reservation_deadline"),
  );

  if (!parsedDeadline.ok) {
    redirect(deadlineUrl(reservationId, "error"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(deadlineUrl(reservationId, "error"));
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      pre_reservation_deadline: parsedDeadline.deadline,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(deadlineUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(deadlineUrl(reservationId, "success"));
}

export async function createReservationNote(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const body = formData.get("body");

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof body !== "string" ||
    !body.trim() ||
    body.trim().length > 2_000
  ) {
    if (typeof reservationId === "string" && isUuid(reservationId)) {
      redirect(noteUrl(reservationId, "error"));
    }

    redirect("/reservations?erreur=note");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation || !reservation.organization_id) {
    redirect(noteUrl(reservationId, "error"));
  }

  const { error: insertError } = await supabase.from("notes").insert({
    reservation_id: reservation.id,
    organization_id: reservation.organization_id,
    body: body.trim(),
    note_type: "internal",
    visibility: "internal",
    created_by: user.id,
    updated_by: user.id,
  });

  if (insertError) {
    redirect(noteUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(noteUrl(reservationId, "success"));
}

export async function upsertReservationAppointment(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const appointmentKind = formData.get("appointment_kind");
  const eventIdValue = formData.get("event_id");

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof appointmentKind !== "string" ||
    !["puppy_choice", "adoption"].includes(appointmentKind)
  ) {
    if (typeof reservationId === "string" && isUuid(reservationId)) {
      redirect(appointmentUrl(reservationId, "error"));
    }

    redirect("/reservations?erreur=appointment");
  }

  const eventId =
    typeof eventIdValue === "string" && isUuid(eventIdValue)
      ? eventIdValue
      : null;

  const plannedAt = parseOptionalDateTimeLocal(formData.get("planned_at"));
  const actualAt = parseOptionalDateTimeLocal(formData.get("actual_at"));

  if (!plannedAt.ok || !actualAt.ok) {
    redirect(appointmentUrl(reservationId, "error"));
  }

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" &&
    ["planned", "done", "postponed"].includes(rawStatus)
      ? rawStatus
      : "planned";

  if (!plannedAt.value && !actualAt.value) {
    redirect(appointmentUrl(reservationId, "error"));
  }

  const description = normalizeOptionalText(formData.get("description"), 500);
  const title =
    appointmentKind === "puppy_choice"
      ? "Rendez-vous de choix du chiot/chaton"
      : "Rendez-vous d’adoption / départ";
  const now = new Date().toISOString();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation?.organization_id) {
    redirect(appointmentUrl(reservationId, "error"));
  }

  const eventValues = {
    event_type: appointmentKind,
    title,
    description,
    planned_at: plannedAt.value,
    planned_date: null,
    actual_at: actualAt.value,
    status,
    priority: "normal",
    is_task: status !== "done",
    updated_at: now,
    updated_by: user.id,
  } satisfies EventUpdate;

  if (eventId) {
    const { data: updatedEvent, error: updateError } = await supabase
      .from("events")
      .update(eventValues)
      .eq("id", eventId)
      .eq("organization_id", reservation.organization_id)
      .eq("reservation_id", reservation.id)
      .eq("event_type", appointmentKind)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedEvent) {
      redirect(appointmentUrl(reservationId, "error"));
    }
  } else {
    const { error: insertError } = await supabase.from("events").insert({
      organization_id: reservation.organization_id,
      reservation_id: reservation.id,
      event_type: appointmentKind,
      title,
      description,
      planned_at: plannedAt.value,
      actual_at: actualAt.value,
      status,
      priority: "normal",
      is_task: status !== "done",
      created_by: user.id,
      updated_by: user.id,
    });

    if (insertError) {
      redirect(appointmentUrl(reservationId, "error"));
    }
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(appointmentUrl(reservationId, "success"));
}

export async function activateReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=activation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(activationUrl(reservationId, "error"));
  }

  if (reservation.status !== "draft") {
    redirect(activationUrl(reservationId, "invalid_state"));
  }

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "active",
      reservation_confirmed_at: now,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .eq("status", "draft")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(activationUrl(reservationId, "invalid_state"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(activationUrl(reservationId, "success"));
}

export async function adoptReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=adoption");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, animal_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(adoptionUrl(reservationId, "error"));
  }

  const adoptionAllowedStatuses = ["animal_assigned"];
  if (
    !adoptionAllowedStatuses.includes(reservation.status) ||
    !reservation.animal_id
  ) {
    redirect(adoptionUrl(reservationId, "invalid_state"));
  }

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "adopted",
      adoption_completed_at: now,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .in("status", adoptionAllowedStatuses)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(adoptionUrl(reservationId, "invalid_state"));
  }

  const adopterRoleResult = await promoteContactJourneyRole({
    supabase,
    organizationId: reservation.organization_id,
    contactId: reservation.contact_id,
    role: "adopter",
    userId: user.id,
    now,
  });

  if (adopterRoleResult.error || adopterRoleResult.deactivationError) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${reservation.contact_id}`);
    revalidatePath("/reservations");
    revalidatePath(`/reservations/${reservationId}`);
    redirect(adoptionRoleUrl(reservationId));
  }

  if (reservation.animal_id) {
    const { data: updatedAnimal, error: animalUpdateError } = await supabase
      .from("animals")
      .update({
        status: "adopted",
        ownership_status: "adopted_out",
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", reservation.animal_id)
      .eq("organization_id", reservation.organization_id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (animalUpdateError || !updatedAnimal) {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${reservation.contact_id}`);
      revalidatePath("/reservations");
      revalidatePath(`/reservations/${reservationId}`);
      revalidatePath("/animals");
      revalidatePath(`/animals/${reservation.animal_id}`);
      redirect(adoptionAnimalUrl(reservationId));
    }

    revalidatePath("/animals");
    revalidatePath(`/animals/${reservation.animal_id}`);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${reservation.contact_id}`);
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(adoptionUrl(reservationId, "success"));
}

export async function cancelReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=annulation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(cancellationUrl(reservationId, "error"));
  }

  if (reservation.status !== "active") {
    redirect(cancellationUrl(reservationId, "invalid_state"));
  }

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "cancelled",
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(cancellationUrl(reservationId, "invalid_state"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(cancellationUrl(reservationId, "success"));
}

export async function withdrawReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=desistement");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(withdrawalUrl(reservationId, "error"));
  }

  if (reservation.status !== "active") {
    redirect(withdrawalUrl(reservationId, "invalid_state"));
  }

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "withdrawn",
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(withdrawalUrl(reservationId, "invalid_state"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(withdrawalUrl(reservationId, "success"));
}

export async function expireReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=expiration");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(expirationUrl(reservationId, "error"));
  }

  if (reservation.status !== "active") {
    redirect(expirationUrl(reservationId, "invalid_state"));
  }

  const now = new Date().toISOString();
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "expired",
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(expirationUrl(reservationId, "invalid_state"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(expirationUrl(reservationId, "success"));
}

export async function assignAnimalToReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=assignation");
  }

  const animalId = formData.get("animal_id");

  if (typeof animalId !== "string" || !isUuid(animalId)) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Relire la réservation
  const { data: reservation, error: readResError } = await supabase
    .from("reservations")
    .select("id, organization_id, animal_id, animal_assignment_locked, litter_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readResError || !reservation) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  // 2. Vérifier si un animal est déjà attribué
  if (reservation.animal_id) {
    redirect(`/reservations/${reservationId}?animal_assign_status=already_assigned#scope-and-animal`);
  }

  if (reservation.animal_assignment_locked) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  // 3. Vérifier que la réservation n'est pas finale
  if (isFinalReservationStatus(reservation.status)) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  // 4. Relire l'animal
  const { data: animal, error: readAnimalError } = await supabase
    .from("animals")
    .select("id, organization_id, litter_id, status, deleted_at")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readAnimalError || !animal) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable#scope-and-animal`);
  }

  // 5. Vérifier la cohérence d'organisation
  if (animal.organization_id !== reservation.organization_id) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  // 6. Vérifier la cohérence de portée quand la réservation est liée à une portée précise
  if (reservation.litter_id && animal.litter_id !== reservation.litter_id) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable#scope-and-animal`);
  }

  // 7. Vérifier le statut de l'animal
  const allowedAnimalStatuses = ["born", "active", "available"];
  if (!allowedAnimalStatuses.includes(animal.status)) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable#scope-and-animal`);
  }

  // 8. Vérifier que l'animal n'est pas déjà lié à une autre réservation active
  const { data: concurrentRes, error: concurrentResError } = await supabase
    .from("reservations")
    .select("id")
    .eq("animal_id", animalId)
    .is("deleted_at", null)
    .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`);

  if (concurrentResError) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  if (concurrentRes && concurrentRes.length > 0) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable#scope-and-animal`);
  }

  const now = new Date().toISOString();

  // 9. Mettre à jour la réservation
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      animal_id: animalId,
      animal_assigned_at: now,
      status: "animal_assigned",
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservationId)
    .eq("organization_id", reservation.organization_id)
    .eq("status", reservation.status)
    .eq("animal_assignment_locked", false)
    .is("animal_id", null)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
  }

  if (animal.status === "born" || animal.status === "available") {
    const { data: updatedAnimal, error: animalUpdateError } = await supabase
      .from("animals")
      .update({
        status: "reserved",
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", animal.id)
      .eq("organization_id", reservation.organization_id)
      .in("status", ["born", "available"])
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (animalUpdateError || !updatedAnimal) {
      redirect(`/reservations/${reservationId}?animal_assign_status=error#scope-and-animal`);
    }
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);

  redirect(`/reservations/${reservationId}?animal_assign_status=success#scope-and-animal`);
}

export async function unassignAnimalFromReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=desassignation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Relire la réservation
  const { data: reservation, error: readResError } = await supabase
    .from("reservations")
    .select("id, organization_id, animal_id, animal_assignment_locked, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readResError || !reservation) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=error#scope-and-animal`);
  }

  // 2. Vérifier si un animal est actuellement attribué
  const animalId = reservation.animal_id;
  if (!animalId) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=no_animal#scope-and-animal`);
  }

  if (reservation.animal_assignment_locked) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=invalid_state#scope-and-animal`);
  }

  // 3. Vérifier que la réservation n'est pas finale
  if (isFinalReservationStatus(reservation.status)) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=invalid_state#scope-and-animal`);
  }

  const now = new Date().toISOString();

  // 4. Mettre à jour la réservation
  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      animal_id: null,
      animal_assigned_at: null,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", reservationId)
    .eq("organization_id", reservation.organization_id)
    .eq("animal_id", animalId)
    .eq("animal_assignment_locked", false)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedReservation) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=error#scope-and-animal`);
  }

  const { data: activeReservationsForAnimal, error: activeReservationsError } =
    await supabase
      .from("reservations")
      .select("id")
      .eq("organization_id", reservation.organization_id)
      .eq("animal_id", animalId)
      .is("deleted_at", null)
      .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`)
      .limit(1);

  if (activeReservationsError) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=error#scope-and-animal`);
  }

  if (!activeReservationsForAnimal || activeReservationsForAnimal.length === 0) {
    const { error: animalUpdateError } = await supabase
      .from("animals")
      .update({
        status: "available",
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", animalId)
      .eq("organization_id", reservation.organization_id)
      .eq("status", "reserved")
      .is("deleted_at", null);

    if (animalUpdateError) {
      redirect(`/reservations/${reservationId}?animal_unassign_status=error#scope-and-animal`);
    }
  }

  // 5. Revalidations
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);

  redirect(`/reservations/${reservationId}?animal_unassign_status=success#scope-and-animal`);
}

// ---------------------------------------------------------------------------
// Campagne de pré-réservation
// ---------------------------------------------------------------------------

/**
 * Lance une campagne de pré-réservation pour les candidatures qualifiées
 * sélectionnées par l'éleveur depuis la fiche portée.
 *
 * Pour chaque candidature sélectionnée :
 *   1. Crée une réservation en statut `pre_reservation_requested` (ou met à jour
 *      un brouillon existant lié à cette candidature + portée).
 *   2. Crée une demande de paiement de 250 € (type `arrhes`, statut `requested`,
 *      échéance J+15).
 *
 * Décisions Phase 1 :
 *   - Pas de changement automatique du statut de candidature.
 *   - Pas d'e-mail réel envoyé.
 *   - Pas de paiement automatique.
 *   - Libellé : "avance sur arrhes" (ne jamais écrire "acompte").
 */
export async function launchPreReservationCampaign(formData: FormData) {
  const litterId = formData.get("litter_id");

  if (typeof litterId !== "string" || !isUuid(litterId)) {
    redirect("/litters?campaign_status=error");
  }

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire la portée pour récupérer organization_id + species/breed
  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id, species, breed")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter) {
    redirect(`/litters/${litterId}?campaign_status=error`);
  }

  // Récupérer les application_id sélectionnés depuis le formulaire
  const rawApplicationIds = formData.getAll("application_ids[]");
  const applicationIds = rawApplicationIds.filter(
    (v): v is string => typeof v === "string" && isUuid(v),
  );

  if (applicationIds.length === 0) {
    redirect(`/litters/${litterId}?campaign_status=no_selection`);
  }

  // Vérifier que toutes les candidatures sont qualifiées et appartiennent
  // bien à cette portée et à la même organisation
  const { data: applications, error: appsError } = await supabase
    .from("applications")
    .select("id, contact_id, desired_sex_preference, status")
    .eq("organization_id", litter.organization_id)
    .eq("desired_litter_id", litterId)
    .eq("status", "qualified")
    .is("deleted_at", null)
    .in("id", applicationIds);

  if (appsError) {
    redirect(`/litters/${litterId}?campaign_status=error`);
  }

  if (!applications || applications.length === 0) {
    redirect(`/litters/${litterId}?campaign_status=no_eligible`);
  }

  // Calculer l'échéance J+15 (date ISO YYYY-MM-DD)
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + 15);
  const dueDateStr = dueDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const note =
    "Demande 1/2 — avance sur arrhes de pré-réservation. Échéance J+15 après confirmation de gestation.";

  let successCount = 0;
  let errorCount = 0;

  for (const app of applications) {
    // 1. Vérifier s'il existe déjà une réservation liée à cette candidature + portée
    const { data: existingReservation, error: existingReservationErr } =
      await supabase
        .from("reservations")
        .select("id, status")
        .eq("organization_id", litter.organization_id)
        .eq("contact_id", app.contact_id)
        .eq("application_id", app.id)
        .eq("litter_id", litterId)
        .is("deleted_at", null)
        .maybeSingle();

    if (existingReservationErr) {
      errorCount++;
      continue;
    }

    let reservationId: string | null = null;
    let reservationStatus: string | null = null;

    if (existingReservation) {
      reservationId = existingReservation.id;
      reservationStatus = existingReservation.status;
    } else {
      // Créer une nouvelle réservation en brouillon d'abord : elle ne sera
      // promue qu'après création effective de la demande de paiement.
      const { data: newReservation, error: insertErr } = await supabase
        .from("reservations")
        .insert({
          organization_id: litter.organization_id,
          contact_id: app.contact_id,
          application_id: app.id,
          litter_id: litterId,
          species: litter.species ?? "dog",
          breed: litter.breed ?? "Golden Retriever",
          reserved_sex_preference: app.desired_sex_preference ?? "unknown",
          status: "draft",
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .maybeSingle();

      if (insertErr || !newReservation) {
        errorCount++;
        continue;
      }
      reservationId = newReservation.id;
      reservationStatus = "draft";
    }

    const { data: existingDepositPayments, error: existingPaymentErr } =
      await supabase
        .from("payments")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("payment_type", "arrhes")
        .eq("amount_cents", PRE_RESERVATION_PAYMENT_AMOUNT_CENTS)
        .in("status", ["requested", "paid"])
        .is("deleted_at", null)
        .limit(1);

    if (existingPaymentErr) {
      errorCount++;
      continue;
    }

    const hasExistingDepositPayment =
      existingDepositPayments && existingDepositPayments.length > 0;
    const canCreateMissingDepositRequest =
      reservationStatus === "draft" ||
      reservationStatus === "pre_reservation_requested";

    if (!hasExistingDepositPayment && !canCreateMissingDepositRequest) {
      continue;
    }

    if (!hasExistingDepositPayment) {
      // 2. Créer la demande de paiement de 250 € (arrhes, requested, J+15)
      const { error: paymentErr } = await supabase.from("payments").insert({
        organization_id: litter.organization_id,
        contact_id: app.contact_id,
        reservation_id: reservationId,
        amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
        currency: "EUR",
        payment_type: "arrhes",
        status: "requested",
        payment_method: "bank_transfer",
        requested_at: new Date().toISOString(),
        due_date: dueDateStr,
        notes: note,
        created_by: user.id,
        updated_by: user.id,
      });

      if (paymentErr) {
        errorCount++;
        continue;
      }
    }

    if (reservationStatus !== "draft") {
      if (!hasExistingDepositPayment) {
        successCount++;
      }
      continue;
    }

    // Mettre à jour le brouillon vers pre_reservation_requested uniquement
    // après existence confirmée de la demande 250 €.
    const { error: updateErr } = await supabase
      .from("reservations")
      .update({
        status: "pre_reservation_requested",
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", reservationId)
      .eq("organization_id", litter.organization_id)
      .eq("status", "draft")
      .is("deleted_at", null);

    if (updateErr) {
      errorCount++;
      continue;
    }

    successCount++;
  }

  revalidatePath(`/litters/${litterId}`);
  revalidatePath("/litters");
  revalidatePath("/reservations");

  if (successCount === 0 && errorCount > 0) {
    redirect(`/litters/${litterId}?campaign_status=error`);
  }

  redirect(
    `/litters/${litterId}?campaign_status=success&campaign_count=${successCount}`,
  );
}

export async function requestPreReservationBalance(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=complement_arrhes");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Relecture serveur de la réservation
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  // 2. Valider le statut : doit être pre_reservation_paid
  if (reservation.status !== "pre_reservation_paid") {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  // 3. Récupérer les paiements actifs de type arrhes et montant Phase 1.
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, status")
    .eq("reservation_id", reservationId)
    .eq("payment_type", "arrhes")
    .eq("amount_cents", PRE_RESERVATION_PAYMENT_AMOUNT_CENTS)
    .in("status", ["requested", "paid"])
    .is("deleted_at", null);

  if (paymentsError || !payments) {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  const paidPayments = payments.filter((p) => p.status === "paid");

  // Si on a déjà 2 demandes ou plus, on renvoie une erreur contrôlée (doublon)
  if (payments.length >= 2) {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  // Il doit y avoir exactement une demande active de 250 € d'arrhes qui est payée
  if (payments.length !== 1 || paidPayments.length !== 1) {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  // 4. Calcul de l'échéance J+15
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 15);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  // 5. Création de la deuxième demande de paiement
  const { error: insertError } = await supabase.from("payments").insert({
    organization_id: reservation.organization_id,
    contact_id: reservation.contact_id,
    reservation_id: reservation.id,
    amount_cents: PRE_RESERVATION_PAYMENT_AMOUNT_CENTS,
    currency: "EUR",
    payment_type: "arrhes",
    status: "requested",
    payment_method: "bank_transfer",
    requested_at: new Date().toISOString(),
    due_date: dueDateStr,
    notes: "Demande 2/2 — complément des arrhes. Total attendu des arrhes : 500 €.",
    created_by: user.id,
    updated_by: user.id,
  });

  if (insertError) {
    redirect(`/reservations/${reservationId}?balance_request_status=error#payments`);
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/payments");

  redirect(`/reservations/${reservationId}?balance_request_status=success#payments`);
}

// ---------------------------------------------------------------------------
// Synchronisation manuelle du rattachement portée/groupe depuis la candidature
// ---------------------------------------------------------------------------

function scopeSyncUrl(
  reservationId: string,
  outcome: "success" | "no_application" | "no_scope" | "error",
) {
  return `/reservations/${reservationId}?scope_sync_status=${outcome}#scope-and-animal`;
}

/**
 * Reprend manuellement, sur une réservation existante, le rattachement
 * portée/groupe de la candidature liée. Action explicite déclenchée par
 * l'éleveur depuis la fiche Réservation (jamais automatique).
 *
 * Décisions :
 *   - `organization_id` jamais accepté du client : déduit de la réservation.
 *   - La candidature liée doit appartenir à la même organisation ET au même
 *     contact que la réservation.
 *   - Règle de synchronisation :
 *       * portée souhaitée → litter_id = portée, litter_group_id = groupe de la
 *         portée (source de vérité, peut être null) ;
 *       * groupe souhaité seul → litter_id = null, litter_group_id = groupe ;
 *       * aucun rattachement souhaité → rien à reprendre (message clair).
 *   - Met à jour uniquement `litter_id`, `litter_group_id`, `updated_at`,
 *     `updated_by`. Ne touche pas au statut, à la candidature, ni à aucun objet
 *     lié (paiement, document, note, animal, événement).
 */
export async function syncReservationScopeFromApplication(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=sync_portee");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relecture serveur de la réservation : son organisation fait foi.
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select(
      "id, organization_id, contact_id, application_id, litter_id, litter_group_id, deleted_at",
    )
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation || !reservation.organization_id) {
    redirect(scopeSyncUrl(reservationId, "error"));
  }

  const organizationId = reservation.organization_id;

  // Une candidature liée est obligatoire pour cette action.
  if (!reservation.application_id) {
    redirect(scopeSyncUrl(reservationId, "no_application"));
  }

  // Relire la candidature liée : même organisation ET même contact.
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select(
      "id, organization_id, contact_id, desired_litter_id, desired_litter_group_id, deleted_at",
    )
    .eq("id", reservation.application_id)
    .eq("organization_id", organizationId)
    .eq("contact_id", reservation.contact_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (applicationError || !application) {
    redirect(scopeSyncUrl(reservationId, "error"));
  }

  let targetLitterId: string | null = null;
  let targetGroupId: string | null = null;

  if (application.desired_litter_id) {
    // Portée souhaitée : vérifier l'organisation ; le groupe de la portée fait
    // foi (peut être null si la portée n'appartient à aucun groupe).
    const { data: litter, error: litterError } = await supabase
      .from("litters")
      .select("id, litter_group_id")
      .eq("id", application.desired_litter_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (litterError || !litter) {
      redirect(scopeSyncUrl(reservationId, "error"));
    }

    targetLitterId = litter.id;
    targetGroupId = litter.litter_group_id ?? null;
  } else if (application.desired_litter_group_id) {
    // Groupe souhaité seul : vérifier l'organisation.
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", application.desired_litter_group_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(scopeSyncUrl(reservationId, "error"));
    }

    targetGroupId = group.id;
  } else {
    // La candidature n'a aucun rattachement portée/groupe à reprendre.
    redirect(scopeSyncUrl(reservationId, "no_scope"));
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      litter_id: targetLitterId,
      litter_group_id: targetGroupId,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (updateError) {
    redirect(scopeSyncUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(scopeSyncUrl(reservationId, "success"));
}

// ---------------------------------------------------------------------------
// Rattachement d'une réservation existante depuis une fiche Portée / Groupe
// ---------------------------------------------------------------------------

function litterReservationAttachUrl(
  litterId: string,
  outcome: "success" | "error" | "animal_attributed",
) {
  return `/litters/${litterId}?reservation_attach_status=${outcome}#reservations-liees`;
}

function groupReservationAttachUrl(
  groupId: string,
  outcome: "success" | "error" | "animal_attributed",
) {
  return `/litter-groups/${groupId}?reservation_attach_status=${outcome}#reservations-liees`;
}

/**
 * Rattache une réservation existante à une portée OU à un groupe de portées,
 * depuis la fiche Portée ou la fiche Groupe.
 *
 * - Le contexte (portée ou groupe) est déterminé par le champ présent
 *   (`litter_id` pour une portée, `litter_group_id` pour un groupe).
 * - Garde-fou : si la réservation a déjà un animal attribué, l'action est
 *   bloquée (un animal appartient à une portée précise).
 * - Rattachement à une portée : litter_id = litter.id,
 *   litter_group_id = litter.litter_group_id (groupe réel de la portée, source
 *   de vérité — aucune valeur de groupe acceptée depuis le client).
 * - Rattachement à un groupe : litter_id = null, litter_group_id = group.id.
 * - Ne touche pas au statut, à la candidature liée, ni à aucun objet lié
 *   (paiement, document, note, animal, événement).
 */
export async function attachReservationToScope(formData: FormData) {
  const reservationIdRaw = formData.get("reservation_id");
  const litterIdRaw = formData.get("litter_id");
  const groupIdRaw = formData.get("litter_group_id");

  const litterId =
    typeof litterIdRaw === "string" &&
    litterIdRaw.trim() &&
    isUuid(litterIdRaw.trim())
      ? litterIdRaw.trim()
      : null;
  const groupId =
    typeof groupIdRaw === "string" &&
    groupIdRaw.trim() &&
    isUuid(groupIdRaw.trim())
      ? groupIdRaw.trim()
      : null;

  // URL de retour selon le contexte d'origine.
  const backUrl = (outcome: "success" | "error" | "animal_attributed") => {
    if (litterId) {
      return litterReservationAttachUrl(litterId, outcome);
    }
    if (groupId) {
      return groupReservationAttachUrl(groupId, outcome);
    }
    return "/litters";
  };

  // Exactement une cible attendue (jamais les deux, jamais aucune).
  if ((litterId && groupId) || (!litterId && !groupId)) {
    redirect(backUrl("error"));
  }

  if (
    typeof reservationIdRaw !== "string" ||
    !reservationIdRaw.trim() ||
    !isUuid(reservationIdRaw.trim())
  ) {
    redirect(backUrl("error"));
  }

  const reservationId = (reservationIdRaw as string).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire la réservation (organisation, non supprimée). Son organisation fait foi.
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, animal_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation || !reservation.organization_id) {
    redirect(backUrl("error"));
  }

  // Garde-fou métier : une réservation avec animal attribué ne peut pas être
  // déplacée dans ce lot (cohérence portée/animal).
  if (reservation.animal_id) {
    redirect(backUrl("animal_attributed"));
  }

  const organizationId = reservation.organization_id;

  let litterTarget: string | null = null;
  let groupTarget: string | null = null;

  if (litterId) {
    // Relire la portée (même organisation, non supprimée) ; son groupe fait foi.
    const { data: litter, error: litterError } = await supabase
      .from("litters")
      .select("id, litter_group_id")
      .eq("id", litterId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (litterError || !litter) {
      redirect(backUrl("error"));
    }

    litterTarget = litter.id;
    groupTarget = litter.litter_group_id ?? null;
  } else if (groupId) {
    // Relire le groupe (même organisation, non supprimé).
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", groupId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(backUrl("error"));
    }

    litterTarget = null;
    groupTarget = group.id;
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      litter_id: litterTarget,
      litter_group_id: groupTarget,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (updateError) {
    redirect(backUrl("error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  if (litterId) {
    revalidatePath(`/litters/${litterId}`);
  }
  if (groupId) {
    revalidatePath(`/litter-groups/${groupId}`);
  }

  redirect(backUrl("success"));
}

// ---------------------------------------------------------------------------
// Création directe d'une réservation brouillon depuis le module Réservations
// ---------------------------------------------------------------------------

const RESERVED_SEX_PREFERENCES = new Set([
  "male_only",
  "female_only",
  "male_preferred_female_possible",
  "female_preferred_male_possible",
  "no_preference",
  "unknown",
]);

const NEW_RESERVATION_ERROR_URL = "/reservations/new?status=error";

/**
 * Crée une réservation brouillon directement depuis `/reservations/new`.
 *
 * Décisions Phase 1 (Lot 1) :
 *   - `contact_id` obligatoire, `application_id` optionnel.
 *   - Statut forcé à `draft` (jamais `active`, payée ou pré-réservée).
 *   - Aucun contact ni candidature créés ici, aucun dédoublonnage de contact.
 *   - Aucun paiement, document, note ou attribution automatique.
 *   - `organization_id` résolu via les memberships de l'utilisateur connecté,
 *     jamais accepté depuis le client.
 *   - Si une candidature est fournie, elle doit appartenir à la même
 *     organisation et au même contact, et ne pas avoir déjà de réservation.
 */
export async function createReservationDirect(formData: FormData) {
  const contactIdValue = formData.get("contact_id");

  if (typeof contactIdValue !== "string" || !isUuid(contactIdValue)) {
    redirect(NEW_RESERVATION_ERROR_URL);
  }

  const contactId = contactIdValue;

  const rawApplicationId = formData.get("application_id");
  let applicationId: string | null = null;

  if (typeof rawApplicationId === "string" && rawApplicationId.trim()) {
    const trimmed = rawApplicationId.trim();
    if (!isUuid(trimmed)) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }
    applicationId = trimmed;
  }

  // Portée / groupe de portées : choix explicite côté formulaire.
  // Règle métier : une portée appartient à un groupe ; sélectionner une portée
  // conserve donc aussi son groupe associé (les deux colonnes peuvent coexister).
  const rawLitterId = formData.get("litter_id");
  let requestedLitterId: string | null = null;

  if (typeof rawLitterId === "string" && rawLitterId.trim()) {
    const trimmed = rawLitterId.trim();
    if (!isUuid(trimmed)) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }
    requestedLitterId = trimmed;
  }

  const rawLitterGroupId = formData.get("litter_group_id");
  let requestedLitterGroupId: string | null = null;

  if (typeof rawLitterGroupId === "string" && rawLitterGroupId.trim()) {
    const trimmed = rawLitterGroupId.trim();
    if (!isUuid(trimmed)) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }
    requestedLitterGroupId = trimmed;
  }

  const rawSexPreference = formData.get("reserved_sex_preference");
  const reservedSexFromForm =
    typeof rawSexPreference === "string" &&
    RESERVED_SEX_PREFERENCES.has(rawSexPreference)
      ? rawSexPreference
      : "unknown";

  const parsedPrice = parsePriceCents(formData.get("price"));

  if (!parsedPrice.ok) {
    redirect(NEW_RESERVATION_ERROR_URL);
  }

  const commentValue = formData.get("internal_comment");
  let internalComment: string | null = null;

  if (typeof commentValue === "string") {
    const trimmedComment = commentValue.trim();
    if (trimmedComment.length > 2_000) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }
    internalComment = trimmedComment || null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Résolution de l'organisation via les memberships de l'utilisateur connecté.
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
    redirect(NEW_RESERVATION_ERROR_URL);
  }

  const organizationId = membership.organization_id;

  // Le contact doit appartenir à la même organisation.
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contact) {
    redirect(NEW_RESERVATION_ERROR_URL);
  }

  let species = "dog";
  let breed = "Golden Retriever";
  let litterGroupId: string | null = null;
  let litterId: string | null = null;
  let reservedSexPreference = reservedSexFromForm;

  if (applicationId) {
    // La candidature doit appartenir à la même organisation ET au même contact.
    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select(
        "id, organization_id, contact_id, species, breed, desired_litter_group_id, desired_litter_id, desired_sex_preference",
      )
      .eq("id", applicationId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .maybeSingle();

    if (applicationError || !application) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }

    // Anti-doublon : pas de réservation déjà liée à cette candidature.
    const { data: existingReservation, error: existingReservationError } =
      await supabase
        .from("reservations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("application_id", applicationId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

    if (existingReservationError) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }

    if (existingReservation) {
      redirect("/reservations/new?status=duplicate");
    }

    species = application.species ?? "dog";
    breed = application.breed ?? "Golden Retriever";
    reservedSexPreference =
      application.desired_sex_preference ?? reservedSexFromForm;
  }

  if (requestedLitterId) {
    // La portée doit appartenir à la même organisation ; on récupère aussi son
    // groupe, qui fait foi (source de vérité métier).
    const { data: litter, error: litterError } = await supabase
      .from("litters")
      .select("id, litter_group_id")
      .eq("id", requestedLitterId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (litterError || !litter) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }

    const litterGroupOfLitter = litter.litter_group_id ?? null;

    // Si un groupe client est aussi fourni, il doit correspondre à celui de la
    // portée (sinon incohérence métier refusée).
    if (
      requestedLitterGroupId &&
      litterGroupOfLitter &&
      requestedLitterGroupId !== litterGroupOfLitter
    ) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }

    litterId = requestedLitterId;
    // Le groupe de la portée fait foi (peut être null : portée sans groupe,
    // enregistrée seule sans inventer de groupe).
    litterGroupId = litterGroupOfLitter;
  } else if (requestedLitterGroupId) {
    // Groupe seul : il doit appartenir à la même organisation.
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", requestedLitterGroupId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(NEW_RESERVATION_ERROR_URL);
    }

    litterGroupId = requestedLitterGroupId;
  }

  const { data: createdReservation, error: insertError } = await supabase
    .from("reservations")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      application_id: applicationId,
      litter_group_id: litterGroupId,
      litter_id: litterId,
      species,
      breed,
      reserved_sex_preference: reservedSexPreference,
      price_cents: parsedPrice.priceCents,
      internal_comment: internalComment,
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !createdReservation?.id) {
    redirect(NEW_RESERVATION_ERROR_URL);
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${createdReservation.id}`);
  redirect(`/reservations/${createdReservation.id}`);
}
