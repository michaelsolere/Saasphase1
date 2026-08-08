import { AdopterProfileReviewView } from "./review-view";
import type { AdopterProfileWorkbenchSummary } from "./state";
import { createClient } from "@/lib/supabase/server";

export async function AdopterProfileReservationSection({
  reservationId,
  currentSexPreference,
  role,
}: {
  reservationId: string;
  currentSexPreference: string | null;
  role: string | null;
}) {
  const supabase = await createClient();
  const client = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [instanceResult, contactsResult] = await Promise.all([
    client.from("adopter_profile_questionnaire_instances").select("*").eq("reservation_id", reservationId).maybeSingle(),
    client.from("adopter_manual_contact_events").select("id, title, event_type, created_at").eq("reservation_id", reservationId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (instanceResult.error || !instanceResult.data) return null;
  const row = instanceResult.data as Record<string, unknown>;
  let invitationSentAt: string | null = null;
  if (typeof row.invitation_delivery_attempt_id === "string") {
    const attempt = await client.from("email_delivery_attempts").select("sent_at").eq("id", row.invitation_delivery_attempt_id).maybeSingle();
    invitationSentAt = typeof attempt.data?.sent_at === "string" ? attempt.data.sent_at : null;
  }
  const profile: AdopterProfileWorkbenchSummary = {
    instanceId: String(row.id), initialSexPreference: typeof row.initial_sex_preference === "string" ? row.initial_sex_preference : null, instanceCreatedAt: String(row.created_at), dueAt: String(row.due_at), invitationSentAt,
    invitationFailedAt: typeof row.invitation_last_failed_at === "string" ? row.invitation_last_failed_at : null,
    draftUpdatedAt: typeof row.draft_updated_at === "string" ? row.draft_updated_at : null,
    finalAnswers: row.final_answers && typeof row.final_answers === "object" && !Array.isArray(row.final_answers) ? row.final_answers as Record<string, unknown> : null,
    finalSubmittedAt: typeof row.final_submitted_at === "string" ? row.final_submitted_at : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
    waivedAt: typeof row.waived_at === "string" ? row.waived_at : null,
    waivedBy: typeof row.waived_by === "string" ? row.waived_by : null,
    waiverReason: typeof row.waiver_reason === "string" ? row.waiver_reason : null,
    proposedSexPreference: typeof row.proposed_sex_preference === "string" ? row.proposed_sex_preference : null,
    sexPreferenceDecision: row.sex_preference_decision === "keep" || row.sex_preference_decision === "update" ? row.sex_preference_decision : null,
    invitationDeliveryAttemptId: typeof row.invitation_delivery_attempt_id === "string" ? row.invitation_delivery_attempt_id : null,
  };
  const canAdmin = role === "owner" || role === "admin";
  return <section id="adopter-profile" className="rounded-2xl border bg-stone-50 p-5 sm:p-7"><AdopterProfileReviewView profile={profile} currentSexPreference={currentSexPreference} canAdmin={canAdmin} canWrite={canAdmin || role === "member"} returnTo={`/reservations/${reservationId}`} manualContacts={(contactsResult.data ?? []).map((contact) => ({ id: String(contact.id), label: `${String(contact.title)} · ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(String(contact.created_at)))}` }))} /></section>;
}
