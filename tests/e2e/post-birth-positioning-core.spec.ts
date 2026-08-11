import { expect, test } from "@playwright/test";

import {
  buildPostBirthQueues,
  diffStalePositioningLines,
  previewPostBirthConfirmation,
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
