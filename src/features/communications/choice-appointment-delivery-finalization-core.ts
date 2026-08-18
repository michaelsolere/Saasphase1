import type { SupabaseClient } from "@supabase/supabase-js";

export async function finalizeChoiceAppointmentDelivery(
  input: {
    kind: "invitation" | "reminder";
    attemptId: string;
    sentAt: string;
    organizationId: string;
    planId: string;
    slotId: string;
    reservationId: string;
  },
  service: SupabaseClient,
) {
  const access = await service
    .from("choice_appointment_accesses")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("slot_id", input.slotId)
    .is("revoked_at", null)
    .maybeSingle();
  if (access.error || !access.data) {
    return { ok: false as const, errorCode: "choice_access_missing" };
  }
  const slotRead = await service
    .from("choice_appointment_slots")
    .select("invitation_delivery_attempt_id,reminder_delivery_attempt_id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.slotId)
    .maybeSingle();
  if (slotRead.error || !slotRead.data) {
    return { ok: false as const, errorCode: "choice_slot_missing" };
  }
  const currentAttemptId = input.kind === "invitation"
    ? slotRead.data.invitation_delivery_attempt_id
    : slotRead.data.reminder_delivery_attempt_id;
  if (currentAttemptId && currentAttemptId !== input.attemptId) {
    return { ok: false as const, errorCode: `${input.kind}_attempt_conflict` };
  }
  const planRead = await service
    .from("choice_appointment_plans")
    .select("sent_at")
    .eq("organization_id", input.organizationId)
    .eq("id", input.planId)
    .maybeSingle();
  if (planRead.error || !planRead.data) {
    return { ok: false as const, errorCode: "choice_plan_missing" };
  }
  const planUpdate = await service
    .from("choice_appointment_plans")
    .update({
      status: "sent",
      sent_at: planRead.data.sent_at ?? input.sentAt,
      updated_at: input.sentAt,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.planId)
    .in("status", ["validated", "sending", "sent"])
    .select("id,status,sent_at")
    .maybeSingle();
  if (planUpdate.error || !planUpdate.data) {
    return { ok: false as const, errorCode: "choice_plan_finalize_failed" };
  }
  const slotUpdate = currentAttemptId === input.attemptId
    ? { data: { id: input.slotId }, error: null }
    : input.kind === "invitation"
      ? await service
        .from("choice_appointment_slots")
        .update({
          invitation_delivery_attempt_id: input.attemptId,
          invitation_sent_at: input.sentAt,
          reminder_due_at: new Date(
            Date.parse(input.sentAt) + 3 * 86_400_000,
          ).toISOString(),
          updated_at: input.sentAt,
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.slotId)
        .is("invitation_delivery_attempt_id", null)
        .select("id,invitation_delivery_attempt_id")
        .maybeSingle()
      : await service
        .from("choice_appointment_slots")
        .update({
          reminder_delivery_attempt_id: input.attemptId,
          reminder_sent_at: input.sentAt,
          updated_at: input.sentAt,
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.slotId)
        .is("reminder_delivery_attempt_id", null)
        .select("id,reminder_delivery_attempt_id")
        .maybeSingle();
  if (slotUpdate.error || !slotUpdate.data) {
    return { ok: false as const, errorCode: `${input.kind}_slot_finalize_failed` };
  }
  const eventInsert = await service.from("choice_appointment_events").insert({
    organization_id: input.organizationId,
    plan_id: input.planId,
    slot_id: input.slotId,
    reservation_id: input.reservationId,
    event_type: input.kind === "reminder" ? "reminder_sent" : "invitation_sent",
    actor_kind: "system",
    details: { accessId: String(access.data.id), attemptId: input.attemptId },
    client_command_id: input.attemptId,
  });
  if (eventInsert.error && eventInsert.error.code !== "23505") {
    return { ok: false as const, errorCode: `${input.kind}_event_finalize_failed` };
  }
  return { ok: true as const };
}
