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

  const [payments, documents, appointments, notes, candidateEvents, manualContacts, emails] =
    await Promise.all([
      supabase.from("payments").select("id, reservation_id, amount_cents, currency, payment_type, status, paid_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("documents").select("id, reservation_id, title, document_type, status, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("events").select("id, reservation_id, event_type, title, description, actual_at, planned_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("notes").select("id, reservation_id, body, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("candidate_journey_events" as "adopter_financial_resolution_events").select("id, reservation_id, event_type, reason, occurred_at").in("reservation_id", ids),
      supabase.from("adopter_manual_contact_events" as "events").select("id, reservation_id, event_type, title, description, created_at").in("reservation_id", ids),
      supabase.from("email_delivery_attempts").select("id, reservation_id, message_type, status, subject_snapshot, sent_at, created_at").in("reservation_id", ids).is("deleted_at", null),
    ]);

  const failed = [payments, documents, appointments, notes, candidateEvents, manualContacts, emails].find((result) => result.error);
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
  for (const row of emails.data ?? []) add(row.reservation_id, event(row.id, "email", row.subject_snapshot || `Email · ${row.message_type}`, row.status, row.sent_at ?? row.created_at));

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
      recentEvents: (recentByReservation.get(row.id!) ?? [])
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 5),
      updatedAt: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    };
  });
}
