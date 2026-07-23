import { expect, test } from "@playwright/test";

import {
  getLitterCareTaskWindowState,
  type LitterCareTaskSummary,
} from "../../src/features/litter-journal/litter-care-tasks-core";

type WindowInput = Pick<
  LitterCareTaskSummary,
  | "itemKind"
  | "status"
  | "retainedStartsOn"
  | "retainedStartsLocalTime"
  | "retainedEndsOn"
  | "retainedEndsLocalTime"
>;

function windowInput(overrides: Partial<WindowInput> = {}): WindowInput {
  return {
    itemKind: "window",
    status: "planned",
    retainedStartsOn: "2026-08-10",
    retainedStartsLocalTime: null,
    retainedEndsOn: "2026-08-10",
    retainedEndsLocalTime: null,
    ...overrides,
  };
}

test("calcule une fenêtre journée entière sans heure implicite", () => {
  const input = windowInput();

  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-09",
      localTime: "23:59",
    }),
  ).toBe("upcoming");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "00:00",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "23:59:59",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-11",
      localTime: "00:00",
    }),
  ).toBe("overdue");
});

test("respecte exactement les heures de début et de fin", () => {
  const input = windowInput({
    retainedStartsLocalTime: "08:00",
    retainedEndsLocalTime: "18:00",
  });

  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "07:59:59",
    }),
  ).toBe("upcoming");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "08:00",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "12:30",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "18:00",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "18:00:01",
    }),
  ).toBe("overdue");
});

test("calcule correctement une fenêtre sur plusieurs jours", () => {
  const input = windowInput({
    retainedStartsOn: "2026-08-10",
    retainedStartsLocalTime: "20:00",
    retainedEndsOn: "2026-08-12",
    retainedEndsLocalTime: "06:00",
  });

  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-10",
      localTime: "19:59",
    }),
  ).toBe("upcoming");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-11",
      localTime: "12:00",
    }),
  ).toBe("open");
  expect(
    getLitterCareTaskWindowState(input, {
      date: "2026-08-12",
      localTime: "06:00:01",
    }),
  ).toBe("overdue");
});

test("donne la priorité aux états terminaux", () => {
  for (const [status, expected] of [
    ["done", "treated"],
    ["cancelled", "cancelled"],
    ["not_applicable", "not_applicable"],
  ] as const) {
    expect(
      getLitterCareTaskWindowState(windowInput({ status }), {
        date: "invalid",
        localTime: "invalid",
      }),
    ).toBe(expected);
  }
});
