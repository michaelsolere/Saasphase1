import type {
  MatingConfirmationDeliveryState,
  SendMatingConfirmationEmailResult,
} from "@/features/communications/mating-confirmation-email-core";

export type MatingConfirmationCampaignApplication = {
  id: string;
  contact_id: string | null;
};

export type MatingConfirmationCampaignResult = {
  emailsSentCount: number;
  emailsAlreadySentCount: number;
  emailsFailedCount: number;
  emailsMissingCount: number;
  emailsInProgressCount: number;
  missingTemplateCount: number;
  brevoNotConfiguredCount: number;
  errorCount: number;
};

export type MatingConfirmationCampaignSendResult = {
  status: SendMatingConfirmationEmailResult["status"];
  deliveryState: MatingConfirmationDeliveryState;
  attemptId?: string;
  errorCode?: string;
};

type SendMatingConfirmationCampaignEmail = (input: {
  applicationId: string;
}) => Promise<MatingConfirmationCampaignSendResult>;

export async function runMatingConfirmationCampaignForApplications({
  applications,
  sendEmail,
}: {
  applications: MatingConfirmationCampaignApplication[];
  sendEmail: SendMatingConfirmationCampaignEmail;
}): Promise<MatingConfirmationCampaignResult> {
  let emailsSentCount = 0;
  let emailsAlreadySentCount = 0;
  let emailsFailedCount = 0;
  let emailsMissingCount = 0;
  let emailsInProgressCount = 0;
  let missingTemplateCount = 0;
  let brevoNotConfiguredCount = 0;
  let errorCount = 0;

  for (const app of applications) {
    if (!app.contact_id) {
      errorCount++;
      continue;
    }

    const sendResult = await sendEmail({ applicationId: app.id });

    if (sendResult.status === "success") {
      emailsSentCount++;
    } else if (sendResult.status === "already_sent") {
      emailsAlreadySentCount++;
    } else if (sendResult.status === "in_progress") {
      emailsInProgressCount++;
    } else if (sendResult.status === "missing_email") {
      emailsMissingCount++;
    } else if (sendResult.status === "missing_template") {
      missingTemplateCount++;
    } else if (sendResult.status === "brevo_not_configured") {
      brevoNotConfiguredCount++;
    } else if (sendResult.status === "not_eligible") {
      errorCount++;
    } else {
      emailsFailedCount++;
    }
  }

  return {
    emailsSentCount,
    emailsAlreadySentCount,
    emailsFailedCount,
    emailsMissingCount,
    emailsInProgressCount,
    missingTemplateCount,
    brevoNotConfiguredCount,
    errorCount,
  };
}
