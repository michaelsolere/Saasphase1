import { expect, test } from "@playwright/test";

import {
  addGestationAnchorCivilDays,
  resolveGestationAnchor,
  resolveGestationAnchorDate,
} from "../../src/features/litter-journal/gestation-anchor";

test("priorise l’ovulation explicite sur la première saillie", () => {
  const input = {
    estimatedOvulationDate: "2026-06-06",
    matingDate: "2026-06-08",
    matingDate2: "2026-06-10",
  };
  const resolved = resolveGestationAnchor(input);
  expect(resolved).toEqual({
    outcome: "resolved",
    date: "2026-06-06",
    source: "estimated_ovulation",
    sourceDate: "2026-06-06",
    adjustmentDays: 0,
    isDerived: false,
  });
  expect(resolveGestationAnchorDate(input)).toBe("2026-06-06");
  expect(addGestationAnchorCivilDays("2026-06-06", 7)).toBe("2026-06-13");
});

test("replie sur première saillie moins un jour sans écrire d’ovulation", () => {
  const resolved = resolveGestationAnchor({
    estimatedOvulationDate: null,
    matingDate: "2026-06-08",
    matingDate2: "2026-06-12",
  });
  expect(resolved).toEqual({
    outcome: "resolved",
    date: "2026-06-07",
    source: "first_mating_minus_24h",
    sourceDate: "2026-06-08",
    adjustmentDays: -1,
    isDerived: true,
  });
  expect(addGestationAnchorCivilDays("2026-06-07", 7)).toBe("2026-06-14");
  expect(addGestationAnchorCivilDays("2026-06-07", 63)).toBe("2026-08-09");
});

test("n’utilise jamais la deuxième saillie seule comme repli", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toEqual({ outcome: "missing" });
  expect(
    resolveGestationAnchorDate({
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: "2026-06-12",
    }),
  ).toBeNull();
});

test("retourne missing sans aucune date utilisable", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: null,
      matingDate2: null,
    }),
  ).toEqual({ outcome: "missing" });
});

test("respecte les passages de mois et d’année", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2026-03-01",
    }),
  ).toMatchObject({ date: "2026-02-28", source: "first_mating_minus_24h" });
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2027-01-01",
    }),
  ).toMatchObject({ date: "2026-12-31", source: "first_mating_minus_24h" });
});

test("respecte l’année bissextile", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2024-03-01",
    }),
  ).toMatchObject({ date: "2024-02-29" });
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2023-03-01",
    }),
  ).toMatchObject({ date: "2023-02-28" });
});

test("gère une première saillie le 1er janvier", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: null,
      matingDate: "2026-01-01",
    }),
  ).toEqual({
    outcome: "resolved",
    date: "2025-12-31",
    source: "first_mating_minus_24h",
    sourceDate: "2026-01-01",
    adjustmentDays: -1,
    isDerived: true,
  });
});

test("rejette les dates civiles invalides", () => {
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: "2026-02-30",
      matingDate: "2026-06-08",
    }),
  ).toMatchObject({
    outcome: "resolved",
    date: "2026-06-07",
    source: "first_mating_minus_24h",
  });
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: "not-a-date",
      matingDate: "2026-13-40",
    }),
  ).toEqual({ outcome: "missing" });
  expect(
    resolveGestationAnchor({
      estimatedOvulationDate: "2026-06-08T10:00:00Z",
      matingDate: null,
    }),
  ).toEqual({ outcome: "missing" });
});

test("reste indépendant du fuseau Node pour l’arithmétique civile", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    expect(
      resolveGestationAnchor({
        estimatedOvulationDate: null,
        matingDate: "2026-06-08",
      }).outcome === "resolved"
        ? resolveGestationAnchor({
            estimatedOvulationDate: null,
            matingDate: "2026-06-08",
          })
        : null,
    ).toMatchObject({ date: "2026-06-07" });

    process.env.TZ = "America/Los_Angeles";
    expect(addGestationAnchorCivilDays("2026-06-07", 63)).toBe("2026-08-09");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("ne mute pas les entrées", () => {
  const input = {
    estimatedOvulationDate: null as string | null,
    matingDate: "2026-06-08",
    matingDate2: "2026-06-10",
  };
  const before = JSON.stringify(input);
  resolveGestationAnchor(input);
  resolveGestationAnchorDate(input);
  expect(JSON.stringify(input)).toBe(before);
});
