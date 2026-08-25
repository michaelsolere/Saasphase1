import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import {
  buildContactChronology,
  classifyContact360,
  type Contact360SourceEntry,
  type ContactChronologyEntry,
  type Contact360JourneyReservation,
} from "@/features/contacts/contact-360-model";

type Client = SupabaseClient<Database>;

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

function emailAttachmentCount(snapshot: unknown): number | null {
  if (!Array.isArray(snapshot)) return null;
  return snapshot.length > 0 ? snapshot.length : null;
}

export function getUsefulContactDocumentDate(document: {
  signed_at: string | null;
  received_at: string | null;
  sent_at: string | null;
  updated_at: string | null;
  created_at: string;
}) {
  if (document.signed_at) return { label: "Signé le", value: document.signed_at };
  if (document.received_at) return { label: "Reçu le", value: document.received_at };
  if (document.sent_at) return { label: "Envoyé le", value: document.sent_at };
  if (document.updated_at) return { label: "Mis à jour le", value: document.updated_at };
  return { label: "Créé le", value: document.created_at };
}

// Pure read-side projection for the contact 360 view. Every query below is an
// existing table or view filtered by contact_id under standard RLS — no new
// write, no migration, no RLS change.
export async function loadContactChronologySources(
  supabase: Client,
  contactId: string,
): Promise<{
  chronology: ContactChronologyEntry[];
  reservations: Contact360JourneyReservation[];
  errors: string[];
}> {
  const [formSubmissions, applications, reservations, payments, documents, events, notes, manualContacts, emails] =
    await Promise.all([
      supabase
        .from("form_submissions")
        .select("id, submitted_at, created_at")
        .eq("contact_id", contactId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("application_overview")
        .select("id, status, species, breed, desired_sex_preference, submitted_at, created_at, public_form_name, public_form_slug")
        .eq("contact_id", contactId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("reservation_overview")
        .select("id, status, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_id, animal_display_name, reserved_sex_preference, adoption_completed_at, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at, reservation_id")
        .eq("contact_id", contactId)
        .is("deleted_at", null),
      supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("contact_id", contactId)
        .is("deleted_at", null),
      supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("contact_id", contactId)
        .is("deleted_at", null),
      supabase
        .from("notes")
        .select("id, body, created_at, created_by, profiles!created_by ( display_name )")
        .eq("contact_id", contactId)
        .eq("note_type", "internal")
        .eq("visibility", "internal"),
      supabase
        .from("adopter_manual_contacts" as "events")
        .select("id, channel, summary, contacted_at")
        .eq("contact_id", contactId),
      supabase
        .from("email_delivery_attempts")
        .select("id, message_type, status, subject_snapshot, recipient_email, attempt_count, last_error_code, sent_at, failed_at, created_at, attachments_snapshot")
        .eq("contact_id", contactId)
        .is("deleted_at", null),
    ]);

  const results = [
    formSubmissions,
    applications,
    reservations,
    payments,
    documents,
    events,
    notes,
    manualContacts,
    emails,
  ];
  const errors = results
    .map((result) => result.error)
    .filter((error): error is NonNullable<typeof error> => Boolean(error))
    .map((error) => error.message);

  const sources: Contact360SourceEntry[] = [];

  for (const row of formSubmissions.data ?? []) {
    const raw = row as { id: string; submitted_at: string | null; created_at: string | null };
    sources.push({
      id: raw.id,
      kind: "form_submission",
      label: raw.submitted_at ? "Soumission de formulaire publique reçue" : "Soumission de formulaire enregistrée",
      detail: null,
      status: null,
      occurredAt: raw.submitted_at ?? raw.created_at,
      email: null,
    });
  }

  for (const row of applications.data ?? []) {
    const raw = row as {
      id: string;
      status: string | null;
      species: string | null;
      breed: string | null;
      submitted_at: string | null;
      created_at: string | null;
    };
    const project = [raw.species, raw.breed].filter(Boolean).join(" · ") || null;
    sources.push({
      id: `application-${raw.id}`,
      kind: "application",
      label: project ? `Candidature · ${project}` : "Candidature créée",
      detail: null,
      status: raw.status,
      occurredAt: raw.submitted_at ?? raw.created_at,
      email: null,
    });
  }

  for (const row of payments.data ?? []) {
    const raw = row as {
      id: string;
      amount_cents: number;
      currency: string;
      status: string;
    };
    sources.push({
      id: `payment-${raw.id}`,
      kind: "payment",
      label: `Paiement · ${raw.status}`,
      detail: `${(raw.amount_cents / 100).toLocaleString("fr-FR")} ${raw.currency}`,
      status: raw.status,
      occurredAt: (row as { paid_at: string | null }).paid_at ?? (row as { created_at: string }).created_at,
      email: null,
    });
  }

  for (const row of documents.data ?? []) {
    const raw = row as {
      id: string;
      title: string | null;
      document_type: string;
      status: string;
      created_at: string;
      updated_at: string | null;
      sent_at: string | null;
      signed_at: string | null;
      received_at: string | null;
    };
    const useful = getUsefulContactDocumentDate(raw);
    sources.push({
      id: `document-${raw.id}`,
      kind: "document",
      label: raw.title || `Document · ${raw.document_type}`,
      detail: `${useful.label} ${useful.value}`,
      status: raw.status,
      occurredAt: useful.value,
      email: null,
    });
  }

  for (const row of events.data ?? []) {
    const raw = row as {
      id: string;
      title: string | null;
      description: string | null;
      event_type: string;
      status: string | null;
      planned_at: string | null;
      planned_date: string | null;
      actual_at: string | null;
      created_at: string;
    };
    sources.push({
      id: `event-${raw.id}`,
      kind: "appointment",
      label: raw.title || raw.event_type.replaceAll("_", " "),
      detail: raw.description ?? null,
      status: raw.status,
      occurredAt: raw.actual_at ?? raw.planned_at ?? raw.planned_date ?? raw.created_at,
      email: null,
    });
  }

  for (const row of notes.data ?? []) {
    const raw = row as {
      id: string;
      body: string;
      created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
    sources.push({
      id: `note-${raw.id}`,
      kind: "note",
      label: "Note interne",
      detail: raw.body,
      status: null,
      occurredAt: raw.created_at,
      email: null,
    });
    void profile;
  }

  for (const row of manualContacts.data ?? []) {
    const raw = row as unknown as {
      id: string;
      channel: string;
      summary: string | null;
      contacted_at: string;
    };
    sources.push({
      id: `manual-${raw.id}`,
      kind: "manual_contact",
      label: `Échange manuel · ${manualContactChannelLabel(raw.channel)}`,
      detail: raw.summary,
      status: null,
      occurredAt: raw.contacted_at,
      email: null,
    });
  }

  for (const row of emails.data ?? []) {
    const raw = row as {
      id: string;
      message_type: string;
      status: string;
      subject_snapshot: string | null;
      recipient_email: string | null;
      attempt_count: number | null;
      last_error_code: string | null;
      sent_at: string | null;
      created_at: string;
      attachments_snapshot: unknown;
    };
    sources.push({
      id: `email-${raw.id}`,
      kind: "email",
      label: raw.subject_snapshot || `Email · ${raw.message_type}`,
      detail: null,
      status: raw.status,
      occurredAt: raw.sent_at ?? raw.created_at,
      email: {
        recipientEmail: raw.recipient_email ?? null,
        subject: raw.subject_snapshot ?? null,
        status: raw.status,
        attemptCount: raw.attempt_count ?? null,
        lastErrorCode: raw.last_error_code ?? null,
        sentAt: raw.sent_at ?? null,
        createdAt: raw.created_at ?? null,
        attachmentCount: emailAttachmentCount(raw.attachments_snapshot),
      },
    });
  }

  const journeyReservations: Contact360JourneyReservation[] = (reservations.data ?? []).map(
    (row) => ({ id: (row as { id: string }).id, status: (row as { status: string | null }).status }),
  );

  return {
    chronology: buildContactChronology(sources),
    reservations: journeyReservations,
    errors,
  };
}

export function getContact360Mode(reservations: Contact360JourneyReservation[]) {
  return classifyContact360({ reservations });
}
