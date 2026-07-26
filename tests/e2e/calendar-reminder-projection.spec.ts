import { expect, test } from "@playwright/test";

import type { BreedingCalendarEvent } from "../../src/features/breeding-calendar/breeding-calendar-contract";
import {
  classifyCalendarReminderProjectionState,
  computeCalendarReminderTriggerAt,
  computeCalendarReminderTriggerLocalDate,
  formatCalendarReminderScheduleLabel,
  projectCalendarReminder,
  sortCalendarReminderProjections,
  type CalendarReminderProjection,
  type CalendarReminderRule,
} from "../../src/features/breeding-calendar/calendar-reminder-projection";
import { localCivilDateTimeToUtcIso } from "../../src/lib/timezone";

const TZ = "Europe/Paris";
const orgId = "20000000-0000-4000-8000-000000000001";
const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const cycleId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const appointmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reservationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const motherId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const litterId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function litterEvent(
  overrides: Partial<Extract<BreedingCalendarEvent, { sourceType: "litter_care" }>> = {},
): Extract<BreedingCalendarEvent, { sourceType: "litter_care" }> {
  return {
    identitySource: "litter-care",
    sourceType: "litter_care",
    sourceRecordId: taskId,
    litterId,
    itemKind: "task",
    title: "Visite vétérinaire",
    contextLabel: "Rosie × Rimbaud",
    startsOn: "2026-09-10",
    startsLocalTime: null,
    endsOn: null,
    endsLocalTime: null,
    timezoneName: TZ,
    isAllDay: true,
    sequence: 1,
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    kind: "task",
    category: "veterinary",
    href: `/litters/journal?litter=${litterId}#litter-care-tasks`,
    ...overrides,
  };
}

function cycleEvent(
  overrides: Partial<
    Extract<BreedingCalendarEvent, { sourceType: "reproductive_cycle" }>
  > = {},
): Extract<BreedingCalendarEvent, { sourceType: "reproductive_cycle" }> {
  return {
    identitySource: "reproductive-cycle",
    sourceType: "reproductive_cycle",
    sourceRecordId: cycleId,
    motherId,
    cycleStatus: "planned",
    title: "Chaleurs prévues",
    contextLabel: "Nova",
    startsOn: "2026-09-10",
    startsLocalTime: null,
    endsOn: null,
    endsLocalTime: null,
    timezoneName: null,
    isAllDay: true,
    sequence: 1,
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    kind: "heat_cycle",
    category: "reproduction",
    href: `/animals/${motherId}/reproduction#cycle-${cycleId}`,
    ...overrides,
  };
}

function appointmentEvent(
  overrides: Partial<
    Extract<BreedingCalendarEvent, { sourceType: "adopter_appointment" }>
  > = {},
): Extract<BreedingCalendarEvent, { sourceType: "adopter_appointment" }> {
  return {
    identitySource: "adopter-appointment",
    sourceType: "adopter_appointment",
    sourceRecordId: appointmentId,
    reservationId,
    appointmentStatus: "planned",
    startsAt: "2026-09-10T08:00:00.000Z",
    title: "Choix du chiot/chaton",
    contextLabel: "Camille Dupont",
    startsOn: "2026-09-10",
    startsLocalTime: "10:00",
    endsOn: null,
    endsLocalTime: null,
    timezoneName: TZ,
    isAllDay: false,
    sequence: 1,
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    kind: "puppy_choice",
    category: "adopter",
    href: `/reservations/${reservationId}#appointments`,
    ...overrides,
  };
}

function reminder(
  overrides: Partial<CalendarReminderRule> = {},
): CalendarReminderRule {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: orgId,
    sourceType: "litter_care_task",
    sourceRecordId: taskId,
    daysBefore: 0,
    localTime: "09:00",
    timezoneName: TZ,
    revisionNo: 1,
    acknowledgedTriggerAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

/** Frozen Paris-local "now" via a known UTC instant. */
function parisNow(isoUtc: string) {
  return new Date(isoUtc);
}

test("calcule les déclencheurs J-0, J-1, J-2, J-7 et les changements de mois/année/bissextile", () => {
  expect(computeCalendarReminderTriggerLocalDate("2026-09-10", 0)).toBe("2026-09-10");
  expect(computeCalendarReminderTriggerLocalDate("2026-09-10", 1)).toBe("2026-09-09");
  expect(computeCalendarReminderTriggerLocalDate("2026-09-10", 2)).toBe("2026-09-08");
  expect(computeCalendarReminderTriggerLocalDate("2026-09-10", 7)).toBe("2026-09-03");

  expect(computeCalendarReminderTriggerLocalDate("2026-09-01", 1)).toBe("2026-08-31");
  expect(computeCalendarReminderTriggerLocalDate("2026-01-01", 1)).toBe("2025-12-31");
  expect(computeCalendarReminderTriggerLocalDate("2028-03-01", 1)).toBe("2028-02-29");
  expect(computeCalendarReminderTriggerLocalDate("2027-03-01", 1)).toBe("2027-02-28");

  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-09-10",
      daysBefore: 0,
      localTime: "09:00",
      timezoneName: TZ,
    }),
  ).toBe(localCivilDateTimeToUtcIso("2026-09-10", "09:00", TZ));
  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-09-10",
      daysBefore: 1,
      localTime: "09:00",
      timezoneName: TZ,
    }),
  ).toBe(localCivilDateTimeToUtcIso("2026-09-09", "09:00", TZ));
  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-09-10",
      daysBefore: 2,
      localTime: "18:30",
      timezoneName: TZ,
    }),
  ).toBe(localCivilDateTimeToUtcIso("2026-09-08", "18:30", TZ));
  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-09-10",
      daysBefore: 7,
      localTime: "08:15",
      timezoneName: TZ,
    }),
  ).toBe(localCivilDateTimeToUtcIso("2026-09-03", "08:15", TZ));
});

test("convertit Europe/Paris hiver/été et gère les trous/chevauchements DST", () => {
  expect(localCivilDateTimeToUtcIso("2026-01-15", "09:30", TZ)).toBe(
    "2026-01-15T08:30:00.000Z",
  );
  expect(localCivilDateTimeToUtcIso("2026-07-15", "09:30", TZ)).toBe(
    "2026-07-15T07:30:00.000Z",
  );

  // Spring forward 2026-03-29: 02:00–02:59 do not exist.
  expect(localCivilDateTimeToUtcIso("2026-03-29", "01:30", TZ)).toBe(
    "2026-03-29T00:30:00.000Z",
  );
  expect(localCivilDateTimeToUtcIso("2026-03-29", "02:00", TZ)).toBeNull();
  expect(localCivilDateTimeToUtcIso("2026-03-29", "02:30", TZ)).toBeNull();
  expect(localCivilDateTimeToUtcIso("2026-03-29", "03:00", TZ)).toBe(
    "2026-03-29T01:00:00.000Z",
  );

  // Fall back 2026-10-25: first matching wall time (CEST / UTC+2).
  expect(localCivilDateTimeToUtcIso("2026-10-25", "01:30", TZ)).toBe(
    "2026-10-24T23:30:00.000Z",
  );
  expect(localCivilDateTimeToUtcIso("2026-10-25", "02:30", TZ)).toBe(
    "2026-10-25T00:30:00.000Z",
  );
  expect(localCivilDateTimeToUtcIso("2026-10-25", "03:00", TZ)).toBe(
    "2026-10-25T02:00:00.000Z",
  );

  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-03-29",
      daysBefore: 0,
      localTime: "02:30",
      timezoneName: TZ,
    }),
  ).toBeNull();
  expect(
    computeCalendarReminderTriggerAt({
      eventDate: "2026-03-29",
      daysBefore: 0,
      localTime: "03:30",
      timezoneName: TZ,
    }),
  ).toBe(localCivilDateTimeToUtcIso("2026-03-29", "03:30", TZ));
});

test("projette invalid_projection pour une heure locale inexistante", () => {
  const now = parisNow("2026-03-29T10:00:00.000Z");
  const projection = projectCalendarReminder({
    reminder: reminder({ daysBefore: 0, localTime: "02:30" }),
    event: litterEvent({ startsOn: "2026-03-29" }),
    now,
  });
  expect(projection.currentTriggerAt).toBeNull();
  expect(projection.projectionState).toBe("invalid_projection");
  expect(
    classifyCalendarReminderProjectionState({
      now,
      timezoneName: TZ,
      currentTriggerAt: null,
      acknowledgedTriggerAt: null,
      acknowledgedAt: null,
      sourceActive: true,
    }),
  ).toBe("invalid_projection");
});

test("classe later_today, due, overdue et acknowledged_today", () => {
  const event = litterEvent({ startsOn: "2026-07-26" });
  const trigger = computeCalendarReminderTriggerAt({
    eventDate: "2026-07-26",
    daysBefore: 0,
    localTime: "14:00",
    timezoneName: TZ,
  })!;
  expect(trigger).toBe("2026-07-26T12:00:00.000Z");

  const later = projectCalendarReminder({
    reminder: reminder({ daysBefore: 0, localTime: "14:00" }),
    event,
    now: parisNow("2026-07-26T10:00:00.000Z"),
  });
  expect(later.projectionState).toBe("later_today");

  const due = projectCalendarReminder({
    reminder: reminder({ daysBefore: 0, localTime: "14:00" }),
    event,
    now: parisNow("2026-07-26T12:00:00.000Z"),
  });
  expect(due.projectionState).toBe("due");

  const overdue = projectCalendarReminder({
    reminder: reminder({ daysBefore: 0, localTime: "14:00" }),
    event,
    now: parisNow("2026-07-27T08:00:00.000Z"),
  });
  expect(overdue.projectionState).toBe("overdue");

  const acknowledgedToday = projectCalendarReminder({
    reminder: reminder({
      daysBefore: 0,
      localTime: "14:00",
      acknowledgedTriggerAt: trigger,
      acknowledgedAt: "2026-07-26T12:05:00.000Z",
      acknowledgedBy: "10000000-0000-4000-8000-000000000001",
    }),
    event,
    now: parisNow("2026-07-26T15:00:00.000Z"),
  });
  expect(acknowledgedToday.projectionState).toBe("acknowledged_today");
});

test("une ancienne acknowledgement ne matche plus après déplacement de la source", () => {
  const oldTrigger = computeCalendarReminderTriggerAt({
    eventDate: "2026-09-10",
    daysBefore: 1,
    localTime: "09:00",
    timezoneName: TZ,
  })!;
  const movedEvent = litterEvent({ startsOn: "2026-09-20" });
  const newTrigger = computeCalendarReminderTriggerAt({
    eventDate: "2026-09-20",
    daysBefore: 1,
    localTime: "09:00",
    timezoneName: TZ,
  })!;
  expect(oldTrigger).not.toBe(newTrigger);

  const afterMove = projectCalendarReminder({
    reminder: reminder({
      daysBefore: 1,
      localTime: "09:00",
      acknowledgedTriggerAt: oldTrigger,
      acknowledgedAt: "2026-09-09T08:00:00.000Z",
      acknowledgedBy: "10000000-0000-4000-8000-000000000001",
    }),
    event: movedEvent,
    now: parisNow("2026-09-19T06:00:00.000Z"),
  });
  expect(afterMove.currentTriggerAt).toBe(newTrigger);
  expect(afterMove.acknowledgedTriggerAt).toBe(oldTrigger);
  expect(afterMove.projectionState).toBe("later_today");

  const reactivatedDue = projectCalendarReminder({
    reminder: reminder({
      daysBefore: 1,
      localTime: "09:00",
      acknowledgedTriggerAt: oldTrigger,
      acknowledgedAt: "2026-09-09T08:00:00.000Z",
      acknowledgedBy: "10000000-0000-4000-8000-000000000001",
    }),
    event: movedEvent,
    now: parisNow("2026-09-19T08:00:00.000Z"),
  });
  expect(reactivatedDue.projectionState).toBe("due");
});

test("filtre inactive_source pour rendez-vous done, tâche absente et cycle mated absent", () => {
  const now = parisNow("2026-09-10T10:00:00.000Z");

  const doneAppointment = projectCalendarReminder({
    reminder: reminder({
      sourceType: "adopter_event",
      sourceRecordId: appointmentId,
    }),
    event: appointmentEvent({ appointmentStatus: "done" }),
    now,
  });
  expect(doneAppointment.projectionState).toBe("inactive_source");

  const missingTask = projectCalendarReminder({
    reminder: reminder(),
    event: null,
    now,
  });
  expect(missingTask.projectionState).toBe("inactive_source");
  expect(missingTask.event).toBeNull();

  const matedAbsent = projectCalendarReminder({
    reminder: reminder({
      sourceType: "reproductive_cycle",
      sourceRecordId: cycleId,
    }),
    event: null,
    now,
  });
  expect(matedAbsent.projectionState).toBe("inactive_source");
  expect(cycleEvent({ cycleStatus: "planned" }).cycleStatus).toBe("planned");
});

test("trie les rappels par trigger puis titre puis id sans muter les entrées", () => {
  const now = parisNow("2026-09-01T10:00:00.000Z");
  const early = projectCalendarReminder({
    reminder: reminder({
      id: "22222222-2222-4222-8222-222222222222",
      daysBefore: 2,
      localTime: "08:00",
    }),
    event: litterEvent({ startsOn: "2026-09-10", title: "Zulu" }),
    now,
  });
  const lateSameTitleA = projectCalendarReminder({
    reminder: reminder({
      id: "33333333-3333-4333-8333-333333333333",
      daysBefore: 0,
      localTime: "09:00",
    }),
    event: litterEvent({
      sourceRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      startsOn: "2026-09-10",
      title: "Alpha",
    }),
    now,
  });
  const lateSameTitleB = projectCalendarReminder({
    reminder: reminder({
      id: "11111111-1111-4111-8111-111111111111",
      daysBefore: 0,
      localTime: "09:00",
    }),
    event: litterEvent({
      sourceRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      startsOn: "2026-09-10",
      title: "Alpha",
    }),
    now,
  });
  const mid = projectCalendarReminder({
    reminder: reminder({
      id: "44444444-4444-4444-8444-444444444444",
      daysBefore: 1,
      localTime: "09:00",
    }),
    event: litterEvent({
      sourceRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      startsOn: "2026-09-10",
      title: "Bravo",
    }),
    now,
  });

  const input: CalendarReminderProjection[] = [
    lateSameTitleA,
    mid,
    early,
    lateSameTitleB,
  ];
  const snapshot = JSON.stringify(input);
  const sorted = sortCalendarReminderProjections(input);
  expect(sorted.map((item) => item.id)).toEqual([
    early.id,
    mid.id,
    lateSameTitleB.id,
    lateSameTitleA.id,
  ]);
  expect(JSON.stringify(input)).toBe(snapshot);
});

test("projectCalendarReminder ne mute pas le rappel ni l’événement d’entrée", () => {
  const rule = reminder({
    daysBefore: 1,
    localTime: "09:00:00",
    acknowledgedTriggerAt: null,
  });
  const event = litterEvent({ startsOn: "2026-09-10", title: "Original" });
  const ruleSnapshot = JSON.stringify(rule);
  const eventSnapshot = JSON.stringify(event);

  const projection = projectCalendarReminder({
    reminder: rule,
    event,
    now: parisNow("2026-09-09T08:00:00.000Z"),
  });

  expect(projection.localTime).toBe("09:00");
  expect(projection.scheduleLabel).toBe("1 jour avant à 09:00");
  expect(projection.projectionState).toBe("due");
  expect(JSON.stringify(rule)).toBe(ruleSnapshot);
  expect(JSON.stringify(event)).toBe(eventSnapshot);
});

test("formatCalendarReminderScheduleLabel pour jour 0, 1 et N", () => {
  expect(formatCalendarReminderScheduleLabel(0, "09:00")).toBe(
    "Le jour même à 09:00",
  );
  expect(formatCalendarReminderScheduleLabel(1, "09:00")).toBe(
    "1 jour avant à 09:00",
  );
  expect(formatCalendarReminderScheduleLabel(7, "18:30:00")).toBe(
    "7 jours avant à 18:30",
  );
});

test("expose le message utilisateur stale_trigger", async () => {
  const { CALENDAR_REMINDER_STALE_TRIGGER_MESSAGE } = await import(
    "../../src/features/breeding-calendar/calendar-reminder-projection"
  );
  expect(CALENDAR_REMINDER_STALE_TRIGGER_MESSAGE).toBe(
    "La date de l’événement a changé. Rechargez la page puis traitez le nouveau rappel.",
  );
});
