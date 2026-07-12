"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function paymentRedirectUrl(
  reservationId: string,
  outcome: "success" | "error" | "technical_pre_reservation",
) {
  return `/reservations/${reservationId}?payment_create_status=${outcome}#payments`;
}

function reservationPaymentMarkUrl(
  reservationId: string,
  outcome: "success" | "error" | "invalid_state",
) {
  return `/reservations/${reservationId}?payment_mark_status=${outcome}#payments`;
}

const PRE_RESERVATION_PAYMENT_TYPES = [
  "arrhes",
  "pre_reservation_deposit_refundable",
] as const;

const PRE_RESERVATION_MARKABLE_STATUSES = [
  "requested",
  "pending",
  "partially_paid",
] as const;

function isUuid(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function isPreReservationPaymentType(paymentType: string | null) {
  return PRE_RESERVATION_PAYMENT_TYPES.includes(
    paymentType as (typeof PRE_RESERVATION_PAYMENT_TYPES)[number],
  );
}

function canMarkPreReservationPaymentStatus(status: string | null) {
  return PRE_RESERVATION_MARKABLE_STATUSES.includes(
    status as (typeof PRE_RESERVATION_MARKABLE_STATUSES)[number],
  );
}

async function markPreReservationPaymentPaidViaRpc({
  supabase,
  paymentId,
  paidAt,
  paymentMethod,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  paymentId: string;
  paidAt?: string;
  paymentMethod?: string;
}) {
  const { data, error } = await supabase.rpc(
    "mark_pre_reservation_payment_paid",
    {
      p_payment_id: paymentId,
      ...(paidAt ? { p_paid_at: paidAt } : {}),
      ...(paymentMethod ? { p_payment_method: paymentMethod } : {}),
    },
  );

  if (error) {
    console.error("mark_pre_reservation_payment_paid RPC failed:", error);
    return { ok: false as const, outcome: "error", reservationId: null };
  }

  const result = data?.[0] ?? null;
  const outcome = result?.outcome ?? "error";

  return {
    ok: outcome === "paid" || outcome === "already_paid",
    outcome,
    reservationId: result?.reservation_id ?? null,
  };
}

async function isPreReservationTransitionPayment({
  supabase,
  payment,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  payment: {
    payment_type: string | null;
    reservation_id: string | null;
    status: string | null;
  };
}) {
  if (
    !payment.reservation_id ||
    !isPreReservationPaymentType(payment.payment_type) ||
    !canMarkPreReservationPaymentStatus(payment.status)
  ) {
    return false;
  }

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", payment.reservation_id)
    .is("deleted_at", null)
    .maybeSingle();

  return reservation?.status === "pre_reservation_requested";
}

async function revalidatePaymentTransitionPaths({
  supabase,
  paymentId,
  reservationId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  paymentId: string;
  reservationId: string | null;
}) {
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/candidatures");
  revalidatePath("/reservations");

  if (reservationId) {
    revalidatePath(`/reservations/${reservationId}`);

    const { data: reservation } = await supabase
      .from("reservations")
      .select("application_id, contact_id, litter_id, litter_group_id")
      .eq("id", reservationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (reservation?.application_id) {
      revalidatePath(`/candidatures/${reservation.application_id}`);
    }

    if (reservation?.contact_id) {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${reservation.contact_id}`);
    }

    if (reservation?.litter_id) {
      revalidatePath(`/litters/${reservation.litter_id}`);
    }

    if (reservation?.litter_group_id) {
      revalidatePath(`/litter-groups/${reservation.litter_group_id}`);
    }
  }
}

export async function markPreReservationPaymentAsPaidFromApplication(
  formData: FormData,
) {
  const paymentId = formData.get("payment_id");
  const applicationId = formData.get("application_id");

  if (
    typeof paymentId !== "string" ||
    !isUuid(paymentId) ||
    typeof applicationId !== "string" ||
    !isUuid(applicationId)
  ) {
    redirect("/candidatures?payment_mark_status=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await markPreReservationPaymentPaidViaRpc({
    supabase,
    paymentId,
  });

  await revalidatePaymentTransitionPaths({
    supabase,
    paymentId,
    reservationId: result?.reservationId ?? null,
  });

  if (!result?.ok || !result.reservationId) {
    redirect(`/candidatures/${applicationId}?payment_mark_status=error`);
  }

  redirect(`/reservations/${result.reservationId}?payment_mark_status=success`);
}

export async function createReservationPayment(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=paiement_contexte");
  }

  // 1. Validation de l'utilisateur authentifié
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Relecture serveur de la réservation
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  if (reservation.status === "pre_reservation_requested") {
    redirect(paymentRedirectUrl(reservationId, "technical_pre_reservation"));
  }

  // 3. Récupération et validation du montant
  const rawAmount = formData.get("amount");
  if (typeof rawAmount !== "string" || !rawAmount) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  const normalizedAmount = rawAmount.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  const amountNum = Number(normalizedAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 1000000) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  const amountCents = Math.round(amountNum * 100);

  // 4. Validation du type de paiement
  const paymentType = formData.get("payment_type");
  if (
    typeof paymentType !== "string" ||
    (paymentType !== "arrhes" && paymentType !== "balance")
  ) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  // 5. Validation de la méthode de paiement
  const paymentMethod = formData.get("payment_method");
  const allowedMethods = ["bank_transfer", "cash", "card", "cheque", "other"];
  if (
    typeof paymentMethod !== "string" ||
    !allowedMethods.includes(paymentMethod)
  ) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  // 6. Validation du statut
  const status = formData.get("status");
  if (typeof status !== "string" || (status !== "paid" && status !== "requested")) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  // 7. Validation de la date
  const paymentDate = formData.get("payment_date");
  if (typeof paymentDate !== "string" || !paymentDate) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate.trim());
  if (!dateMatch) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const dateVal = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    dateVal.getUTCFullYear() !== year ||
    dateVal.getUTCMonth() !== month - 1 ||
    dateVal.getUTCDate() !== day
  ) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  // Configuration des dates selon le statut
  let paidAt: string | null = null;
  let requestedAt: string | null = null;
  let dueDate: string | null = null;

  if (status === "paid") {
    paidAt = dateVal.toISOString();
  } else {
    requestedAt = new Date().toISOString();
    dueDate = paymentDate; // Format YYYY-MM-DD
  }

  // 8. Validation des notes
  const rawNotes = formData.get("notes");
  let notes: string | null = null;
  if (typeof rawNotes === "string") {
    const trimmedNotes = rawNotes.trim();
    if (trimmedNotes.length > 2000) {
      redirect(paymentRedirectUrl(reservationId, "error"));
    }
    notes = trimmedNotes || null;
  }

  const shouldTransitionPreReservation =
    status === "paid" &&
    reservation.status === "pre_reservation_requested" &&
    isPreReservationPaymentType(paymentType);

  // 9. Insertion du paiement. Pour une pré-réservation réglée dès la saisie,
  // on insère d'abord une demande puis la RPC effectue la transition atomique.
  const { data: insertedPayment, error: insertError } = await supabase
    .from("payments")
    .insert({
      organization_id: reservation.organization_id,
      contact_id: reservation.contact_id,
      reservation_id: reservation.id,
      amount_cents: amountCents,
      currency: "EUR",
      payment_type: paymentType,
      status: shouldTransitionPreReservation ? "requested" : status,
      payment_method: paymentMethod,
      paid_at: shouldTransitionPreReservation ? null : paidAt,
      requested_at: shouldTransitionPreReservation ? new Date().toISOString() : requestedAt,
      due_date: shouldTransitionPreReservation ? null : dueDate,
      notes: notes,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !insertedPayment) {
    redirect(paymentRedirectUrl(reservationId, "error"));
  }

  if (shouldTransitionPreReservation) {
    const transitionResult = await markPreReservationPaymentPaidViaRpc({
      supabase,
      paymentId: insertedPayment.id,
      paidAt: paidAt ?? undefined,
      paymentMethod,
    });

    if (!transitionResult?.ok) {
      redirect(paymentRedirectUrl(reservationId, "error"));
    }
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/payments");

  redirect(paymentRedirectUrl(reservationId, "success"));
}

export async function markPaymentAsPaid(formData: FormData) {
  const paymentId = formData.get("payment_id");

  if (typeof paymentId !== "string" || !paymentId) {
    redirect("/payments?erreur=contexte");
  }

  // 1. Validation de l'utilisateur authentifié
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Relecture serveur du paiement
  const { data: payment, error: readError } = await supabase
    .from("payments")
    .select("id, organization_id, reservation_id, status, deleted_at, amount_cents, payment_type")
    .eq("id", paymentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !payment) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  // 3. Vérifier le statut
  if (
    payment.status !== "requested" &&
    payment.status !== "pending" &&
    payment.status !== "partially_paid"
  ) {
    redirect(`/payments/${paymentId}?payment_mark_status=invalid_state`);
  }

  // 4. Validation de la date
  const paidDate = formData.get("paid_date");
  if (typeof paidDate !== "string" || !paidDate) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paidDate.trim());
  if (!dateMatch) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const dateVal = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    dateVal.getUTCFullYear() !== year ||
    dateVal.getUTCMonth() !== month - 1 ||
    dateVal.getUTCDate() !== day
  ) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  const paidAt = dateVal.toISOString();

  // 5. Validation de la méthode de paiement
  const paymentMethod = formData.get("payment_method");
  const allowedMethods = ["bank_transfer", "cash", "card", "cheque", "other"];
  if (
    typeof paymentMethod !== "string" ||
    !allowedMethods.includes(paymentMethod)
  ) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  // 6. Validation des notes
  const rawNotes = formData.get("notes");
  let notes: string | null = null;
  if (typeof rawNotes === "string") {
    const trimmedNotes = rawNotes.trim();
    if (trimmedNotes.length > 2000) {
      redirect(`/payments/${paymentId}?payment_mark_status=error`);
    }
    notes = trimmedNotes || null;
  }

  if (
    await isPreReservationTransitionPayment({
      supabase,
      payment,
    })
  ) {
    const transitionResult = await markPreReservationPaymentPaidViaRpc({
      supabase,
      paymentId,
      paidAt,
      paymentMethod,
    });

    await revalidatePaymentTransitionPaths({
      supabase,
      paymentId,
      reservationId: transitionResult?.reservationId ?? payment.reservation_id,
    });

    if (!transitionResult?.ok) {
      redirect(`/payments/${paymentId}?payment_mark_status=error`);
    }

    redirect(`/payments/${payment.id}?payment_mark_status=success`);
  }

  // 7. Mise à jour du paiement
  const { error: updateError } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_method: paymentMethod,
      notes: notes,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (updateError) {
    redirect(`/payments/${paymentId}?payment_mark_status=error`);
  }

  // 8. Revalidation des chemins
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");
  if (payment.reservation_id) {
    revalidatePath(`/reservations/${payment.reservation_id}`);
    revalidatePath("/reservations");
  }

  redirect(`/payments/${payment.id}?payment_mark_status=success`);
}

export async function markReservationPaymentAsPaid(formData: FormData) {
  const paymentId = formData.get("payment_id");
  const reservationId = formData.get("reservation_id");

  if (
    typeof paymentId !== "string" ||
    !isUuid(paymentId) ||
    typeof reservationId !== "string" ||
    !isUuid(reservationId)
  ) {
    redirect("/reservations?erreur=paiement_contexte");
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
    .select("id, organization_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect(reservationPaymentMarkUrl(reservationId, "error"));
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, organization_id, reservation_id, status, deleted_at, amount_cents, payment_type")
    .eq("id", paymentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (paymentError || !payment) {
    redirect(reservationPaymentMarkUrl(reservationId, "error"));
  }

  if (
    payment.reservation_id !== reservation.id ||
    payment.organization_id !== reservation.organization_id
  ) {
    redirect(reservationPaymentMarkUrl(reservationId, "error"));
  }

  if (
    payment.status !== "requested" &&
    payment.status !== "pending" &&
    payment.status !== "partially_paid"
  ) {
    redirect(reservationPaymentMarkUrl(reservationId, "invalid_state"));
  }

  if (
    await isPreReservationTransitionPayment({
      supabase,
      payment,
    })
  ) {
    const transitionResult = await markPreReservationPaymentPaidViaRpc({
      supabase,
      paymentId,
    });

    await revalidatePaymentTransitionPaths({
      supabase,
      paymentId,
      reservationId: transitionResult?.reservationId ?? reservationId,
    });

    if (!transitionResult?.ok) {
      redirect(reservationPaymentMarkUrl(reservationId, "error"));
    }

    redirect(reservationPaymentMarkUrl(transitionResult.reservationId ?? reservationId, "success"));
  }

  const { data: updatedPayment, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservation.id)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPayment) {
    redirect(reservationPaymentMarkUrl(reservationId, "error"));
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");

  redirect(reservationPaymentMarkUrl(reservationId, "success"));
}

export async function createReservationRefund(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !reservationId) {
    redirect("/reservations?erreur=remboursement_contexte");
  }

  // 1. Validation de l'utilisateur authentifié
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Relecture serveur de la réservation
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, deleted_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  // 3. Récupération et validation du montant
  const rawAmount = formData.get("amount");
  if (typeof rawAmount !== "string" || !rawAmount) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const normalizedAmount = rawAmount.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const amountNum = Number(normalizedAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 1000000) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const amountCents = Math.round(amountNum * 100);

  // 4. Validation de la méthode de remboursement
  const paymentMethod = formData.get("payment_method");
  const allowedMethods = ["bank_transfer", "cash", "card", "cheque", "other"];
  if (
    typeof paymentMethod !== "string" ||
    !allowedMethods.includes(paymentMethod)
  ) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  // 5. Validation de la date de remboursement
  const paymentDate = formData.get("payment_date");
  if (typeof paymentDate !== "string" || !paymentDate) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate.trim());
  if (!dateMatch) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const dateVal = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    dateVal.getUTCFullYear() !== year ||
    dateVal.getUTCMonth() !== month - 1 ||
    dateVal.getUTCDate() !== day
  ) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  const paidAt = dateVal.toISOString();

  // 6. Validation des notes
  const rawNotes = formData.get("notes");
  let notes: string | null = null;
  if (typeof rawNotes === "string") {
    const trimmedNotes = rawNotes.trim();
    if (trimmedNotes.length > 2000) {
      redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
    }
    notes = trimmedNotes || null;
  }

  // 7. Insertion du remboursement
  const { error: insertError } = await supabase
    .from("payments")
    .insert({
      organization_id: reservation.organization_id,
      contact_id: reservation.contact_id,
      reservation_id: reservation.id,
      amount_cents: amountCents,
      currency: "EUR",
      payment_type: "refund",
      status: "paid",
      payment_method: paymentMethod,
      paid_at: paidAt,
      requested_at: null,
      due_date: null,
      refunded_at: null,
      notes: notes,
      created_by: user.id,
      updated_by: user.id,
    });

  if (insertError) {
    redirect(`/reservations/${reservationId}?payment_refund_status=error#payments`);
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/payments");
  revalidatePath(`/contacts/${reservation.contact_id}`);

  redirect(`/reservations/${reservationId}?payment_refund_status=success#payments`);
}
