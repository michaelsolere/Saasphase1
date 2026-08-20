import { expect, test } from "@playwright/test";

import {
  buildFemaleReproductionSummary,
  buildMaleReproductionSummary,
  getRecentAnimalActivity,
  isAnimalHealthEventType,
  isSensitiveAnimalDecisionRole,
  normalizeAnimalProfileTab,
  projectAnimalAttentionPoints,
} from "../../src/features/animals/animal-profile-model";

test("normalise les onglets de la fiche animal et revient à Aperçu pour une valeur inconnue", () => {
  expect(normalizeAnimalProfileTab(undefined)).toBe("overview");
  expect(normalizeAnimalProfileTab("unknown")).toBe("overview");
  expect(normalizeAnimalProfileTab("health")).toBe("health");
  expect(normalizeAnimalProfileTab("reproduction")).toBe("reproduction");
  expect(normalizeAnimalProfileTab("documents")).toBe("documents");
  expect(normalizeAnimalProfileTab("history")).toBe("history");
});

test("classe health_other comme santé sans reclasser les anciens événements other", () => {
  expect(isAnimalHealthEventType("health_other")).toBe(true);
  expect(isAnimalHealthEventType("vaccination")).toBe(true);
  expect(isAnimalHealthEventType("xray")).toBe(true);
  expect(isAnimalHealthEventType("ultrasound")).toBe(true);
  expect(isAnimalHealthEventType("pregnancy_check")).toBe(true);
  expect(isAnimalHealthEventType("other")).toBe(false);
});

test("réserve les décisions sensibles aux rôles owner et admin", () => {
  expect(isSensitiveAnimalDecisionRole("owner")).toBe(true);
  expect(isSensitiveAnimalDecisionRole("admin")).toBe(true);
  expect(isSensitiveAnimalDecisionRole("member")).toBe(false);
  expect(isSensitiveAnimalDecisionRole("viewer")).toBe(false);
  expect(isSensitiveAnimalDecisionRole(undefined)).toBe(false);
});

test("projette au maximum trois points d’attention dans l’ordre retard, urgent, haute, identité", () => {
  const points = projectAnimalAttentionPoints({
    now: "2026-08-20T12:00:00.000Z",
    events: [
      {
        id: "high",
        title: "Tâche haute",
        eventType: "vaccination",
        status: "todo",
        priority: "high",
        plannedAt: "2026-08-25T12:00:00.000Z",
        plannedDate: null,
      },
      {
        id: "urgent",
        title: "Tâche urgente",
        eventType: "vaccination",
        status: "in_progress",
        priority: "urgent",
        plannedAt: null,
        plannedDate: "2026-08-24",
      },
      {
        id: "late",
        title: "Tâche en retard",
        eventType: "vaccination",
        status: "todo",
        priority: "normal",
        plannedAt: null,
        plannedDate: "2026-08-19",
      },
    ],
    identity: {
      kennelBorn: true,
      status: "available",
      identificationNumber: null,
      officialName: null,
    },
  });

  expect(points.map((point) => point.id)).toEqual(["late", "urgent", "high"]);
  expect(points).toHaveLength(3);
  expect(points.every((point) => point.tab === "overview" || point.tab === "health")).toBe(true);
});

test("oriente les alertes santé vers Santé et les autres événements vers Historique", () => {
  const points = projectAnimalAttentionPoints({
    now: "2026-08-20T12:00:00.000Z",
    events: [
      { id: "health", title: "Santé", eventType: "health_other", status: "late", priority: "normal", plannedAt: null, plannedDate: "2026-08-19" },
      { id: "payment", title: "Paiement", eventType: "payment_due", status: "late", priority: "normal", plannedAt: null, plannedDate: "2026-08-19" },
    ],
    identity: { kennelBorn: false, status: "active", identificationNumber: null, officialName: null },
  });

  expect(points).toEqual([
    expect.objectContaining({ id: "health", tab: "health" }),
    expect.objectContaining({ id: "payment", tab: "history" }),
  ]);
});

test("exclut les statuts terminaux des alertes et signale l’identité incomplète pertinente", () => {
  const points = projectAnimalAttentionPoints({
    now: "2026-08-20T12:00:00.000Z",
    events: ["done", "cancelled", "not_applicable"].map((status) => ({
      id: status,
      title: status,
      status,
      priority: "urgent",
      plannedAt: null,
      plannedDate: "2026-08-01",
    })),
    identity: {
      kennelBorn: true,
      status: "reserved",
      identificationNumber: "",
      officialName: "Nom officiel",
    },
  });

  expect(points).toEqual([
    expect.objectContaining({ id: "identity-incomplete", tab: "overview" }),
  ]);
});

test("retient les trois activités les plus récentes sans modifier la chronologie", () => {
  const entries = [
    { id: "new", kind: "event" as const, label: "Nouveau", detail: null, occurredAt: "2026-08-03T00:00:00Z" },
    { id: "middle", kind: "note" as const, label: "Milieu", detail: null, occurredAt: "2026-08-02T00:00:00Z" },
    { id: "old", kind: "document" as const, label: "Ancien", detail: null, occurredAt: "2026-08-01T00:00:00Z" },
    { id: "older", kind: "health" as const, label: "Plus ancien", detail: null, occurredAt: "2026-07-31T00:00:00Z" },
  ];

  expect(getRecentAnimalActivity(entries).map((entry) => entry.id)).toEqual([
    "new",
    "middle",
    "old",
  ]);
  expect(entries).toHaveLength(4);
});

test("résume la reproduction femelle à partir du cycle réellement le plus récent", () => {
  const summary = buildFemaleReproductionSummary({
    cycles: [
      {
        id: "older",
        startedOn: "2026-01-01",
        endedOn: "2026-01-15",
        status: "closed",
        measurements: [{ measuredAt: "2026-01-05T10:00:00Z", value: 4.2, unit: "ng_ml" }],
        matings: [{ id: "mating-old" }],
      },
      {
        id: "latest",
        startedOn: "2026-06-01",
        endedOn: null,
        status: "in_progress",
        measurements: [
          { measuredAt: "2026-06-02T10:00:00Z", value: 2.1, unit: "ng_ml" },
          { measuredAt: "2026-06-04T10:00:00Z", value: 7.8, unit: "ng_ml" },
        ],
        matings: [{ id: "mating-1" }, { id: "mating-2" }],
      },
    ],
    litters: [{ id: "litter-1", bornTotalCount: 7, aliveCount: 7 }],
  });

  expect(summary.latestCycle?.id).toBe("latest");
  expect(summary.latestMeasurement).toMatchObject({ value: 7.8, unit: "ng_ml" });
  expect(summary.matingCount).toBe(2);
  expect(summary.litterCount).toBe(1);
  expect(summary.descendantCount).toBe(7);
});

test("résume les portées et descendants d’un mâle", () => {
  expect(
    buildMaleReproductionSummary([
      { id: "litter-1", bornTotalCount: 6, aliveCount: 5 },
      { id: "litter-2", bornTotalCount: null, aliveCount: 4 },
    ]),
  ).toEqual({ litterCount: 2, descendantCount: 10, aliveDescendantCount: 9 });
});
