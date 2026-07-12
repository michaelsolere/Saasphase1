import "server-only";
import { sendBirthDocumentsDepositEmailForReservation as core, type BirthDocumentsDepositEmailTransport, type SendBirthDocumentsDepositEmailResult } from "@/features/communications/birth-documents-deposit-email-core";
import { getBrevoConfigurationStatus, getBrevoTransactionalTemplate, sendBrevoTransactionalEmail } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
export type { BirthDocumentsDepositEmailTransport, SendBirthDocumentsDepositEmailResult };
export async function sendBirthDocumentsDepositEmailForReservation(input: { reservationId: string; litterId: string; paymentId: string; paidArrhesCents: number; completeDepositCents: number }) {
  return core(input, { supabase: await createClient(), transport: { getTemplate: getBrevoTransactionalTemplate, sendEmail: sendBrevoTransactionalEmail, isConfigured: () => getBrevoConfigurationStatus().isConfigured } });
}
