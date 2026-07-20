import { expect, test } from "@playwright/test";

import {
  buildLitterWeighingSchedule,
  DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
  type BuildLitterWeighingScheduleInput,
  type LitterWeighingObservation,
  type LitterWeighingSchedulePolicy,
  type LitterWeighingScheduleResult,
} from "../../src/features/litter-weights/litter-weighing-schedule-model";

const ONE_PHASE_POLICY = {
  phases: [{ startAgeDay: 0, endAgeDay: 4, intervalDays: 1 }],
} as const satisfies LitterWeighingSchedulePolicy;

function input(
  overrides: Partial<BuildLitterWeighingScheduleInput> = {},
): BuildLitterWeighingScheduleInput {
  return {
    actualBirthDate: "2026-07-01",
    todayDate: "2026-07-03",
    observations: [],
    policy: ONE_PHASE_POLICY,
    ...overrides,
  };
}

function available(
  value: BuildLitterWeighingScheduleInput,
): Extract<LitterWeighingScheduleResult, { status: "available" }> {
  const result = buildLitterWeighingSchedule(value);
  if (result.status !== "available") {
    throw new Error(`Expected an available schedule, received ${result.status}`);
  }
  return result;
}

function observation(
  observationIndex: number,
  observedOn: string,
  source: "birth" | "routine" = "routine",
): LitterWeighingObservation {
  return { observationIndex, observedOn, source };
}

test("rend explicite l’absence de date réelle sans chercher de fallback", () => {
  const result = buildLitterWeighingSchedule(
    input({
      actualBirthDate: null,
      todayDate: "date également ignorée dans cet état",
      observations: [observation(0, "2026-07-01", "birth")],
    }),
  );

  expect(result).toEqual({
    status: "missing_actual_birth_date",
    schedule: [],
    extraObservations: [],
  });
});

test("refuse strictement les dates civiles invalides ou approximatives", () => {
  const invalidBirthDates = [
    "2026-02-30",
    "2026-7-01",
    "01/07/2026",
    "2026-07-01T10:00:00Z",
  ];
  for (const actualBirthDate of invalidBirthDates) {
    expect(buildLitterWeighingSchedule(input({ actualBirthDate })).status).toBe(
      "invalid_input",
    );
  }

  expect(
    buildLitterWeighingSchedule(input({ todayDate: "2026-13-01" })).status,
  ).toBe("invalid_input");
  expect(
    buildLitterWeighingSchedule(
      input({ observations: [observation(0, "2026-04-31")] }),
    ).status,
  ).toBe("invalid_input");
});

test("refuse les index et sources d’observation invalides", () => {
  const invalidObservations: unknown[] = [
    [{ observationIndex: 0.5, observedOn: "2026-07-01", source: "routine" }],
    [{ observationIndex: -1, observedOn: "2026-07-01", source: "routine" }],
    [observation(1, "2026-07-01"), observation(1, "2026-07-02")],
    [{ observationIndex: 0, observedOn: "2026-07-01", source: "clinical" }],
  ];

  for (const observations of invalidObservations) {
    const result = buildLitterWeighingSchedule(
      input({ observations: observations as readonly LitterWeighingObservation[] }),
    );
    expect(result.status).toBe("invalid_input");
    if (result.status === "invalid_input") expect(result.reason).toBeTruthy();
  }
});

test("valide strictement la structure et les bornes de la politique", () => {
  const invalidPolicies: unknown[] = [
    { phases: [] },
    { phases: [{ startAgeDay: -1, endAgeDay: 2, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 3, endAgeDay: 2, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 0.5, endAgeDay: 2, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 0 }] },
    { phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: -1 }] },
    {
      phases: [
        { startAgeDay: 10, endAgeDay: 12, intervalDays: 1 },
        { startAgeDay: 0, endAgeDay: 2, intervalDays: 1 },
      ],
    },
    {
      phases: [
        { startAgeDay: 0, endAgeDay: 10, intervalDays: 1 },
        { startAgeDay: 10, endAgeDay: 20, intervalDays: 2 },
      ],
    },
    { phases: [{ startAgeDay: 0, endAgeDay: 366, intervalDays: 1 }] },
    {
      phases: Array.from({ length: 13 }, (_, index) => ({
        startAgeDay: index * 2,
        endAgeDay: index * 2,
        intervalDays: 1,
      })),
    },
  ];

  for (const policy of invalidPolicies) {
    expect(
      buildLitterWeighingSchedule(
        input({ policy: policy as LitterWeighingSchedulePolicy }),
      ).status,
    ).toBe("invalid_input");
  }
});

test("la politique recommandée produit exactement ses 41 jours", () => {
  const result = available(
    input({
      actualBirthDate: "2026-01-01",
      todayDate: "2025-12-31",
      policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
    }),
  );
  const expectedAgeDays = [
    ...Array.from({ length: 31 }, (_, ageDay) => ageDay),
    31,
    34,
    37,
    40,
    43,
    46,
    49,
    52,
    55,
    58,
  ];

  expect(result.schedule).toHaveLength(41);
  expect(result.schedule.map(({ ageDay }) => ageDay)).toEqual(expectedAgeDays);
  expect(result.schedule.map(({ ageDay }) => ageDay)).not.toContain(32);
  expect(result.schedule.map(({ ageDay }) => ageDay)).not.toContain(60);
});

test("applique des politiques personnalisées sans compléter artificiellement les phases", () => {
  const policies = [
    {
      policy: { phases: [{ startAgeDay: 0, endAgeDay: 7, intervalDays: 2 }] },
      expected: [0, 2, 4, 6],
    },
    {
      policy: {
        phases: [
          { startAgeDay: 0, endAgeDay: 3, intervalDays: 1 },
          { startAgeDay: 4, endAgeDay: 8, intervalDays: 2 },
        ],
      },
      expected: [0, 1, 2, 3, 4, 6, 8],
    },
    {
      policy: { phases: [{ startAgeDay: 5, endAgeDay: 11, intervalDays: 4 }] },
      expected: [5, 9],
    },
    {
      policy: {
        phases: [
          { startAgeDay: 0, endAgeDay: 1, intervalDays: 1 },
          { startAgeDay: 2, endAgeDay: 6, intervalDays: 2 },
          { startAgeDay: 7, endAgeDay: 12, intervalDays: 5 },
        ],
      },
      expected: [0, 1, 2, 4, 6, 7, 12],
    },
    {
      policy: {
        phases: [
          { startAgeDay: 0, endAgeDay: 2, intervalDays: 1 },
          { startAgeDay: 6, endAgeDay: 10, intervalDays: 2 },
        ],
      },
      expected: [0, 1, 2, 6, 8, 10],
    },
  ] satisfies Array<{ policy: LitterWeighingSchedulePolicy; expected: number[] }>;

  for (const { policy, expected } of policies) {
    expect(available(input({ policy })).schedule.map(({ ageDay }) => ageDay)).toEqual(
      expected,
    );
  }
});

test("une politique personnalisée ne modifie pas la constante recommandée", () => {
  const before = JSON.stringify(DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY);
  available(
    input({
      policy: { phases: [{ startAgeDay: 0, endAgeDay: 10, intervalDays: 2 }] },
    }),
  );
  expect(JSON.stringify(DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY)).toBe(before);
});

test("calcule les dates civiles aux fins de mois, d’année et années bissextiles", () => {
  const cases = [
    { birth: "2026-01-31", expected: ["2026-01-31", "2026-02-01", "2026-02-02"] },
    { birth: "2026-12-31", expected: ["2026-12-31", "2027-01-01", "2027-01-02"] },
    { birth: "2024-02-28", expected: ["2024-02-28", "2024-02-29", "2024-03-01"] },
    { birth: "2024-02-29", expected: ["2024-02-29", "2024-03-01", "2024-03-02"] },
  ];
  const policy = {
    phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 1 }],
  } as const;

  for (const { birth, expected } of cases) {
    const result = available(
      input({ actualBirthDate: birth, todayDate: birth, policy }),
    );
    expect(result.schedule.map(({ scheduledOn }) => scheduledOn)).toEqual(expected);
  }
});

test("reste indépendant du changement d’heure, du fuseau et de Date.now", () => {
  const originalTimezone = process.env.TZ;
  const originalDateNow = Date.now;
  const results: LitterWeighingScheduleResult[] = [];

  try {
    Date.now = () => {
      throw new Error("Date.now must not be read");
    };
    for (const timezone of ["Europe/Paris", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      results.push(
        buildLitterWeighingSchedule(
          input({
            actualBirthDate: "2026-03-28",
            todayDate: "2026-03-29",
            policy: {
              phases: [{ startAgeDay: 0, endAgeDay: 3, intervalDays: 1 }],
            },
          }),
        ),
      );
    }
  } finally {
    Date.now = originalDateNow;
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }

  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  expect(results[0].status).toBe("available");
});

test("rapproche uniquement le même jour et applique la priorité des statuts", () => {
  const result = available(
    input({
      observations: [
        observation(9, "2026-07-01", "birth"),
        observation(2, "2026-07-01", "routine"),
      ],
    }),
  );

  expect(result.schedule.map(({ status }) => status)).toEqual([
    "completed",
    "overdue",
    "due_today",
    "upcoming",
    "upcoming",
  ]);
  expect(result.schedule[0].observations.map(({ observationIndex }) => observationIndex)).toEqual([
    2,
    9,
  ]);
  expect(result.schedule).toHaveLength(5);
});

test("l’ordre des observations d’entrée ne change pas le résultat", () => {
  const observations = [
    observation(3, "2026-07-03"),
    observation(1, "2026-06-30"),
    observation(2, "2026-07-03"),
    observation(4, "2026-07-08"),
  ];
  const forward = available(input({ observations }));
  const reverse = available(input({ observations: [...observations].reverse() }));

  expect(reverse).toEqual(forward);
});

test("classe les observations hors planning sans satisfaire une échéance voisine", () => {
  const result = available(
    input({
      actualBirthDate: "2026-01-01",
      todayDate: "2026-03-15",
      policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
      observations: [
        observation(5, "2026-02-02"),
        observation(1, "2025-12-31"),
        observation(4, "2026-03-03"),
        observation(3, "2026-03-02"),
        observation(2, "2026-02-03"),
      ],
    }),
  );

  expect(result.extraObservations).toEqual([
    { ...observation(1, "2025-12-31"), ageDay: -1, reason: "before_birth" },
    { ...observation(5, "2026-02-02"), ageDay: 32, reason: "unscheduled_day" },
    { ...observation(2, "2026-02-03"), ageDay: 33, reason: "unscheduled_day" },
    { ...observation(3, "2026-03-02"), ageDay: 60, reason: "unscheduled_day" },
    { ...observation(4, "2026-03-03"), ageDay: 61, reason: "after_schedule" },
  ]);
  expect(result.schedule.find(({ ageDay }) => ageDay === 31)?.status).toBe("overdue");
  expect(result.schedule.find(({ ageDay }) => ageDay === 34)?.status).toBe("overdue");
});

test("classe une observation située dans un espace volontaire", () => {
  const result = available(
    input({
      policy: {
        phases: [
          { startAgeDay: 0, endAgeDay: 2, intervalDays: 1 },
          { startAgeDay: 6, endAgeDay: 8, intervalDays: 2 },
        ],
      },
      observations: [observation(0, "2026-07-05")],
    }),
  );

  expect(result.extraObservations[0]).toMatchObject({
    ageDay: 4,
    reason: "unscheduled_day",
  });
});

test("produit des compteurs et la première échéance incomplète exacts", () => {
  const result = available(
    input({ observations: [observation(0, "2026-07-01")] }),
  );

  expect(result.summary).toEqual({
    totalScheduledCount: 5,
    completedCount: 1,
    dueTodayCount: 1,
    overdueCount: 1,
    upcomingCount: 2,
    extraObservationCount: 0,
    firstIncomplete: {
      ageDay: 1,
      scheduledOn: "2026-07-02",
      status: "overdue",
    },
  });
});

test("retourne firstIncomplete null lorsque tout est réalisé", () => {
  const observations = Array.from({ length: 5 }, (_, observationIndex) =>
    observation(observationIndex, `2026-07-0${observationIndex + 1}`),
  );
  const result = available(input({ observations }));

  expect(result.summary).toMatchObject({
    completedCount: 5,
    dueTodayCount: 0,
    overdueCount: 0,
    upcomingCount: 0,
    firstIncomplete: null,
  });
});

test("ne mute ni la politique, ni ses phases, ni les observations", () => {
  const policy = Object.freeze({
    phases: Object.freeze([
      Object.freeze({ startAgeDay: 0, endAgeDay: 3, intervalDays: 1 }),
    ]),
  });
  const observations = Object.freeze([
    Object.freeze(observation(2, "2026-07-02")),
    Object.freeze(observation(1, "2026-06-30")),
  ]);
  const before = JSON.stringify({ policy, observations });

  const result = available(input({ policy, observations }));

  expect(JSON.stringify({ policy, observations })).toBe(before);
  expect(result.schedule.map(({ ageDay }) => ageDay)).toEqual([0, 1, 2, 3]);
  expect(result.extraObservations.map(({ observationIndex }) => observationIndex)).toEqual([1]);
});
