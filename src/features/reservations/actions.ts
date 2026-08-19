"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isFinalReservationStatus } from "@/features/reservations/statuses";
import {
  runPreReservationCampaignForApplications,
  type PreReservationCampaignResult,
} from "@/features/reservations/pre-reservation-campaign";
import {
  addDaysAsIsoDate,
  readDepositSettingsForOrganization,
} from "@/features/payments/deposit-thresholds";
import { evaluatePreReservationBalanceRequest } from "@/features/payments/pre-reservation-deposit";
import { calculateRemainingBalanceCents } from "@/features/reservations/financials";
import { departureDateTimeInputToIso } from "@/features/departures/departure-time-zone";
import { formatPrice } from "@/features/reservations/formatters";
import { parseEuroAmountToCents } from "@/features/reservations/financial-resolution-core";
import { sendPreReservationEmailForApplication, sendPreReservationEmailForReservation } from "@/features/communications/pre-reservation-email";
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
  returnTo?: FormDataEntryValue | null,
) {
  if (typeof returnTo === "string" && returnTo.startsWith("/reservations?")) {
    try {
      const url = new URL(returnTo, "http://localhost");
      if (url.origin === "http://localhost" && url.pathname === "/reservations") {
        url.searchParams.set("note_status", outcome);
        return `${url.pathname}${url.search}`;
      }
    } catch {
      // Fall back to the complete journey below.
    }
  }
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

function preReservationEmailUrl(reservationId: string, outcome: string) {
  return `/reservations/${reservationId}?pre_reservation_email_status=${outcome}#pre-reservation-email`;
}

function adoptionUrl(
  reservationId: string,
  outcome: "success" | "invalid_state" | "error",
  reason?: string | null,
) {
  const reasonQuery = reason ? `&adoption_reason=${encodeURIComponent(reason)}` : "";
  return `/reservations/${reservationId}?adoption_status=${outcome}${reasonQuery}#adoption-preparation`;
}

function adoptionCorrectionUrl(
  reservationId: string,
  outcome: "success" | "incident" | "invalid_state" | "error",
  reason?: string | null,
) {
  const reasonQuery = reason
    ? `&adoption_correction_reason=${encodeURIComponent(reason)}`
    : "";
  return `/reservations/${reservationId}?adoption_correction_status=${outcome}${reasonQuery}#adoption-preparation`;
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

function jsonStringField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
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

  const isoValue = departureDateTimeInputToIso(trimmedValue);

  if (!isoValue) {
    return { ok: false as const };
  }

  return { ok: true as const, value: isoValue };
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

export async function sendPreReservationEmail(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=email_pre_reservation");
  }

  const result = await sendPreReservationEmailForReservation({ reservationId });

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/settings/organization");
  redirect(preReservationEmailUrl(reservationId, result.status));
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
  const returnTo = formData.get("return_to");

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof body !== "string" ||
    !body.trim() ||
    body.trim().length > 2_000
  ) {
    if (typeof reservationId === "string" && isUuid(reservationId)) {
      redirect(noteUrl(reservationId, "error", returnTo));
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
    redirect(noteUrl(reservationId, "error", returnTo));
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
    redirect(noteUrl(reservationId, "error", returnTo));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(noteUrl(reservationId, "success", returnTo));
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
  const commandId = formData.get("client_command_id");
  const adoptionCompletedAt = formData.get("adoption_completed_at");
  const adoptionIso = typeof adoptionCompletedAt === "string" ? departureDateTimeInputToIso(adoptionCompletedAt) : null;
  const expectedReservationUpdatedAt = formData.get(
    "expected_reservation_updated_at",
  );
  const exceptionReason = normalizeOptionalText(
    formData.get("exception_reason"),
    5_000,
  );
  const acknowledgedExceptionCodes = formData
    .getAll("acknowledged_exception_code")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const physicalDocumentsHandedOver = formData.get("physical_documents_handed_over") === "confirmed";
  const requestedReturnTo = formData.get("return_to");
  const returnTo = typeof requestedReturnTo === "string" && requestedReturnTo.startsWith("/reservations?") && !requestedReturnTo.includes("//") ? requestedReturnTo : null;

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof commandId !== "string" ||
    !isUuid(commandId) ||
    !adoptionIso ||
    typeof expectedReservationUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(expectedReservationUpdatedAt)) ||
    !physicalDocumentsHandedOver
  ) {
    redirect("/reservations?erreur=adoption");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }


  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: Array<{ outcome: string; event_id: string | null; reason: string | null; exception_codes: string[] | null; result?: unknown }> | null;
      error: unknown;
    }>;
  }).rpc("finalize_departure_adoption_handover", {
    p_reservation_id: reservationId,
    p_client_command_id: commandId,
    p_adoption_completed_at: adoptionIso,
    p_expected_reservation_updated_at: expectedReservationUpdatedAt,
    p_physical_documents_handed_over: true,
    p_acknowledged_exception_codes: acknowledgedExceptionCodes,
    p_exception_reason: exceptionReason,
  });

  const response = data?.[0];
  if (error || !response) {
    redirect(adoptionUrl(reservationId, "error"));
  }

  if (response.outcome !== "success") {
    redirect(adoptionUrl(reservationId, "invalid_state", response.reason));
  }

  const contactId = jsonStringField(response.result, "contactId");
  revalidatePath("/contacts");
  if (contactId && isUuid(contactId)) revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  const organization = returnTo ? new URL(returnTo, "http://localhost").searchParams.get("organization") : null;
  redirect(`/reservations?view=finalized&selected=${reservationId}&adoption_status=success${organization ? `&organization=${encodeURIComponent(organization)}` : ""}`);
}

export async function correctAdoptionHandover(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const commandId = formData.get("client_command_id");
  const correctionType = formData.get("correction_type");
  const newAdoptionCompletedAt = formData.get("new_adoption_completed_at");
  const correctedAdoptionIso = typeof newAdoptionCompletedAt === "string" ? departureDateTimeInputToIso(newAdoptionCompletedAt) : null;
  const expectedAdoptionCompletedAt = formData.get(
    "expected_adoption_completed_at",
  );
  const reason = normalizeOptionalText(formData.get("reason"), 5_000);

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof commandId !== "string" ||
    !isUuid(commandId) ||
    (correctionType !== "date" && correctionType !== "reverse") ||
    typeof expectedAdoptionCompletedAt !== "string" ||
    !Number.isFinite(Date.parse(expectedAdoptionCompletedAt)) ||
    !reason ||
    (correctionType === "date" && !correctedAdoptionIso)
  ) {
    redirect("/reservations?erreur=correction_adoption");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("correct_adoption_handover", {
    p_reservation_id: reservationId,
    p_client_command_id: commandId,
    p_correction_type: correctionType,
    p_expected_adoption_completed_at: expectedAdoptionCompletedAt,
    p_new_adoption_completed_at:
      correctionType === "date" ? correctedAdoptionIso : null,
    p_reason: reason,
  });
  const response = data?.[0];
  if (error || !response) {
    redirect(adoptionCorrectionUrl(reservationId, "error"));
  }
  if (response.outcome === "incident_opened") {
    revalidatePath(`/reservations/${reservationId}`);
    redirect(adoptionCorrectionUrl(reservationId, "incident"));
  }
  if (response.outcome !== "success") {
    redirect(
      adoptionCorrectionUrl(reservationId, "invalid_state", response.reason),
    );
  }

  const contactId = jsonStringField(response.result, "contactId");
  revalidatePath("/contacts");
  if (contactId && isUuid(contactId)) revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/animals");
  redirect(adoptionCorrectionUrl(reservationId, "success"));
}

type NegativeExitStatus = "cancelled" | "withdrawn" | "expired";

function negativeExitUrl(
  reservationId: string,
  targetStatus: NegativeExitStatus,
  outcome: "success" | "invalid_state" | "error",
) {
  if (targetStatus === "cancelled") return cancellationUrl(reservationId, outcome);
  if (targetStatus === "withdrawn") return withdrawalUrl(reservationId, outcome);
  return expirationUrl(reservationId, outcome);
}

async function transitionReservationToNegativeExit(
  formData: FormData,
  targetStatus: NegativeExitStatus,
) {
  const reservationId = formData.get("reservation_id");
  const clientCommandId = formData.get("client_command_id");
  const expectedUpdatedAt = formData.get("expected_reservation_updated_at");

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof clientCommandId !== "string" ||
    !isUuid(clientCommandId) ||
    typeof expectedUpdatedAt !== "string" ||
    Number.isNaN(Date.parse(expectedUpdatedAt))
  ) {
    redirect("/reservations?erreur=sortie");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("transition_adopter_journey_exit", {
    p_reservation_id: reservationId,
    p_client_command_id: clientCommandId,
    p_target_status: targetStatus,
    p_expected_reservation_updated_at: expectedUpdatedAt,
  });
  const result = data?.[0] ?? null;

  if (error) {
    console.error("transition_adopter_journey_exit RPC failed:", error);
    redirect(negativeExitUrl(reservationId, targetStatus, "error"));
  }
  if (result?.outcome !== "success") {
    redirect(negativeExitUrl(reservationId, targetStatus, "invalid_state"));
  }

  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(negativeExitUrl(reservationId, targetStatus, "success"));
}

export async function cancelReservation(formData: FormData) {
  return transitionReservationToNegativeExit(formData, "cancelled");
}

export async function withdrawReservation(formData: FormData) {
  return transitionReservationToNegativeExit(formData, "withdrawn");
}

export async function expireReservation(formData: FormData) {
  return transitionReservationToNegativeExit(formData, "expired");
}

export type FinancialResolutionActionState = {
  status: "idle" | "success" | "error" | "stale";
  message: string;
};

export async function recordAdopterFinancialResolution(
  _previousState: FinancialResolutionActionState,
  formData: FormData,
): Promise<FinancialResolutionActionState> {
  const reservationId = formData.get("reservation_id");
  const clientCommandId = formData.get("client_command_id");
  const expectedEventId = formData.get("expected_event_id");
  const financialResolution = formData.get("financial_resolution");
  const reason = formData.get("reason");
  const refundAmountRaw = formData.get("refund_amount");
  const paymentMethod = formData.get("payment_method");
  const paidAtRaw = formData.get("paid_at");
  const voidRefundPaymentId = formData.get("void_refund_payment_id");
  const voidAttestation = formData.get("void_attestation");

  const validResolution =
    financialResolution === "full_refund" ||
    financialResolution === "partial_refund" ||
    financialResolution === "no_refund";
  const amountInput = typeof refundAmountRaw === "string" ? refundAmountRaw.trim() : "";
  const refundAmountCents = amountInput ? parseEuroAmountToCents(amountInput) : 0;
  const voidPaymentId =
    typeof voidRefundPaymentId === "string" && voidRefundPaymentId
      ? voidRefundPaymentId
      : null;

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof clientCommandId !== "string" ||
    !isUuid(clientCommandId) ||
    typeof expectedEventId !== "string" ||
    !isUuid(expectedEventId) ||
    !validResolution ||
    typeof reason !== "string" ||
    reason.trim().length === 0 ||
    reason.trim().length > 5000 ||
    refundAmountCents === null ||
    (voidPaymentId !== null &&
      (!isUuid(voidPaymentId) || voidAttestation !== "confirmed"))
  ) {
    return {
      status: "error",
      message: "Vérifiez la décision, le montant et la justification.",
    };
  }

  let paidAt: string | null = null;
  let normalizedPaymentMethod: string | null = null;
  if (refundAmountCents > 0) {
    if (
      typeof paymentMethod !== "string" ||
      !["bank_transfer", "cash", "cheque", "card", "other"].includes(paymentMethod) ||
      typeof paidAtRaw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(paidAtRaw)
    ) {
      return {
        status: "error",
        message: "Renseignez la date réelle et le moyen du remboursement.",
      };
    }
    paidAt = `${paidAtRaw}T12:00:00.000Z`;
    if (paidAtRaw > new Date().toISOString().slice(0, 10)) {
      return {
        status: "error",
        message: "La date du remboursement ne peut pas être future.",
      };
    }
    normalizedPaymentMethod = paymentMethod;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Votre session a expiré." };

  const { data, error } = await supabase.rpc("record_adopter_financial_resolution", {
    p_reservation_id: reservationId,
    p_client_command_id: clientCommandId,
    p_financial_resolution: financialResolution,
    p_refund_amount_cents: refundAmountCents,
    p_payment_method: normalizedPaymentMethod,
    p_paid_at: paidAt,
    p_reason: reason.trim(),
    p_expected_event_id: expectedEventId,
    p_void_refund_payment_id: voidPaymentId,
  });
  const result = data?.[0] ?? null;

  if (error) {
    console.error("record_adopter_financial_resolution RPC failed:", error);
    return {
      status: "error",
      message: "La résolution n’a pas été enregistrée. Réessayez sans modifier le dossier.",
    };
  }
  if (result?.outcome !== "success") {
    if (result?.reason === "resolution_stale") {
      return {
        status: "stale",
        message: "La situation financière a changé. Rechargez la page avant de recommencer.",
      };
    }
    if (result?.reason === "currency_mismatch") {
      return {
        status: "error",
        message:
          "Les paiements de ce parcours utilisent plusieurs devises. Corrigez-les avant de finaliser la résolution.",
      };
    }
    return {
      status: "error",
      message: "Cette résolution n’est plus applicable à l’état actuel du parcours.",
    };
  }

  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  return {
    status: "success",
    message: result.replayed
      ? "Cette résolution était déjà enregistrée."
      : "La résolution financière a été enregistrée.",
  };
}


function preciseLitterAttachUrl(
  reservationId: string,
  outcome: "success" | "error" | "animal_attributed",
) {
  return `/reservations/${reservationId}?litter_attach_status=${outcome}#scope-and-animal`;
}

export async function attachReservationToPreciseLitter(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const litterId = formData.get("litter_id");

  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    typeof litterId !== "string" ||
    !isUuid(litterId)
  ) {
    redirect("/reservations?erreur=rattachement_portee");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, organization_id, animal_id, litter_group_id, status")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError || !reservation?.organization_id) {
    redirect(preciseLitterAttachUrl(reservationId, "error"));
  }

  if (reservation.animal_id) {
    redirect(preciseLitterAttachUrl(reservationId, "animal_attributed"));
  }

  if (isFinalReservationStatus(reservation.status)) {
    redirect(preciseLitterAttachUrl(reservationId, "error"));
  }

  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, litter_group_id")
    .eq("id", litterId)
    .eq("organization_id", reservation.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter) {
    redirect(preciseLitterAttachUrl(reservationId, "error"));
  }

  if (
    reservation.litter_group_id &&
    litter.litter_group_id !== reservation.litter_group_id
  ) {
    redirect(preciseLitterAttachUrl(reservationId, "error"));
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      litter_id: litter.id,
      litter_group_id: litter.litter_group_id,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", reservation.id)
    .eq("organization_id", reservation.organization_id)
    .is("animal_id", null)
    .is("deleted_at", null);

  if (updateError) {
    redirect(preciseLitterAttachUrl(reservationId, "error"));
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/litters/${litter.id}`);

  redirect(preciseLitterAttachUrl(reservationId, "success"));
}

// ---------------------------------------------------------------------------
// Campagne de pré-réservation
// ---------------------------------------------------------------------------

type PreReservationBalanceCampaignReservation = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  status: string | null;
};

type PreReservationBalanceCampaignResult = {
  reservationsCheckedCount: number;
  paymentsCreatedCount: number;
  ignoredCompleteCount: number;
  ignoredActiveRequestCount: number;
  ignoredPreReservationUnpaidCount: number;
  ignoredIneligibleCount: number;
  errorCount: number;
};

type PreReservationBalanceCreationResult =
  | { outcome: "created" }
  | {
      outcome:
        | "complete"
        | "active_request"
        | "pre_reservation_unpaid"
        | "ineligible"
        | "error";
    };

type DepartureBalanceCampaignReservation = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  status: string | null;
  price_cents: number | null;
  paid_cents: number | null;
  refunded_cents: number | null;
  currency: string | null;
};

type DepartureBalanceCampaignResult = {
  reservationsCheckedCount: number;
  paymentsCreatedCount: number;
  ignoredNoBalanceCount: number;
  ignoredActiveRequestCount: number;
  ignoredMissingPriceCount: number;
  ignoredIneligibleCount: number;
  errorCount: number;
};

type DepartureBalanceCreationResult =
  | { outcome: "created" }
  | {
      outcome:
        | "no_balance"
        | "active_request"
        | "missing_price"
        | "ineligible"
        | "error";
    };

type ChoiceAppointmentsCampaignReservation = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  litter_id: string | null;
  status: string | null;
};

type ChoiceAppointmentsCampaignResult = {
  selectedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  ignoredNotFoundCount: number;
  ignoredNotInJourneyCount: number;
  ignoredFinalStatusCount: number;
  ignoredMissingDocumentsCount: number;
  ignoredDepositIncompleteCount: number;
  ignoredMissingChoiceAppointmentCount: number;
  ignoredMissingAdoptionAppointmentCount: number;
  errorCount: number;
};

type ChoiceAppointmentsTraceResult =
  | { outcome: "created" }
  | {
      outcome:
        | "already_confirmed"
        | "not_in_journey"
        | "final_status"
        | "missing_documents"
        | "deposit_incomplete"
        | "missing_choice_appointment"
        | "missing_adoption_appointment"
        | "not_found"
        | "error";
    };

const CHOICE_APPOINTMENT_ADOPTION_BOOKLET_TEMPLATE_KEY =
  "choice_appointment_adoption_booklet";

const CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE =
  "Créneaux proposés et livret d’adoption envoyés";

const CHOICE_APPOINTMENTS_CAMPAIGN_ELIGIBLE_STATUSES = new Set([
  "pre_reservation_paid",
  "active",
  "confirmed_after_birth",
  "animal_assigned",
  "adoption_ready",
]);

function revalidatePreReservationCampaignProgress(
  applications: Array<{ id: string; contact_id: string | null }>,
) {
  revalidatePath("/candidatures");
  revalidatePath("/contacts");
  revalidatePath("/payments");
  revalidatePath("/reservations");

  applications.forEach((application) => {
    revalidatePath(`/candidatures/${application.id}`);

    if (application.contact_id) {
      revalidatePath(`/contacts/${application.contact_id}`);
    }
  });
}

function preReservationCampaignParams({
  statusParam,
  countParam,
  paymentCountParam,
  draftConflictCountParam,
  result,
}: {
  statusParam: string;
  countParam: string;
  paymentCountParam: string;
  draftConflictCountParam: string;
  result: PreReservationCampaignResult;
}) {
  return new URLSearchParams({
    [statusParam]: "success",
    [countParam]: String(result.reservationsPreparedCount),
    [paymentCountParam]: String(result.paymentsCreatedCount),
    [draftConflictCountParam]: String(result.ignoredDraftConflictCount),
    pre_reservation_email_sent_count: String(result.emailsSentCount),
    pre_reservation_email_already_sent_count: String(
      result.emailsAlreadySentCount,
    ),
    pre_reservation_email_failed_count: String(result.emailsFailedCount),
    pre_reservation_email_missing_count: String(result.emailsMissingCount),
    pre_reservation_email_in_progress_count: String(
      result.emailsInProgressCount + result.uncertainCount,
    ),
    pre_reservation_email_uncertain_count: String(result.uncertainCount),
    pre_reservation_missing_template_count: String(result.missingTemplateCount),
    pre_reservation_brevo_not_configured_count: String(
      result.brevoNotConfiguredCount,
    ),
    pre_reservation_conflict_count: String(result.conflictCount),
    pre_reservation_error_count: String(result.errorCount),
  });
}

async function createPreReservationBalanceRequestForReservation({
  supabase,
  userId,
  reservation,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reservation: PreReservationBalanceCampaignReservation;
}): Promise<PreReservationBalanceCreationResult> {
  const depositSettings = await readDepositSettingsForOrganization({
    supabase,
    organizationId: reservation.organization_id,
  });

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, payment_type, status, amount_cents")
    .eq("reservation_id", reservation.id)
    .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
    .in("status", ["requested", "pending", "partially_paid", "paid"])
    .is("deleted_at", null);

  if (paymentsError || !payments) {
    return { outcome: "error" };
  }

  const evaluation = evaluatePreReservationBalanceRequest({
    reservationStatus: reservation.status,
    contactId: reservation.contact_id,
    payments,
    depositSettings,
    isFinalStatus: isFinalReservationStatus(reservation.status),
  });

  if (evaluation.outcome !== "eligible") {
    return { outcome: evaluation.outcome };
  }

  const contactId = reservation.contact_id;
  if (!contactId) {
    return { outcome: "ineligible" };
  }

  const dueDateStr = addDaysAsIsoDate(
    depositSettings.preReservationResponseDelayDays,
  );

  const { error: insertError } = await supabase.from("payments").insert({
    organization_id: reservation.organization_id,
    contact_id: contactId,
    reservation_id: reservation.id,
    amount_cents: evaluation.balanceAmountCents,
    currency: "EUR",
    payment_type: "arrhes",
    status: "requested",
    payment_method: "bank_transfer",
    requested_at: new Date().toISOString(),
    due_date: dueDateStr,
    notes: `Demande 2/2 — complément d’arrhes. Total attendu des arrhes complètes : ${formatPrice(depositSettings.completeDepositCents, "EUR")}.`,
    created_by: userId,
    updated_by: userId,
  });

  if (insertError) {
    return { outcome: "error" };
  }

  return { outcome: "created" };
}

async function runPreReservationBalanceCampaignForReservations({
  supabase,
  userId,
  reservations,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reservations: PreReservationBalanceCampaignReservation[];
}): Promise<PreReservationBalanceCampaignResult> {
  const result: PreReservationBalanceCampaignResult = {
    reservationsCheckedCount: reservations.length,
    paymentsCreatedCount: 0,
    ignoredCompleteCount: 0,
    ignoredActiveRequestCount: 0,
    ignoredPreReservationUnpaidCount: 0,
    ignoredIneligibleCount: 0,
    errorCount: 0,
  };

  for (const reservation of reservations) {
    const creationResult = await createPreReservationBalanceRequestForReservation({
      supabase,
      userId,
      reservation,
    });

    if (creationResult.outcome === "created") {
      result.paymentsCreatedCount++;
    } else if (creationResult.outcome === "complete") {
      result.ignoredCompleteCount++;
    } else if (creationResult.outcome === "active_request") {
      result.ignoredActiveRequestCount++;
    } else if (creationResult.outcome === "pre_reservation_unpaid") {
      result.ignoredPreReservationUnpaidCount++;
    } else if (creationResult.outcome === "ineligible") {
      result.ignoredIneligibleCount++;
    } else {
      result.errorCount++;
    }
  }

  return result;
}

function preReservationBalanceCampaignParams(
  result: PreReservationBalanceCampaignResult,
) {
  return new URLSearchParams({
    balance_campaign_status: "success",
    balance_campaign_count: String(result.reservationsCheckedCount),
    balance_campaign_payment_count: String(result.paymentsCreatedCount),
    balance_campaign_complete_count: String(result.ignoredCompleteCount),
    balance_campaign_active_request_count: String(
      result.ignoredActiveRequestCount,
    ),
    balance_campaign_unpaid_count: String(
      result.ignoredPreReservationUnpaidCount,
    ),
    balance_campaign_ineligible_count: String(result.ignoredIneligibleCount),
    balance_campaign_error_count: String(result.errorCount),
  });
}

const ACTIVE_BALANCE_PAYMENT_STATUSES = [
  "requested",
  "pending",
  "partially_paid",
] as const;

const DEPARTURE_BALANCE_ELIGIBLE_RESERVATION_STATUSES = [
  "pre_reservation_paid",
  "active",
  "confirmed_after_birth",
  "animal_assigned",
  "adoption_ready",
] as const;

async function createDepartureBalanceRequestForReservation({
  supabase,
  userId,
  reservation,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reservation: DepartureBalanceCampaignReservation;
}): Promise<DepartureBalanceCreationResult> {
  if (
    !reservation.contact_id ||
    isFinalReservationStatus(reservation.status) ||
    !DEPARTURE_BALANCE_ELIGIBLE_RESERVATION_STATUSES.includes(
      reservation.status as (typeof DEPARTURE_BALANCE_ELIGIBLE_RESERVATION_STATUSES)[number],
    )
  ) {
    return { outcome: "ineligible" };
  }

  const remainingBalanceCents = calculateRemainingBalanceCents({
    priceCents: reservation.price_cents,
    paidCents: reservation.paid_cents,
    refundedCents: reservation.refunded_cents,
  });

  if (remainingBalanceCents === null) {
    return { outcome: "missing_price" };
  }

  if (remainingBalanceCents <= 0) {
    return { outcome: "no_balance" };
  }

  const { data: activeBalancePayments, error: activeBalanceError } =
    await supabase
      .from("payments")
      .select("id")
      .eq("reservation_id", reservation.id)
      .eq("payment_type", "balance")
      .in("status", [...ACTIVE_BALANCE_PAYMENT_STATUSES])
      .is("deleted_at", null)
      .limit(1);

  if (activeBalanceError || !activeBalancePayments) {
    return { outcome: "error" };
  }

  if (activeBalancePayments.length > 0) {
    return { outcome: "active_request" };
  }

  const { error: insertError } = await supabase.from("payments").insert({
    organization_id: reservation.organization_id,
    contact_id: reservation.contact_id,
    reservation_id: reservation.id,
    amount_cents: remainingBalanceCents,
    currency: reservation.currency ?? "EUR",
    payment_type: "balance",
    status: "requested",
    payment_method: "bank_transfer",
    requested_at: new Date().toISOString(),
    notes:
      "Demande de solde avant départ/adoption créée après confirmation manuelle de campagne. Aucun e-mail réel envoyé par l'application.",
    created_by: userId,
    updated_by: userId,
  });

  if (insertError) {
    return { outcome: "error" };
  }

  return { outcome: "created" };
}

async function runDepartureBalanceCampaignForReservations({
  supabase,
  userId,
  reservations,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reservations: DepartureBalanceCampaignReservation[];
}): Promise<DepartureBalanceCampaignResult> {
  const result: DepartureBalanceCampaignResult = {
    reservationsCheckedCount: reservations.length,
    paymentsCreatedCount: 0,
    ignoredNoBalanceCount: 0,
    ignoredActiveRequestCount: 0,
    ignoredMissingPriceCount: 0,
    ignoredIneligibleCount: 0,
    errorCount: 0,
  };

  for (const reservation of reservations) {
    const creationResult = await createDepartureBalanceRequestForReservation({
      supabase,
      userId,
      reservation,
    });

    if (creationResult.outcome === "created") {
      result.paymentsCreatedCount++;
    } else if (creationResult.outcome === "no_balance") {
      result.ignoredNoBalanceCount++;
    } else if (creationResult.outcome === "active_request") {
      result.ignoredActiveRequestCount++;
    } else if (creationResult.outcome === "missing_price") {
      result.ignoredMissingPriceCount++;
    } else if (creationResult.outcome === "ineligible") {
      result.ignoredIneligibleCount++;
    } else {
      result.errorCount++;
    }
  }

  return result;
}

function departureBalanceCampaignParams(
  result: DepartureBalanceCampaignResult,
) {
  return new URLSearchParams({
    departure_balance_campaign_status: "success",
    departure_balance_campaign_count: String(result.reservationsCheckedCount),
    departure_balance_campaign_payment_count: String(
      result.paymentsCreatedCount,
    ),
    departure_balance_campaign_no_balance_count: String(
      result.ignoredNoBalanceCount,
    ),
    departure_balance_campaign_active_request_count: String(
      result.ignoredActiveRequestCount,
    ),
    departure_balance_campaign_missing_price_count: String(
      result.ignoredMissingPriceCount,
    ),
    departure_balance_campaign_ineligible_count: String(
      result.ignoredIneligibleCount,
    ),
    departure_balance_campaign_error_count: String(result.errorCount),
  });
}

function deterministicChoiceAppointmentsTraceId(reservationId: string) {
  const hash = createHash("sha1")
    .update(`${CHOICE_APPOINTMENT_ADOPTION_BOOKLET_TEMPLATE_KEY}:${reservationId}`)
    .digest("hex");
  const chars = hash.slice(0, 32).split("");

  chars[12] = "5";
  chars[16] = ((parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}

function formatTraceAppointmentDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function isDocumentSigned(document: {
  status: string | null;
}) {
  return document.status === "signed";
}

function traceDescriptionIncludesCurrentAppointments({
  description,
  choiceAppointmentAt,
  adoptionAppointmentAt,
}: {
  description: string | null;
  choiceAppointmentAt: string;
  adoptionAppointmentAt: string;
}) {
  return (
    Boolean(description) &&
    description?.includes(`Créneau de choix ISO : ${choiceAppointmentAt}`) &&
    description?.includes(`Créneau de départ ISO : ${adoptionAppointmentAt}`)
  );
}

async function createChoiceAppointmentsTraceForReservation({
  supabase,
  userId,
  reservation,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  reservation: ChoiceAppointmentsCampaignReservation;
}): Promise<ChoiceAppointmentsTraceResult> {
  if (!reservation.contact_id || !reservation.litter_id) {
    return { outcome: "not_found" };
  }

  if (isFinalReservationStatus(reservation.status)) {
    return { outcome: "final_status" };
  }

  if (
    !reservation.status ||
    !CHOICE_APPOINTMENTS_CAMPAIGN_ELIGIBLE_STATUSES.has(reservation.status)
  ) {
    return { outcome: "not_in_journey" };
  }

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("document_type, status")
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservation.id)
    .in("document_type", ["commitment_certificate", "reservation_contract"])
    .is("deleted_at", null)
    .is("superseded_at", null);

  if (documentsError || !documents) {
    return { outcome: "error" };
  }

  const commitmentDocument = documents.find(
    (document) => document.document_type === "commitment_certificate",
  );
  const reservationContract = documents.find(
    (document) => document.document_type === "reservation_contract",
  );

  if (
    !commitmentDocument ||
    !reservationContract ||
    !isDocumentSigned(commitmentDocument) ||
    !isDocumentSigned(reservationContract)
  ) {
    return { outcome: "missing_documents" };
  }

  const depositSettings = await readDepositSettingsForOrganization({
    supabase,
    organizationId: reservation.organization_id,
  });
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount_cents, payment_type, status")
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservation.id)
    .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
    .eq("status", "paid")
    .is("deleted_at", null);

  if (paymentsError || !payments) {
    return { outcome: "error" };
  }

  const paidDepositCents = payments.reduce(
    (total, payment) => total + payment.amount_cents,
    0,
  );

  if (paidDepositCents < depositSettings.completeDepositCents) {
    return { outcome: "deposit_incomplete" };
  }

  const { data: appointments, error: appointmentsError } = await supabase
    .from("events")
    .select("event_type, planned_at")
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservation.id)
    .in("event_type", ["puppy_choice", "adoption"])
    .is("deleted_at", null);

  if (appointmentsError || !appointments) {
    return { outcome: "error" };
  }

  const choiceAppointment = appointments.find(
    (event) => event.event_type === "puppy_choice" && event.planned_at,
  );
  const adoptionAppointment = appointments.find(
    (event) => event.event_type === "adoption" && event.planned_at,
  );

  if (!choiceAppointment?.planned_at) {
    return { outcome: "missing_choice_appointment" };
  }

  if (!adoptionAppointment?.planned_at) {
    return { outcome: "missing_adoption_appointment" };
  }

  const traceId = deterministicChoiceAppointmentsTraceId(reservation.id);
  const { data: existingTrace, error: existingTraceError } = await supabase
    .from("events")
    .select("id, description, deleted_at")
    .eq("organization_id", reservation.organization_id)
    .eq("id", traceId)
    .eq("reservation_id", reservation.id)
    .maybeSingle();

  if (existingTraceError) {
    return { outcome: "error" };
  }

  if (
    existingTrace &&
    !existingTrace.deleted_at &&
    traceDescriptionIncludesCurrentAppointments({
      description: existingTrace.description,
      choiceAppointmentAt: choiceAppointment.planned_at,
      adoptionAppointmentAt: adoptionAppointment.planned_at,
    })
  ) {
    return { outcome: "already_confirmed" };
  }

  const now = new Date().toISOString();
  const description = [
    `Modèle utilisé : ${CHOICE_APPOINTMENT_ADOPTION_BOOKLET_TEMPLATE_KEY}`,
    `Créneau de choix ISO : ${choiceAppointment.planned_at}`,
    `Créneau de choix proposé : ${formatTraceAppointmentDate(choiceAppointment.planned_at)}`,
    `Créneau de départ ISO : ${adoptionAppointment.planned_at}`,
    `Créneau de départ proposé : ${formatTraceAppointmentDate(adoptionAppointment.planned_at)}`,
    "Aucun e-mail réel envoyé par l’application.",
  ].join("\n");

  const traceValues = {
    id: traceId,
    organization_id: reservation.organization_id,
    reservation_id: reservation.id,
    contact_id: reservation.contact_id,
    litter_id: reservation.litter_id,
    event_type: "other",
    title: CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE,
    description,
    actual_at: now,
    status: "done",
    priority: "normal",
    is_task: false,
    created_by: userId,
    updated_by: userId,
    deleted_at: null,
  };

  if (existingTrace) {
    const { error: updateDeletedTraceError } = await supabase
      .from("events")
      .update({
        contact_id: traceValues.contact_id,
        litter_id: traceValues.litter_id,
        event_type: traceValues.event_type,
        title: traceValues.title,
        description: traceValues.description,
        planned_at: null,
        planned_date: null,
        actual_at: traceValues.actual_at,
        status: traceValues.status,
        priority: traceValues.priority,
        is_task: traceValues.is_task,
        updated_at: now,
        updated_by: userId,
        deleted_at: null,
      })
      .eq("organization_id", reservation.organization_id)
      .eq("id", traceId);

    if (updateDeletedTraceError) {
      return { outcome: "error" };
    }

    return { outcome: "created" };
  }

  const { error: insertError } = await supabase.from("events").insert(traceValues);

  if (insertError) {
    if (insertError.code === "23505") {
      return { outcome: "already_confirmed" };
    }

    return { outcome: "error" };
  }

  return { outcome: "created" };
}

function choiceAppointmentsCampaignParams(
  result: ChoiceAppointmentsCampaignResult,
) {
  return new URLSearchParams({
    choice_appointments_campaign_status: "success",
    choice_appointments_campaign_selected_count: String(result.selectedCount),
    choice_appointments_campaign_confirmed_count: String(
      result.confirmedCount,
    ),
    choice_appointments_campaign_already_count: String(
      result.alreadyConfirmedCount,
    ),
    choice_appointments_campaign_not_found_count: String(
      result.ignoredNotFoundCount,
    ),
    choice_appointments_campaign_not_in_journey_count: String(
      result.ignoredNotInJourneyCount,
    ),
    choice_appointments_campaign_final_status_count: String(
      result.ignoredFinalStatusCount,
    ),
    choice_appointments_campaign_missing_documents_count: String(
      result.ignoredMissingDocumentsCount,
    ),
    choice_appointments_campaign_deposit_incomplete_count: String(
      result.ignoredDepositIncompleteCount,
    ),
    choice_appointments_campaign_missing_choice_count: String(
      result.ignoredMissingChoiceAppointmentCount,
    ),
    choice_appointments_campaign_missing_adoption_count: String(
      result.ignoredMissingAdoptionAppointmentCount,
    ),
    choice_appointments_campaign_error_count: String(result.errorCount),
  });
}

/**
 * Lance une campagne de pré-réservation pour les candidatures qualifiées
 * sélectionnées par l'éleveur depuis la fiche portée.
 *
 * Pour chaque candidature sélectionnée :
 *   1. Crée une réservation en statut `pre_reservation_requested` (ou réutilise
 *      une réservation compatible déjà demandée).
 *   2. Crée une demande de paiement de pré-réservation (type `arrhes`,
 *      statut `requested`, échéance paramétrée).
 *
 * Décisions Phase 1 :
 *   - Pas de changement automatique du statut de candidature.
 *   - E-mail Brevo transactionnel envoyé après création de la demande.
 *   - Demande nouvellement créée compensée si l'e-mail n'est pas envoyé.
 *   - Pas de paiement automatique.
 *   - Libellé : "avance sur arrhes" (ne jamais écrire "acompte").
 */
export async function launchPreReservationCampaign(formData: FormData) {
  const litterId = formData.get("litter_id");
  const campaignConfirmation = formData.get("campaign_confirmation");

  if (typeof litterId !== "string" || !isUuid(litterId)) {
    redirect("/litters?campaign_status=error");
  }

  if (campaignConfirmation !== "confirmed") {
    redirect(`/litters/${litterId}?campaign_status=confirmation_required`);
  }

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire la portée pour récupérer organization_id + species/breed/groupe.
  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id, species, breed, litter_group_id")
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
    .select("id, contact_id, species, breed, desired_sex_preference, status")
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

  const campaignResult = await runPreReservationCampaignForApplications({
    supabase,
    sendEmail: sendPreReservationEmailForApplication,
    applications: applications.map((app) => ({
      id: app.id,
      species: app.species ?? litter.species ?? "dog",
      breed: app.breed ?? litter.breed ?? "Golden Retriever",
      desired_sex_preference: app.desired_sex_preference,
      target_litter_id: litterId,
      target_litter_group_id: litter.litter_group_id,
    })),
  });

  revalidatePath(`/litters/${litterId}`);
  revalidatePath("/");
  revalidatePath("/litters");
  revalidatePreReservationCampaignProgress(applications);

  if (
    campaignResult.reservationsPreparedCount === 0 &&
    (campaignResult.errorCount > 0 ||
      campaignResult.compensatedNotSentCreationCount > 0)
  ) {
    redirect(`/litters/${litterId}?campaign_status=error`);
  }

  const params = preReservationCampaignParams({
    statusParam: "campaign_status",
    countParam: "campaign_count",
    paymentCountParam: "campaign_payment_count",
    draftConflictCountParam: "campaign_draft_conflict_count",
    result: campaignResult,
  });
  redirect(`/litters/${litterId}?${params.toString()}`);
}

export async function confirmChoiceAppointmentsAdoptionBookletCampaign(
  formData: FormData,
) {
  const litterId = formData.get("litter_id");

  if (typeof litterId !== "string" || !isUuid(litterId)) {
    redirect("/litters?choice_appointments_campaign_status=error");
  }

  const reservationIds = Array.from(
    new Set(
      formData
        .getAll("reservation_ids[]")
        .filter((value): value is string => typeof value === "string" && isUuid(value)),
    ),
  );

  if (reservationIds.length === 0) {
    redirect(
      `/litters/${litterId}?choice_appointments_campaign_status=no_selection`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter) {
    redirect(`/litters/${litterId}?choice_appointments_campaign_status=error`);
  }

  const { data: reservations, error: reservationsError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, litter_id, status")
    .eq("organization_id", litter.organization_id)
    .eq("litter_id", litterId)
    .is("deleted_at", null)
    .in("id", reservationIds);

  if (reservationsError || !reservations) {
    redirect(`/litters/${litterId}?choice_appointments_campaign_status=error`);
  }

  const reservationsById = new Map(
    reservations.map((reservation) => [reservation.id, reservation]),
  );
  const result: ChoiceAppointmentsCampaignResult = {
    selectedCount: reservationIds.length,
    confirmedCount: 0,
    alreadyConfirmedCount: 0,
    ignoredNotFoundCount: 0,
    ignoredNotInJourneyCount: 0,
    ignoredFinalStatusCount: 0,
    ignoredMissingDocumentsCount: 0,
    ignoredDepositIncompleteCount: 0,
    ignoredMissingChoiceAppointmentCount: 0,
    ignoredMissingAdoptionAppointmentCount: 0,
    errorCount: 0,
  };

  for (const reservationId of reservationIds) {
    const reservation = reservationsById.get(reservationId);

    if (!reservation) {
      result.ignoredNotFoundCount++;
      continue;
    }

    const traceResult = await createChoiceAppointmentsTraceForReservation({
      supabase,
      userId: user.id,
      reservation,
    });

    if (traceResult.outcome === "created") {
      result.confirmedCount++;
    } else if (traceResult.outcome === "already_confirmed") {
      result.alreadyConfirmedCount++;
    } else if (traceResult.outcome === "not_found") {
      result.ignoredNotFoundCount++;
    } else if (traceResult.outcome === "not_in_journey") {
      result.ignoredNotInJourneyCount++;
    } else if (traceResult.outcome === "final_status") {
      result.ignoredFinalStatusCount++;
    } else if (traceResult.outcome === "missing_documents") {
      result.ignoredMissingDocumentsCount++;
    } else if (traceResult.outcome === "deposit_incomplete") {
      result.ignoredDepositIncompleteCount++;
    } else if (traceResult.outcome === "missing_choice_appointment") {
      result.ignoredMissingChoiceAppointmentCount++;
    } else if (traceResult.outcome === "missing_adoption_appointment") {
      result.ignoredMissingAdoptionAppointmentCount++;
    } else {
      result.errorCount++;
    }
  }

  revalidatePath(`/litters/${litterId}`);
  revalidatePath("/litters");
  revalidatePath("/reservations");

  const params = choiceAppointmentsCampaignParams(result);
  redirect(`/litters/${litterId}?${params.toString()}`);
}

export async function launchGroupPreReservationCampaign(formData: FormData) {
  const groupId = formData.get("litter_group_id");
  const campaignConfirmation = formData.get("campaign_confirmation");

  if (typeof groupId !== "string" || !isUuid(groupId)) {
    redirect("/litter-groups?group_campaign_status=error");
  }

  if (campaignConfirmation !== "confirmed") {
    redirect(
      `/litter-groups/${groupId}?group_campaign_status=confirmation_required`,
    );
  }

  const rawApplicationIds = formData.getAll("application_ids[]");
  const applicationIds = Array.from(
    new Set(
      rawApplicationIds.filter(
        (v): v is string => typeof v === "string" && isUuid(v),
      ),
    ),
  );

  if (applicationIds.length === 0) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=no_selection`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("litter_groups")
    .select("id, organization_id, species")
    .eq("id", groupId)
    .is("deleted_at", null)
    .maybeSingle();

  if (groupError || !group) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=error`);
  }

  const { data: groupLitters, error: littersError } = await supabase
    .from("litters")
    .select("id")
    .eq("organization_id", group.organization_id)
    .eq("litter_group_id", groupId)
    .is("deleted_at", null);

  if (littersError) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=error`);
  }

  const groupLitterIds = new Set((groupLitters ?? []).map((litter) => litter.id));

  const { data: applications, error: appsError } = await supabase
    .from("applications")
    .select(
      "id, contact_id, species, breed, desired_sex_preference, desired_litter_id, desired_litter_group_id, status",
    )
    .eq("organization_id", group.organization_id)
    .eq("status", "qualified")
    .is("deleted_at", null)
    .in("id", applicationIds);

  if (appsError) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=error`);
  }

  const eligibleApplications = (applications ?? []).filter((app) => {
    if (app.desired_litter_group_id === groupId) {
      return true;
    }

    return Boolean(
      app.desired_litter_id && groupLitterIds.has(app.desired_litter_id),
    );
  });

  if (eligibleApplications.length === 0) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=no_eligible`);
  }

  const campaignResult = await runPreReservationCampaignForApplications({
    supabase,
    sendEmail: sendPreReservationEmailForApplication,
    applications: eligibleApplications.map((app) => {
      const targetLitterId =
        app.desired_litter_id && groupLitterIds.has(app.desired_litter_id)
          ? app.desired_litter_id
          : null;

      return {
        id: app.id,
        species: app.species ?? group.species ?? "dog",
        breed: app.breed ?? "Golden Retriever",
        desired_sex_preference: app.desired_sex_preference,
        target_litter_id: targetLitterId,
        target_litter_group_id: groupId,
      };
    }),
  });

  revalidatePath(`/litter-groups/${groupId}`);
  revalidatePath("/");
  revalidatePath("/litter-groups");
  revalidatePreReservationCampaignProgress(eligibleApplications);

  if (
    campaignResult.reservationsPreparedCount === 0 &&
    campaignResult.paymentsCreatedCount === 0 &&
    (campaignResult.errorCount > 0 ||
      campaignResult.compensatedNotSentCreationCount > 0)
  ) {
    redirect(`/litter-groups/${groupId}?group_campaign_status=error`);
  }

  const params = preReservationCampaignParams({
    statusParam: "group_campaign_status",
    countParam: "group_campaign_count",
    paymentCountParam: "group_campaign_payment_count",
    draftConflictCountParam: "group_campaign_draft_conflict_count",
    result: campaignResult,
  });
  redirect(`/litter-groups/${groupId}?${params.toString()}`);
}

export async function launchLitterPreReservationBalanceCampaign(
  formData: FormData,
) {
  const litterId = formData.get("litter_id");

  if (typeof litterId !== "string" || !isUuid(litterId)) {
    redirect("/litters?balance_campaign_status=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter) {
    redirect(`/litters/${litterId}?balance_campaign_status=error`);
  }

  const { data: reservations, error: reservationsError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status")
    .eq("organization_id", litter.organization_id)
    .eq("litter_id", litterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (reservationsError || !reservations) {
    redirect(`/litters/${litterId}?balance_campaign_status=error`);
  }

  if (reservations.length === 0) {
    redirect(`/litters/${litterId}?balance_campaign_status=no_eligible`);
  }

  const campaignResult = await runPreReservationBalanceCampaignForReservations({
    supabase,
    userId: user.id,
    reservations,
  });

  revalidatePath(`/litters/${litterId}`);
  revalidatePath("/litters");
  revalidatePath("/reservations");
  revalidatePath("/payments");

  if (
    campaignResult.paymentsCreatedCount === 0 &&
    campaignResult.errorCount > 0 &&
    campaignResult.errorCount === campaignResult.reservationsCheckedCount
  ) {
    redirect(`/litters/${litterId}?balance_campaign_status=error`);
  }

  const params = preReservationBalanceCampaignParams(campaignResult);
  redirect(`/litters/${litterId}?${params.toString()}`);
}

export async function launchGroupPreReservationBalanceCampaign(
  formData: FormData,
) {
  const groupId = formData.get("litter_group_id");

  if (typeof groupId !== "string" || !isUuid(groupId)) {
    redirect("/litter-groups?balance_campaign_status=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("litter_groups")
    .select("id, organization_id")
    .eq("id", groupId)
    .is("deleted_at", null)
    .maybeSingle();

  if (groupError || !group) {
    redirect(`/litter-groups/${groupId}?balance_campaign_status=error`);
  }

  const { data: groupLitters, error: littersError } = await supabase
    .from("litters")
    .select("id")
    .eq("organization_id", group.organization_id)
    .eq("litter_group_id", groupId)
    .is("deleted_at", null);

  if (littersError) {
    redirect(`/litter-groups/${groupId}?balance_campaign_status=error`);
  }

  const groupLitterIds = (groupLitters ?? []).map((litter) => litter.id);
  const reservationsQuery = supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status")
    .eq("organization_id", group.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const { data: reservations, error: reservationsError } =
    groupLitterIds.length > 0
      ? await reservationsQuery.or(
          `litter_group_id.eq.${groupId},litter_id.in.(${groupLitterIds.join(",")})`,
        )
      : await reservationsQuery.eq("litter_group_id", groupId);

  if (reservationsError || !reservations) {
    redirect(`/litter-groups/${groupId}?balance_campaign_status=error`);
  }

  if (reservations.length === 0) {
    redirect(`/litter-groups/${groupId}?balance_campaign_status=no_eligible`);
  }

  const campaignResult = await runPreReservationBalanceCampaignForReservations({
    supabase,
    userId: user.id,
    reservations,
  });

  revalidatePath(`/litter-groups/${groupId}`);
  revalidatePath("/litter-groups");
  revalidatePath("/reservations");
  revalidatePath("/payments");

  if (
    campaignResult.paymentsCreatedCount === 0 &&
    campaignResult.errorCount > 0 &&
    campaignResult.errorCount === campaignResult.reservationsCheckedCount
  ) {
    redirect(`/litter-groups/${groupId}?balance_campaign_status=error`);
  }

  const params = preReservationBalanceCampaignParams(campaignResult);
  redirect(`/litter-groups/${groupId}?${params.toString()}`);
}

export async function launchLitterDepartureBalanceCampaign(
  formData: FormData,
) {
  const litterId = formData.get("litter_id");

  if (typeof litterId !== "string" || !isUuid(litterId)) {
    redirect("/litters?departure_balance_campaign_status=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError || !litter) {
    redirect(`/litters/${litterId}?departure_balance_campaign_status=error`);
  }

  const { data: reservations, error: reservationsError } = await supabase
    .from("reservation_overview")
    .select(
      "id, organization_id, contact_id, status, price_cents, paid_cents, refunded_cents, currency",
    )
    .eq("organization_id", litter.organization_id)
    .eq("litter_id", litterId)
    .order("created_at", { ascending: true });

  if (reservationsError || !reservations) {
    redirect(`/litters/${litterId}?departure_balance_campaign_status=error`);
  }

  const validReservations = reservations.flatMap((reservation) => {
    if (!reservation.id || !reservation.organization_id) {
      return [];
    }

    return [{
      id: reservation.id,
      organization_id: reservation.organization_id,
      contact_id: reservation.contact_id,
      status: reservation.status,
      price_cents: reservation.price_cents,
      paid_cents: reservation.paid_cents,
      refunded_cents: reservation.refunded_cents,
      currency: reservation.currency,
    }];
  });

  if (validReservations.length === 0) {
    redirect(`/litters/${litterId}?departure_balance_campaign_status=no_eligible`);
  }

  const campaignResult = await runDepartureBalanceCampaignForReservations({
    supabase,
    userId: user.id,
    reservations: validReservations,
  });

  revalidatePath(`/litters/${litterId}`);
  revalidatePath("/litters");
  revalidatePath("/reservations");
  revalidatePath("/payments");

  if (
    campaignResult.paymentsCreatedCount === 0 &&
    campaignResult.errorCount > 0 &&
    campaignResult.errorCount === campaignResult.reservationsCheckedCount
  ) {
    redirect(`/litters/${litterId}?departure_balance_campaign_status=error`);
  }

  const params = departureBalanceCampaignParams(campaignResult);
  redirect(`/litters/${litterId}?${params.toString()}`);
}

export async function launchGroupDepartureBalanceCampaign(
  formData: FormData,
) {
  const groupId = formData.get("litter_group_id");

  if (typeof groupId !== "string" || !isUuid(groupId)) {
    redirect("/litter-groups?departure_balance_campaign_status=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("litter_groups")
    .select("id, organization_id")
    .eq("id", groupId)
    .is("deleted_at", null)
    .maybeSingle();

  if (groupError || !group) {
    redirect(
      `/litter-groups/${groupId}?departure_balance_campaign_status=error`,
    );
  }

  const { data: groupLitters, error: littersError } = await supabase
    .from("litters")
    .select("id")
    .eq("organization_id", group.organization_id)
    .eq("litter_group_id", groupId)
    .is("deleted_at", null);

  if (littersError) {
    redirect(
      `/litter-groups/${groupId}?departure_balance_campaign_status=error`,
    );
  }

  const groupLitterIds = (groupLitters ?? []).map((litter) => litter.id);
  const reservationsQuery = supabase
    .from("reservation_overview")
    .select(
      "id, organization_id, contact_id, status, price_cents, paid_cents, refunded_cents, currency",
    )
    .eq("organization_id", group.organization_id)
    .order("created_at", { ascending: true });

  const { data: reservations, error: reservationsError } =
    groupLitterIds.length > 0
      ? await reservationsQuery.or(
          `litter_group_id.eq.${groupId},litter_id.in.(${groupLitterIds.join(",")})`,
        )
      : await reservationsQuery.eq("litter_group_id", groupId);

  if (reservationsError || !reservations) {
    redirect(
      `/litter-groups/${groupId}?departure_balance_campaign_status=error`,
    );
  }

  const validReservations = reservations.flatMap((reservation) => {
    if (!reservation.id || !reservation.organization_id) {
      return [];
    }

    return [{
      id: reservation.id,
      organization_id: reservation.organization_id,
      contact_id: reservation.contact_id,
      status: reservation.status,
      price_cents: reservation.price_cents,
      paid_cents: reservation.paid_cents,
      refunded_cents: reservation.refunded_cents,
      currency: reservation.currency,
    }];
  });

  if (validReservations.length === 0) {
    redirect(
      `/litter-groups/${groupId}?departure_balance_campaign_status=no_eligible`,
    );
  }

  const campaignResult = await runDepartureBalanceCampaignForReservations({
    supabase,
    userId: user.id,
    reservations: validReservations,
  });

  revalidatePath(`/litter-groups/${groupId}`);
  revalidatePath("/litter-groups");
  revalidatePath("/reservations");
  revalidatePath("/payments");

  if (
    campaignResult.paymentsCreatedCount === 0 &&
    campaignResult.errorCount > 0 &&
    campaignResult.errorCount === campaignResult.reservationsCheckedCount
  ) {
    redirect(
      `/litter-groups/${groupId}?departure_balance_campaign_status=error`,
    );
  }

  const params = departureBalanceCampaignParams(campaignResult);
  redirect(`/litter-groups/${groupId}?${params.toString()}`);
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

  const creationResult = await createPreReservationBalanceRequestForReservation({
    supabase,
    userId: user.id,
    reservation,
  });

  if (creationResult.outcome !== "created") {
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
// ou modification explicite depuis la fiche Réservation
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

function reservationScopeAttachUrl(
  reservationId: string,
  outcome: "success" | "error" | "animal_attributed",
) {
  return `/reservations/${reservationId}?litter_attach_status=${outcome}#scope-and-animal`;
}

/**
 * Rattache une réservation existante à une portée OU à un groupe de portées,
 * depuis la fiche Portée, la fiche Groupe, ou la fiche Réservation.
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
  const returnToReservationIdRaw = formData.get("return_to_reservation_id");

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
  const returnToReservationId =
    typeof returnToReservationIdRaw === "string" &&
    returnToReservationIdRaw.trim() &&
    isUuid(returnToReservationIdRaw.trim())
      ? returnToReservationIdRaw.trim()
      : null;

  // URL de retour selon le contexte d'origine.
  const backUrl = (outcome: "success" | "error" | "animal_attributed") => {
    if (returnToReservationId) {
      return reservationScopeAttachUrl(returnToReservationId, outcome);
    }
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

  if (returnToReservationId && returnToReservationId !== reservationId) {
    redirect(backUrl("error"));
  }

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
