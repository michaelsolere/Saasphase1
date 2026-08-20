import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
} from "@/features/documents/formatters";

export const ANIMAL_HISTORY_PAGE_SIZE = 30;

export type AnimalHistoryKind = "health" | "event" | "note" | "document";

export type AnimalHistoryEntry = {
  id: string;
  kind: AnimalHistoryKind;
  label: string;
  detail: string | null;
  occurredAt: string;
};

type RelatedEvent = {
  id: string;
  title: string | null;
  description: string | null;
  event_type: string;
  status: string;
  priority: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};

type RelatedNote = {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  visibility: string;
  created_at: string;
  created_by: string | null;
  profiles: { display_name: string | null } | null;
};

type RelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  signed_at: string | null;
  file_name: string | null;
  signature_required: boolean;
};

export type AnimalHistoryInput = {
  events: RelatedEvent[];
  notes: RelatedNote[];
  documents: RelatedDocument[];
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  mating: "Saillie",
  pregnancy_check: "Contrôle de gestation",
  ultrasound: "Échographie",
  vaccination: "Vaccination",
  xray: "Radiographie",
  birth_expected: "Naissance prévue",
  birth_actual: "Naissance effective",
  puppy_choice: "Rendez-vous de choix",
  adoption: "Adoption",
  post_adoption_follow_up: "Suivi post-adoption",
  contact_follow_up: "Relance contact",
  application_review: "Revue de candidature",
  payment_due: "Paiement attendu",
  document_due: "Document attendu",
  other: "Autre",
};

const EVENT_STATUS_LABELS: Record<string, string> = {
  planned: "Planifié",
  todo: "À faire",
  in_progress: "En cours",
  done: "Fait",
  late: "En retard",
  cancelled: "Annulé",
  postponed: "Reporté",
  not_applicable: "Sans objet",
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  internal: "Note interne",
  call_summary: "Compte rendu d'appel",
  plaud_summary: "Résumé Plaud",
  follow_up: "Suivi",
  decision: "Décision",
  health: "Note santé",
  other: "Note",
};

const HEALTH_EVENT_TYPES = new Set([
  "vaccination",
  "xray",
  "ultrasound",
  "pregnancy_check",
]);

function isHealthEvent(eventType: string): boolean {
  return HEALTH_EVENT_TYPES.has(eventType);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function getUsefulEventDate(event: RelatedEvent): string | null {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at ?? null;
}

function normalizeDate(value: string | null): string | null {
  if (!value || value === "null" || value === "undefined") return null;
  //planned_date is a date-only string; normalize it to midnight UTC for stable sorting.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return value;
}

function getUsefulDocumentDate(document: RelatedDocument): string | null {
  return (
    document.signed_at ??
    document.received_at ??
    document.sent_at ??
    document.updated_at ??
    document.created_at ??
    null
  );
}

function buildEventEntry(event: RelatedEvent): AnimalHistoryEntry | null {
  const rawDate = getUsefulEventDate(event);
  const occurredAt = normalizeDate(rawDate);
  if (!occurredAt) return null;

  const eventTypeLabel = EVENT_TYPE_LABELS[event.event_type] ?? humanize(event.event_type);
  const label = event.title?.trim() || eventTypeLabel;
  const detail = event.description?.trim() || (EVENT_STATUS_LABELS[event.status] ?? humanize(event.status));
  const kind: AnimalHistoryKind = isHealthEvent(event.event_type) ? "health" : "event";

  return {
    id: event.id,
    kind,
    label,
    detail,
    occurredAt,
  };
}

function buildNoteEntry(note: RelatedNote): AnimalHistoryEntry | null {
  const occurredAt = normalizeDate(note.created_at);
  if (!occurredAt) return null;

  const label = NOTE_TYPE_LABELS[note.note_type] ?? humanize(note.note_type);
  const detail = note.body?.trim() || null;

  return {
    id: note.id,
    kind: "note",
    label,
    detail,
    occurredAt,
  };
}

function buildDocumentEntry(document: RelatedDocument): AnimalHistoryEntry | null {
  const occurredAt = normalizeDate(getUsefulDocumentDate(document));
  if (!occurredAt) return null;

  const typeLabel = getDocumentTypeLabel(document.document_type);
  const label = document.title?.trim() || typeLabel;
  const statusLabel = getDocumentStatusLabel(document.status, document.document_type);
  const detail = `${typeLabel} · ${statusLabel}`;

  return {
    id: document.id,
    kind: "document",
    label,
    detail,
    occurredAt,
  };
}

export function buildAnimalHistory(input: AnimalHistoryInput): {
  entries: AnimalHistoryEntry[];
  hasMore: boolean;
} {
  const rawEntries: AnimalHistoryEntry[] = [
    ...input.events.map(buildEventEntry),
    ...input.notes.map(buildNoteEntry),
    ...input.documents.map(buildDocumentEntry),
  ].filter((entry): entry is AnimalHistoryEntry => entry !== null);

  const entries = rawEntries.sort((a, b) => {
    if (a.occurredAt < b.occurredAt) return 1;
    if (a.occurredAt > b.occurredAt) return -1;
    return b.id.localeCompare(a.id);
  });

  const hasMore = entries.length > ANIMAL_HISTORY_PAGE_SIZE;

  return { entries, hasMore };
}
