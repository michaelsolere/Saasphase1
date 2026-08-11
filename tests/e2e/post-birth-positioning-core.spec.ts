import { expect, test } from "@playwright/test";

import {
  annotatePostBirthCapacity,
  buildPostBirthQueues,
  diffStalePositioningLines,
  isPostBirthPreferenceCompatible,
  movePostBirthProposal,
  previewPostBirthConfirmation,
  reorderPostBirthFile,
  summarizePostBirthCapacity,
} from "../../src/features/reservations/post-birth-positioning-model";

test("capacity summary keeps preserved puppies and uncertainty separate from confirmed commitments", () => {
  expect(
    summarizePostBirthCapacity({
      born: { male: 4, female: 3 },
      preserved: { male: 1, female: 1 },
      uncertain: { male: 1, female: 0 },
      confirmed: { male: 1, female: 2 },
    }),
  ).toEqual({
    male: { total: 4, preserved: 1, uncertain: 1, committed: 1, available: 1 },
    female: { total: 3, preserved: 1, uncertain: 0, committed: 2, available: 0 },
  });
});

test("sex queues preserve historical ranks and isolate late payments in a complementary wave", () => {
  const queues = buildPostBirthQueues([
    { id: "family-3", rank: 3, preference: "male_only", late: false },
    { id: "family-1", rank: 1, preference: "female_preferred_male_possible", late: false },
    { id: "family-2", rank: 2, preference: "no_preference", late: false },
    { id: "family-8", rank: 8, preference: "female_only", late: true },
  ]);

  expect(queues.male.map((family) => family.id)).toEqual(["family-1", "family-2", "family-3"]);
  expect(queues.female.map((family) => family.id)).toEqual(["family-1", "family-2"]);
  expect(queues.complementary.map((family) => family.id)).toEqual(["family-8"]);
});

test("an active-order override moves one family inside its file without changing historical ranks", () => {
  const result = reorderPostBirthFile(
    [
      { id: "family-1", historicalRank: 1, activeOrder: 1 },
      { id: "family-2", historicalRank: 2, activeOrder: 2 },
      { id: "family-3", historicalRank: 3, activeOrder: 3 },
    ],
    "family-3",
    1,
  );

  expect(result.map(({ id, activeOrder }) => ({ id, activeOrder }))).toEqual([
    { id: "family-3", activeOrder: 1 },
    { id: "family-1", activeOrder: 2 },
    { id: "family-2", activeOrder: 3 },
  ]);
  expect(Object.fromEntries(result.map((family) => [family.id, family.historicalRank]))).toEqual({
    "family-1": 1,
    "family-2": 2,
    "family-3": 3,
  });
});

test("a compatible proposal change recalculates both files and inserts by historical priority", () => {
  const result = movePostBirthProposal(
    [
      { id: "family-1", litterId: "alba", sex: "female" as const, historicalRank: 1, activeOrder: 1, hasOrderOverride: false },
      { id: "family-2", litterId: "alba", sex: "female" as const, historicalRank: 2, activeOrder: 2, hasOrderOverride: true },
      { id: "family-3", litterId: "naya", sex: "male" as const, historicalRank: 3, activeOrder: 1, hasOrderOverride: false },
      { id: "family-4", litterId: "naya", sex: "male" as const, historicalRank: 4, activeOrder: 2, hasOrderOverride: false },
    ],
    "family-2",
    { litterId: "naya", sex: "male" },
  );

  expect(result.map(({ id, litterId, sex, activeOrder, hasOrderOverride }) => ({ id, litterId, sex, activeOrder, hasOrderOverride }))).toEqual([
    { id: "family-1", litterId: "alba", sex: "female", activeOrder: 1, hasOrderOverride: false },
    { id: "family-2", litterId: "naya", sex: "male", activeOrder: 1, hasOrderOverride: false },
    { id: "family-3", litterId: "naya", sex: "male", activeOrder: 2, hasOrderOverride: false },
    { id: "family-4", litterId: "naya", sex: "male", activeOrder: 3, hasOrderOverride: false },
  ]);
  expect(result.find((family) => family.id === "family-2")?.historicalRank).toBe(2);
});

test("capacity overflow stays in the draft and blocks wave confirmation", () => {
  const result = annotatePostBirthCapacity(
    [
      { id: "family-1", litterId: "alba", sex: "female" as const, activeOrder: 1 },
      { id: "family-2", litterId: "alba", sex: "female" as const, activeOrder: 2 },
      { id: "family-3", litterId: "alba", sex: "female" as const, activeOrder: 3 },
    ],
    { "alba:female": 2 },
  );

  expect(result.lines).toEqual([
    { id: "family-1", litterId: "alba", sex: "female", activeOrder: 1, capacityOverflow: false },
    { id: "family-2", litterId: "alba", sex: "female", activeOrder: 2, capacityOverflow: false },
    { id: "family-3", litterId: "alba", sex: "female", activeOrder: 3, capacityOverflow: true },
  ]);
  expect(result.canConfirm).toBe(false);
  expect(result.overflowByFile).toEqual({ "alba:female": 1 });
});

test("the five declared preferences keep their distinct compatibility rules", () => {
  expect([
    isPostBirthPreferenceCompatible("male_only", "male"),
    isPostBirthPreferenceCompatible("male_only", "female"),
    isPostBirthPreferenceCompatible("female_only", "male"),
    isPostBirthPreferenceCompatible("female_only", "female"),
    isPostBirthPreferenceCompatible("male_preferred_female_possible", "female"),
    isPostBirthPreferenceCompatible("female_preferred_male_possible", "male"),
    isPostBirthPreferenceCompatible("no_preference", "male"),
    isPostBirthPreferenceCompatible("no_preference", "female"),
  ]).toEqual([true, false, false, true, true, true, true, true]);
});

test("draft refresh obsoletes only lines whose source versions changed", () => {
  expect(
    diffStalePositioningLines(
      [
        { id: "line-a", reservationVersion: 2, capacityVersion: 4 },
        { id: "line-b", reservationVersion: 3, capacityVersion: 4 },
      ],
      {
        reservationVersions: { "line-a": 2, "line-b": 4 },
        capacityVersion: 4,
      },
    ),
  ).toEqual([{ id: "line-b", reasons: ["reservation_changed"] }]);
});

test("confirmation preview is partial and suggests the least-priority confirmed place on deficit", () => {
  expect(
    previewPostBirthConfirmation({
      available: { male: 1, female: 0 },
      selected: [
        { id: "family-2", rank: 2, sex: "male", stale: false, blocked: false },
        { id: "family-4", rank: 4, sex: "female", stale: false, blocked: true },
      ],
      activeConfirmed: [
        { id: "family-1", rank: 1, sex: "female" },
        { id: "family-3", rank: 3, sex: "female" },
      ],
    }),
  ).toEqual({
    readyIds: ["family-2"],
    blocked: [{ id: "family-4", reason: "blocked" }],
    deficitSuggestions: [{ sex: "female", reservationId: "family-3" }],
  });
});
