import type { createClient } from "@/lib/supabase/server";

export const PRE_RESERVATION_PAYMENT_AMOUNT_CENTS = 25000;
export const COMPLETE_DEPOSIT_AMOUNT_CENTS = 50000;
export const PRE_RESERVATION_RESPONSE_DELAY_DAYS = 15;

type PaymentSettingsRow = {
  organization_id?: string | null;
  default_pre_reservation_deposit_cents: number | null;
  default_arrhes_second_payment_cents: number | null;
  pre_reservation_response_delay_days: number | null;
};

type SupabasePaymentSettingsClient = Awaited<ReturnType<typeof createClient>>;

export type ResolvedDepositSettings = {
  preReservationDepositCents: number;
  arrhesSecondPaymentCents: number;
  completeDepositCents: number;
  preReservationResponseDelayDays: number;
};

function resolvePositiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function resolveNonNegativeInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function resolveDepositSettings(
  settings: PaymentSettingsRow | null | undefined,
): ResolvedDepositSettings {
  const preReservationDepositCents =
    resolvePositiveInteger(settings?.default_pre_reservation_deposit_cents) ??
    PRE_RESERVATION_PAYMENT_AMOUNT_CENTS;
  const arrhesSecondPaymentCents =
    resolvePositiveInteger(settings?.default_arrhes_second_payment_cents) ??
    PRE_RESERVATION_PAYMENT_AMOUNT_CENTS;
  const completeDepositCents =
    settings &&
    resolvePositiveInteger(settings.default_pre_reservation_deposit_cents) !==
      null &&
    resolvePositiveInteger(settings.default_arrhes_second_payment_cents) !== null
      ? preReservationDepositCents + arrhesSecondPaymentCents
      : COMPLETE_DEPOSIT_AMOUNT_CENTS;

  return {
    preReservationDepositCents,
    arrhesSecondPaymentCents,
    completeDepositCents,
    preReservationResponseDelayDays:
      resolveNonNegativeInteger(settings?.pre_reservation_response_delay_days) ??
      PRE_RESERVATION_RESPONSE_DELAY_DAYS,
  };
}

export async function readDepositSettingsForOrganization({
  supabase,
  organizationId,
}: {
  supabase: SupabasePaymentSettingsClient;
  organizationId: string;
}) {
  const { data: settings, error } = await supabase
    .from("organization_settings")
    .select(
      "default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents, pre_reservation_response_delay_days",
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Failed to read payment settings:", error);
  }

  return resolveDepositSettings(error ? null : settings);
}

export async function readCompleteDepositCentsByOrganizationId({
  supabase,
  organizationIds,
}: {
  supabase: SupabasePaymentSettingsClient;
  organizationIds: string[];
}) {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds));
  const completeDepositCentsByOrganizationId = new Map<string, number>();

  if (uniqueOrganizationIds.length === 0) {
    return completeDepositCentsByOrganizationId;
  }

  const { data: settingsRows, error } = await supabase
    .from("organization_settings")
    .select(
      "organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents, pre_reservation_response_delay_days",
    )
    .in("organization_id", uniqueOrganizationIds)
    .is("deleted_at", null);

  if (error) {
    console.error("Failed to read grouped payment settings:", error);
    return completeDepositCentsByOrganizationId;
  }

  for (const settings of settingsRows ?? []) {
    if (!settings.organization_id) {
      continue;
    }

    completeDepositCentsByOrganizationId.set(
      settings.organization_id,
      resolveDepositSettings(settings).completeDepositCents,
    );
  }

  return completeDepositCentsByOrganizationId;
}

export function addDaysAsIsoDate(days: number, from = new Date()) {
  const dueDate = new Date(from);
  dueDate.setUTCDate(dueDate.getUTCDate() + days);
  return dueDate.toISOString().slice(0, 10);
}
