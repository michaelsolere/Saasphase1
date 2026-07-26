import { expect, test } from "@playwright/test";

import {
  sequenceFromUpdatedAt,
  toAdopterAppointmentCalendarEvent,
} from "../../src/features/breeding-calendar/adopter-appointment-calendar";
import { toBreedingCalendarEvent } from "../../src/features/breeding-calendar/breeding-calendar-contract";
import {
  filterBreedingCalendarEvents,
  filterReproductiveCyclesForToday,
} from "../../src/features/breeding-calendar/breeding-calendar-projection";
import { toReproductiveCycleCalendarEvent } from "../../src/features/breeding-calendar/reproductive-cycle-calendar";
import {
  buildBreedingCalendarICalendar,
  buildLitterCareICalendar,
} from "../../src/features/litter-journal/litter-care-icalendar";
import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";

const litterA = "11111111-1111-4111-8111-111111111111";
const litterB = "11111111-1111-4111-8111-111111111112";
const taskA = "22222222-2222-4222-8222-222222222222";
const appointmentA = "33333333-3333-4333-8333-333333333333";
const appointmentB = "44444444-4444-4444-8444-444444444444";
const reservationA = "55555555-5555-4555-8555-555555555555";
const cycleA = "66666666-6666-4666-8666-666666666666";
const cycleB = "77777777-7777-4777-8777-777777777777";
const motherA = "88888888-8888-4888-8888-888888888888";

function task(overrides: Partial<LitterCareTaskSummary> = {}): LitterCareTaskSummary {
  return {
    id: taskA,
    litterId: litterA,
    source: "manual",
    litterPlanItemId: null,
    organizationTemplateId: null,
    systemTemplateCode: null,
    occurrenceNo: 1,
    category: "veterinary",
    targetScope: "litter",
    title: "Visite vétérinaire",
    description: "Description privée",
    anchorType: null,
    anchorDate: null,
    offsetDays: null,
    itemKind: "task",
    priority: "normal",
    suggestedFor: null,
    suggestedLocalTime: null,
    plannedFor: "2026-08-12",
    scheduledLocalTime: null,
    scheduleTimezoneName: "Europe/Paris",
    suggestedStartsOn: null,
    suggestedStartsLocalTime: null,
    suggestedEndsOn: null,
    suggestedEndsLocalTime: null,
    retainedStartsOn: null,
    retainedStartsLocalTime: null,
    retainedEndsOn: null,
    retainedEndsLocalTime: null,
    scheduleSource: "suggested",
    isScheduleLocked: false,
    scheduleLockedAt: null,
    scheduleLockedBy: null,
    revisionNo: 2,
    status: "planned",
    resolvedAt: null,
    resolvedTimezoneName: null,
    resolvedBy: null,
    resolutionNote: "Ne pas exporter",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function event(value: LitterCareTaskSummary, name = "Rosie × Rimbaud") {
  return toBreedingCalendarEvent(value, name);
}

function appointment(
  overrides: Partial<Parameters<typeof toAdopterAppointmentCalendarEvent>[0]> = {},
) {
  return toAdopterAppointmentCalendarEvent({
    id: appointmentA,
    reservationId: reservationA,
    eventType: "puppy_choice",
    status: "planned",
    plannedAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    contactLabel: "Camille Dupont",
    ...overrides,
  });
}

function cycle(
  overrides: Partial<Parameters<typeof toReproductiveCycleCalendarEvent>[0]> = {},
) {
  return toReproductiveCycleCalendarEvent({
    id: cycleA,
    motherId: motherA,
    status: "planned",
    startedOn: "2026-07-26",
    updatedAt: "2026-07-01T10:00:00.000Z",
    animalLabel: "Nova",
    ...overrides,
  });
}

test("convertit les tâches planifiées, fenêtres et contextualise sans mutation", () => {
  const point = task();
  const window = task({
    id: "22222222-2222-4222-8222-222222222223",
    itemKind: "window",
    plannedFor: null,
    retainedStartsOn: "2026-08-13",
    retainedEndsOn: "2026-08-15",
    retainedStartsLocalTime: "08:00",
    retainedEndsLocalTime: "18:00",
  });
  const snapshot = JSON.stringify([point, window]);
  expect(event(point)).toMatchObject({
    startsOn: "2026-08-12",
    endsOn: null,
    contextLabel: "Rosie × Rimbaud",
    sequence: 2,
    kind: "task",
    href: `/litters/journal?litter=${litterA}#litter-care-tasks`,
  });
  expect(event(window)).toMatchObject({
    startsOn: "2026-08-13",
    endsOn: "2026-08-15",
    isAllDay: false,
  });
  expect(event(task({ status: "done" }))).toBeNull();
  expect(event(task({ plannedFor: null }))).toBeNull();
  expect(JSON.stringify([point, window])).toBe(snapshot);
});

test("convertit les rendez-vous puppy_choice et adoption avec planned et done", () => {
  const choice = appointment();
  const adoption = appointment({
    id: appointmentB,
    eventType: "adoption",
    status: "done",
    plannedAt: "2026-09-20T12:30:00.000Z",
  });
  expect(choice).toMatchObject({
    sourceType: "adopter_appointment",
    identitySource: "adopter-appointment",
    title: "Choix du chiot/chaton",
    contextLabel: "Camille Dupont",
    startsOn: "2026-09-10",
    startsLocalTime: "10:00",
    startsAt: "2026-09-10T08:00:00.000Z",
    appointmentStatus: "planned",
    href: `/reservations/${reservationA}#appointments`,
    category: "adopter_appointment",
  });
  expect(adoption).toMatchObject({
    title: "Adoption / départ",
    appointmentStatus: "done",
    startsOn: "2026-09-20",
    startsLocalTime: "14:30",
    startsAt: "2026-09-20T12:30:00.000Z",
  });
  expect(appointment({ status: "planned" })).not.toBeNull();
  expect(appointment({ status: "done" })).not.toBeNull();
});

test("exclut postponed et les autres types d’événements", () => {
  expect(appointment({ status: "postponed" })).toBeNull();
  expect(appointment({ eventType: "post_adoption_follow_up" })).toBeNull();
  expect(appointment({ eventType: "payment_due" })).toBeNull();
  expect(appointment({ eventType: "document_reminder" })).toBeNull();
  expect(appointment({ plannedAt: "not-a-date" })).toBeNull();
});

test("convertit planned et in_progress, exclut mated/closed/cancelled", () => {
  const planned = cycle();
  const inProgress = cycle({
    id: cycleB,
    status: "in_progress",
    startedOn: "2026-07-20",
  });
  const snapshot = JSON.stringify({
    id: cycleA,
    motherId: motherA,
    status: "planned",
    startedOn: "2026-07-26",
    updatedAt: "2026-07-01T10:00:00.000Z",
    animalLabel: "Nova",
  });
  expect(planned).toMatchObject({
    identitySource: "reproductive-cycle",
    sourceType: "reproductive_cycle",
    sourceRecordId: cycleA,
    motherId: motherA,
    cycleStatus: "planned",
    title: "Chaleurs prévues",
    contextLabel: "Nova",
    startsOn: "2026-07-26",
    startsLocalTime: null,
    endsOn: null,
    isAllDay: true,
    kind: "heat_cycle",
    category: "reproduction",
    href: `/animals/${motherA}/reproduction#cycle-${cycleA}`,
    sequence: sequenceFromUpdatedAt("2026-07-01T10:00:00.000Z"),
  });
  expect(inProgress).toMatchObject({
    cycleStatus: "in_progress",
    title: "Chaleurs en cours",
    startsOn: "2026-07-20",
  });
  expect(cycle({ status: "mated" })).toBeNull();
  expect(cycle({ status: "closed" })).toBeNull();
  expect(cycle({ status: "cancelled" })).toBeNull();
  expect(cycle({ startedOn: "2026-02-30" })).toBeNull();
  expect(cycle({ startedOn: "not-a-date" })).toBeNull();
  expect(
    JSON.stringify({
      id: cycleA,
      motherId: motherA,
      status: "planned",
      startedOn: "2026-07-26",
      updatedAt: "2026-07-01T10:00:00.000Z",
      animalLabel: "Nova",
    }),
  ).toBe(snapshot);
});

test("projette Europe/Paris autour de minuit et du changement d’heure", () => {
  // 23:30 UTC le 15 janvier = 00:30 Europe/Paris le 16 janvier (hiver).
  expect(
    appointment({ plannedAt: "2026-01-15T23:30:00.000Z" }),
  ).toMatchObject({
    startsOn: "2026-01-16",
    startsLocalTime: "00:30",
    startsAt: "2026-01-15T23:30:00.000Z",
  });
  // Après le passage à l’heure d’été (29 mars 2026, 02:00 → 03:00).
  expect(
    appointment({ plannedAt: "2026-03-29T01:30:00.000Z" }),
  ).toMatchObject({
    startsOn: "2026-03-29",
    startsLocalTime: "03:30",
    startsAt: "2026-03-29T01:30:00.000Z",
  });
  // Changement de date autour de minuit Europe/Paris (été UTC+2).
  expect(
    appointment({ plannedAt: "2026-07-25T22:00:00.000Z" }),
  ).toMatchObject({
    startsOn: "2026-07-26",
    startsLocalTime: "00:00",
    startsAt: "2026-07-25T22:00:00.000Z",
  });
});

test("préserve les deux occurrences de 02:30 au retour à l’heure d’hiver", () => {
  const firstOccurrenceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondOccurrenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  // 25 octobre 2026 : 03:00 CEST → 02:00 CET. 02:30 existe deux fois.
  const first = appointment({
    id: firstOccurrenceId,
    plannedAt: "2026-10-25T00:30:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  })!;
  const second = appointment({
    id: secondOccurrenceId,
    plannedAt: "2026-10-25T01:30:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  })!;

  expect(first).toMatchObject({
    startsOn: "2026-10-25",
    startsLocalTime: "02:30",
    startsAt: "2026-10-25T00:30:00.000Z",
  });
  expect(second).toMatchObject({
    startsOn: "2026-10-25",
    startsLocalTime: "02:30",
    startsAt: "2026-10-25T01:30:00.000Z",
  });

  const ics = buildBreedingCalendarICalendar({
    events: [first, second],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  expect(ics).toContain("DTSTART:20261025T003000Z");
  expect(ics).toContain("DTSTART:20261025T013000Z");
  expect(ics).not.toContain("DTSTART:20261025T003000Z\r\nDTSTART:20261025T003000Z");

  const uids = [...ics.matchAll(/UID:([^\r]+)/g)].map((match) => match[1]);
  expect(uids).toHaveLength(2);
  expect(uids[0]).not.toBe(uids[1]);
  expect(uids[0]).not.toContain(firstOccurrenceId);
  expect(uids[1]).not.toContain(secondOccurrenceId);

  const firstAlone = buildBreedingCalendarICalendar({
    events: [first],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  const secondAlone = buildBreedingCalendarICalendar({
    events: [second],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  expect(/UID:([^\r]+)/.exec(firstAlone)?.[1]).toBe(uids[0]);
  expect(/UID:([^\r]+)/.exec(secondAlone)?.[1]).toBe(uids[1]);

  const modifiedSecond = appointment({
    id: secondOccurrenceId,
    plannedAt: "2026-10-25T01:30:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
  })!;
  const modifiedIcs = buildBreedingCalendarICalendar({
    events: [modifiedSecond],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  expect(modifiedIcs).toContain(`UID:${uids[1]}`);
  expect(modifiedIcs).toContain("DTSTART:20261025T013000Z");
  expect(modifiedIcs).toContain(
    `SEQUENCE:${sequenceFromUpdatedAt(modifiedSecond.lastModifiedAt)}`,
  );
  expect(modifiedSecond.sequence).not.toBe(second.sequence);
});

test("conserve une identité stable distincte de litter_care", () => {
  const litter = event(task())!;
  const adopter = appointment()!;
  const heat = cycle()!;
  expect(litter.identitySource).toBe("litter-care");
  expect(adopter.identitySource).toBe("adopter-appointment");
  expect(heat.identitySource).toBe("reproductive-cycle");
  expect(litter.sourceRecordId).not.toBe(adopter.sourceRecordId);
  expect(heat.sourceRecordId).not.toBe(litter.sourceRecordId);
  const litterUid = /UID:([^\r]+)/.exec(
    buildBreedingCalendarICalendar({
      events: [litter],
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      calendarName: "Calendrier",
    }),
  )?.[1];
  const adopterUid = /UID:([^\r]+)/.exec(
    buildBreedingCalendarICalendar({
      events: [adopter],
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      calendarName: "Calendrier",
    }),
  )?.[1];
  const heatUid = /UID:([^\r]+)/.exec(
    buildBreedingCalendarICalendar({
      events: [heat],
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      calendarName: "Calendrier",
    }),
  )?.[1];
  expect(litterUid).toBeTruthy();
  expect(adopterUid).toBeTruthy();
  expect(heatUid).toBeTruthy();
  expect(litterUid).not.toBe(adopterUid);
  expect(heatUid).not.toBe(litterUid);
  expect(heatUid).not.toBe(adopterUid);
  expect(heatUid).not.toContain(cycleA);
  const modified = appointment({ updatedAt: "2026-08-02T10:00:00.000Z" })!;
  const modifiedIcs = buildBreedingCalendarICalendar({
    events: [modified],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  expect(modifiedIcs).toContain(`UID:${adopterUid}`);
  expect(modifiedIcs).toContain(`SEQUENCE:${sequenceFromUpdatedAt(modified.lastModifiedAt)}`);
  expect(modified.sequence).not.toBe(adopter.sequence);

  const modifiedHeat = cycle({ updatedAt: "2026-07-02T12:00:00.000Z" })!;
  const modifiedHeatIcs = buildBreedingCalendarICalendar({
    events: [modifiedHeat],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  expect(modifiedHeatIcs).toContain(`UID:${heatUid}`);
  expect(modifiedHeatIcs).toContain(
    `SEQUENCE:${sequenceFromUpdatedAt(modifiedHeat.lastModifiedAt)}`,
  );
  expect(modifiedHeat.sequence).not.toBe(heat.sequence);
  expect(modifiedHeatIcs).toContain("DTSTART;VALUE=DATE:20260726");
  expect(modifiedHeatIcs).not.toContain("DTEND");
  expect(modifiedHeatIcs).toContain("X-SAAS-ELEVAGE-SOURCE:reproductive_cycle");
  expect(modifiedHeatIcs).toContain("X-SAAS-ELEVAGE-KIND:heat_cycle");
  expect(modifiedHeatIcs).toContain("CATEGORIES:reproduction");
  expect(modifiedHeatIcs).toContain("Nova — Chaleurs prévues");
});

test("filtre par source sans croiser litter_care et adopter_appointment", () => {
  const litter = event(task())!;
  const adopter = appointment()!;
  const heat = cycle()!;
  const events = [litter, adopter, heat];
  expect(filterBreedingCalendarEvents({ events, source: "all" })).toHaveLength(3);
  expect(
    filterBreedingCalendarEvents({ events, source: "litter_care" }).map((item) => item.sourceType),
  ).toEqual(["litter_care"]);
  expect(
    filterBreedingCalendarEvents({ events, source: "adopter_appointment" }).map(
      (item) => item.sourceType,
    ),
  ).toEqual(["adopter_appointment"]);
  expect(
    filterBreedingCalendarEvents({ events, source: "reproductive_cycle" }).map(
      (item) => item.sourceType,
    ),
  ).toEqual(["reproductive_cycle"]);
  expect(
    filterBreedingCalendarEvents({
      events,
      source: "all",
      kind: "task",
      category: "veterinary",
    }).map((item) => item.sourceType),
  ).toEqual(["litter_care", "adopter_appointment", "reproductive_cycle"]);
});

test("sélectionne les cycles pour Aujourd’hui sans planned passé/futur ni in_progress futur", () => {
  const today = "2026-07-26";
  const events = [
    cycle({ id: cycleA, status: "planned", startedOn: today })!,
    cycle({
      id: cycleB,
      status: "in_progress",
      startedOn: "2026-07-20",
      animalLabel: "Orion",
    })!,
    cycle({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "planned",
      startedOn: "2026-07-20",
      animalLabel: "Past",
    })!,
    cycle({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "planned",
      startedOn: "2026-08-01",
      animalLabel: "Future",
    })!,
    cycle({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "in_progress",
      startedOn: "2026-08-01",
      animalLabel: "FutureProgress",
    })!,
  ];
  const selection = filterReproductiveCyclesForToday(events, today);
  expect(selection.plannedToday.map((item) => item.contextLabel)).toEqual(["Nova"]);
  expect(selection.inProgress.map((item) => item.contextLabel)).toEqual(["Orion"]);
});

test("sérialise l’agrégation sans UUID, description, email, paiement ou document", () => {
  const first = event(task())!;
  const second = event(
    task({
      id: "22222222-2222-4222-8222-222222222224",
      litterId: litterB,
      title: "Vaccination",
    }),
    "Nova × Orion",
  )!;
  const choice = appointment({
    contactLabel: "Camille Dupont",
    updatedAt: "2026-08-01T10:00:00.000Z",
  })!;
  const adoption = appointment({
    id: appointmentB,
    eventType: "adoption",
    status: "done",
    plannedAt: "2026-09-20T12:30:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
  })!;
  const heat = cycle({
    animalLabel: "Nova",
    updatedAt: "2026-07-01T10:00:00.000Z",
  })!;
  const global = buildBreedingCalendarICalendar({
    events: [second, first, adoption, choice, heat].sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) ||
        a.contextLabel.localeCompare(b.contextLabel),
    ),
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    calendarName: "Calendrier",
  });
  const perLitter = buildLitterCareICalendar({
    litterName: "Rosie × Rimbaud",
    tasks: [task()],
    filters: { kind: "all", category: "all" },
    generatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  const uid = /UID:([^\r]+)/.exec(perLitter)?.[1];
  expect(global).toContain(`UID:${uid}`);
  expect([...global.matchAll(/UID:([^\r]+)/g)].map((match) => match[1])).toHaveLength(5);
  expect(global).toContain("Choix du chiot/chaton");
  expect(global).toContain("Adoption / départ");
  expect(global).toContain("Chaleurs prévues");
  expect(global).toContain("X-SAAS-ELEVAGE-SOURCE:adopter_appointment");
  expect(global).toContain("X-SAAS-ELEVAGE-SOURCE:litter_care");
  expect(global).toContain("X-SAAS-ELEVAGE-SOURCE:reproductive_cycle");
  for (const forbidden of [
    taskA,
    litterA,
    appointmentA,
    appointmentB,
    reservationA,
    cycleA,
    motherA,
    "Description privée",
    "Ne pas exporter",
    "camille@example.com",
    "paiement",
    "document",
    "DESCRIPTION:",
    "ng/mL",
    "dosage",
    "saillie",
    "laboratoire",
  ]) {
    expect(global.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }
  const empty = buildBreedingCalendarICalendar({
    events: [],
    generatedAt: new Date(),
    calendarName: "Calendrier",
  });
  expect(empty).toContain("BEGIN:VCALENDAR\r\n");
  expect(empty).toMatch(/END:VCALENDAR\r\n$/);
});
