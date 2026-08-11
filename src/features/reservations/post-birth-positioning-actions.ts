"use server";

import { revalidatePath } from "next/cache";

import {
  getBrevoConfigurationStatus,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function integerField(formData: FormData, name: string, fallback = 0) {
  const value = Number(stringField(formData, name));
  return Number.isSafeInteger(value) ? value : fallback;
}

function commandId(formData: FormData) {
  const value = stringField(formData, "client_command_id");
  return /^[0-9a-f-]{36}$/i.test(value) ? value : crypto.randomUUID();
}

function pagePath(formData: FormData) {
  const groupId = stringField(formData, "litter_group_id");
  return `/litter-groups/${groupId}/positioning`;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(error.message ?? `${name} failed`);
  const result = Array.isArray(data) ? data[0] : data;
  if (result && typeof result === "object" && "outcome" in result) {
    const outcome = String((result as Record<string, unknown>).outcome);
    if (!["updated", "created", "already_applied", "already_open"].includes(outcome)) {
      throw new Error(String((result as Record<string, unknown>).reason ?? outcome));
    }
  }
  return result;
}

function refresh(formData: FormData) {
  revalidatePath(pagePath(formData));
  revalidatePath("/reservations");
}

export async function openPostBirthDraft(formData: FormData) {
  await rpc("open_post_birth_positioning_draft", {
    p_litter_group_id: stringField(formData, "litter_group_id"),
    p_exception_reason: stringField(formData, "exception_reason") || null,
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function publishPostBirthCapacity(formData: FormData) {
  await rpc("publish_post_birth_capacity", {
    p_litter_id: stringField(formData, "litter_id"),
    p_expected_version: integerField(formData, "expected_version"),
    p_male_preserved: integerField(formData, "male_preserved"),
    p_female_preserved: integerField(formData, "female_preserved"),
    p_male_uncertain: integerField(formData, "male_uncertain"),
    p_female_uncertain: integerField(formData, "female_uncertain"),
    p_reason: stringField(formData, "reason"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function openPostBirthWave(formData: FormData) {
  await rpc("open_post_birth_wave", {
    p_draft_id: stringField(formData, "draft_id"),
    p_litter_id: stringField(formData, "litter_id"),
    p_wave_kind: stringField(formData, "wave_kind"),
    p_expected_draft_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function upsertPostBirthProposal(formData: FormData) {
  const proposedOutcome = stringField(formData, "proposed_outcome");
  await rpc("upsert_post_birth_proposal", {
    p_wave_id: stringField(formData, "wave_id"),
    p_reservation_id: stringField(formData, "reservation_id"),
    p_proposed_sex: proposedOutcome === "place" ? stringField(formData, "proposed_sex") : null,
    p_proposed_outcome: proposedOutcome,
    p_blocker_code: proposedOutcome === "blocked" ? stringField(formData, "blocker_code") : null,
    p_expected_wave_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function confirmPostBirthPlaces(formData: FormData) {
  await rpc("confirm_post_birth_places", {
    p_wave_id: stringField(formData, "wave_id"),
    p_line_ids: formData.getAll("line_ids").filter((value): value is string => typeof value === "string"),
    p_expected_wave_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function refreshPostBirthLines(formData: FormData) {
  await rpc("refresh_post_birth_positioning_lines", {
    p_wave_id: stringField(formData, "wave_id"),
    p_expected_wave_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function completePostBirthWave(formData: FormData) {
  await rpc("complete_post_birth_wave", {
    p_wave_id: stringField(formData, "wave_id"),
    p_expected_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function completePostBirthDraft(formData: FormData) {
  await rpc("complete_post_birth_positioning_draft", {
    p_draft_id: stringField(formData, "draft_id"),
    p_expected_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function openPostBirthIncident(formData: FormData) {
  await rpc("open_post_birth_incident", {
    p_litter_id: stringField(formData, "litter_id"),
    p_incident_type: stringField(formData, "incident_type"),
    p_sex: stringField(formData, "sex") || null,
    p_summary: stringField(formData, "summary"),
    p_details: stringField(formData, "details"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function resolvePostBirthIncident(formData: FormData) {
  await rpc("resolve_post_birth_incident", {
    p_incident_id: stringField(formData, "incident_id"),
    p_resolution: stringField(formData, "resolution"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function createDirectLateSale(formData: FormData) {
  const deadline = stringField(formData, "hold_deadline");
  await rpc("create_direct_late_sale", {
    p_application_id: stringField(formData, "application_id"),
    p_litter_id: stringField(formData, "litter_id"),
    p_animal_id: stringField(formData, "animal_id"),
    p_hold_deadline: deadline ? new Date(deadline).toISOString() : null,
    p_required_amount_cents: integerField(formData, "required_amount_euros") * 100,
    p_email_subject: stringField(formData, "email_subject"),
    p_email_body_preview: stringField(formData, "email_body_preview"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function transitionDirectLateSaleEmail(formData: FormData) {
  await rpc("transition_direct_late_sale_email", {
    p_direct_sale_id: stringField(formData, "direct_sale_id"),
    p_action: stringField(formData, "email_action"),
    p_expected_version: integerField(formData, "email_version"),
    p_brevo_message_id: null,
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function sendDirectLateSaleEmail(formData: FormData) {
  const directSaleId = stringField(formData, "direct_sale_id");
  const emailVersion = integerField(formData, "email_version");
  const supabase = await createClient();
  const membership = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();
  if (!membership.data) throw new Error("owner_admin_required");

  const email = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
          };
        };
      };
    };
  })
    .from("direct_late_sale_email_drafts")
    .select("id, organization_id, status, recipient_email, recipient_name, variables, version")
    .eq("direct_sale_id", directSaleId)
    .eq("organization_id", membership.data.organization_id)
    .maybeSingle();
  const emailStatus = String(email.data?.status ?? "");
  if (email.error || !email.data || !["reviewed", "sending", "failed"].includes(emailStatus) || email.data.version !== emailVersion) {
    throw new Error("reviewed_email_required");
  }

  const template = await supabase
    .from("email_templates")
    .select("id, brevo_template_id")
    .eq("organization_id", membership.data.organization_id)
    .eq("template_key", "direct_late_sale")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!template.data?.brevo_template_id || !getBrevoConfigurationStatus().isConfigured) {
    throw new Error("brevo_template_or_configuration_missing");
  }

  if (emailStatus !== "sending") {
    await rpc("transition_direct_late_sale_email", {
      p_direct_sale_id: directSaleId,
      p_action: "sending",
      p_expected_version: emailVersion,
      p_brevo_message_id: null,
      p_client_command_id: crypto.randomUUID(),
    });
  }
  const sendResult = await sendBrevoTransactionalEmail({
    templateId: template.data.brevo_template_id,
    to: { email: String(email.data.recipient_email), name: String(email.data.recipient_name) },
    params: (email.data.variables ?? {}) as Record<string, string>,
    idempotencyKey: `direct-late-sale:${email.data.id}`,
    tags: ["saas_elevage", "direct_late_sale"],
  });
  await rpc("transition_direct_late_sale_email", {
    p_direct_sale_id: directSaleId,
    p_action: sendResult.ok ? "sent" : "failed",
    p_expected_version: emailVersion + (emailStatus === "sending" ? 0 : 1),
    p_brevo_message_id: sendResult.ok ? sendResult.messageId : null,
    p_client_command_id: crypto.randomUUID(),
  });
  if (!sendResult.ok) throw new Error(`brevo_${sendResult.reason}`);
  refresh(formData);
}

export async function recordDirectLateSaleDocument(formData: FormData) {
  await rpc("record_direct_late_sale_document_received", {
    p_direct_sale_id: stringField(formData, "direct_sale_id"),
    p_document_id: stringField(formData, "document_id"),
    p_signed_at: new Date(stringField(formData, "signed_at")).toISOString(),
    p_expected_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function recordDirectLateSalePayment(formData: FormData) {
  await rpc("record_direct_late_sale_full_payment", {
    p_direct_sale_id: stringField(formData, "direct_sale_id"),
    p_paid_at: new Date(stringField(formData, "paid_at")).toISOString(),
    p_payment_method: stringField(formData, "payment_method"),
    p_external_reference: stringField(formData, "external_reference") || null,
    p_expected_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}

export async function finalizeDirectLateSale(formData: FormData) {
  await rpc("finalize_direct_late_sale_assignment", {
    p_direct_sale_id: stringField(formData, "direct_sale_id"),
    p_expected_version: integerField(formData, "expected_version"),
    p_client_command_id: commandId(formData),
  });
  refresh(formData);
}
