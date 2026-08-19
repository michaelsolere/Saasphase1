import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildJourneyChronology,
  type JourneyChronologyEmailDetails,
  type JourneyChronologySourceEntry,
  type AdopterWorkbenchRecord,
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

const MANUAL_CONTACT_CHANNEL_LABELS: Record<string, string> = {
  phone: "Appel",
  sms: "SMS",
  external_email: "Email externe",
  visit: "Visite",
  video: "Visio",
  other: "Autre",
};

function manualContactChannelLabel(channel: string) {
  return MANUAL_CONTACT_CHANNEL_LABELS[channel] ?? channel;
}

export async function loadAdopterWorkbench(supabase: Client, organizationId?: string | null) {
  let overviewQuery = supabase
    .from("adopter_workbench_overview" as "reservation_overview")
    .select("*");
  if (organizationId) overviewQuery = overviewQuery.eq("organization_id", organizationId);
  const overviewResult = await overviewQuery.order("created_at", { ascending: false });
  if (overviewResult.error) throw overviewResult.error;
  const overview = (overviewResult.data ?? []) as unknown as RawOverview[];
  const ids = overview.map((row) => row.id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const [payments, documents, appointments, notes, candidateEvents, manualContacts, emails, profileSummaries, profiles, profileEvents, positions, directSaleEvents, departureSlots, choiceEvents, departureEvents, assignmentEvents, handoverEvents, financialEvents] =
    await Promise.all([
      supabase.from("payments").select("id, reservation_id, amount_cents, currency, payment_type, status, paid_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("documents").select("id, reservation_id, animal_id, title, document_type, status, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("events").select("id, reservation_id, event_type, title, description, status, actual_at, planned_at, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("notes").select("id, reservation_id, body, created_at").in("reservation_id", ids).is("deleted_at", null),
      supabase.from("candidate_journey_events" as "adopter_financial_resolution_events").select("id, reservation_id, event_type, reason, occurred_at").in("reservation_id", ids),
      supabase.from("adopter_manual_contact_events" as "events").select("id, reservation_id, event_type, title, description, created_at").in("reservation_id", ids),
      supabase.from("email_delivery_attempts").select("id, reservation_id, message_type, status, subject_snapshot, recipient_email, attempt_count, last_error_code, sent_at, failed_at, created_at, attachments_snapshot").in("reservation_id", ids).is("deleted_at", null),
      (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }> }).rpc("read_adopter_profile_questionnaire_summaries", { p_reservation_ids: ids }),
      (supabase as unknown as SupabaseClient).from("adopter_profile_questionnaire_instances").select("id, reservation_id, initial_sex_preference, created_at, due_at, draft_updated_at, final_answers, final_submitted_at, reviewed_at, reviewed_by, waived_at, waived_by, waiver_reason, proposed_sex_preference, sex_preference_decision, invitation_delivery_attempt_id, invitation_last_failed_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("adopter_profile_questionnaire_events").select("id, reservation_id, event_type, details, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("post_birth_positions").select("id, reservation_id, status, confirmed_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("direct_late_sale_events").select("id, reservation_id, event_type, reason, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("departure_slots").select("id,reservation_id,starts_at,status,confirmed_at,updated_at").in("reservation_id", ids).order("updated_at", { ascending: false }),
      (supabase as unknown as SupabaseClient).from("choice_appointment_events").select("id, reservation_id, event_type, details, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("departure_events").select("id, reservation_id, event_type, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("animal_assignment_events").select("id, reservation_id, event_type, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("adoption_handover_events").select("id, reservation_id, event_type, occurred_at").in("reservation_id", ids),
      (supabase as unknown as SupabaseClient).from("adopter_financial_resolution_events").select("id, reservation_id, event_type, occurred_at").in("reservation_id", ids),
    ]);

  const failed = [payments, documents, appointments, notes, candidateEvents, manualContacts, emails, profileSummaries, profiles, profileEvents, positions, directSaleEvents, departureSlots, choiceEvents, departureEvents, assignmentEvents, handoverEvents, financialEvents].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const departureSlotByReservation = new Map<string, { starts_at: string; status: string; confirmed_at: string | null }>();
  for (const raw of departureSlots.data ?? []) {
    const slot = raw as { reservation_id: string | null; starts_at: string; status: string; confirmed_at: string | null };
    if (slot.reservation_id && !departureSlotByReservation.has(slot.reservation_id)) departureSlotByReservation.set(slot.reservation_id, slot);
  }

  const loose = supabase as unknown as SupabaseClient;
  const [positioningLines, positioningWaves, capacities, litters, positioningEvents] = await Promise.all([
    loose.from("post_birth_positioning_lines").select("id, wave_id, reservation_id, proposed_sex, proposed_outcome, blocker_code, rank_snapshot, active_order, has_order_override, preference_exception_active, stale_reason, updated_at").in("reservation_id", ids),
    loose.from("post_birth_positioning_waves").select("id, draft_id, litter_id, wave_kind, status, version"),
    loose.from("post_birth_capacity_states").select("litter_id, male_total, female_total, male_preserved, female_preserved, male_uncertain, female_uncertain"),
    loose.from("litters").select("id, name").is("deleted_at", null),
    loose.from("post_birth_positioning_events").select("id, reservation_id, event_type, reason, details, occurred_at").in("reservation_id", ids),
  ]);
  const positioningFailure = [positioningLines, positioningWaves, capacities, litters, positioningEvents].find((result) => result.error);
  if (positioningFailure?.error) throw positioningFailure.error;

  const sourceByReservation = new Map<string, JourneyChronologySourceEntry[]>();
  const add = (reservationId: string | null, item: Omit<JourneyChronologySourceEntry, "occurredAt"> & { occurredAt: string | null }) => {
    if (!reservationId || !item.occurredAt) return;
    const entry = { ...item, occurredAt: item.occurredAt } as JourneyChronologySourceEntry;
    sourceByReservation.set(reservationId, [...(sourceByReservation.get(reservationId) ?? []), entry]);
  };
  const emailAttachmentCount = (snapshot: unknown): number | null => {
    if (!Array.isArray(snapshot)) return null;
    return snapshot.length > 0 ? snapshot.length : null;
  };
  for (const row of payments.data ?? []) add(row.reservation_id, { id: row.id, source: "payment", eventType: null, label: `Paiement · ${row.status}`, detail: `${(row.amount_cents / 100).toLocaleString("fr-FR")} ${row.currency}`, occurredAt: row.paid_at ?? row.created_at, status: row.status, email: null });
  for (const row of documents.data ?? []) add(row.reservation_id, { id: row.id, source: "document", eventType: null, label: row.title || `Document · ${row.document_type}`, detail: row.status, occurredAt: row.created_at, status: row.status, email: null });
  for (const row of appointments.data ?? []) {
    if (row.event_type !== "puppy_choice" && row.event_type !== "adoption") continue;
    add(row.reservation_id, { id: row.id, source: "appointment", eventType: row.event_type, label: row.event_type === "puppy_choice" ? "Rendez-vous de choix" : "Rendez-vous de départ", detail: row.description ?? row.status, occurredAt: row.actual_at ?? row.planned_at ?? row.created_at, status: row.status, email: null });
  }
  for (const row of notes.data ?? []) add(row.reservation_id, { id: row.id, source: "note", eventType: null, label: "Note interne", detail: row.body, occurredAt: row.created_at, status: null, email: null });
  for (const row of candidateEvents.data ?? []) add(row.reservation_id, { id: row.id, source: "candidate", eventType: row.event_type, label: null, detail: row.reason, occurredAt: row.occurred_at, status: null, email: null });
  for (const row of manualContacts.data ?? []) add(row.reservation_id, { id: row.id, source: "manual_contact", eventType: row.event_type, label: `Échange manuel · ${manualContactChannelLabel(row.event_type)}`, detail: row.description, occurredAt: row.created_at, status: null, email: null });
  for (const row of emails.data ?? []) {
    add(row.reservation_id, {
      id: row.id, source: "email", eventType: row.message_type, label: row.subject_snapshot || `Email · ${row.message_type}`, detail: null,
      occurredAt: row.sent_at ?? row.created_at, status: row.status,
      email: {
        recipientEmail: row.recipient_email ?? null,
        subject: row.subject_snapshot ?? null,
        status: row.status,
        attemptCount: row.attempt_count ?? null,
        lastErrorCode: row.last_error_code ?? null,
        sentAt: row.sent_at ?? null,
        createdAt: row.created_at ?? null,
        attachmentCount: emailAttachmentCount(row.attachments_snapshot),
      },
    });
  }
  for (const raw of profileEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string; event_type: string; occurred_at: string; details: unknown };
    add(row.reservation_id, { id: row.id, source: "profile", eventType: row.event_type, label: null, detail: null, occurredAt: row.occurred_at, status: null, email: null });
  }

  const positionByReservation = new Map<string, string>();
  for (const raw of positions.data ?? []) {
    const row = raw as { id: string; reservation_id: string; status: string; confirmed_at: string | null };
    positionByReservation.set(row.reservation_id, row.status);
    add(row.reservation_id, { id: row.id, source: "position", eventType: row.status, label: null, detail: null, occurredAt: row.confirmed_at, status: row.status, email: null });
  }
  for (const raw of directSaleEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string; event_type: string; reason: string | null; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "direct_sale", eventType: row.event_type, label: null, detail: row.reason, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of positioningEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; reason: string | null; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "positioning", eventType: row.event_type, label: null, detail: row.reason, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of choiceEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; details: Record<string, unknown> | null; occurred_at: string };
    const responseKind = row.details && typeof row.details === "object" ? String((row.details as Record<string, unknown>).responseKind ?? "") : "";
    add(row.reservation_id, { id: row.id, source: "choice", eventType: row.event_type, label: null, detail: responseKind || null, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of departureEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "departure", eventType: row.event_type, label: null, detail: null, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of assignmentEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "assignment", eventType: row.event_type, label: null, detail: null, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of handoverEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "handover", eventType: row.event_type, label: null, detail: null, occurredAt: row.occurred_at, status: null, email: null });
  }
  for (const raw of financialEvents.data ?? []) {
    const row = raw as { id: string; reservation_id: string | null; event_type: string; occurred_at: string };
    add(row.reservation_id, { id: row.id, source: "financial", eventType: row.event_type, label: null, detail: null, occurredAt: row.occurred_at, status: null, email: null });
  }

  type PositioningWave = { id: string; draft_id: string; litter_id: string; wave_kind: string; status: string; version: number };
  type PositioningLine = { id: string; wave_id: string; reservation_id: string; proposed_sex: string | null; proposed_outcome: string; blocker_code: string | null; rank_snapshot: number; active_order: number | null; has_order_override: boolean; preference_exception_active: boolean; stale_reason: string | null; updated_at: string };
  const waveById = new Map((positioningWaves.data ?? []).map((raw) => { const wave = raw as PositioningWave; return [wave.id, wave]; }));
  const litterNameById = new Map((litters.data ?? []).map((raw) => { const litter = raw as { id: string; name: string }; return [litter.id, litter.name]; }));
  const capacityByLitter = new Map((capacities.data ?? []).map((raw) => {
    const capacity = raw as { litter_id: string; male_total: number; female_total: number; male_preserved: number; female_preserved: number; male_uncertain: number; female_uncertain: number };
    return [capacity.litter_id, capacity];
  }));
  const openWaves = [...waveById.values()].filter((wave) => wave.status === "open");
  const activeLines = (positioningLines.data ?? [])
    .map((raw) => raw as PositioningLine)
    .filter((line) => waveById.get(line.wave_id)?.status === "open");
  const positioningByReservation = new Map<string, AdopterWorkbenchRecord["positioning"]>();
  for (const line of activeLines) {
    const wave = waveById.get(line.wave_id);
    if (!wave || (line.proposed_sex !== "male" && line.proposed_sex !== "female")) continue;
    const file = activeLines
      .filter((candidate) => candidate.wave_id === line.wave_id && candidate.proposed_sex === line.proposed_sex && candidate.proposed_outcome === "place")
      .sort((left, right) => (left.active_order ?? left.rank_snapshot) - (right.active_order ?? right.rank_snapshot) || left.id.localeCompare(right.id));
    const activeOrder = line.active_order ?? file.findIndex((candidate) => candidate.id === line.id) + 1;
    const capacity = capacityByLitter.get(wave.litter_id);
    const fileCapacity = line.proposed_sex === "male"
      ? (capacity?.male_total ?? 0) - (capacity?.male_preserved ?? 0) - (capacity?.male_uncertain ?? 0)
      : (capacity?.female_total ?? 0) - (capacity?.female_preserved ?? 0) - (capacity?.female_uncertain ?? 0);
    const operationalState = line.proposed_outcome === "blocked" ? "Bloquée"
      : line.proposed_outcome === "postponed" ? "Reportée"
        : line.proposed_outcome === "withdrawn" ? "Retirée"
          : activeOrder > fileCapacity ? "Hors capacité"
            : line.stale_reason || line.blocker_code ? "À vérifier" : "Prête";
    const options = openWaves
      .filter((candidate) => candidate.draft_id === wave.draft_id && candidate.wave_kind === wave.wave_kind && capacityByLitter.has(candidate.litter_id))
      .flatMap((candidate) => (["female", "male"] as const).map((sex) => ({ litterId: candidate.litter_id, litterName: litterNameById.get(candidate.litter_id) ?? "Portée", sex })));
    positioningByReservation.set(line.reservation_id, {
      lineId: line.id,
      waveId: wave.id,
      waveVersion: wave.version,
      litterId: wave.litter_id,
      litterName: litterNameById.get(wave.litter_id) ?? "Portée",
      sex: line.proposed_sex,
      historicalRank: line.rank_snapshot,
      activeOrder,
      fileSize: file.length,
      fileCapacity,
      hasOrderOverride: line.has_order_override,
      preferenceExceptionActive: line.preference_exception_active,
      capacityOverflow: activeOrder > fileCapacity,
      operationalState,
      options,
    });
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
    const saleCertificate = (documents.data ?? []).find((document) => document.reservation_id === row.id && document.animal_id === row.animal_id && document.document_type === "sale_certificate");
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
      positioning: positioningByReservation.get(row.id!) ?? null,
      postBirthPositionStatus: positionByReservation.get(row.id!) ?? null,
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
      saleCertificateGenerated: Boolean(saleCertificate),
      saleCertificateSigned: saleCertificate?.status === "signed",
      choiceAppointmentAt: row.choice_appointment_at,
      choiceAppointmentStatus: row.choice_appointment_status,
      departureAppointmentAt: departureSlotByReservation.get(row.id!)?.starts_at ?? row.departure_appointment_at,
      departureAppointmentStatus: (() => { const slot = departureSlotByReservation.get(row.id!); return slot ? (["booked","late","to_review","completed"].includes(slot.status) && slot.confirmed_at ? "done" : slot.status === "cancelled" || slot.status === "no_show" ? "cancelled" : "planned") : row.departure_appointment_status; })(),
      noteCount: Number(row.note_count ?? 0),
      profile: profileByReservation.get(row.id!) ?? null,
      manualContacts: manualContactsByReservation.get(row.id!) ?? [],
      chronology: buildJourneyChronology(sourceByReservation.get(row.id!) ?? []),
      updatedAt: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    };
  });
}
