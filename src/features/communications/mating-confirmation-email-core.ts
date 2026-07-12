import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
  type TransactionalProviderErrorReason,
} from "@/features/communications/transactional-campaign-core";
import {
  formatPreReservationContactFullName,
  formatPreReservationParisDate,
} from "@/features/communications/pre-reservation-email-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type MatingConfirmationEmailTransport = TransactionalEmailTransport;
export type MatingConfirmationProviderErrorReason =
  TransactionalProviderErrorReason;
export type MatingConfirmationDeliveryState =
  | "sent"
  | "not_sent"
  | "in_progress"
  | "uncertain";

type MatingConfirmationStatus =
  | "success"
  | "already_sent"
  | "in_progress"
  | "failed"
  | "not_eligible"
  | "missing_email"
  | "missing_template"
  | "brevo_not_configured";

export type SendMatingConfirmationEmailResult = {
  status: MatingConfirmationStatus;
  deliveryState: MatingConfirmationDeliveryState;
  attemptId?: string;
  errorCode?: string;
};

const CAMPAIGN_KEY = "mating_confirmation";
const OPERATION_VERSION = "v1";

function isValidEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function mapResult(
  result: Awaited<ReturnType<typeof runTransactionalCampaignDelivery>>,
): SendMatingConfirmationEmailResult {
  if (result.outcome === "success") {
    return {
      status: "success",
      deliveryState: "sent",
      attemptId: result.attemptId,
    };
  }
  if (result.outcome === "already_sent") {
    return {
      status: "already_sent",
      deliveryState: "sent",
      attemptId: result.attemptId,
    };
  }
  if (result.outcome === "in_progress") {
    return {
      status: "in_progress",
      deliveryState: "in_progress",
      attemptId: result.attemptId,
    };
  }
  if (result.outcome === "uncertain") {
    return {
      status: "failed",
      deliveryState: "uncertain",
      attemptId: result.attemptId,
      errorCode: result.errorCode,
    };
  }

  let functionalStatus: MatingConfirmationStatus = "failed";
  if (result.errorCode === "not_eligible" || result.errorCode === "missing_email") {
    functionalStatus = result.errorCode;
  } else if (
    result.errorCode === "missing_template" ||
    result.errorCode === "invalid_request" ||
    result.errorCode === "template_not_found" ||
    result.errorCode === "template_inactive"
  ) {
    functionalStatus = "missing_template";
  } else if (
    result.errorCode === "brevo_not_configured" ||
    result.errorCode === "not_configured"
  ) {
    functionalStatus = "brevo_not_configured";
  }
  return {
    status: functionalStatus,
    deliveryState: "not_sent",
    attemptId: result.attemptId,
    errorCode: result.errorCode,
  };
}

export async function sendMatingConfirmationEmailForApplication(
  input: { applicationId: string; litterId: string },
  options: {
    supabase: Supabase;
    transport?: MatingConfirmationEmailTransport;
    transitions?: Parameters<typeof runTransactionalCampaignDelivery>[1]["transitions"];
  },
): Promise<SendMatingConfirmationEmailResult> {
  const result = await runTransactionalCampaignDelivery(
    {
      campaignKey: CAMPAIGN_KEY,
      operationVersion: OPERATION_VERSION,
      transport: options.transport,
      prepareOperation: async ({ supabase, organizationId }) => {
        const { data: application, error: applicationError } = await supabase
          .from("applications")
          .select(
            "id, organization_id, contact_id, desired_litter_id, desired_litter_group_id, status",
          )
          .eq("organization_id", organizationId)
          .eq("id", input.applicationId)
          .eq("desired_litter_id", input.litterId)
          .eq("status", "qualified")
          .is("deleted_at", null)
          .maybeSingle();
        if (applicationError || !application?.contact_id) {
          return { ok: false, errorCode: "not_eligible" };
        }

        const [contactResult, litterResult, overviewResult, organizationResult] =
          await Promise.all([
            supabase
              .from("contacts")
              .select("id, first_name, last_name, display_name, email")
              .eq("organization_id", organizationId)
              .eq("id", application.contact_id)
              .is("deleted_at", null)
              .maybeSingle(),
            supabase
              .from("litters")
              .select(
                "id, organization_id, name, litter_group_id, mating_date, mating_date_2",
              )
              .eq("organization_id", organizationId)
              .eq("id", input.litterId)
              .is("deleted_at", null)
              .maybeSingle(),
            supabase
              .from("litter_overview")
              .select(
                "id, litter_group_name, mother_display_name, father_display_name",
              )
              .eq("id", input.litterId)
              .maybeSingle(),
            supabase
              .from("organizations")
              .select("id, name, affix_name, dog_affix_name")
              .eq("id", organizationId)
              .is("deleted_at", null)
              .maybeSingle(),
          ]);

        const contact = contactResult.data;
        const litter = litterResult.data;
        if (!contact || !isValidEmail(contact.email)) {
          return { ok: false, errorCode: "missing_email" };
        }
        if (!litter) return { ok: false, errorCode: "not_eligible" };

        const overview = overviewResult.data;
        const organization = organizationResult.data;
        const recipientName =
          formatPreReservationContactFullName(contact) ||
          contact.display_name ||
          null;
        const variables = {
          prenom: contact.first_name ?? "",
          nom: contact.last_name ?? "",
          nom_complet: formatPreReservationContactFullName(contact),
          portee: litter.name ?? "",
          groupe_portees: overview?.litter_group_name ?? "",
          mere: overview?.mother_display_name ?? "",
          pere: overview?.father_display_name ?? "",
          date_saillie: formatPreReservationParisDate(litter.mating_date),
          date_saillie_2: formatPreReservationParisDate(litter.mating_date_2),
          nom_elevage:
            organization?.dog_affix_name ??
            organization?.affix_name ??
            organization?.name ??
            "",
        };

        return {
          ok: true,
          operation: {
            dossierId: application.id,
            contactId: contact.id,
            recipientEmail: contact.email!.trim().toLowerCase(),
            recipientName,
            litterId: litter.id,
            litterGroupId: litter.litter_group_id,
            variables,
            variablesSnapshot: { ...variables, application_id: application.id },
          },
        };
      },
    },
    { supabase: options.supabase, transitions: options.transitions },
  );

  return mapResult(result);
}
