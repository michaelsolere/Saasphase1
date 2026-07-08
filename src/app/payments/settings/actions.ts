"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const paymentSettingsPath = "/payments/settings";

type PaymentSettingsStatus = "success" | "invalid" | "error";

function statusUrl(status: PaymentSettingsStatus) {
  return `${paymentSettingsPath}?settings_status=${status}`;
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

function parseEuroAmountCents(
  value: FormDataEntryValue | null,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().replace(",", ".");
  if (!normalizedValue) {
    return allowEmpty ? null : undefined;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
    return undefined;
  }

  const amount = Number(normalizedValue);
  if (!Number.isFinite(amount) || amount < 0) {
    return undefined;
  }

  return Math.round(amount * 100);
}

function parseNonNegativeInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return undefined;
  }

  const integerValue = Number(normalizedValue);
  return Number.isSafeInteger(integerValue) && integerValue >= 0
    ? integerValue
    : undefined;
}

export async function updatePaymentSettings(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) {
    redirect(statusUrl("error"));
  }

  const defaultPreReservationDepositCents = parseEuroAmountCents(
    formData.get("default_pre_reservation_deposit_euros"),
  );
  const defaultArrhesSecondPaymentCents = parseEuroAmountCents(
    formData.get("default_arrhes_second_payment_euros"),
  );
  const defaultPuppyPriceCents = parseEuroAmountCents(
    formData.get("default_puppy_price_euros"),
    { allowEmpty: true },
  );
  const preReservationResponseDelayDays = parseNonNegativeInteger(
    formData.get("pre_reservation_response_delay_days"),
  );

  if (
    defaultPreReservationDepositCents === undefined ||
    defaultPreReservationDepositCents === null ||
    defaultArrhesSecondPaymentCents === undefined ||
    defaultArrhesSecondPaymentCents === null ||
    defaultPuppyPriceCents === undefined ||
    preReservationResponseDelayDays === undefined
  ) {
    redirect(statusUrl("invalid"));
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
    .select("organization_id, role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    redirect(statusUrl("error"));
  }

  const { error } = await supabase
    .from("organization_settings")
    .update({
      default_pre_reservation_deposit_cents: defaultPreReservationDepositCents,
      default_arrhes_second_payment_cents: defaultArrhesSecondPaymentCents,
      default_puppy_price_cents: defaultPuppyPriceCents,
      pre_reservation_response_delay_days: preReservationResponseDelayDays,
    })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) {
    redirect(statusUrl("error"));
  }

  revalidatePath(paymentSettingsPath);
  redirect(statusUrl("success"));
}
