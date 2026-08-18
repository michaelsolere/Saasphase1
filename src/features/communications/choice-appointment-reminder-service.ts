import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendChoiceAppointmentInvitation } from "@/features/communications/choice-appointment-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/types/database.types";

export async function runChoiceAppointmentReminders() {
  const supabase = createServiceRoleClient();
  const loose = supabase as unknown as SupabaseClient;
  const due = await loose
    .from("choice_appointment_slots")
    .select("id,plan_id")
    .is("response_kind", null)
    .is("reminder_sent_at", null)
    .not("invitation_sent_at", "is", null)
    .lte("reminder_due_at", new Date().toISOString())
    .in("status", ["planned", "responded"])
    .order("reminder_due_at", { ascending: true })
    .limit(2);
  if (due.error) throw due.error;
  const slots = (due.data ?? []) as Array<{ id: string; plan_id: string }>;
  const planIds = Array.from(new Set(slots.map((slot) => slot.plan_id)));
  const plansResult = planIds.length
    ? await loose.from("choice_appointment_plans").select("id,created_by").in("id", planIds)
    : { data: [], error: null };
  if (plansResult.error) throw plansResult.error;
  const actors = new Map(((plansResult.data ?? []) as Array<{ id: string; created_by: string }>).map((plan) => [plan.id, plan.created_by]));
  const summary = { checked: slots.length, sent: 0, alreadySent: 0, inProgress: 0, uncertain: 0, failed: 0 };
  for (const slot of slots) {
    const actor = actors.get(slot.plan_id);
    if (!actor) { summary.failed += 1; continue; }
    const result = await sendChoiceAppointmentInvitation(slot.id, {
      supabase: supabase as SupabaseClient<Database>,
      kind: "reminder",
      systemActorUserId: actor,
    });
    if (result.outcome === "success") summary.sent += 1;
    else if (result.outcome === "already_sent") summary.alreadySent += 1;
    else if (result.outcome === "in_progress") summary.inProgress += 1;
    else if (result.outcome === "uncertain") summary.uncertain += 1;
    else summary.failed += 1;
  }
  return summary;
}
