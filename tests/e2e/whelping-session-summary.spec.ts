import { expect, test } from "@playwright/test";

import {
  buildWhelpingSessionSummary,
  formatWhelpingDuration,
  formatWhelpingSexCounts,
  formatWhelpingViabilityCounts,
  type WhelpingSessionSummaryInput,
} from "../../src/features/whelping/whelping-session-summary";

const sessionId = "session-summary";

function session(overrides: Partial<WhelpingSessionSummaryInput["session"]> = {}) {
  return {
    id: sessionId,
    status: "closed" as const,
    startedAt: "2026-07-31T00:00:00+02:00",
    endedAt: "2026-07-31T05:42:00+02:00",
    ...overrides,
  };
}

function birth(
  overrides: Partial<WhelpingSessionSummaryInput["births"][number]> = {},
): WhelpingSessionSummaryInput["births"][number] {
  return {
    sessionId,
    cancelledAt: null,
    occurredAt: "2026-07-31T01:14:00+02:00",
    sex: "female",
    viability: "alive",
    animal: { id: "animal" },
    birthWeightMeasurement: { grams: 412 },
    ...overrides,
  };
}

function summary(
  overrides: Partial<WhelpingSessionSummaryInput> = {},
) {
  return buildWhelpingSessionSummary({
    session: session(),
    events: [],
    births: [birth()],
    ...overrides,
  });
}

function available(value: ReturnType<typeof summary>) {
  expect(value.status).toBe("available");
  if (value.status !== "available") throw new Error("Bilan indisponible");
  return value;
}

test("calcule une session clôturée standard et ses libellés", () => {
  const value = available(summary({
    events: [
      { sessionId, eventType: "intervention" },
      { sessionId, eventType: "vet_called" },
      { sessionId, eventType: "birth" },
      { sessionId, eventType: "birth_corrected" },
      { sessionId, eventType: "birth_cancelled" },
      { sessionId, eventType: "session_closed" },
      { sessionId, eventType: "session_reopened" },
    ],
    births: [
      birth({ occurredAt: "2026-07-31T01:14:00+02:00", sex: "female", birthWeightMeasurement: { grams: 356 } }),
      birth({ occurredAt: "2026-07-31T05:58:00+02:00", sex: "male", birthWeightMeasurement: { grams: 471 } }),
    ],
  }));

  expect(value).toMatchObject({
    sessionDurationMinutes: 342,
    birthSpanMinutes: 284,
    activeBirthCount: 2,
    recordedWeightCount: 2,
    missingWeightCount: 0,
    averageWeightGrams: 414,
    minimumWeightGrams: 356,
    maximumWeightGrams: 471,
    interventionCount: 1,
    vetCallCount: 1,
    readyForWeighingCount: 2,
  });
  expect(formatWhelpingDuration(value.sessionDurationMinutes)).toBe("5 h 42");
  expect(formatWhelpingSexCounts(value.sexCounts)).toBe("1 femelle · 1 mâle");
  expect(formatWhelpingViabilityCounts(value.viabilityCounts)).toBe("2 vivants");
});

test("rend le bilan indisponible pour une session ouverte", () => {
  expect(summary({ session: session({ status: "open", endedAt: null }) })).toEqual({ status: "unavailable" });
});

test("rend le bilan indisponible pour une session rouverte", () => {
  expect(summary({ session: session({ status: "open", endedAt: "2026-07-31T05:42:00+02:00" }) })).toEqual({ status: "unavailable" });
});

test("gère une session sans naissance active", () => {
  const value = available(summary({ births: [] }));
  expect(value).toMatchObject({
    activeBirthCount: 0,
    firstBirthAt: null,
    lastBirthAt: null,
    birthSpanMinutes: null,
    recordedWeightCount: 0,
    missingWeightCount: 0,
    averageWeightGrams: null,
    minimumWeightGrams: null,
    maximumWeightGrams: null,
    readyForWeighingCount: 0,
  });
});

test("gère une naissance unique avec un intervalle nul", () => {
  const value = available(summary());
  expect(value.firstBirthAt).toBe(value.lastBirthAt);
  expect(value.birthSpanMinutes).toBe(0);
  expect(formatWhelpingDuration(value.birthSpanMinutes)).toBe("0 min");
});

test("classe plusieurs naissances par occurredAt sans dépendre de l’ordre d’entrée", () => {
  const value = available(summary({ births: [
    birth({ occurredAt: "2026-07-31T04:05:00+02:00" }),
    birth({ occurredAt: "2026-07-31T01:12:00+02:00" }),
    birth({ occurredAt: "2026-07-31T03:00:00+02:00" }),
  ] }));
  expect(value.firstBirthAt).toBe("2026-07-31T01:12:00+02:00");
  expect(value.lastBirthAt).toBe("2026-07-31T04:05:00+02:00");
  expect(value.birthSpanMinutes).toBe(173);
});

test("exclut intégralement une naissance annulée", () => {
  const value = available(summary({ births: [
    birth({ sex: "male", birthWeightMeasurement: { grams: 500 } }),
    birth({ cancelledAt: "2026-07-31T04:00:00+02:00", sex: "female", birthWeightMeasurement: { grams: 900 } }),
  ] }));
  expect(value.activeBirthCount).toBe(1);
  expect(value.sexCounts).toEqual({ female: 0, male: 1, unknown: 0 });
  expect(value.averageWeightGrams).toBe(500);
  expect(value.readyForWeighingCount).toBe(1);
});

test("compte femelles, mâles et sexes inconnus avec pluralisation", () => {
  const value = available(summary({ births: [birth({ sex: "female" }), birth({ sex: "female" }), birth({ sex: "male" }), birth({ sex: "unknown" }), birth({ sex: "unknown" })] }));
  expect(value.sexCounts).toEqual({ female: 2, male: 1, unknown: 2 });
  expect(formatWhelpingSexCounts(value.sexCounts)).toBe("2 femelles · 1 mâle · 2 sexes à confirmer");
});

test("compte vivants, mort-nés et viabilités inconnues sans conversion", () => {
  const value = available(summary({ births: [birth({ viability: "alive" }), birth({ viability: "stillborn" }), birth({ viability: "unknown" }), birth({ viability: "unknown" })] }));
  expect(value.viabilityCounts).toEqual({ alive: 1, stillborn: 1, unknown: 2 });
  expect(formatWhelpingViabilityCounts(value.viabilityCounts)).toBe("1 vivant · 1 mort-né · 2 états à confirmer");
});

test("ne crée aucune statistique lorsqu’aucun poids n’est renseigné", () => {
  const value = available(summary({ births: [birth({ birthWeightMeasurement: null }), birth({ birthWeightMeasurement: null })] }));
  expect(value).toMatchObject({ recordedWeightCount: 0, missingWeightCount: 2, averageWeightGrams: null, minimumWeightGrams: null, maximumWeightGrams: null, readyForWeighingCount: 2 });
});

test("sépare poids renseignés et poids manquants", () => {
  const value = available(summary({ births: [birth({ birthWeightMeasurement: { grams: 400 } }), birth({ birthWeightMeasurement: null }), birth({ birthWeightMeasurement: { grams: 500 } })] }));
  expect(value).toMatchObject({ recordedWeightCount: 2, missingWeightCount: 1, averageWeightGrams: 450 });
});

test("arrondit la moyenne au gramme le plus proche", () => {
  const value = available(summary({ births: [birth({ birthWeightMeasurement: { grams: 400 } }), birth({ birthWeightMeasurement: { grams: 401 } }), birth({ birthWeightMeasurement: { grams: 401 } })] }));
  expect(value.averageWeightGrams).toBe(401);
});

test("calcule le minimum et le maximum", () => {
  const value = available(summary({ births: [birth({ birthWeightMeasurement: { grams: 471 } }), birth({ birthWeightMeasurement: { grams: 356 } }), birth({ birthWeightMeasurement: { grams: 412 } })] }));
  expect(value.minimumWeightGrams).toBe(356);
  expect(value.maximumWeightGrams).toBe(471);
});

test("compte uniquement interventions et appels vétérinaires de la session", () => {
  const value = available(summary({ events: [
    { sessionId, eventType: "intervention" },
    { sessionId, eventType: "intervention" },
    { sessionId, eventType: "vet_called" },
    { sessionId, eventType: "observation" },
    { sessionId: "other", eventType: "intervention" },
  ] }));
  expect(value.interventionCount).toBe(2);
  expect(value.vetCallCount).toBe(1);
});

test("neutralise les horodatages invalides", () => {
  expect(summary({ session: session({ endedAt: "invalide" }) })).toEqual({ status: "unavailable" });
  const value = available(summary({ session: session({ startedAt: "invalide" }), births: [birth({ occurredAt: "invalide" })] }));
  expect(value.sessionDurationMinutes).toBeNull();
  expect(value.firstBirthAt).toBeNull();
  expect(value.lastBirthAt).toBeNull();
  expect(value.birthSpanMinutes).toBeNull();
});

test("ne produit jamais de durée négative lorsque la fin précède le début", () => {
  const value = available(summary({ session: session({ startedAt: "2026-07-31T06:00:00+02:00", endedAt: "2026-07-31T05:42:00+02:00" }) }));
  expect(value.sessionDurationMinutes).toBeNull();
  expect(formatWhelpingDuration(-1)).toBeNull();
  expect(formatWhelpingDuration(42)).toBe("42 min");
  expect(formatWhelpingDuration(125)).toBe("2 h 05");
  expect(formatWhelpingDuration(1620)).toBe("1 j 3 h");
});

test("recalcule immédiatement après une correction simulée", () => {
  const initial = [birth({ sex: "unknown", viability: "unknown", birthWeightMeasurement: null })];
  const corrected = [{ ...initial[0], sex: "female" as const, viability: "alive" as const, birthWeightMeasurement: { grams: 412 } }];
  expect(available(summary({ births: initial }))).toMatchObject({ missingWeightCount: 1, averageWeightGrams: null, sexCounts: { female: 0, male: 0, unknown: 1 }, viabilityCounts: { alive: 0, stillborn: 0, unknown: 1 } });
  expect(available(summary({ births: corrected }))).toMatchObject({ missingWeightCount: 0, averageWeightGrams: 412, sexCounts: { female: 1, male: 0, unknown: 0 }, viabilityCounts: { alive: 1, stillborn: 0, unknown: 0 } });
});

test("recalcule première et dernière naissance après une annulation simulée", () => {
  const births = [birth({ occurredAt: "2026-07-31T01:00:00+02:00" }), birth({ occurredAt: "2026-07-31T02:00:00+02:00" }), birth({ occurredAt: "2026-07-31T03:00:00+02:00" })];
  const before = available(summary({ births }));
  const after = available(summary({ births: [{ ...births[0], cancelledAt: "2026-07-31T04:00:00+02:00" }, births[1], { ...births[2], cancelledAt: "2026-07-31T04:01:00+02:00" }] }));
  expect(before).toMatchObject({ activeBirthCount: 3, firstBirthAt: births[0].occurredAt, lastBirthAt: births[2].occurredAt, birthSpanMinutes: 120 });
  expect(after).toMatchObject({ activeBirthCount: 1, firstBirthAt: births[1].occurredAt, lastBirthAt: births[1].occurredAt, birthSpanMinutes: 0 });
});
