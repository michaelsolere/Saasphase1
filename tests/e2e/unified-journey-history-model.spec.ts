import { expect, test } from "@playwright/test";

import {
  JOURNEY_CHRONOLOGY_PAGE_SIZE,
  buildJourneyChronology,
  type JourneyChronologySourceEntry,
} from "../../src/features/reservations/adopter-workbench-model";

function source(overrides: Partial<JourneyChronologySourceEntry> & { id: string; source: JourneyChronologySourceEntry["source"] }): JourneyChronologySourceEntry {
  return { eventType: null, label: null, detail: null, occurredAt: "2026-08-01T10:00:00.000Z", status: null, email: null, ...overrides };
}

test("builds a unified chronology containing every family source", () => {
  const entries = buildJourneyChronology([
    source({ id: "payment-1", source: "payment", label: "Paiement · paid", detail: "25 000 EUR", occurredAt: "2026-08-02T10:00:00.000Z", status: "paid" }),
    source({ id: "document-1", source: "document", label: "Contrat de réservation", detail: "signed", occurredAt: "2026-08-03T10:00:00.000Z", status: "signed" }),
    source({ id: "email-1", source: "email", label: "Votre rendez-vous de choix", occurredAt: "2026-08-04T10:00:00.000Z", status: "sent", email: { recipientEmail: "famille@example.test", subject: "Votre rendez-vous de choix", status: "sent", attemptCount: 1, lastErrorCode: null, sentAt: "2026-08-04T10:00:00.000Z", createdAt: "2026-08-04T09:59:00.000Z", attachmentCount: 2 } }),
    source({ id: "contact-1", source: "manual_contact", label: "Échange manuel · Appel", detail: "Relance au sujet du choix", occurredAt: "2026-08-05T10:00:00.000Z" }),
    source({ id: "note-1", source: "note", label: "Note interne", detail: "Famille très motivée", occurredAt: "2026-08-06T10:00:00.000Z" }),
    source({ id: "candidate-1", source: "candidate", eventType: "candidate_first_payment_accepted", detail: null, occurredAt: "2026-07-01T10:00:00.000Z" }),
    source({ id: "assignment-1", source: "assignment", eventType: "assigned", occurredAt: "2026-08-07T10:00:00.000Z" }),
    source({ id: "handover-1", source: "handover", eventType: "finalized", occurredAt: "2026-08-08T10:00:00.000Z" }),
  ]);

  expect(entries.map((entry) => entry.id)).toEqual([
    "handover-1", "assignment-1", "note-1", "contact-1", "email-1", "document-1", "payment-1", "candidate-1",
  ]);
  expect(entries.map((entry) => entry.kind)).toEqual([
    "decision", "decision", "note", "manual_contact", "email", "document", "payment", "decision",
  ]);
  expect(entries.map((entry) => entry.label)).toEqual([
    "Adoption finalisée", "Chiot attribué", "Note interne", "Échange manuel · Appel",
    "Votre rendez-vous de choix", "Contrat de réservation", "Paiement · paid", "Premier versement accepté",
  ]);
});

test("sorts chronologically descending with id as tie-break", () => {
  const entries = buildJourneyChronology([
    source({ id: "b", source: "note", label: "Note B", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "a", source: "note", label: "Note A", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "c", source: "note", label: "Note C", occurredAt: "2026-08-02T10:00:00.000Z" }),
  ]);
  expect(entries.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
});

test("hides questionnaire send decisions and keeps the received/reviewed/waived ones", () => {
  const entries = buildJourneyChronology([
    source({ id: "sent", source: "profile", eventType: "profile_questionnaire_sent", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "failed", source: "profile", eventType: "profile_questionnaire_send_failed", occurredAt: "2026-08-01T10:01:00.000Z" }),
    source({ id: "received", source: "profile", eventType: "profile_questionnaire_received", occurredAt: "2026-08-02T10:00:00.000Z" }),
    source({ id: "reviewed", source: "profile", eventType: "profile_questionnaire_reviewed", occurredAt: "2026-08-03T10:00:00.000Z" }),
    source({ id: "waived", source: "profile", eventType: "profile_questionnaire_waived", occurredAt: "2026-08-04T10:00:00.000Z" }),
    source({ id: "questionnaire-email", source: "email", label: "Questionnaire d'accompagnement", occurredAt: "2026-08-01T10:02:00.000Z", status: "sent" }),
  ]);

  expect(entries.map((entry) => entry.id)).toEqual(["waived", "reviewed", "received", "questionnaire-email"]);
  expect(entries.map((entry) => entry.label)).toEqual([
    "Profil traité par dérogation", "Questionnaire relu", "Questionnaire reçu", "Questionnaire d'accompagnement",
  ]);
});

test("hides departure planning noise and keeps published/no-slot decisions plus the appointment", () => {
  const entries = buildJourneyChronology([
    source({ id: "plan-created", source: "departure", eventType: "plan_created", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "slot-created", source: "departure", eventType: "slot_created", occurredAt: "2026-08-01T10:01:00.000Z" }),
    source({ id: "booked", source: "departure", eventType: "appointment_booked", occurredAt: "2026-08-01T10:02:00.000Z" }),
    source({ id: "published", source: "departure", eventType: "plan_published", occurredAt: "2026-08-02T10:00:00.000Z" }),
    source({ id: "no-slot", source: "departure", eventType: "no_slot_suitable", occurredAt: "2026-08-03T10:00:00.000Z" }),
    source({ id: "appointment", source: "appointment", eventType: "adoption", label: "Rendez-vous de départ", occurredAt: "2026-08-04T10:00:00.000Z" }),
  ]);

  expect(entries.map((entry) => entry.id)).toEqual(["appointment", "no-slot", "published"]);
  expect(entries.map((entry) => entry.label)).toEqual([
    "Rendez-vous de départ", "Aucun créneau convenait à la famille", "Planning des départs publié",
  ]);
});

test("hides choice planning internals and financial not_required noise", () => {
  const entries = buildJourneyChronology([
    source({ id: "choice-plan", source: "choice", eventType: "plan_created", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "choice-validated", source: "choice", eventType: "plan_validated", occurredAt: "2026-08-01T10:01:00.000Z" }),
    source({ id: "choice-adjusted", source: "choice", eventType: "slot_adjusted", occurredAt: "2026-08-01T10:02:00.000Z" }),
    source({ id: "choice-reported", source: "choice", eventType: "slot_reported", occurredAt: "2026-08-01T10:03:00.000Z" }),
    source({ id: "family-response", source: "choice", eventType: "family_response_recorded", detail: "Sur place", occurredAt: "2026-08-02T10:00:00.000Z" }),
    source({ id: "preferences", source: "choice", eventType: "ranked_preferences_saved", occurredAt: "2026-08-03T10:00:00.000Z" }),
    source({ id: "not-required", source: "financial", eventType: "not_required", occurredAt: "2026-08-04T10:00:00.000Z" }),
    source({ id: "resolved", source: "financial", eventType: "resolved", occurredAt: "2026-08-05T10:00:00.000Z" }),
  ]);

  expect(entries.map((entry) => entry.id)).toEqual(["resolved", "preferences", "family-response"]);
  expect(entries.map((entry) => entry.label)).toEqual([
    "Résolution financière résolue", "Pré-choix enregistrés", "Réponse de la famille au RDV de choix",
  ]);
  expect(entries.find((entry) => entry.id === "family-response")?.detail).toBe("Sur place");
});

test("maps the remaining decision sources with human french labels", () => {
  const entries = buildJourneyChronology([
    source({ id: "candidate-position", source: "candidate", eventType: "candidate_positioning_updated", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "candidate-partial", source: "candidate", eventType: "candidate_payment_partially_received", occurredAt: "2026-08-01T10:01:00.000Z" }),
    source({ id: "positioning", source: "positioning", eventType: "post_birth_active_order_overridden", detail: "Motif", occurredAt: "2026-08-02T10:00:00.000Z" }),
    source({ id: "position", source: "position", eventType: "confirmed", occurredAt: "2026-08-03T10:00:00.000Z", status: "confirmed" }),
    source({ id: "direct-sale", source: "direct_sale", eventType: "direct_late_sale_prepared", occurredAt: "2026-08-04T10:00:00.000Z" }),
    source({ id: "handover-reversed", source: "handover", eventType: "reversed", occurredAt: "2026-08-05T10:00:00.000Z" }),
    source({ id: "handover-incident", source: "handover", eventType: "incident_opened", occurredAt: "2026-08-05T10:01:00.000Z" }),
    source({ id: "financial-opened", source: "financial", eventType: "opened", occurredAt: "2026-08-06T10:00:00.000Z" }),
    source({ id: "financial-rectified", source: "financial", eventType: "rectified", occurredAt: "2026-08-07T10:00:00.000Z" }),
    source({ id: "financial-reconciled", source: "financial", eventType: "reconciled", occurredAt: "2026-08-08T10:00:00.000Z" }),
    source({ id: "assignment-changed", source: "assignment", eventType: "changed", occurredAt: "2026-08-09T10:00:00.000Z" }),
    source({ id: "handover-corrected", source: "handover", eventType: "date_corrected", occurredAt: "2026-08-10T10:00:00.000Z" }),
    source({ id: "choice-appointment", source: "appointment", eventType: "puppy_choice", label: "Rendez-vous de choix", occurredAt: "2026-08-11T10:00:00.000Z" }),
  ]);

  const labels = Object.fromEntries(entries.map((entry) => [entry.id, entry.label]));
  expect(labels).toMatchObject({
    "candidate-position": "Positionnement modifié",
    "candidate-partial": "Paiement partiel reçu",
    positioning: "Dérogation à l’ordre actif",
    position: "Place post-naissance confirmée",
    "direct-sale": "direct late sale prepared",
    "handover-reversed": "Adoption annulée",
    "handover-incident": "Incident ouvert",
    "financial-opened": "Résolution financière ouverte",
    "financial-rectified": "Résolution financière rectifiée",
    "financial-reconciled": "Résolution financière réconciliée",
    "assignment-changed": "Attribution modifiée",
    "handover-corrected": "Date de départ corrigée",
    "choice-appointment": "Rendez-vous de choix",
  });
});

test("keeps technical email details attached to email entries", () => {
  const entries = buildJourneyChronology([
    source({
      id: "email-1",
      source: "email",
      label: "Email · invitation",
      occurredAt: "2026-08-01T10:00:00.000Z",
      status: "failed",
      email: {
        recipientEmail: "famille@example.test",
        subject: "Invitation au rendez-vous",
        status: "failed",
        attemptCount: 3,
        lastErrorCode: "soft_bounce",
        sentAt: null,
        createdAt: "2026-08-01T09:59:00.000Z",
        attachmentCount: 0,
      },
    }),
  ]);

  expect(entries).toHaveLength(1);
  expect(entries[0]?.email).toEqual({
    recipientEmail: "famille@example.test",
    subject: "Invitation au rendez-vous",
    status: "failed",
    attemptCount: 3,
    lastErrorCode: "soft_bounce",
    sentAt: null,
    createdAt: "2026-08-01T09:59:00.000Z",
    attachmentCount: 0,
  });
});

test("drops entries without any occurrence date", () => {
  const entries = buildJourneyChronology([
    source({ id: "dated", source: "note", label: "Note datée", occurredAt: "2026-08-01T10:00:00.000Z" }),
    source({ id: "undated", source: "note", label: "Note sans date", occurredAt: null }),
  ]);
  expect(entries.map((entry) => entry.id)).toEqual(["dated"]);
});

test("paginates client side with JOURNEY_CHRONOLOGY_PAGE_SIZE visible entries and a hasMore flag", () => {
  const entries = buildJourneyChronology(
    Array.from({ length: JOURNEY_CHRONOLOGY_PAGE_SIZE + 5 }, (_, index) =>
      source({ id: `entry-${index}`, source: "note", label: `Note ${index}`, occurredAt: `2026-08-01T10:00:${String(index).padStart(2, "0")}.000Z` }),
    ),
  );

  expect(entries).toHaveLength(JOURNEY_CHRONOLOGY_PAGE_SIZE + 5);
  expect(entries.slice(0, JOURNEY_CHRONOLOGY_PAGE_SIZE)).toHaveLength(JOURNEY_CHRONOLOGY_PAGE_SIZE);
  expect(entries.length > JOURNEY_CHRONOLOGY_PAGE_SIZE).toBe(true);
});
