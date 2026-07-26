import { expect, test } from "@playwright/test";

import {
  resolveExpectedBirthAnchor,
  resolveExpectedBirthAnchorDate,
} from "../../src/features/litter-journal/expected-birth-anchor";
import { addGestationAnchorCivilDays } from "../../src/features/litter-journal/gestation-anchor";

test("priorise expected_birth explicite sur ovulation et saillie", () => {
  const input = {
    expectedBirthDate: "2026-08-20",
    estimatedOvulationDate: "2026-06-06",
    matingDate: "2026-06-08",
    matingDate2: "2026-06-10",
  };
  const resolved = resolveExpectedBirthAnchor(input);
  expect(resolved).toEqual({
    outcome: "resolved",
    date: "2026-08-20",
    source: "expected_birth",
    sourceDate: "2026-08-20",
    adjustmentDays: 0,
    isDerived: false,
  });
  expect(resolveExpectedBirthAnchorDate(input)).toBe("2026-08-20");
});

test("dérive ovulation + 63 jours sans écrire expected_birth", () => {
  const input = {
    expectedBirthDate: null,
    estimatedOvulationDate: "2026-06-06",
    matingDate: "2026-06-08",
    matingDate2: "2026-06-12",
  };
  const resolved = resolveExpectedBirthAnchor(input);
  expect(resolved).toEqual({
    outcome: "resolved",
    date: "2026-08-08",
    source: "estimated_ovulation",
    sourceDate: "2026-06-06",
    adjustmentDays: 63,
    isDerived: true,
  });
  expect(addGestationAnchorCivilDays("2026-06-06", 63)).toBe("2026-08-08");
  expect(resolveExpectedBirthAnchorDate(input)).toBe("2026-08-08");
});

test("dérive première saillie + 62 jours sans ovulation", () => {
  const resolved = resolveExpectedBirthAnchor({
    expectedBirthDate: null,
    estimatedOvulationDate: null,
    matingDate: "2026-06-08",
    matingDate2: "2026-06-12",
  });
  expect(resolved).toEqual({
    outcome: "resolved",
    date: "2026-08-09",
    source: "first_mating",
    sourceDate: "2026-06-08",
    adjustmentDays: 62,
    isDerived: true,
  });
  expect(addGestationAnchorCivilDays("2026-06-08", 62)).toBe("2026-08-09");
});

test("n’utilise jamais la deuxième saillie seule comme repli", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toEqual({ outcome: "missing" });
  expect(
    resolveExpectedBirthAnchorDate({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toBeNull();
});

test("n’utilise jamais mating_date_2 pour surcharger la première saillie", () => {
  const resolved = resolveExpectedBirthAnchor({
    expectedBirthDate: null,
    estimatedOvulationDate: null,
    matingDate: "2026-06-08",
    matingDate2: "2026-07-01",
  });
  expect(resolved).toMatchObject({
    outcome: "resolved",
    date: "2026-08-09",
    source: "first_mating",
    sourceDate: "2026-06-08",
    adjustmentDays: 62,
  });
  expect(resolved.outcome === "resolved" ? resolved.date : null).not.toBe(
    addGestationAnchorCivilDays("2026-07-01", 62),
  );
});

test("retourne missing sans aucune date utilisable", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: null,
    }),
  ).toEqual({ outcome: "missing" });
});

test("respecte les passages de mois et d’année pour ovulation +63", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: "2026-11-01",
      matingDate: null,
    }),
  ).toMatchObject({
    date: "2027-01-03",
    source: "estimated_ovulation",
    adjustmentDays: 63,
  });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: "2026-12-20",
      matingDate: null,
    }),
  ).toMatchObject({
    date: "2027-02-21",
    source: "estimated_ovulation",
  });
});

test("respecte les passages de mois et d’année pour première saillie +62", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: "2026-11-01",
    }),
  ).toMatchObject({
    date: "2027-01-02",
    source: "first_mating",
    adjustmentDays: 62,
  });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: "2026-12-31",
    }),
  ).toMatchObject({
    date: "2027-03-03",
    source: "first_mating",
  });
});

test("respecte l’année bissextile", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: "2024-01-01",
      matingDate: null,
    }),
  ).toMatchObject({ date: "2024-03-04" });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: null,
      estimatedOvulationDate: null,
      matingDate: "2024-01-01",
    }),
  ).toMatchObject({ date: "2024-03-03" });
});

test("rejette les dates civiles invalides et bascule sur le repli suivant", () => {
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: "2026-02-30",
      estimatedOvulationDate: "2026-06-06",
      matingDate: "2026-06-08",
    }),
  ).toMatchObject({
    outcome: "resolved",
    date: "2026-08-08",
    source: "estimated_ovulation",
  });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: "not-a-date",
      estimatedOvulationDate: "2026-13-40",
      matingDate: "2026-06-08",
    }),
  ).toMatchObject({
    outcome: "resolved",
    date: "2026-08-09",
    source: "first_mating",
  });
  expect(
    resolveExpectedBirthAnchor({
      expectedBirthDate: "2026-08-20T10:00:00Z",
      estimatedOvulationDate: null,
      matingDate: null,
    }),
  ).toEqual({ outcome: "missing" });
});

test("reste indépendant du fuseau Node pour l’arithmétique civile", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    expect(
      resolveExpectedBirthAnchor({
        expectedBirthDate: null,
        estimatedOvulationDate: "2026-06-06",
        matingDate: null,
      }),
    ).toMatchObject({ date: "2026-08-08" });

    process.env.TZ = "America/Los_Angeles";
    expect(
      resolveExpectedBirthAnchor({
        expectedBirthDate: null,
        estimatedOvulationDate: null,
        matingDate: "2026-06-08",
      }),
    ).toMatchObject({ date: "2026-08-09" });
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("ne mute pas les entrées", () => {
  const input = {
    expectedBirthDate: null as string | null,
    estimatedOvulationDate: null as string | null,
    matingDate: "2026-06-08",
    matingDate2: "2026-06-10",
  };
  const before = JSON.stringify(input);
  resolveExpectedBirthAnchor(input);
  resolveExpectedBirthAnchorDate(input);
  expect(JSON.stringify(input)).toBe(before);
});
