import { expect, test } from "@playwright/test";

import {
  buildLitterGrowthVigilance,
  type BuildLitterGrowthVigilanceInput,
} from "../../src/features/litter-weights/litter-growth-vigilance";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
} from "../../src/features/litter-weights/litter-weights-core";
import type {
  LitterWeighingScheduleItem,
  LitterWeighingScheduleResult,
} from "../../src/features/litter-weights/litter-weighing-schedule-model";

function animal(
  id: string,
  overrides: Partial<LitterWeightHistoryAnimal> = {},
): LitterWeightHistoryAnimal {
  return {
    id,
    ownershipStatus: "produced",
    birthOrder: 1,
    sex: "female",
    callName: `Chiot ${id}`,
    officialName: null,
    initialCollarColor: null,
    currentCollarColor: null,
    status: "born",
    birthDate: "2026-07-01",
    deathDate: null,
    birthWeightGrams: null,
    ...overrides,
  };
}

function measurement(
  id: string,
  animalId: string,
  measuredAt: string,
  grams: number,
  overrides: Partial<LitterWeightHistoryMeasurement> = {},
): LitterWeightHistoryMeasurement {
  return {
    id,
    revisionNo: 0,
    animalId,
    sessionId: null,
    type: "routine",
    grams,
    measuredAt,
    note: null,
    createdBy: "user",
    createdAt: measuredAt,
    ...overrides,
  };
}

function session(
  id: string,
  measuredAt: string,
  overrides: Partial<LitterWeightHistorySession> = {},
): LitterWeightHistorySession {
  return {
    id,
    revisionNo: 0,
    measuredAt,
    timezoneName: "Europe/Paris",
    note: null,
    measurementCount: 0,
    averageGrams: null,
    minimumGrams: null,
    maximumGrams: null,
    createdBy: "user",
    createdAt: measuredAt,
    ...overrides,
  };
}

function scheduleItem(
  ageDay: number,
  scheduledOn: string,
  status: LitterWeighingScheduleItem["status"],
): LitterWeighingScheduleItem {
  return {
    ageDay,
    scheduledOn,
    phaseIndex: 0,
    cadence: { intervalDays: 1 },
    status,
    observations: [],
  };
}

function schedule(
  items: LitterWeighingScheduleItem[],
): LitterWeighingScheduleResult {
  const incomplete = items.find((item) => item.status !== "completed") ?? null;
  return {
    status: "available",
    schedule: items,
    extraObservations: [],
    summary: {
      totalScheduledCount: items.length,
      completedCount: items.filter((item) => item.status === "completed").length,
      dueTodayCount: items.filter((item) => item.status === "due_today").length,
      overdueCount: items.filter((item) => item.status === "overdue").length,
      upcomingCount: items.filter((item) => item.status === "upcoming").length,
      extraObservationCount: 0,
      firstIncomplete: incomplete
        ? {
            ageDay: incomplete.ageDay,
            scheduledOn: incomplete.scheduledOn,
            status: incomplete.status as "due_today" | "overdue" | "upcoming",
          }
        : null,
    },
  };
}

function project(
  overrides: Partial<BuildLitterGrowthVigilanceInput> = {},
) {
  return buildLitterGrowthVigilance({
    animals: [],
    measurements: [],
    sessions: [],
    weighingSchedule: null,
    ...overrides,
  });
}

test.describe("projection pure des points de vigilance de croissance", () => {
  test("aucune donnée ne produit aucun signal", () => {
    expect(project()).toEqual([]);
  });

  test("une seule mesure ne produit aucun signal de tendance", () => {
    expect(
      project({
        animals: [animal("a")],
        measurements: [measurement("m1", "a", "2026-07-01T08:00:00Z", 400)],
      }),
    ).toEqual([]);
  });

  test("une hausse ne produit pas de baisse", () => {
    expect(
      project({
        animals: [animal("a")],
        measurements: [
          measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
          measurement("m2", "a", "2026-07-02T08:00:00Z", 420),
        ],
      }),
    ).toEqual([]);
  });

  test("une baisse produit le signal exact avec différence et intervalle", () => {
    const result = project({
      animals: [animal("a", { callName: "Violet" })],
      measurements: [
        measurement("m2", "a", "2026-07-02T08:00:00Z", 388),
        measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({
        code: "weight_decrease",
        severity: "attention",
        scope: "animal",
        animalPublicLabel: "Violet",
        differenceGrams: -12,
        intervalMilliseconds: 86_400_000,
        latestMeasurement: {
          measuredAt: "2026-07-02T08:00:00Z",
          grams: 388,
          type: "routine",
        },
        previousMeasurement: {
          measuredAt: "2026-07-01T08:00:00Z",
          grams: 400,
          type: "routine",
        },
      }),
    ]);
  });

  test("une correction simulée supprimant la baisse retire le signal", () => {
    const measurements = [
      measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
      measurement("m2", "a", "2026-07-02T08:00:00Z", 388),
    ];
    expect(project({ animals: [animal("a")], measurements })).toHaveLength(1);
    const corrected = measurements.map((item) =>
      item.id === "m2" ? { ...item, grams: 405 } : item,
    );
    expect(project({ animals: [animal("a")], measurements: corrected })).toEqual([]);
  });

  test("deux poids identiques ne suffisent pas pour la stagnation", () => {
    expect(
      project({
        animals: [animal("a")],
        measurements: [
          measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
          measurement("m2", "a", "2026-07-02T08:00:00Z", 400),
        ],
      }),
    ).toEqual([]);
  });

  test("trois poids identiques consécutifs produisent la stagnation", () => {
    const result = project({
      animals: [animal("a", { callName: "Bleu" })],
      measurements: [
        measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
        measurement("m2", "a", "2026-07-02T08:00:00Z", 400),
        measurement("m3", "a", "2026-07-03T08:00:00Z", 400),
      ],
    });
    expect(result).toEqual([
      expect.objectContaining({
        code: "weight_stagnation",
        animalPublicLabel: "Bleu",
        intervalMilliseconds: 86_400_000,
      }),
    ]);
  });

  test("un quatrième poids différent casse la stagnation", () => {
    expect(
      project({
        animals: [animal("a")],
        measurements: [
          measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
          measurement("m2", "a", "2026-07-02T08:00:00Z", 400),
          measurement("m3", "a", "2026-07-03T08:00:00Z", 400),
          measurement("m4", "a", "2026-07-04T08:00:00Z", 401),
        ],
      }),
    ).toEqual([]);
  });

  test("un horodatage invalide est ignoré sans durée négative", () => {
    const result = project({
      animals: [animal("a")],
      measurements: [
        measurement("m-invalid", "a", "invalide", 300),
        measurement("m2", "a", "2026-07-02T08:00:00Z", 390),
        measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
      ],
    });
    expect(result).toEqual([
      expect.objectContaining({
        code: "weight_decrease",
        differenceGrams: -10,
        intervalMilliseconds: 86_400_000,
      }),
    ]);
    const decrease = result.find((signal) => signal.code === "weight_decrease");
    expect(decrease?.intervalMilliseconds).toBeGreaterThanOrEqual(0);
  });

  test("naissance et routine appartiennent à la même série réelle", () => {
    const result = project({
      animals: [animal("a")],
      measurements: [
        measurement("birth", "a", "2026-07-01T08:00:00Z", 400, {
          type: "birth",
        }),
        measurement("routine", "a", "2026-07-02T08:00:00Z", 390),
      ],
    });
    expect(result).toEqual([
      expect.objectContaining({
        code: "weight_decrease",
        previousMeasurement: expect.objectContaining({ type: "birth" }),
        latestMeasurement: expect.objectContaining({ type: "routine" }),
      }),
    ]);
  });

  test("le retrait d’une naissance annulée la retire de la série active", () => {
    const birth = measurement("birth", "a", "2026-07-01T08:00:00Z", 500, {
      type: "birth",
    });
    const routine = measurement("routine", "a", "2026-07-02T08:00:00Z", 450);
    expect(
      project({ animals: [animal("a")], measurements: [birth, routine] }),
    ).toHaveLength(1);
    expect(
      project({ animals: [animal("a")], measurements: [routine] }),
    ).toEqual([]);
  });

  test("due_today produit une information de portée", () => {
    expect(
      project({
        weighingSchedule: schedule([
          scheduleItem(4, "2026-07-05", "due_today"),
        ]),
      }),
    ).toEqual([
      {
        code: "weighing_due_today",
        severity: "information",
        scope: "litter",
        scheduledOn: "2026-07-05",
        ageDay: 4,
        suggestsWeightEntry: true,
      },
    ]);
  });

  test("overdue est agrégé avec la plus ancienne échéance", () => {
    expect(
      project({
        weighingSchedule: schedule([
          scheduleItem(12, "2026-07-13", "overdue"),
          scheduleItem(10, "2026-07-11", "overdue"),
          scheduleItem(11, "2026-07-12", "overdue"),
        ]),
      }),
    ).toEqual([
      {
        code: "weighing_overdue",
        severity: "attention",
        scope: "litter",
        scheduledOn: "2026-07-11",
        ageDay: 10,
        overdueCount: 3,
        suggestsWeightEntry: true,
      },
    ]);
  });

  test("due_today et overdue peuvent coexister dans l’ordre défini", () => {
    expect(
      project({
        weighingSchedule: schedule([
          scheduleItem(3, "2026-07-04", "due_today"),
          scheduleItem(2, "2026-07-03", "overdue"),
        ]),
      }).map(({ code }) => code),
    ).toEqual(["weighing_overdue", "weighing_due_today"]);
  });

  test("upcoming seul et planning indisponible ne produisent aucun signal", () => {
    expect(
      project({
        weighingSchedule: schedule([
          scheduleItem(5, "2026-07-06", "upcoming"),
        ]),
      }),
    ).toEqual([]);
    expect(
      project({
        weighingSchedule: {
          status: "missing_actual_birth_date",
          schedule: [],
          extraObservations: [],
        },
      }),
    ).toEqual([]);
    expect(project({ weighingSchedule: null })).toEqual([]);
  });

  test("la dernière séance complète ne produit aucun signal", () => {
    const animals = [
      animal("a", { birthOrder: 1 }),
      animal("b", { birthOrder: 2 }),
    ];
    const latest = session("s", "2026-07-02T08:00:00Z");
    expect(
      project({
        animals,
        sessions: [latest],
        measurements: [
          measurement("m1", "a", latest.measuredAt, 400, { sessionId: latest.id }),
          measurement("m2", "b", latest.measuredAt, 420, { sessionId: latest.id }),
        ],
      }),
    ).toEqual([]);
  });

  test("la dernière séance partielle conserve la liste publique complète et ordonnée", () => {
    const animals = [
      animal("c", { birthOrder: 3, callName: "Rouge" }),
      animal("a", { birthOrder: 1, callName: "Bleu" }),
      animal("b", { birthOrder: 2, callName: "Violet" }),
    ];
    const latest = session("s", "2026-07-02T08:00:00Z");
    expect(
      project({
        animals,
        sessions: [latest],
        measurements: [
          measurement("m", "c", latest.measuredAt, 450, { sessionId: latest.id }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "latest_session_incomplete",
        sessionId: "s",
        sessionMeasuredAt: "2026-07-02T08:00:00Z",
        missingAnimalLabels: ["Bleu", "Violet"],
      }),
    ]);
  });

  test("une ancienne séance incomplète est ignorée lorsque la dernière est complète", () => {
    const animals = [animal("a"), animal("b", { birthOrder: 2 })];
    const older = session("older", "2026-07-01T08:00:00Z");
    const latest = session("latest", "2026-07-02T08:00:00Z");
    expect(
      project({
        animals,
        sessions: [latest, older],
        measurements: [
          measurement("old-a", "a", older.measuredAt, 400, { sessionId: older.id }),
          measurement("new-a", "a", latest.measuredAt, 410, { sessionId: latest.id }),
          measurement("new-b", "b", latest.measuredAt, 420, { sessionId: latest.id }),
        ],
      }),
    ).toEqual([]);
  });

  test("les animaux inéligibles sont exclus des manquants", () => {
    const latest = session("s", "2026-07-02T08:00:00Z");
    expect(
      project({
        animals: [
          animal("measured", { birthOrder: 1 }),
          animal("adopted", { birthOrder: 2, ownershipStatus: "adopted_out" }),
          animal("stillborn", { birthOrder: 3, status: "stillborn" }),
          animal("undated", { birthOrder: 4, birthDate: null }),
        ],
        sessions: [latest],
        measurements: [
          measurement("m", "measured", latest.measuredAt, 400, {
            sessionId: latest.id,
          }),
        ],
      }),
    ).toEqual([]);
  });

  test("un animal décédé avant la date locale de la dernière séance est exclu des manquants", () => {
    const latest = session("s", "2026-07-03T00:30:00Z", {
      timezoneName: "Europe/Paris",
    });
    expect(
      project({
        animals: [
          animal("measured", { birthOrder: 1 }),
          animal("deceased", {
            birthOrder: 2,
            callName: "Décédé avant",
            deathDate: "2026-07-02",
          }),
        ],
        sessions: [latest],
        measurements: [
          measurement("m", "measured", latest.measuredAt, 400, {
            sessionId: latest.id,
          }),
        ],
      }),
    ).toEqual([]);
  });

  test("un animal décédé le jour civil de la séance reste éligible selon la règle serveur", () => {
    const latest = session("s", "2026-07-03T00:30:00Z", {
      timezoneName: "America/Los_Angeles",
    });
    expect(
      project({
        animals: [
          animal("measured", { birthOrder: 1 }),
          animal("same-day", {
            birthOrder: 2,
            callName: "Décédé le même jour",
            deathDate: "2026-07-02",
          }),
        ],
        sessions: [latest],
        measurements: [
          measurement("m", "measured", latest.measuredAt, 400, {
            sessionId: latest.id,
          }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "latest_session_incomplete",
        missingAnimalLabels: ["Décédé le même jour"],
      }),
    ]);
  });

  test("un décès postérieur à la séance conserve l’animal dans les manquants", () => {
    const latest = session("s", "2026-07-03T08:00:00Z");
    expect(
      project({
        animals: [
          animal("measured", { birthOrder: 1 }),
          animal("later", {
            birthOrder: 2,
            callName: "Décédé après",
            deathDate: "2026-07-04",
          }),
        ],
        sessions: [latest],
        measurements: [
          measurement("m", "measured", latest.measuredAt, 400, {
            sessionId: latest.id,
          }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "latest_session_incomplete",
        missingAnimalLabels: ["Décédé après"],
      }),
    ]);
  });

  test("un animal vivant reste compté comme manquant", () => {
    const latest = session("s", "2026-07-03T08:00:00Z");
    expect(
      project({
        animals: [
          animal("measured", { birthOrder: 1 }),
          animal("living", {
            birthOrder: 2,
            callName: "Vivant",
            deathDate: null,
          }),
        ],
        sessions: [latest],
        measurements: [
          measurement("m", "measured", latest.measuredAt, 400, {
            sessionId: latest.id,
          }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "latest_session_incomplete",
        missingAnimalLabels: ["Vivant"],
      }),
    ]);
  });

  test("le retrait d’une séance ou d’une mesure active recalcule la complétude", () => {
    const animals = [animal("a"), animal("b", { birthOrder: 2 })];
    const active = session("active", "2026-07-02T08:00:00Z");
    const measurements = [
      measurement("a", "a", active.measuredAt, 400, { sessionId: active.id }),
      measurement("b", "b", active.measuredAt, 420, { sessionId: active.id }),
    ];
    expect(project({ animals, sessions: [active], measurements })).toEqual([]);
    expect(
      project({ animals, sessions: [active], measurements: [measurements[0]] }),
    ).toEqual([
      expect.objectContaining({
        code: "latest_session_incomplete",
        missingAnimalLabels: ["Chiot b"],
      }),
    ]);
    expect(project({ animals, sessions: [], measurements })).toEqual([]);
  });

  test("les signaux suivent l’ordre déterministe et l’ordre de naissance", () => {
    const animals = [
      animal("b", { birthOrder: 2, callName: "Bleu" }),
      animal("a", { birthOrder: 1, callName: "Violet" }),
    ];
    const result = project({
      animals,
      measurements: [
        measurement("a1", "a", "2026-07-01T08:00:00Z", 500),
        measurement("a2", "a", "2026-07-02T08:00:00Z", 490),
        measurement("b1", "b", "2026-07-01T08:00:00Z", 450),
        measurement("b2", "b", "2026-07-02T08:00:00Z", 440),
      ],
      weighingSchedule: schedule([
        scheduleItem(2, "2026-07-03", "overdue"),
        scheduleItem(3, "2026-07-04", "due_today"),
      ]),
    });
    expect(result.map(({ code }) => code)).toEqual([
      "weighing_overdue",
      "weight_decrease",
      "weight_decrease",
      "weighing_due_today",
    ]);
    expect(
      result
        .filter((signal) => signal.code === "weight_decrease")
        .map((signal) => signal.animalPublicLabel),
    ).toEqual(["Violet", "Bleu"]);
  });

  test("aucun code n’est dupliqué pour une même portée, séance ou animal", () => {
    const latest = session("s", "2026-07-03T08:00:00Z");
    const result = project({
      animals: [
        animal("a", { callName: "Violet" }),
        animal("a", { callName: "Doublon non retenu" }),
        animal("b", { birthOrder: 2, callName: "Bleu" }),
      ],
      sessions: [latest],
      measurements: [
        measurement("a1", "a", "2026-07-01T08:00:00Z", 500),
        measurement("a2", "a", latest.measuredAt, 490, { sessionId: latest.id }),
      ],
      weighingSchedule: schedule([
        scheduleItem(1, "2026-07-02", "overdue"),
        scheduleItem(2, "2026-07-03", "overdue"),
      ]),
    });
    const keys = result.map((signal) =>
      signal.scope === "animal"
        ? `${signal.code}:${signal.animalId}`
        : signal.scope === "session"
          ? `${signal.code}:${signal.sessionId}`
          : `${signal.code}:litter`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("la projection ne mute aucun modèle d’entrée", () => {
    const input: BuildLitterGrowthVigilanceInput = {
      animals: [
        animal("b", { birthOrder: 2, deathDate: "2026-07-04" }),
        animal("a", { birthOrder: 1 }),
      ],
      measurements: [
        measurement("m2", "a", "2026-07-02T08:00:00Z", 390),
        measurement("m1", "a", "2026-07-01T08:00:00Z", 400),
      ],
      sessions: [
        session("s2", "2026-07-02T08:00:00Z"),
        session("s1", "2026-07-01T08:00:00Z"),
      ],
      weighingSchedule: schedule([
        scheduleItem(2, "2026-07-03", "overdue"),
        scheduleItem(1, "2026-07-02", "overdue"),
      ]),
    };
    const before = structuredClone(input);
    buildLitterGrowthVigilance(input);
    expect(input).toEqual(before);
  });
});
