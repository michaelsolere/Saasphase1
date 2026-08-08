import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AdopterWorkbenchRecord,
  RecentAdopterEvent,
} from "@/features/reservations/adopter-workbench-model";
import type { Database } from "@/types/database.types";

type Client = SupabaseClient<Database>;

type RawOverview = Database["public"]["Views"]["reservation_overview"]["Row"] & {
  contact_email: string | null;
  contact_phone: string | null;
  identification_number: string | null;
  application_sex_preference: string | null;
  opening_event_at: string | null;
  historical_paid_opening_cents: number | null;
  document_count: number | null;
  signed_document_count: number | null;
  note_count: number | null;
  choice_appointment_at: string | null;
  choice_appointment_status: string | null;
  departure_appointment_at: string | null;
  departure_appointment_status: string | null;
};

function event(
  id: string,
  kind: RecentAdopterEvent["kind"],
  label: string,
  detail: string | null,
  occurredAt: string | null,
): RecentAdopterEvent | null {
  return occurredAt ? { id, kind, label, detail, occurredAt } : null;
}

export async function loadAdopterWorkbench(supabase: Client) {
  const overviewResult = await supabase
    .from("adopter_workbench_overview" as "reservation_overview")
    .select("*")
    .order("created_at", { ascending: false });
  if (overviewResult.error) throw overviewResult.error;
  const overview = (overviewResult.data ?? []) as unknown as RawOverview[];
  const ids = overview.map((row) => row.id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const [payments, documents, appointments, notes, candidateEvents, manualContacts, emails, profileSummaries, profiles, profileEvents] =
    await Promise.all([
      supabase.from("payments").select("id, reservation_id, amount_cents, currency, payment_type, status, paid_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("documents").select("id, reservation_id, title, document_type, status, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("events").select("id, reservation_id, event_type, title, description, actual_at, planned_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("notes").select("id, reservation_id, body, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("candidate_journey_events" as "adopter_financial_resolution_events").select("id, reservation_id, event_type, reason, occurred_at").in("reservation_id", ids),
      supabase.from("adopter_manual_contact_events" as "events").select("id, reservation_id, event_type, title, description, created_at").in("reservation_id", ids),
      supabase.from("email_delivery_attempts").select("id, reservation_id, message_type, status, subject_snapshot, sent_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }> }).rpc("read_adopter_profile_questionnaire_summaries", { p_reservation_ids: ids }),
      (supabase as unknown as SupabaseClient).from("adopter_profile_questionnaire_instances").select("id, reservation_id, initial_sex_preference, created_at, due_at, draft_updated_at, final_answers, final_submitted_at, reviewed_at, reviewed_by, waived_at, waived_by, waiver_reason, proposed_sex_preference, sex_preference_decision, invitation_delivery_attempt_id, invitation_last_failed_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("adopter_profile_questionnaire_events").select("id, reservation_id, event_type, details, occurred_at").in("reservation_id", ids),
    ]);

  const failed = [payments, documents, appointments, notes, candidateEvents, manualContacts, emails, profileSummaries, profiles, profileEvents].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const recentByReservation = new Map<string, RecentAdopterEvent[]>();
  const add = (reservationId: string | null, item: RecentAdopterEvent | null) => {
    if (!reservationId || !item) return;
    recentByReservation.set(reservationId, [...(recentByReservation.get(reservationId) ?? []), item]);
  };
  for (const row of payments.data ?? []) add(row.reservation_id, event(row.id, "payment", `Paiement · ${row.status}`, `${(row.amount_cents / 100).toLocaleString("fr-FR")} ${row.currency}`, row.paid_at ?? row.created_at));
  for (const row of documents.data ?? []) add(row.reservation_id, event(row.id, "document", row.title || `Document · ${row.document_type}`, row.status, row.created_at));
  for (const row of appointments.data ?? []) add(row.reservation_id, event(row.id, "appointment", row.title, row.description, row.actual_at ?? row.planned_at ?? row.created_at));
  for (const row of notes.data ?? []) add(row.reservation_id, event(row.id, "note", "Note interne", row.body, row.created_at));
  for (const row of candidateEvents.data ?? []) add(row.reservation_id, event(row.id, "decision", row.event_type.replaceAll("_", " "), row.reason, row.occurred_at));
  for (const row of manualContacts.data ?? []) add(row.reservation_id, event(row.id, "manual_contact", `${row.title} · ${row.event_type}`, row.description, row.created_at));
  for (const row of emails.data ?? []) {
    if (!row.message_type.startsWith("adopter_profile_")) add(row.reservation_id, event(row.id, "email", row.subject_snapshot || `Email · ${row.message_type}`, row.status, row.sent_at ?? row.created_at));
  }
  for (const raw of profileEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string; event_type: string; occurred_at: string; details: unknown };
    const labels: Record<string, string> = {
      profile_questionnaire_sent: "Questionnaire envoyé",
      profile_questionnaire_received: "Questionnaire reçu",
      profile_questionnaire_reviewed: "Questionnaire relu",
      profile_questionnaire_waived: "Profil traité par dérogation",
      profile_questionnaire_send_failed: "Incident d’envoi du questionnaire",
    };
    if (labels[row.event_type]) add(row.reservation_id, event(row.id, "decision", labels[row.event_type]!, null, row.occurred_at));
  }

  const emailById = new Map((emails.data ?? []).map((row) => [row.id, row]));
  const manualContactsByReservation = new Map<string, Array<{ id: string; label: string }>>();
  for (const row of manualContacts.data ?? []) {
    const reservationId = row.reservation_id;
    if (!reservationId) continue;
    manualContactsByReservation.set(reservationId, [
      ...(manualContactsByReservation.get(reservationId) ?? []),
      { id: row.id, label: `${row.title} · ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(row.created_at))}` },
    ]);
  }
  const profileByReservation = new Map<string, AdopterWorkbenchRecord["profile"]>();
  for (const raw of profileSummaries.data ?? []) {
    const row = raw as Record<string, unknown>;
    const attemptId = typeof row.invitation_delivery_attempt_id === "string" ? row.invitation_delivery_attempt_id : null;
    const attempt = attemptId ? emailById.get(attemptId) : null;
    profileByReservation.set(String(row.reservation_id), {
      instanceId: String(row.instance_id),
      initialSexPreference: null,
      instanceCreatedAt: String(row.created_at),
      dueAt: String(row.due_at),
      invitationSentAt: attempt?.sent_at ?? null,
      invitationFailedAt: typeof row.invitation_last_failed_at === "string" ? row.invitation_last_failed_at : null,
      draftUpdatedAt: typeof row.draft_updated_at === "string" ? row.draft_updated_at : null,
      finalAnswers: null,
      finalSubmittedAt: typeof row.final_submitted_at === "string" ? row.final_submitted_at : null,
      reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
      reviewedBy: null,
      waivedAt: typeof row.waived_at === "string" ? row.waived_at : null,
      waivedBy: null,
      waiverReason: null,
      proposedSexPreference: null,
      sexPreferenceDecision: null,
      invitationDeliveryAttemptId: attemptId,
    });
  }
  for (const raw of profiles.data ?? []) {
    const row = raw as Record<string, unknown>;
    const attempt = typeof row.invitation_delivery_attempt_id === "string" ? emailById.get(row.invitation_delivery_attempt_id) : null;
    profileByReservation.set(String(row.reservation_id), {
      instanceId: String(row.id),
      initialSexPreference: typeof row.initial_sex_preference === "string" ? row.initial_sex_preference : null,
      instanceCreatedAt: String(row.created_at),
      dueAt: String(row.due_at),
      invitationSentAt: attempt?.sent_at ?? null,
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
    });
  }

  return overview.map((row): AdopterWorkbenchRecord => {
    const preference = row.reserved_sex_preference ?? row.application_sex_preference;
    return {
      id: row.id!,
      contactId: row.contact_id,
      familyName: row.contact_display_name ?? "Famille sans nom",
      email: row.contact_email,
      phone: row.contact_phone,
      reference: `PAR-${row.id!.slice(0, 8).toUpperCase()}`,
      status: row.status ?? "active",
      openingEventAt: row.opening_event_at,
      historicalPaidOpeningCents: Number(row.historical_paid_opening_cents ?? 0),
      litterId: row.litter_id,
      litterName: row.litter_name,
      litterGroupId: row.litter_group_id,
      litterGroupName: row.litter_group_name,
      sexPreference: preference,
      preferenceFlexible: preference === "no_preference" || preference === "flexible",
      rank: row.rank_active,
      animalId: row.animal_id,
      animalName: row.animal_display_name,
      identificationNumber: row.identification_number,
      adoptionCompletedAt: row.adoption_completed_at,
      priceCents: row.price_cents,
      paidCents: Number(row.paid_cents ?? 0),
      refundedCents: Number(row.refunded_cents ?? 0),
      financialResolution: row.financial_resolution,
      documentCount: Number(row.document_count ?? 0),
      signedDocumentCount: Number(row.signed_document_count ?? 0),
      choiceAppointmentAt: row.choice_appointment_at,
      choiceAppointmentStatus: row.choice_appointment_status,
      departureAppointmentAt: row.departure_appointment_at,
      departureAppointmentStatus: row.departure_appointment_status,
      noteCount: Number(row.note_count ?? 0),
      profile: profileByReservation.get(row.id!) ?? null,
      manualContacts: manualContactsByReservation.get(row.id!) ?? [],
      recentEvents: (recentByReservation.get(row.id!) ?? [])
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 5),
      updatedAt: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    };
  });
}
