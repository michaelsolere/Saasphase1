import { expect, test } from "@playwright/test";

import {
  ANIMAL_HISTORY_PAGE_SIZE,
  buildAnimalHistory,
  type AnimalHistoryInput,
} from "../../src/features/animals/animal-history-model";

function makeEvent(overrides: Partial<AnimalHistoryInput["events"][number]> & { id: string }): AnimalHistoryInput["events"][number] {
  return {
    id: overrides.id,
    title: overrides.title ?? null,
    description: overrides.description ?? null,
    event_type: overrides.event_type ?? "other",
    status: overrides.status ?? "planned",
    priority: overrides.priority ?? "normal",
    planned_at: overrides.planned_at ?? null,
    planned_date: overrides.planned_date ?? null,
    actual_at: overrides.actual_at ?? null,
    created_at: "created_at" in overrides ? (overrides.created_at as string) : "2026-08-01T10:00:00.000Z",
  };
}

function makeNote(overrides: Partial<AnimalHistoryInput["notes"][number]> & { id: string }): AnimalHistoryInput["notes"][number] {
  return {
    id: overrides.id,
    title: overrides.title ?? null,
    body: overrides.body ?? "",
    note_type: overrides.note_type ?? "internal",
    visibility: overrides.visibility ?? "internal",
    created_at: overrides.created_at ?? "2026-08-01T10:00:00.000Z",
    created_by: overrides.created_by ?? null,
    profiles: overrides.profiles ?? null,
  };
}

function makeDocument(overrides: Partial<AnimalHistoryInput["documents"][number]> & { id: string }): AnimalHistoryInput["documents"][number] {
  return {
    id: overrides.id,
    title: overrides.title ?? "Document",
    document_type: overrides.document_type ?? "other",
    status: overrides.status ?? "to_generate",
    created_at: overrides.created_at ?? "2026-08-01T10:00:00.000Z",
    updated_at: overrides.updated_at ?? null,
    sent_at: overrides.sent_at ?? null,
    received_at: overrides.received_at ?? null,
    signed_at: overrides.signed_at ?? null,
    file_name: overrides.file_name ?? null,
    signature_required: overrides.signature_required ?? false,
  };
}

test("builds a unified history from events, notes and documents sorted by useful date descending", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "event-1", event_type: "vaccination", title: "Rappel vaccin", status: "done", actual_at: "2026-08-01T10:00:00.000Z" }),
    ],
    notes: [
      makeNote({ id: "note-1", body: "Note interne", note_type: "internal", created_at: "2026-08-02T10:00:00.000Z" }),
    ],
    documents: [
      makeDocument({ id: "doc-1", title: "Certificat vétérinaire", document_type: "veterinary_certificate", status: "received", received_at: "2026-08-03T10:00:00.000Z" }),
    ],
  });

  expect(entries.map((entry) => entry.id)).toEqual(["doc-1", "note-1", "event-1"]);
  expect(entries.map((entry) => entry.kind)).toEqual(["document", "note", "health"]);
});

test("sorts by useful date descending with id as tie-break", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "b", event_type: "other", actual_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "a", event_type: "other", actual_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "c", event_type: "other", actual_at: "2026-08-02T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  expect(entries.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
});

test("maps health event types to french labels", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "vaccination", event_type: "vaccination", actual_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "xray", event_type: "xray", actual_at: "2026-08-02T10:00:00.000Z" }),
      makeEvent({ id: "ultrasound", event_type: "ultrasound", actual_at: "2026-08-03T10:00:00.000Z" }),
      makeEvent({ id: "pregnancy_check", event_type: "pregnancy_check", actual_at: "2026-08-04T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  const labels = Object.fromEntries(entries.map((entry) => [entry.id, entry.label]));
  expect(labels).toMatchObject({
    vaccination: "Vaccination",
    xray: "Radiographie",
    ultrasound: "Échographie",
    pregnancy_check: "Contrôle de gestation",
  });
  expect(entries.every((entry) => entry.kind === "health")).toBe(true);
});

test("maps health_other as a health event while legacy other stays generic", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "health-other", event_type: "health_other", actual_at: "2026-08-02T10:00:00.000Z" }),
      makeEvent({ id: "legacy-other", event_type: "other", actual_at: "2026-08-01T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  expect(entries).toEqual([
    expect.objectContaining({ id: "health-other", kind: "health", label: "Autre événement de santé" }),
    expect.objectContaining({ id: "legacy-other", kind: "event", label: "Autre" }),
  ]);
});

test("maps non-health event types to french labels and kind event", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "mating", event_type: "mating", actual_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "puppy_choice", event_type: "puppy_choice", actual_at: "2026-08-02T10:00:00.000Z" }),
      makeEvent({ id: "adoption", event_type: "adoption", actual_at: "2026-08-03T10:00:00.000Z" }),
      makeEvent({ id: "birth_expected", event_type: "birth_expected", actual_at: "2026-08-04T10:00:00.000Z" }),
      makeEvent({ id: "birth_actual", event_type: "birth_actual", actual_at: "2026-08-05T10:00:00.000Z" }),
      makeEvent({ id: "post_adoption_follow_up", event_type: "post_adoption_follow_up", actual_at: "2026-08-06T10:00:00.000Z" }),
      makeEvent({ id: "contact_follow_up", event_type: "contact_follow_up", actual_at: "2026-08-07T10:00:00.000Z" }),
      makeEvent({ id: "application_review", event_type: "application_review", actual_at: "2026-08-08T10:00:00.000Z" }),
      makeEvent({ id: "payment_due", event_type: "payment_due", actual_at: "2026-08-09T10:00:00.000Z" }),
      makeEvent({ id: "document_due", event_type: "document_due", actual_at: "2026-08-10T10:00:00.000Z" }),
      makeEvent({ id: "other", event_type: "other", title: "Surveillance", actual_at: "2026-08-11T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  const labels = Object.fromEntries(entries.map((entry) => [entry.id, entry.label]));
  expect(labels).toMatchObject({
    mating: "Saillie",
    puppy_choice: "Rendez-vous de choix",
    adoption: "Adoption",
    birth_expected: "Naissance prévue",
    birth_actual: "Naissance effective",
    post_adoption_follow_up: "Suivi post-adoption",
    contact_follow_up: "Relance contact",
    application_review: "Revue de candidature",
    payment_due: "Paiement attendu",
    document_due: "Document attendu",
    other: "Surveillance",
  });
  expect(entries.every((entry) => entry.kind === "event")).toBe(true);
});

test("falls back to humanized raw event type when unknown", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "unknown", event_type: "custom_event_type", title: "Titre", actual_at: "2026-08-01T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  expect(entries[0]?.label).toBe("Titre");
  expect(entries[0]?.kind).toBe("event");
});

test("maps note types to french labels", () => {
  const { entries } = buildAnimalHistory({
    events: [],
    notes: [
      makeNote({ id: "internal", note_type: "internal", body: "Note", created_at: "2026-08-01T10:00:00.000Z" }),
      makeNote({ id: "health", note_type: "health", body: "Note santé", created_at: "2026-08-02T10:00:00.000Z" }),
      makeNote({ id: "call_summary", note_type: "call_summary", body: "Appel", created_at: "2026-08-03T10:00:00.000Z" }),
      makeNote({ id: "plaud_summary", note_type: "plaud_summary", body: "Plaud", created_at: "2026-08-04T10:00:00.000Z" }),
      makeNote({ id: "follow_up", note_type: "follow_up", body: "Suivi", created_at: "2026-08-05T10:00:00.000Z" }),
      makeNote({ id: "decision", note_type: "decision", body: "Décision", created_at: "2026-08-06T10:00:00.000Z" }),
      makeNote({ id: "other", note_type: "other", body: "Autre", created_at: "2026-08-07T10:00:00.000Z" }),
    ],
    documents: [],
  });

  const labels = Object.fromEntries(entries.map((entry) => [entry.id, entry.label]));
  expect(labels).toMatchObject({
    internal: "Note interne",
    health: "Note santé",
    call_summary: "Compte rendu d'appel",
    plaud_summary: "Résumé Plaud",
    follow_up: "Suivi",
    decision: "Décision",
    other: "Note",
  });
});

test("maps documents using title, type label and status label", () => {
  const { entries } = buildAnimalHistory({
    events: [],
    notes: [],
    documents: [
      makeDocument({ id: "doc-1", title: "Mon certificat", document_type: "veterinary_certificate", status: "received", received_at: "2026-08-01T10:00:00.000Z" }),
    ],
  });

  expect(entries[0]?.kind).toBe("document");
  expect(entries[0]?.label).toBe("Mon certificat");
  expect(entries[0]?.detail).toContain("Certificat vétérinaire");
  expect(entries[0]?.detail).toContain("Reçu");
});

test("uses document type label as fallback when title is missing", () => {
  const { entries } = buildAnimalHistory({
    events: [],
    notes: [],
    documents: [
      makeDocument({ id: "doc-1", title: "", document_type: "sale_certificate", status: "generated", created_at: "2026-08-01T10:00:00.000Z" }),
    ],
  });

  expect(entries[0]?.label).toBe("Attestation de vente");
});

test("uses useful dates in priority: actual_at, planned_at, planned_date, created_at for events", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "actual", event_type: "other", actual_at: "2026-08-04T10:00:00.000Z", planned_at: "2026-08-03T10:00:00.000Z", planned_date: "2026-08-02", created_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "planned", event_type: "other", actual_at: null, planned_at: "2026-08-03T10:00:00.000Z", planned_date: "2026-08-02", created_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "planned_date", event_type: "other", actual_at: null, planned_at: null, planned_date: "2026-08-02", created_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "created", event_type: "other", actual_at: null, planned_at: null, planned_date: null, created_at: "2026-08-01T10:00:00.000Z" }),
    ],
    notes: [],
    documents: [],
  });

  expect(entries.map((entry) => entry.id)).toEqual(["actual", "planned", "planned_date", "created"]);
  expect(entries.map((entry) => entry.occurredAt)).toEqual([
    "2026-08-04T10:00:00.000Z",
    "2026-08-03T10:00:00.000Z",
    "2026-08-02T00:00:00.000Z",
    "2026-08-01T10:00:00.000Z",
  ]);
});

test("uses useful document dates in priority: signed_at, received_at, sent_at, updated_at, created_at", () => {
  const { entries } = buildAnimalHistory({
    events: [],
    notes: [],
    documents: [
      makeDocument({ id: "signed", document_type: "other", signed_at: "2026-08-05T10:00:00.000Z", received_at: "2026-08-04T10:00:00.000Z", sent_at: "2026-08-03T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z", created_at: "2026-08-01T10:00:00.000Z" }),
      makeDocument({ id: "received", document_type: "other", signed_at: null, received_at: "2026-08-04T10:00:00.000Z", sent_at: "2026-08-03T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z", created_at: "2026-08-01T10:00:00.000Z" }),
      makeDocument({ id: "sent", document_type: "other", signed_at: null, received_at: null, sent_at: "2026-08-03T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z", created_at: "2026-08-01T10:00:00.000Z" }),
      makeDocument({ id: "updated", document_type: "other", signed_at: null, received_at: null, sent_at: null, updated_at: "2026-08-02T10:00:00.000Z", created_at: "2026-08-01T10:00:00.000Z" }),
      makeDocument({ id: "created", document_type: "other", signed_at: null, received_at: null, sent_at: null, updated_at: null, created_at: "2026-08-01T10:00:00.000Z" }),
    ],
  });

  expect(entries.map((entry) => entry.id)).toEqual(["signed", "received", "sent", "updated", "created"]);
});

test("drops entries without any exploitable date", () => {
  const { entries } = buildAnimalHistory({
    events: [
      makeEvent({ id: "dated", event_type: "other", actual_at: "2026-08-01T10:00:00.000Z" }),
      makeEvent({ id: "undated", event_type: "other", actual_at: null, planned_at: null, planned_date: null, created_at: null as unknown as string }),
    ],
    notes: [
      makeNote({ id: "note-dated", body: "A", created_at: "2026-08-02T10:00:00.000Z" }),
    ],
    documents: [
      makeDocument({ id: "doc-undated", document_type: "other", status: "to_generate", created_at: "" }),
    ],
  });

  expect(entries.map((entry) => entry.id)).toEqual(["note-dated", "dated"]);
});

test("paginates client side with page size and hasMore flag", () => {
  const { entries, hasMore } = buildAnimalHistory({
    events: Array.from({ length: ANIMAL_HISTORY_PAGE_SIZE + 5 }, (_, index) =>
      makeEvent({ id: `event-${index}`, event_type: "other", actual_at: `2026-08-01T10:00:${String(index).padStart(2, "0")}.000Z` }),
    ),
    notes: [],
    documents: [],
  });

  expect(entries).toHaveLength(ANIMAL_HISTORY_PAGE_SIZE + 5);
  expect(hasMore).toBe(true);
});

test("hasMore is false when entries fit in one page", () => {
  const { hasMore } = buildAnimalHistory({
    events: Array.from({ length: ANIMAL_HISTORY_PAGE_SIZE }, (_, index) =>
      makeEvent({ id: `event-${index}`, event_type: "other", actual_at: `2026-08-01T10:00:${String(index).padStart(2, "0")}.000Z` }),
    ),
    notes: [],
    documents: [],
  });

  expect(hasMore).toBe(false);
});

test("uses body as detail for notes", () => {
  const { entries } = buildAnimalHistory({
    events: [],
    notes: [makeNote({ id: "note-1", body: "Corps de la note", created_at: "2026-08-01T10:00:00.000Z" })],
    documents: [],
  });

  expect(entries[0]?.detail).toBe("Corps de la note");
});

test("uses description or status as detail for events", () => {
  const { entries: withDescription } = buildAnimalHistory({
    events: [makeEvent({ id: "event-1", event_type: "other", description: "Description utile", status: "done", actual_at: "2026-08-01T10:00:00.000Z" })],
    notes: [],
    documents: [],
  });

  expect(withDescription[0]?.detail).toBe("Description utile");

  const { entries: withoutDescription } = buildAnimalHistory({
    events: [makeEvent({ id: "event-2", event_type: "other", description: null, status: "done", actual_at: "2026-08-01T10:00:00.000Z" })],
    notes: [],
    documents: [],
  });

  expect(withoutDescription[0]?.detail).toBe("Fait");
});
