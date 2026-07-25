"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseNonNegativeInteger,
  parseOptionalEuroCents,
  parseRequiredPositiveEuroCents,
} from "@/features/payments/payment-settings-parse";
import { createClient } from "@/lib/supabase/server";

const paymentSettingsPath = "/payments/settings";

export type PaymentSettingsStatus =
  | "success"
  | "invalid_pre_reservation"
  | "invalid_complement"
  | "invalid_delay"
  | "invalid"
  | "error";

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

export async function updatePaymentSettings(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) {
    redirect(statusUrl("error"));
  }

  const defaultPreReservationDepositCents = parseRequiredPositiveEuroCents(
    formData.get("default_pre_reservation_deposit_euros"),
  );
  if (!defaultPreReservationDepositCents.ok) {
    redirect(statusUrl("invalid_pre_reservation"));
  }

  const defaultArrhesSecondPaymentCents = parseRequiredPositiveEuroCents(
    formData.get("default_arrhes_second_payment_euros"),
  );
  if (!defaultArrhesSecondPaymentCents.ok) {
    redirect(statusUrl("invalid_complement"));
  }

  const defaultMalePuppyPriceCents = parseOptionalEuroCents(
    formData.get("default_male_puppy_price_euros"),
  );
  const defaultFemalePuppyPriceCents = parseOptionalEuroCents(
    formData.get("default_female_puppy_price_euros"),
  );
  const defaultPuppyPriceCents = parseOptionalEuroCents(
    formData.get("default_puppy_price_euros"),
  );
  if (
    !defaultMalePuppyPriceCents.ok ||
    !defaultFemalePuppyPriceCents.ok ||
    !defaultPuppyPriceCents.ok
  ) {
    redirect(statusUrl("invalid"));
  }

  const preReservationResponseDelayDays = parseNonNegativeInteger(
    formData.get("pre_reservation_response_delay_days"),
  );
  if (!preReservationResponseDelayDays.ok) {
    redirect(statusUrl("invalid_delay"));
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

  const { data: updatedSettings, error } = await supabase
    .from("organization_settings")
    .update({
      default_pre_reservation_deposit_cents:
        defaultPreReservationDepositCents.value,
      default_arrhes_second_payment_cents: defaultArrhesSecondPaymentCents.value,
      default_male_puppy_price_cents: defaultMalePuppyPriceCents.value,
      default_female_puppy_price_cents: defaultFemalePuppyPriceCents.value,
      default_puppy_price_cents: defaultPuppyPriceCents.value,
      pre_reservation_response_delay_days: preReservationResponseDelayDays.value,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(
      "organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents",
    )
    .maybeSingle();

  if (error || !updatedSettings) {
    redirect(statusUrl("error"));
  }

  revalidatePath(paymentSettingsPath);
  revalidatePath("/payments");
  revalidatePath("/reservations");
  redirect(statusUrl("success"));
}
