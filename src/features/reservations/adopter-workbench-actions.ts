"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dispatchAdopterProfileQuestionnaire } from "@/features/adopter-profile-questionnaire/delivery-service";
import { createClient } from "@/lib/supabase/server";

type RpcResult = {
  data: Array<{ outcome: string; manual_contact_id: string | null; reason: string | null }> | null;
  error: { message: string } | null;
};

function safeReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/reservations")) return "/reservations?view=current";
  try {
    const url = new URL(value, "http://localhost");
    return url.origin === "http://localhost" && (url.pathname === "/reservations" || /^\/reservations\/[0-9a-f-]{36}$/i.test(url.pathname))
      ? `${url.pathname}${url.search}`
      : "/reservations?view=current";
  } catch {
    return "/reservations?view=current";
  }
}

export async function recordAdopterManualContact(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const expectedUpdatedAt = formData.get("expected_updated_at");
  const channel = formData.get("channel");
  const summary = formData.get("summary");
  const contactedAt = formData.get("contacted_at");
  const returnPath = safeReturnPath(formData.get("return_to"));
  const commandValue = formData.get("client_command_id");
  const commandId = typeof commandValue === "string" && /^[0-9a-f-]{36}$/i.test(commandValue)
    ? commandValue
    : randomUUID();

  if (
    typeof reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(reservationId) ||
    typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt ||
    typeof channel !== "string" || !["phone", "sms", "external_email", "visit", "video", "other"].includes(channel) ||
    typeof summary !== "string" || summary.trim().length < 3 || summary.trim().length > 1000 ||
    typeof contactedAt !== "string" || !contactedAt
  ) {
    redirect(`${returnPath}&contact_status=error`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rpcClient = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  };
  const { data, error } = await rpcClient.rpc("record_adopter_manual_contact", {
    p_reservation_id: reservationId,
    p_expected_reservation_updated_at: expectedUpdatedAt,
    p_channel: channel,
    p_summary: summary.trim(),
    p_contacted_at: new Date(contactedAt).toISOString(),
    p_client_command_id: commandId,
  });
  if (error) redirect(`${returnPath}&contact_status=error`);
  const outcome = data?.[0]?.outcome;
  if (outcome === "conflict") redirect(`${returnPath}&contact_status=conflict`);
  if (outcome !== "recorded" && outcome !== "already_recorded") {
    redirect(`${returnPath}&contact_status=error`);
  }
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(`${returnPath}&contact_status=success`);
}

async function requireProfileAdmin(instanceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const client = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
  const instanceResult = await client.from("adopter_profile_questionnaire_instances")
    .select("id, organization_id, reservation_id").eq("id", instanceId).maybeSingle();
  const instance = instanceResult.data as { id: string; organization_id: string; reservation_id: string } | null;
  if (instanceResult.error || !instance) return null;
  const membership = await supabase.from("memberships").select("role")
    .eq("organization_id", instance.organization_id).eq("profile_id", user.id)
    .eq("status", "active").is("deleted_at", null).maybeSingle();
  if (membership.data?.role !== "owner" && membership.data?.role !== "admin") return null;
  return { supabase, user, instance };
}

function profileReturnPath(formData: FormData) {
  return safeReturnPath(formData.get("return_to"));
}

function profileRedirectPath(formData: FormData, status: string) {
  const path = profileReturnPath(formData);
  return `${path}${path.includes("?") ? "&" : "?"}profile_status=${status}`;
}

export async function sendAdopterProfileQuestionnaire(formData: FormData) {
  const instanceId = formData.get("instance_id");
  if (typeof instanceId !== "string" || !/^[0-9a-f-]{36}$/i.test(instanceId)) redirect("/reservations?profile_status=error");
  const authorized = await requireProfileAdmin(instanceId);
  if (!authorized) redirect("/reservations?profile_status=forbidden");
  const result = await dispatchAdopterProfileQuestionnaire(instanceId, "invitation", true).catch(() => ({ outcome: "failed" as const }));
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${authorized.instance.reservation_id}`);
  redirect(profileRedirectPath(formData, result.outcome === "sent" ? "sent" : "error"));
}

export async function reviewAdopterProfileQuestionnaire(formData: FormData) {
  const instanceId = formData.get("instance_id");
  const decisionValue = formData.get("sex_preference_decision");
  const decision = decisionValue === "keep" || decisionValue === "update" ? decisionValue : null;
  if (typeof instanceId !== "string" || !/^[0-9a-f-]{36}$/i.test(instanceId)) redirect("/reservations?profile_status=error");
  const authorized = await requireProfileAdmin(instanceId);
  if (!authorized) redirect("/reservations?profile_status=forbidden");
  const rpc = authorized.supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string }> | null; error: unknown }> };
  const result = await rpc.rpc("review_adopter_profile_questionnaire", { p_instance_id: instanceId, p_sex_preference_decision: decision, p_client_command_id: randomUUID() });
  const outcome = result.data?.[0]?.outcome;
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${authorized.instance.reservation_id}`);
  redirect(profileRedirectPath(formData, outcome === "reviewed" || outcome === "already_reviewed" ? "reviewed" : outcome === "sex_decision_required" ? "sex_required" : "error"));
}

export async function waiveAdopterProfileQuestionnaire(formData: FormData) {
  const instanceId = formData.get("instance_id");
  const reason = formData.get("reason");
  const manualContactId = formData.get("manual_contact_id");
  if (typeof instanceId !== "string" || typeof reason !== "string" || typeof manualContactId !== "string") redirect("/reservations?profile_status=error");
  const authorized = await requireProfileAdmin(instanceId);
  if (!authorized) redirect("/reservations?profile_status=forbidden");
  const rpc = authorized.supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string }> | null; error: unknown }> };
  const result = await rpc.rpc("waive_adopter_profile_questionnaire", { p_instance_id: instanceId, p_reason: reason.trim(), p_manual_contact_id: manualContactId, p_client_command_id: randomUUID() });
  const outcome = result.data?.[0]?.outcome;
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${authorized.instance.reservation_id}`);
  redirect(profileRedirectPath(formData, outcome === "waived" || outcome === "already_waived" ? "waived" : "error"));
}

export async function revokeAdopterProfileAccess(formData: FormData) {
  const instanceId = formData.get("instance_id");
  if (typeof instanceId !== "string") redirect("/reservations?profile_status=error");
  const authorized = await requireProfileAdmin(instanceId);
  if (!authorized) redirect("/reservations?profile_status=forbidden");
  const rpc = authorized.supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string }> | null; error: unknown }> };
  const result = await rpc.rpc("revoke_adopter_profile_questionnaire_access", {
    p_instance_id: instanceId,
    p_reason: "manual",
    p_client_command_id: randomUUID(),
  });
  if (result.error || !["revoked", "already_revoked"].includes(result.data?.[0]?.outcome ?? "")) redirect(profileRedirectPath(formData, "error"));
  revalidatePath("/reservations");
  redirect(profileRedirectPath(formData, "revoked"));
}

export async function renewAdopterProfileAccess(formData: FormData) {
  const instanceId = formData.get("instance_id");
  if (typeof instanceId !== "string") redirect("/reservations?profile_status=error");
  const authorized = await requireProfileAdmin(instanceId);
  if (!authorized) redirect("/reservations?profile_status=forbidden");
  const rpc = authorized.supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string }> | null; error: unknown }> };
  const revoked = await rpc.rpc("revoke_adopter_profile_questionnaire_access", {
    p_instance_id: instanceId,
    p_reason: "renewal",
    p_client_command_id: randomUUID(),
  });
  if (revoked.error || !["revoked", "already_revoked"].includes(revoked.data?.[0]?.outcome ?? "")) redirect(profileRedirectPath(formData, "error"));
  const result = await dispatchAdopterProfileQuestionnaire(instanceId, "invitation", true).catch(() => ({ outcome: "failed" as const }));
  revalidatePath("/reservations");
  redirect(profileRedirectPath(formData, result.outcome === "sent" ? "renewed" : "error"));
}
