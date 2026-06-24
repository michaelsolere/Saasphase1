"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
