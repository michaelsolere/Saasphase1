import type { SupabaseClient } from "@supabase/supabase-js";

import type { SendBirthDocumentsDepositEmailResult } from "@/features/communications/birth-documents-deposit-email-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type BirthDocumentsDepositCampaignResult = {
  status: "success" | "partial" | "error";
  emailsSentCount: number;
  emailsAlreadySentCount: number;
  emailsInProgressCount: number;
  uncertainCount: number;
  paymentsCreatedCount: number;
  paymentsReusedCount: number;
  paymentsCompensatedCount: number;
  completeCount: number;
  preReservationUnpaidCount: number;
  incompatibleRequestCount: number;
  emailsMissingCount: number;
  missingTemplateCount: number;
  brevoNotConfiguredCount: number;
  missingDocumentsCount: number;
  incoherentDocumentsCount: number;
  documentsNotSendableCount: number;
  errorCount: number;
};

const emptyResult = (): BirthDocumentsDepositCampaignResult => ({
  status: "error", emailsSentCount: 0, emailsAlreadySentCount: 0,
  emailsInProgressCount: 0, uncertainCount: 0, paymentsCreatedCount: 0,
  paymentsReusedCount: 0, paymentsCompensatedCount: 0, completeCount: 0,
  preReservationUnpaidCount: 0, incompatibleRequestCount: 0,
  emailsMissingCount: 0, missingTemplateCount: 0,
  brevoNotConfiguredCount: 0, missingDocumentsCount: 0,
  incoherentDocumentsCount: 0, documentsNotSendableCount: 0, errorCount: 0,
});

export async function runBirthDocumentsDepositCampaign(input: {
  supabase: Supabase;
  litterId: string;
  reservationIds: string[];
  userId: string;
  sendEmail: (input: { reservationId: string; litterId: string }) => Promise<SendBirthDocumentsDepositEmailResult>;
}): Promise<BirthDocumentsDepositCampaignResult> {
  const result = emptyResult();
  const { data: membership } = await input.supabase.from("memberships")
    .select("organization_id").eq("profile_id", input.userId).eq("status", "active")
    .is("deleted_at", null).in("role", ["owner", "admin", "member"]).limit(1).maybeSingle();
  if (!membership) { result.errorCount = input.reservationIds.length || 1; return result; }

  for (const reservationId of [...new Set(input.reservationIds)]) {
    const sent = await input.sendEmail({ reservationId, litterId: input.litterId });
    if (sent.paymentAction === "created" || sent.paymentAction === "reactivated") result.paymentsCreatedCount++;
    else if (sent.paymentAction === "reused") result.paymentsReusedCount++;
    if (sent.compensated) result.paymentsCompensatedCount++;
    if (sent.status === "success") result.emailsSentCount++;
    else if (sent.status === "already_sent") result.emailsAlreadySentCount++;
    else if (sent.status === "in_progress") result.emailsInProgressCount++;
    else if (sent.deliveryState === "uncertain") result.uncertainCount++;
    else if (sent.status === "deposit_complete") result.completeCount++;
    else if (sent.status === "pre_reservation_unpaid") result.preReservationUnpaidCount++;
    else if (sent.status === "incompatible_request") result.incompatibleRequestCount++;
    else if (sent.status === "missing_email") result.emailsMissingCount++;
    else if (sent.status === "missing_template") result.missingTemplateCount++;
    else if (sent.status === "brevo_not_configured") result.brevoNotConfiguredCount++;
    else if (sent.status === "missing_documents") result.missingDocumentsCount++;
    else if (sent.status === "incoherent_documents") result.incoherentDocumentsCount++;
    else if (sent.status === "documents_not_sendable") result.documentsNotSendableCount++;
    else result.errorCount++;
  }
  const delivered = result.emailsSentCount + result.emailsAlreadySentCount;
  const pending = result.emailsInProgressCount + result.uncertainCount;
  const rejected = result.completeCount + result.preReservationUnpaidCount +
    result.incompatibleRequestCount + result.emailsMissingCount +
    result.missingTemplateCount + result.brevoNotConfiguredCount +
    result.missingDocumentsCount + result.incoherentDocumentsCount +
    result.documentsNotSendableCount + result.errorCount;
  result.status = delivered === 0 ? (pending > 0 ? "partial" : "error") :
    pending + rejected > 0 ? "partial" : "success";
  return result;
}
