"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deriveDepartureToken, hashDepartureToken, sendDepartureAppointmentEmail } from "@/features/communications/departure-appointment-email";
import { departureDateTimeInputToIso } from "@/features/departures/departure-time-zone";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

const uuid = (value: FormDataEntryValue | null): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
const commandId = (formData: FormData) => {
  const value = formData.get("client_command_id");
  return uuid(value) ? value : null;
};
const target = (planId: string | null, status: string, formData?: FormData) => {
  const supplied = formData?.get("return_to");
  const params = typeof supplied === "string" && supplied.startsWith("/departs?") && !supplied.includes("//")
    ? new URL(supplied, "http://localhost").searchParams
    : new URLSearchParams();
  if (planId) params.set("plan", planId); else params.delete("plan");
  params.set("status", status);
  return `/departs?${params.toString()}`;
};

export async function createDeparturePlanAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const title = String(formData.get("title") ?? "Départs");
  const duration = Number(formData.get("default_duration_minutes"));
  const litterIds = formData.getAll("litter_ids").filter(uuid);
  const litters = litterIds.map((litterId) => ({ litterId, earliestDepartureAt: departureDateTimeInputToIso(String(formData.get(`earliest_${litterId}`) ?? "")) ?? "" }));
  if (!clientCommandId || !Number.isInteger(duration) || !litters.length || litters.some((row) => !Number.isFinite(Date.parse(row.earliestDepartureAt)))) redirect(target(null, "invalid_input", formData));
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; plan_id: string | null; reason: string | null }> | null; error: unknown }> }).rpc("create_departure_plan", { p_title: title, p_default_duration_minutes: duration, p_litters: litters, p_client_command_id: clientCommandId });
  const result = data?.[0];
  if (error || result?.outcome !== "created" || !result.plan_id) redirect(target(null, result?.reason ?? "error", formData));
  revalidatePath("/departs");
  redirect(target(result.plan_id, "created", formData));
}

export async function upsertDepartureSlotAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const planId = formData.get("plan_id");
  const slotValue = formData.get("slot_id");
  const startsAt = departureDateTimeInputToIso(String(formData.get("starts_at") ?? "")) ?? "";
  const duration = Number(formData.get("duration_minutes"));
  const version = Number(formData.get("plan_version"));
  const reservationValue = formData.get("reservation_id");
  const reservationId = uuid(reservationValue) ? reservationValue : null;
  const visibility = reservationId || formData.get("visibility") === "exceptional" ? "exceptional" : "public";
  if (!clientCommandId || !uuid(planId) || !Number.isFinite(Date.parse(startsAt)) || !Number.isInteger(duration) || !Number.isInteger(version)) redirect(target(uuid(planId) ? planId : null, "invalid_input", formData));
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null; slot_id: string | null }> | null; error: unknown }> }).rpc("upsert_departure_slot", { p_plan_id: planId, p_slot_id: uuid(slotValue) ? slotValue : null, p_starts_at: new Date(startsAt).toISOString(), p_duration_minutes: duration, p_visibility: visibility, p_reservation_id: reservationId, p_expected_version: version, p_client_command_id: clientCommandId });
  const result = data?.[0];
  if (!error && ["updated", "already_applied"].includes(result?.outcome ?? "") && result?.slot_id && reservationId) {
    const { data: { user } } = await supabase.auth.getUser();
    const plan = await (supabase as unknown as SupabaseClient).from("departure_plans").select("organization_id").eq("id", planId).single();
    if (user && plan.data) {
      const service = createServiceRoleClient() as unknown as SupabaseClient;
      let access = await service.from("departure_public_accesses").select("id").eq("plan_id", planId).eq("reservation_id", reservationId).is("revoked_at", null).maybeSingle();
      if (!access.data) {
        const accessId = randomUUID(); const token = deriveDepartureToken(accessId);
        access = await service.from("departure_public_accesses").insert({ id: accessId, organization_id: plan.data.organization_id, plan_id: planId, reservation_id: reservationId, token_hash: hashDepartureToken(token), token_hint: token.slice(-8), expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString() }).select("id").single();
      }
      if (access.data) {
        await service.from("departure_public_accesses").update({ response_kind: "booked", responded_at: new Date().toISOString() }).eq("id", access.data.id);
        await sendDepartureAppointmentEmail(access.data.id, "exceptional_confirmation", { supabase: service, systemActorUserId: user.id });
      }
    }
  }
  revalidatePath("/departs");
  redirect(target(planId, error ? "error" : result?.reason ?? result?.outcome ?? "error", formData));
}

export async function publishDeparturePlanAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const planId = formData.get("plan_id");
  const deadline = departureDateTimeInputToIso(String(formData.get("response_deadline_at") ?? "")) ?? "";
  const version = Number(formData.get("plan_version"));
  if (!clientCommandId || !uuid(planId) || !Number.isFinite(Date.parse(deadline)) || !Number.isInteger(version)) redirect(target(uuid(planId) ? planId : null, "invalid_input", formData));
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("publish_departure_plan", { p_plan_id: planId, p_response_deadline_at: new Date(deadline).toISOString(), p_expected_version: version, p_client_command_id: clientCommandId });
  const result = data?.[0];
  revalidatePath("/departs");
  redirect(target(planId, error ? "error" : result?.reason ?? result?.outcome ?? "error", formData));
}

export async function moveDepartureAppointmentAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const planId = formData.get("plan_id");
  const slotId = formData.get("slot_id");
  const startsAt = departureDateTimeInputToIso(String(formData.get("starts_at") ?? "")) ?? "";
  const duration = Number(formData.get("duration_minutes"));
  const slotVersion = Number(formData.get("slot_version"));
  const reason = String(formData.get("reason") ?? "Déplacement confirmé");
  if (!clientCommandId || !uuid(planId) || !uuid(slotId) || !Number.isFinite(Date.parse(startsAt)) || !Number.isInteger(duration) || !Number.isInteger(slotVersion)) redirect(target(uuid(planId) ? planId : null, "invalid_input", formData));
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("move_departure_appointment", { p_slot_id: slotId, p_starts_at: new Date(startsAt).toISOString(), p_duration_minutes: duration, p_expected_version: slotVersion, p_reason: reason, p_client_command_id: clientCommandId });
  const result = data?.[0];
  if (!error && result?.outcome === "moved") {
    const { data: { user } } = await supabase.auth.getUser();
    const service = createServiceRoleClient() as unknown as SupabaseClient;
    const slot = await service.from("departure_slots").select("reservation_id").eq("id", slotId).single();
    if (user && slot.data?.reservation_id) {
      const access = await service.from("departure_public_accesses").select("id").eq("plan_id", planId).eq("reservation_id", slot.data.reservation_id).is("revoked_at", null).maybeSingle();
      if (access.data) await sendDepartureAppointmentEmail(access.data.id, "move_confirmation", { supabase: service, systemActorUserId: user.id });
    }
  }
  revalidatePath("/departs");
  redirect(target(planId, error ? "error" : result?.reason ?? result?.outcome ?? "error", formData));
}

export async function sendDepartureInvitationsAction(formData: FormData) {
  const planId = formData.get("plan_id");
  if (!uuid(planId)) redirect(target(null, "invalid_input", formData));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const loose = supabase as unknown as SupabaseClient;
  const { data: plan } = await loose.from("departure_plans").select("id,organization_id,status,response_deadline_at").eq("id", planId).maybeSingle();
  if (!plan || plan.status !== "published") redirect(target(planId, "plan_not_published", formData));
  const { data: membership } = await supabase.from("memberships").select("role").eq("organization_id", plan.organization_id).eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect(target(planId, "forbidden", formData));
  const service = createServiceRoleClient() as unknown as SupabaseClient;
  const links = await service.from("departure_plan_litters").select("litter_id").eq("plan_id", planId);
  const litterIds = (links.data ?? []).map((row: { litter_id: string }) => row.litter_id);
  const reservations = litterIds.length ? await service.from("reservations").select("id,litter_id").eq("organization_id", plan.organization_id).in("litter_id", litterIds).eq("status", "animal_assigned").not("animal_id", "is", null).is("deleted_at", null) : { data: [], error: null };
  if (links.error || reservations.error) redirect(target(planId, "error", formData));
  let sent = 0;
  let pending = 0;
  for (const reservation of reservations.data ?? []) {
    const incidents = await service.from("post_birth_incidents").select("id").eq("organization_id", plan.organization_id).eq("litter_id", reservation.litter_id).eq("status", "open").limit(1);
    if ((incidents.data ?? []).length) { pending += 1; continue; }
    const exceptional = await service.from("departure_slots").select("id").eq("plan_id", planId).eq("reservation_id", reservation.id).in("status", ["booked", "to_review"]).limit(1);
    if ((exceptional.data ?? []).length) continue;
    let access = await service.from("departure_public_accesses").select("id").eq("plan_id", planId).eq("reservation_id", reservation.id).is("revoked_at", null).maybeSingle();
    if (!access.data) {
      const accessId = randomUUID();
      const token = deriveDepartureToken(accessId);
      access = await service.from("departure_public_accesses").insert({ id: accessId, organization_id: plan.organization_id, plan_id: planId, reservation_id: reservation.id, token_hash: hashDepartureToken(token), token_hint: token.slice(-8), expires_at: new Date(Math.max(Date.parse(plan.response_deadline_at) + 30 * 86_400_000, Date.now() + 7 * 86_400_000)).toISOString() }).select("id").single();
    }
    if (!access.data) { pending += 1; continue; }
    const result = await sendDepartureAppointmentEmail(access.data.id, "invitation", { supabase: service, systemActorUserId: user.id });
    if (["success", "already_sent"].includes(result.outcome)) sent += 1; else pending += 1;
  }
  revalidatePath("/departs");
  redirect(target(planId, pending ? `invitations_pending_${pending}` : `invitations_sent_${sent}`, formData));
}

export async function assignDepartureSlotAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const planId = formData.get("plan_id"); const slotId = formData.get("slot_id"); const reservationId = formData.get("reservation_id");
  if (!clientCommandId || !uuid(planId) || !uuid(slotId) || !uuid(reservationId)) redirect(target(uuid(planId) ? planId : null, "invalid_input", formData));
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const result = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("assign_departure_slot", { p_slot_id: slotId, p_reservation_id: reservationId, p_client_command_id: clientCommandId });
  if (!result.error && result.data?.[0]?.outcome === "booked") {
    const service = createServiceRoleClient() as unknown as SupabaseClient; const plan = await service.from("departure_plans").select("organization_id,response_deadline_at").eq("id", planId).single();
    if (plan.data) {
      let access = await service.from("departure_public_accesses").select("id").eq("plan_id", planId).eq("reservation_id", reservationId).is("revoked_at", null).maybeSingle();
      if (!access.data) {
        const accessId = randomUUID(); const token = deriveDepartureToken(accessId);
        access = await service.from("departure_public_accesses").insert({ id: accessId, organization_id: plan.data.organization_id, plan_id: planId, reservation_id: reservationId, token_hash: hashDepartureToken(token), token_hint: token.slice(-8), expires_at: new Date(Math.max(Date.parse(plan.data.response_deadline_at ?? "") + 30 * 86_400_000, Date.now() + 7 * 86_400_000)).toISOString() }).select("id").single();
      }
      if (access.data) {
        await service.from("departure_public_accesses").update({ response_kind: "booked", responded_at: new Date().toISOString() }).eq("id", access.data.id);
        await sendDepartureAppointmentEmail(access.data.id, "booking_confirmation", { supabase: service, systemActorUserId: user.id });
      }
    }
  }
  revalidatePath("/departs"); revalidatePath("/reservations"); redirect(target(planId,result.error?"error":result.data?.[0]?.reason??result.data?.[0]?.outcome??"error",formData));
}

export async function shiftDepartureLitterAppointmentsAction(formData: FormData) {
  const clientCommandId = commandId(formData);
  const planId = formData.get("plan_id");
  const litterId = formData.get("litter_id");
  const dayDelta = Number(formData.get("day_delta"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!clientCommandId || !uuid(planId) || !uuid(litterId) || !Number.isInteger(dayDelta) || dayDelta === 0 || reason.length < 3) redirect(target(uuid(planId) ? planId : null, "invalid_input", formData));
  const supabase = await createClient();
  const result = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("shift_departure_litter_appointments", { p_plan_id: planId, p_litter_id: litterId, p_day_delta: dayDelta, p_reason: reason, p_client_command_id: clientCommandId });
  revalidatePath("/departs"); revalidatePath("/reservations");
  redirect(target(planId, result.error ? "error" : result.data?.[0]?.reason ?? result.data?.[0]?.outcome ?? "error", formData));
}
