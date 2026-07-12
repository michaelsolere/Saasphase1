import type { SupabaseClient } from "@supabase/supabase-js";
import type { BirthDocumentsDepositDeliveryState } from "@/features/communications/birth-documents-deposit-email-core";
import { addDaysAsIsoDate, readDepositSettingsForOrganization } from "@/features/payments/deposit-thresholds";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type SendResult = { status: "success" | "already_sent" | "in_progress" | "failed" | "not_eligible" | "missing_email" | "missing_payment" | "missing_template" | "brevo_not_configured"; deliveryState: BirthDocumentsDepositDeliveryState };
export type BirthDocumentsDepositCampaignResult = {
  status: "success" | "partial" | "error";
  emailsSentCount: number; emailsAlreadySentCount: number; paymentsCreatedCount: number; paymentsReusedCount: number;
  completeCount: number; preReservationUnpaidCount: number; incompatibleRequestCount: number; emailsMissingCount: number;
  missingTemplateCount: number; brevoNotConfiguredCount: number; uncertainCount: number; compensatedCount: number; errorCount: number;
};

const FINAL = new Set(["adopted", "withdrawn", "cancelled", "expired", "archived"]);
const ACTIVE = ["requested", "pending", "partially_paid"] as const;

async function compensate(supabase: Supabase, organizationId: string, reservationId: string, paymentId: string, userId: string) {
  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase.from("payments").update({ deleted_at: deletedAt, updated_at: deletedAt, updated_by: userId }).eq("organization_id", organizationId).eq("reservation_id", reservationId).eq("id", paymentId).eq("payment_type", "arrhes").eq("status", "requested").is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return false;
  const { count, error: verifyError } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("id", paymentId).is("deleted_at", null);
  return !verifyError && count === 0;
}

export async function runBirthDocumentsDepositCampaign({ supabase, litterId, reservationIds, userId, sendEmail }: {
  supabase: Supabase; litterId: string; reservationIds: string[]; userId: string;
  sendEmail: (input: { reservationId: string; litterId: string; paymentId: string; paidArrhesCents: number; completeDepositCents: number }) => Promise<SendResult>;
}): Promise<BirthDocumentsDepositCampaignResult> {
  const result: BirthDocumentsDepositCampaignResult = { status: "error", emailsSentCount: 0, emailsAlreadySentCount: 0, paymentsCreatedCount: 0, paymentsReusedCount: 0, completeCount: 0, preReservationUnpaidCount: 0, incompatibleRequestCount: 0, emailsMissingCount: 0, missingTemplateCount: 0, brevoNotConfiguredCount: 0, uncertainCount: 0, compensatedCount: 0, errorCount: 0 };
  const { data: membership } = await supabase.from("memberships").select("organization_id").eq("profile_id", userId).eq("status", "active").is("deleted_at", null).in("role", ["owner", "admin", "member"]).limit(1).maybeSingle();
  if (!membership) { result.errorCount++; return result; }
  const settings = await readDepositSettingsForOrganization({ supabase, organizationId: membership.organization_id });
  for (const reservationId of reservationIds) {
    const { data: reservation } = await supabase.from("reservations").select("id, organization_id, contact_id, litter_id, status").eq("organization_id", membership.organization_id).eq("id", reservationId).eq("litter_id", litterId).is("deleted_at", null).maybeSingle();
    if (!reservation?.contact_id || !reservation.status || FINAL.has(reservation.status)) { result.errorCount++; continue; }
    const { data: payments, error: paymentError } = await supabase.from("payments").select("id, amount_cents, payment_type, status, due_date, notes").eq("organization_id", reservation.organization_id).eq("reservation_id", reservation.id).eq("contact_id", reservation.contact_id).in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"]).in("status", ["requested", "pending", "partially_paid", "paid"]).is("deleted_at", null);
    if (paymentError || !payments) { result.errorCount++; continue; }
    const paid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount_cents, 0);
    if (paid >= settings.completeDepositCents) { result.completeCount++; continue; }
    if (reservation.status !== "pre_reservation_paid" || paid < settings.preReservationDepositCents) { result.preReservationUnpaidCount++; continue; }
    const complement = settings.completeDepositCents - paid;
    const active = payments.filter((p) => ACTIVE.includes(p.status as (typeof ACTIVE)[number]) && p.payment_type === "arrhes");
    const matching = active.find((p) => p.amount_cents === complement && (p.notes ?? "").includes("Demande 2/2"));
    if (active.length > 0 && !matching) { result.incompatibleRequestCount++; continue; }
    let paymentId = matching?.id;
    let created = false;
    if (!paymentId) {
      const dueDate = addDaysAsIsoDate(settings.preReservationResponseDelayDays);
      const { data: inserted, error } = await supabase.from("payments").insert({ organization_id: reservation.organization_id, contact_id: reservation.contact_id, reservation_id: reservation.id, amount_cents: complement, currency: "EUR", payment_type: "arrhes", status: "requested", payment_method: "bank_transfer", requested_at: new Date().toISOString(), due_date: dueDate, notes: "Demande 2/2 — complément d’arrhes", created_by: userId, updated_by: userId }).select("id").single();
      if (error || !inserted) { result.errorCount++; continue; }
      paymentId = inserted.id; created = true; result.paymentsCreatedCount++;
    } else result.paymentsReusedCount++;
    const sent = await sendEmail({ reservationId: reservation.id, litterId, paymentId, paidArrhesCents: paid, completeDepositCents: settings.completeDepositCents });
    if (sent.status === "success") result.emailsSentCount++;
    else if (sent.status === "already_sent") result.emailsAlreadySentCount++;
    else if (sent.status === "missing_email") result.emailsMissingCount++;
    else if (sent.status === "missing_template") result.missingTemplateCount++;
    else if (sent.status === "brevo_not_configured") result.brevoNotConfiguredCount++;
    else if (sent.deliveryState === "in_progress" || sent.deliveryState === "uncertain") result.uncertainCount++;
    else result.errorCount++;
    if (created && sent.deliveryState === "not_sent") {
      if (await compensate(supabase, reservation.organization_id, reservation.id, paymentId, userId)) result.compensatedCount++;
      else result.errorCount++;
    }
  }
  const successful = result.emailsSentCount + result.emailsAlreadySentCount;
  const issues = result.completeCount + result.preReservationUnpaidCount + result.incompatibleRequestCount + result.emailsMissingCount + result.missingTemplateCount + result.brevoNotConfiguredCount + result.uncertainCount + result.errorCount;
  result.status = successful === 0 ? "error" : issues > 0 ? "partial" : "success";
  return result;
}
