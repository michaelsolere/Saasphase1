import { expect, test } from "@playwright/test";

import {
  buildLitterUnifiedHistoryInput,
} from "../../src/features/litter-journal/litter-unified-history-projection";
import { buildUnifiedHistory } from "../../src/features/litter-journal/unified-history-model";

const baseSession = {
  id: "session-1",
  revisionNo: 0,
  measuredAt: "2026-06-26T09:42:00.000Z",
  timezoneName: "Europe/Paris",
  note: null,
  measurementCount: 8,
  averageGrams: 612,
  minimumGrams: 589,
  maximumGrams: 631,
  createdBy: "user-1",
  createdAt: "2026-06-26T09:43:00.000Z",
};

const baseObservation = {
  id: "obs-1",
  litterId: "litter-1",
  motherId: "mother-1",
  observationType: "temperature" as const,
  observedAt: "2026-06-25T18:15:00.000Z",
  timezoneName: "Europe/Paris",
  numericValue: 38.5,
  unit: "celsius" as const,
  severity: "routine" as const,
  note: null,
  clientCommandId: "cmd-1",
  createdAt: "2026-06-25T18:16:00.000Z",
  updatedAt: "2026-06-25T18:16:00.000Z",
  createdBy: null,
  satisfiedTask: null,
};

const baseTask = {
  id: "task-1",
  litterId: "litter-1",
  source: "system_template" as const,
  litterPlanItemId: null,
  litterPlanSeriesId: null,
  organizationTemplateId: null,
  systemTemplateCode: null,
  occurrenceNo: 1,
  recurrenceDayNo: null,
  slotNo: null,
  seriesState: null,
  category: "offspring_health" as const,
  targetScope: "litter" as const,
  title: "Première sortie de caisse",
  description: null,
  anchorType: null,
  anchorDate: null,
  offsetDays: null,
  itemKind: "milestone" as const,
  priority: "normal" as const,
  suggestedFor: "2026-06-25",
  suggestedLocalTime: null,
  plannedFor: "2026-06-25",
  scheduledLocalTime: null,
  scheduleTimezoneName: "Europe/Paris",
  suggestedStartsOn: null,
  suggestedStartsLocalTime: null,
  suggestedEndsOn: null,
  suggestedEndsLocalTime: null,
  retainedStartsOn: null,
  retainedStartsLocalTime: null,
  retainedEndsOn: null,
  retainedEndsLocalTime: null,
  scheduleSource: "suggested" as const,
  isScheduleLocked: false,
  scheduleLockedAt: null,
  scheduleLockedBy: null,
  revisionNo: 0,
  status: "done" as const,
  resolvedAt: "2026-06-25T10:30:00.000Z",
  resolvedTimezoneName: "Europe/Paris",
  resolvedBy: "user-1",
  resolutionNote: null,
  completionOrigin: "manual" as const,
  completionFact: null,
  createdAt: "2026-06-01T00:00:00.000Z",
};

test("projette une séance de pesée avec moyenne et couverture", () => {
  const entries = buildLitterUnifiedHistoryInput({
    weightSessions: [baseSession],
    maternalObservations: [],
    careTasks: [],
    whelpingEvents: [],
    whelpingBirths: [],
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]?.kind).toBe("weighing_session");
  expect(entries[0]?.detail).toContain("8 mesures");
  expect(entries[0]?.detail).toContain("moyenne 612 g");
});

test("projette une observation maternelle avec sa mesure", () => {
  const entries = buildLitterUnifiedHistoryInput({
    weightSessions: [],
    maternalObservations: [baseObservation],
    careTasks: [],
    whelpingEvents: [],
    whelpingBirths: [],
  });
  expect(entries[0]?.label).toBe("Observation de la mère — Température");
  expect(entries[0]?.detail).toContain("38.5 celsius");
});

test("n'inclut que les jalons de soins réalisés", () => {
  const entries = buildLitterUnifiedHistoryInput({
    weightSessions: [],
    maternalObservations: [],
    careTasks: [
      baseTask,
      { ...baseTask, id: "task-planned", status: "planned" as const },
      { ...baseTask, id: "task-cancelled", status: "cancelled" as const },
    ],
    whelpingEvents: [],
    whelpingBirths: [],
  });
  expect(entries.map((entry) => entry.id)).toEqual(["care-task-task-1"]);
});

test("projette une naissance avec ordre, sexe et collier", () => {
  const event = {
    id: "event-1",
    sessionId: "session-w1",
    sequenceNo: 1,
    occurredAt: "2026-06-14T01:12:00.000Z",
    recordedAt: "2026-06-14T01:13:00.000Z",
    eventType: "birth" as const,
    note: null,
    authorId: "user-1",
  };
  const birth = {
    id: "birth-1",
    sessionId: "session-w1",
    birthOrder: 3,
    sex: "female" as const,
    viability: "alive" as const,
    initialCollarColor: "rose",
    revisionNo: 0,
    occurredAt: event.occurredAt,
    note: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: event.recordedAt,
    createdBy: "user-1",
    event,
    animal: {
      id: "animal-1",
      litterId: "litter-1",
      motherId: "mother-1",
      fatherId: "father-1",
      species: "dog",
      breed: "Golden Retriever",
      sex: "female" as const,
      status: "born",
      ownershipStatus: "breeder",
      birthDate: "2026-06-14",
      birthTime: "01:12",
      birthOrder: 3,
      birthWeightGrams: null,
      collarColorInitial: "rose",
      collarColorCurrent: "rose",
      deathDate: null,
    },
    birthWeightMeasurement: null,
  };
  const entries = buildLitterUnifiedHistoryInput({
    weightSessions: [],
    maternalObservations: [],
    careTasks: [],
    whelpingEvents: [event],
    whelpingBirths: [birth],
  });
  expect(entries[0]?.label).toBe("Naissance (3)");
  expect(entries[0]?.detail).toContain("femelle");
  expect(entries[0]?.detail).toContain("collier rose");
});

test("la fusion finale trie l'ensemble par date décroissante", () => {
  const input = buildLitterUnifiedHistoryInput({
    weightSessions: [baseSession],
    maternalObservations: [baseObservation],
    careTasks: [baseTask],
    whelpingEvents: [],
    whelpingBirths: [],
  });
  const history = buildUnifiedHistory(input);
  expect(history.map((entry) => entry.id)).toEqual([
    "weight-session-session-1",
    "maternal-observation-obs-1",
    "care-task-task-1",
  ]);
});
