import { expect, test } from "@playwright/test";

import { buildLitterWeighingPolicyPreview } from "../../src/features/litter-weights/litter-weighing-policy-preview";

test("valide via le parseur canonique et génère l’aperçu exact", () => {
  const result = buildLitterWeighingPolicyPreview({
    phases: [
      { startAgeDay: 0, endAgeDay: 6, intervalDays: 2 },
      { startAgeDay: 10, endAgeDay: 15, intervalDays: 3 },
    ],
  });

  expect(result).toEqual({
    ok: true,
    preview: {
      policy: {
        phases: [
          { startAgeDay: 0, endAgeDay: 6, intervalDays: 2 },
          { startAgeDay: 10, endAgeDay: 15, intervalDays: 3 },
        ],
      },
      scheduledCount: 6,
      ageDays: [0, 2, 4, 6, 10, 13],
    },
  });
});

test("propage les validations canoniques sans accepter de forme approximative", () => {
  const invalidPolicies: unknown[] = [
    { phases: [] },
    { phases: [{ startAgeDay: -1, endAgeDay: 1, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 0, endAgeDay: 366, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 0.5, endAgeDay: 2, intervalDays: 1 }] },
    { phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 0 }] },
    {
      phases: [
        { startAgeDay: 5, endAgeDay: 8, intervalDays: 1 },
        { startAgeDay: 2, endAgeDay: 3, intervalDays: 1 },
      ],
    },
    {
      phases: [
        { startAgeDay: 0, endAgeDay: 5, intervalDays: 1 },
        { startAgeDay: 5, endAgeDay: 8, intervalDays: 1 },
      ],
    },
    { phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 1, extra: true }] },
    { phases: [{ startAgeDay: 0, endAgeDay: 2, intervalDays: 1 }], extra: true },
    {
      phases: Array.from({ length: 13 }, (_, index) => ({
        startAgeDay: index * 2,
        endAgeDay: index * 2,
        intervalDays: 1,
      })),
    },
  ];

  for (const policy of invalidPolicies) {
    expect(buildLitterWeighingPolicyPreview(policy).ok).toBe(false);
  }
});

test("respecte les bornes maximales du parseur, dont le plafond de 400", () => {
  const result = buildLitterWeighingPolicyPreview({
    phases: [{ startAgeDay: 0, endAgeDay: 365, intervalDays: 1 }],
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.preview.scheduledCount).toBe(366);
    expect(result.preview.ageDays.at(-1)).toBe(365);
    expect(result.preview.scheduledCount).toBeLessThanOrEqual(400);
  }
});
