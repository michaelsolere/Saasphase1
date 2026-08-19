import { expect, test } from "@playwright/test";

import {
  buildCollectiveShiftDraft,
  buildDepartureSlot,
  eligiblePublicSlots,
  evaluateDeparturePlanCoverage,
  slotsOverlap,
  type DepartureSlot,
} from "../../src/features/departures/departure-planning-core";

const slot = (overrides: Partial<DepartureSlot> = {}): DepartureSlot => ({
  id: "10000000-0000-4000-8000-000000000001",
  startsAt: "2026-09-04T08:00:00.000Z",
  durationMinutes: 75,
  visibility: "public",
  status: "open",
  reservationId: null,
  litterIds: ["20000000-0000-4000-8000-000000000001"],
  ...overrides,
});

test("builds one non-overlapping appointment block from the organization default", () => {
  const built = buildDepartureSlot({
    id: slot().id,
    startsAt: "2026-09-04T08:00:00.000Z",
    defaultDurationMinutes: 75,
    litterIds: slot().litterIds,
  });

  expect(built).toMatchObject({ durationMinutes: 75, visibility: "public", status: "open" });
  expect(slotsOverlap(built, slot({ id: "10000000-0000-4000-8000-000000000002", startsAt: "2026-09-04T09:15:00.000Z" }))).toBe(false);
  expect(slotsOverlap(built, slot({ id: "10000000-0000-4000-8000-000000000003", startsAt: "2026-09-04T09:14:00.000Z" }))).toBe(true);
});

test("supports an individual duration and private exceptional appointment", () => {
  expect(buildDepartureSlot({
    id: slot().id,
    startsAt: "2026-09-16T12:00:00.000Z",
    defaultDurationMinutes: 75,
    durationMinutes: 90,
    visibility: "exceptional",
    reservationId: "30000000-0000-4000-8000-000000000001",
    litterIds: slot().litterIds,
  })).toMatchObject({ durationMinutes: 90, visibility: "exceptional", status: "booked" });
});

test("filters public availability by litter release date", () => {
  const later = slot({ id: "10000000-0000-4000-8000-000000000002", startsAt: "2026-09-06T08:00:00.000Z" });
  const privateSlot = slot({ id: "10000000-0000-4000-8000-000000000003", startsAt: "2026-09-06T10:00:00.000Z", visibility: "exceptional" });
  const booked = slot({ id: "10000000-0000-4000-8000-000000000004", startsAt: "2026-09-06T11:30:00.000Z", status: "booked", reservationId: "30000000-0000-4000-8000-000000000001" });

  expect(eligiblePublicSlots([slot(), later, privateSlot, booked], {
    litterId: slot().litterIds[0]!,
    earliestDepartureAt: "2026-09-05T00:00:00.000Z",
  }).map((item) => item.id)).toEqual([later.id]);
});

test("blocks invitation when free public blocks do not cover invited families", () => {
  expect(evaluateDeparturePlanCoverage({ slots: [slot()], invitedReservationIds: ["a", "b"] })).toEqual({
    canSend: false,
    invitedCount: 2,
    freePublicSlotCount: 1,
    missingSlotCount: 1,
  });
});

test("prepares a collective shift without changing unaffected litters", () => {
  const affected = slot({ reservationId: "r1", status: "booked" });
  const unaffected = slot({ id: "10000000-0000-4000-8000-000000000002", reservationId: "r2", status: "booked", litterIds: ["20000000-0000-4000-8000-000000000002"] });
  const shifted = buildCollectiveShiftDraft({ slots: [affected, unaffected], litterId: affected.litterIds[0]!, dayDelta: 3 });

  expect(shifted.find((item) => item.slotId === affected.id)?.proposedStartsAt).toBe("2026-09-07T08:00:00.000Z");
  expect(shifted.some((item) => item.slotId === unaffected.id)).toBe(false);
});
