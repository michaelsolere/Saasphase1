import "server-only";

import {
  sendPreReservationEmailForReservation as sendPreReservationEmailForReservationCore,
  type PreReservationEmailTransport,
  type SendPreReservationEmailResult,
} from "@/features/communications/pre-reservation-email-core";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

export type { PreReservationEmailTransport, SendPreReservationEmailResult };

function defaultTransport(): PreReservationEmailTransport {
  return {
    getTemplate: getBrevoTransactionalTemplate,
    sendEmail: sendBrevoTransactionalEmail,
    isConfigured: () => getBrevoConfigurationStatus().isConfigured,
  };
}

export async function sendPreReservationEmailForReservation(input: {
  reservationId: string;
}): Promise<SendPreReservationEmailResult> {
  return sendPreReservationEmailForReservationCore(input, {
    supabase: await createClient(),
    transport: defaultTransport(),
  });
}
