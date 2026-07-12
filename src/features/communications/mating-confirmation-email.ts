import "server-only";

import {
  sendMatingConfirmationEmailForApplication as sendMatingConfirmationEmailForApplicationCore,
  type MatingConfirmationEmailTransport,
  type SendMatingConfirmationEmailResult,
} from "@/features/communications/mating-confirmation-email-core";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

export type {
  MatingConfirmationEmailTransport,
  SendMatingConfirmationEmailResult,
};

function defaultTransport(): MatingConfirmationEmailTransport {
  return {
    getTemplate: getBrevoTransactionalTemplate,
    sendEmail: sendBrevoTransactionalEmail,
    isConfigured: () => getBrevoConfigurationStatus().isConfigured,
  };
}

export async function sendMatingConfirmationEmailForApplication(input: {
  applicationId: string;
  litterId: string;
}): Promise<SendMatingConfirmationEmailResult> {
  return sendMatingConfirmationEmailForApplicationCore(input, {
    supabase: await createClient(),
    transport: defaultTransport(),
  });
}
