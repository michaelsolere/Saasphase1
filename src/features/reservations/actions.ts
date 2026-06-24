"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  FINAL_RESERVATION_STATUSES,
  isFinalReservationStatus,
} from "@/features/reservations/statuses";
import { createClient } from "@/lib/supabase/server";

function priceUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?price_status=${outcome}`;
}

function commentUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?comment_status=${outcome}`;
}

function deadlineUrl(
  reservationId: string,
  outcome: "success" | "error",
) {
  return `/reservations/${reservationId}?deadline_status=${outcome}`;
}

function activationUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
) {
  return `/reservations/${reservationId}?activation_status=${outcome}`;
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
    .select("id, organization_id, status, deleted_at")
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

export async function assignAnimalToReservation(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=assignation");
  }

  const animalId = formData.get("animal_id");

  if (typeof animalId !== "string" || !animalId) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
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
    .select("id, organization_id, animal_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readResError || !reservation) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
  }

  // 2. Vérifier si un animal est déjà attribué
  if (reservation.animal_id) {
    redirect(`/reservations/${reservationId}?animal_assign_status=already_assigned`);
  }

  // 3. Vérifier que la réservation n'est pas finale
  if (isFinalReservationStatus(reservation.status)) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
  }

  // 4. Relire l'animal
  const { data: animal, error: readAnimalError } = await supabase
    .from("animals")
    .select("id, organization_id, status, deleted_at")
    .eq("id", animalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readAnimalError || !animal) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable`);
  }

  // 5. Vérifier la cohérence d'organisation
  if (animal.organization_id !== reservation.organization_id) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
  }

  // 6. Vérifier le statut de l'animal
  const allowedAnimalStatuses = ["born", "active", "available"];
  if (!allowedAnimalStatuses.includes(animal.status)) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable`);
  }

  // 7. Vérifier que l'animal n'est pas déjà lié à une autre réservation active
  const { data: concurrentRes, error: concurrentResError } = await supabase
    .from("reservations")
    .select("id")
    .eq("animal_id", animalId)
    .is("deleted_at", null)
    .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`);

  if (concurrentResError) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
  }

  if (concurrentRes && concurrentRes.length > 0) {
    redirect(`/reservations/${reservationId}?animal_assign_status=animal_unavailable`);
  }

  // 8. Mettre à jour
  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      animal_id: animalId,
      animal_assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservationId)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(`/reservations/${reservationId}?animal_assign_status=error`);
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);

  redirect(`/reservations/${reservationId}?animal_assign_status=success`);
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
    .select("id, organization_id, animal_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readResError || !reservation) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=error`);
  }

  // 2. Vérifier si un animal est actuellement attribué
  const animalId = reservation.animal_id;
  if (!animalId) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=no_animal`);
  }

  // 3. Vérifier que la réservation n'est pas finale
  if (isFinalReservationStatus(reservation.status)) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=invalid_state`);
  }

  // 4. Mettre à jour la réservation
  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      animal_id: null,
      animal_assigned_at: null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservationId)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    redirect(`/reservations/${reservationId}?animal_unassign_status=error`);
  }

  // 5. Revalidations
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);

  redirect(`/reservations/${reservationId}?animal_unassign_status=success`);
}
