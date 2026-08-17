import { expect, test } from "@playwright/test";

import {
  buildAdopterWorkbenchPath,
  classifyAdopterView,
  deriveAdopterJourney,
  filterAndSortAdopterJourneys,
  groupAdopterJourneys,
  hasAcceptedJourneyOpeningProof,
  type AdopterWorkbenchRecord,
} from "../../src/features/reservations/adopter-workbench-model";

function record(overrides: Partial<AdopterWorkbenchRecord> = {}): AdopterWorkbenchRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    contactId: "20000000-0000-4000-8000-000000000001",
    familyName: "Famille Martin",
    email: "martin@example.test",
    phone: "0600000000",
    reference: "PAR-0001",
    status: "active",
    openingEventAt: "2026-08-01T10:00:00.000Z",
    historicalPaidOpeningCents: 0,
    litterId: "30000000-0000-4000-8000-000000000001",
    litterName: "Portée Alba 2026",
    litterGroupId: null,
    litterGroupName: null,
    sexPreference: "female",
    preferenceFlexible: false,
    rank: 2,
    animalId: null,
    animalName: null,
    identificationNumber: null,
    adoptionCompletedAt: null,
    priceCents: 200000,
    paidCents: 25000,
    refundedCents: 0,
    financialResolution: null,
    documentCount: 0,
    signedDocumentCount: 0,
    choiceAppointmentAt: null,
    choiceAppointmentStatus: null,
    departureAppointmentAt: null,
    departureAppointmentStatus: null,
    noteCount: 0,
    recentEvents: [],
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

test("requires an accepted payment proof and never trusts active alone", () => {
  expect(hasAcceptedJourneyOpeningProof(record())).toBe(true);
  expect(
    hasAcceptedJourneyOpeningProof(
      record({ openingEventAt: null, historicalPaidOpeningCents: 0, status: "active" }),
    ),
  ).toBe(false);
  expect(
    hasAcceptedJourneyOpeningProof(
      record({ openingEventAt: null, historicalPaidOpeningCents: 25000 }),
    ),
  ).toBe(true);
});

test("classifies current, explicitly waiting, finalized and transversal follow-up", () => {
  expect(classifyAdopterView(record())).toEqual({ primary: "current", followUp: true });
  expect(classifyAdopterView(record({ status: "waiting_for_available_sex" }))).toEqual({
    primary: "current",
    followUp: true,
  });
  expect(classifyAdopterView(record({ status: "postponed" }))).toEqual({
    primary: "waiting",
    followUp: false,
  });
  expect(classifyAdopterView(record({ status: "adopted", adoptionCompletedAt: "2026-10-01" }))).toEqual({
    primary: "finalized",
    followUp: false,
  });
  expect(classifyAdopterView(record({ status: "cancelled", financialResolution: "pending" }))).toEqual({
    primary: "finalized",
    followUp: true,
  });
});

test("derives seven milestones, first blocking gap and one prioritized action", () => {
  const journey = deriveAdopterJourney(
    record({
      documentCount: 2,
      signedDocumentCount: 2,
      animalId: "40000000-0000-4000-8000-000000000001",
      animalName: "Nova",
      identificationNumber: null,
      choiceAppointmentAt: "2026-09-01T10:00:00.000Z",
      choiceAppointmentStatus: "done",
      departureAppointmentAt: "2026-10-01T10:00:00.000Z",
      departureAppointmentStatus: "planned",
    }),
    new Date("2026-09-20T12:00:00.000Z"),
  );

  expect(journey.milestones).toHaveLength(7);
  expect(journey.milestones.map((step) => step.label)).toEqual([
    "Ouverture",
    "Profil",
    "Positionnement",
    "Réservation",
    "Choix / attribution",
    "Départ",
    "Adoption",
  ]);
  expect(journey.currentMilestone.key).toBe("profile");
  expect(journey.primaryAction.label).toBe("Vérifier l’identification");
  expect(journey.otherActionCount).toBeGreaterThan(0);
  expect(journey.milestones.find((step) => step.key === "choice_assignment")?.state).toBe("done");
});

test("groups exactly once by scope then completion, flexible preference and sex rank", () => {
  const journeys = [
    deriveAdopterJourney(record({ id: "missing", rank: null }), new Date("2026-08-10")),
    deriveAdopterJourney(record({ id: "flex", preferenceFlexible: true, rank: 3 }), new Date("2026-08-10")),
    deriveAdopterJourney(record({ id: "female-2", rank: 2, sexPreference: "female" }), new Date("2026-08-10")),
    deriveAdopterJourney(record({ id: "female-1", rank: 1, sexPreference: "female" }), new Date("2026-08-10")),
    deriveAdopterJourney(record({ id: "male", rank: 1, sexPreference: "male" }), new Date("2026-08-10")),
  ];
  const groups = groupAdopterJourneys(journeys);
  expect(groups).toHaveLength(1);
  expect(groups[0]?.sections.map((section) => section.key)).toEqual([
    "incomplete",
    "flexible",
    "female",
    "male",
  ]);
  expect(groups[0]?.sections.flatMap((section) => section.items.map((item) => item.record.id))).toEqual([
    "missing",
    "flex",
    "female-1",
    "female-2",
    "male",
  ]);
});

test("keeps positioning incomplete until scope, queue and rank are all known", () => {
  const journey = deriveAdopterJourney(
    record({ litterId: "litter-1", litterName: "Portée Alba", rank: 1, sexPreference: null }),
  );

  expect(journey.queue).toBe("incomplete");
  expect(journey.milestones.find((milestone) => milestone.key === "positioning")?.state).not.toBe("done");
});

test("searches transversally, filters the view and produces a safe restorable URL", () => {
  const current = deriveAdopterJourney(record(), new Date("2026-08-10"));
  const finalized = deriveAdopterJourney(
    record({ id: "final", familyName: "Famille Durand", status: "cancelled" }),
    new Date("2026-08-10"),
  );
  expect(
    filterAndSortAdopterJourneys([current, finalized], {
      view: "current",
      search: "alba",
      step: "all",
      actionState: "all",
      queue: "all",
      sort: "scope_queue_rank",
    }).map((item) => item.record.id),
  ).toEqual([current.record.id]);

  expect(
    buildAdopterWorkbenchPath({
      view: "follow_up",
      search: "Martin & fils",
      step: "profile",
      actionState: "due",
      queue: "female",
      sort: "deadline",
      selectedId: current.record.id,
    }),
  ).toBe(
    `/reservations?view=follow_up&q=Martin+%26+fils&step=profile&action=due&queue=female&sort=deadline&selected=${current.record.id}`,
  );
});

test("the profile milestone waits for a review proof, not only a final response", () => {
  const submitted = deriveAdopterJourney(record({
    profile: {
      instanceId: "profile-1", initialSexPreference: "male_only", instanceCreatedAt: "2026-08-01T10:00:00.000Z", dueAt: "2026-08-15T10:00:00.000Z",
      invitationSentAt: "2026-08-01T10:01:00.000Z", invitationFailedAt: null, draftUpdatedAt: null,
      finalAnswers: { household_adults: 2 }, finalSubmittedAt: "2026-08-03T10:00:00.000Z", reviewedAt: null,
      reviewedBy: null, waivedAt: null, waivedBy: null, waiverReason: null, proposedSexPreference: "female",
      sexPreferenceDecision: null, invitationDeliveryAttemptId: "attempt-1",
    },
  }));
  expect(submitted.milestones.find((step) => step.key === "profile")?.state).not.toBe("done");
  expect(submitted.actions.some((action) => action.label === "Lire le questionnaire")).toBe(true);

  const reviewed = deriveAdopterJourney(record({
    profile: { ...submitted.record.profile!, reviewedAt: "2026-08-04T10:00:00.000Z", reviewedBy: "owner-1", sexPreferenceDecision: "keep" },
  }));
  expect(reviewed.milestones.find((step) => step.key === "profile")?.state).toBe("done");
});

test("opens the guided reservation preparation from the adopter workbench", () => {
  const journey = deriveAdopterJourney(record());
  const preparation = journey.actions.find((action) => action.key === "documents");

  expect(preparation).toMatchObject({
    label: "Préparer la réservation",
    available: true,
    href: `/reservations/${journey.record.id}/preparer`,
  });
});
