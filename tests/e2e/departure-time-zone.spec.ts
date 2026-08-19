import { expect, test } from "@playwright/test";

import { departureDateTimeInputToIso, isoToParisLocalInput, parisWallTimeToIso, shiftParisCalendarDays } from "../../src/features/departures/departure-time-zone";

test("converts Paris wall time independently from the runtime timezone", () => {
  expect(parisWallTimeToIso("2026-07-03T09:00")).toBe("2026-07-03T07:00:00.000Z");
  expect(parisWallTimeToIso("2026-01-03T09:00")).toBe("2026-01-03T08:00:00.000Z");
  expect(isoToParisLocalInput("2026-07-03T07:00:00.000Z")).toBe("2026-07-03T09:00");
  expect(departureDateTimeInputToIso("2026-07-03T07:00:00.000Z")).toBe("2026-07-03T07:00:00.000Z");
  expect(parisWallTimeToIso("2026-03-29T01:30")).toBe("2026-03-29T00:30:00.000Z");
  expect(parisWallTimeToIso("2026-03-29T02:30")).toBeNull();
});

test("shifts collective appointments by Paris calendar days across DST", () => {
  expect(shiftParisCalendarDays("2026-03-28T08:00:00.000Z", 1)).toBe("2026-03-29T07:00:00.000Z");
  expect(shiftParisCalendarDays("2026-10-24T07:00:00.000Z", 1)).toBe("2026-10-25T08:00:00.000Z");
});
