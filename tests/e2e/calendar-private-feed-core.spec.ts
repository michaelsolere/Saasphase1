import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  toAdopterAppointmentCalendarEvent,
} from "../../src/features/breeding-calendar/adopter-appointment-calendar";
import {
  filterBreedingCalendarEventsBySources,
  toBreedingCalendarEvent,
} from "../../src/features/breeding-calendar/breeding-calendar-contract";
import {
  CALENDAR_FEED_TOKEN_BYTE_LENGTH,
  calendarFeedTokenHint,
  generateCalendarFeedToken,
  hashCalendarFeedToken,
  hasAtLeastOneCalendarFeedSource,
  isCalendarFeedTokenFormat,
  normalizeCalendarFeedSources,
} from "../../src/features/breeding-calendar/calendar-feed-token";
import {
  CALENDAR_EXPORT_CONTENT_DISPOSITION,
  CALENDAR_FEED_CONTENT_DISPOSITION,
} from "../../src/features/breeding-calendar/calendar-ics-http";
import { toReproductiveCycleCalendarEvent } from "../../src/features/breeding-calendar/reproductive-cycle-calendar";
import { buildBreedingCalendarICalendar } from "../../src/features/litter-journal/litter-care-icalendar";
import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks-core";

const litterA = "11111111-1111-4111-8111-111111111111";
const taskA = "22222222-2222-4222-8222-222222222222";
const appointmentA = "33333333-3333-4333-8333-333333333333";
const reservationA = "55555555-5555-4555-8555-555555555555";
const cycleA = "66666666-6666-4666-8666-666666666666";
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

function sampleEvents() {
  const litter = toBreedingCalendarEvent(task(), "Rosie × Rimbaud")!;
  const cycle = toReproductiveCycleCalendarEvent({
    id: cycleA,
    motherId: motherA,
    status: "planned",
    startedOn: "2026-08-01",
    updatedAt: "2026-08-01T10:00:00.000Z",
    animalLabel: "Luna",
  })!;
  const appointment = toAdopterAppointmentCalendarEvent({
    id: appointmentA,
    reservationId: reservationA,
    eventType: "puppy_choice",
    status: "planned",
    plannedAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    contactLabel: "Camille Dupont",
  })!;
  return {
    litter: { ...litter, contextLabel: `Portée ${litter.contextLabel}` },
    cycle,
    appointment,
  };
}

test("génère un jeton de 32 octets en base64url sans padding", () => {
  const token = generateCalendarFeedToken();
  expect(isCalendarFeedTokenFormat(token)).toBe(true);
  expect(Buffer.from(token, "base64url").byteLength).toBe(CALENDAR_FEED_TOKEN_BYTE_LENGTH);
  expect(token).not.toMatch(/[=+/]/);
  expect(token.length).toBe(43);
});

test("hash SHA-256 déterministe et distinct pour deux jetons", () => {
  const left = generateCalendarFeedToken();
  const right = generateCalendarFeedToken();
  expect(left).not.toBe(right);
  expect(hashCalendarFeedToken(left)).toBe(
    createHash("sha256").update(left, "utf8").digest("hex"),
  );
  expect(hashCalendarFeedToken(left)).toHaveLength(64);
  expect(hashCalendarFeedToken(left)).not.toBe(hashCalendarFeedToken(right));
});

test("le modèle persistant ne contient jamais le jeton brut", () => {
  const token = generateCalendarFeedToken();
  const persisted = {
    token_hash: hashCalendarFeedToken(token),
    token_hint: calendarFeedTokenHint(token),
  };
  expect(JSON.stringify(persisted)).not.toContain(token);
  expect(persisted.token_hash).not.toBe(token);
  expect(persisted.token_hint).toBe(token.slice(-4));
  expect(token.endsWith(persisted.token_hint)).toBe(true);
});

test("exige au moins une source calendaire", () => {
  expect(
    hasAtLeastOneCalendarFeedSource({
      includeLitterCare: false,
      includeReproductiveCycle: false,
      includeAdopterAppointment: false,
    }),
  ).toBe(false);
  expect(
    normalizeCalendarFeedSources({
      includeLitterCare: false,
      includeReproductiveCycle: false,
      includeAdopterAppointment: false,
    }),
  ).toBeNull();
  expect(
    normalizeCalendarFeedSources({
      includeLitterCare: true,
      includeReproductiveCycle: false,
      includeAdopterAppointment: false,
    }),
  ).toEqual({
    includeLitterCare: true,
    includeReproductiveCycle: false,
    includeAdopterAppointment: false,
  });
});

test("filtre les trois familles de sources", () => {
  const { litter, cycle, appointment } = sampleEvents();
  const all = [litter, cycle, appointment];

  expect(
    filterBreedingCalendarEventsBySources(all, {
      includeLitterCare: true,
      includeReproductiveCycle: true,
      includeAdopterAppointment: true,
    }).map((event) => event.sourceType),
  ).toEqual(["litter_care", "reproductive_cycle", "adopter_appointment"]);

  expect(
    filterBreedingCalendarEventsBySources(all, {
      includeLitterCare: true,
      includeReproductiveCycle: false,
      includeAdopterAppointment: false,
    }).map((event) => event.sourceType),
  ).toEqual(["litter_care"]);

  expect(
    filterBreedingCalendarEventsBySources(all, {
      includeLitterCare: false,
      includeReproductiveCycle: true,
      includeAdopterAppointment: false,
    }).map((event) => event.sourceType),
  ).toEqual(["reproductive_cycle"]);

  expect(
    filterBreedingCalendarEventsBySources(all, {
      includeLitterCare: false,
      includeReproductiveCycle: false,
      includeAdopterAppointment: true,
    }).map((event) => event.sourceType),
  ).toEqual(["adopter_appointment"]);
});

test("sérialiseur ICS conserve les UID et accepte les hints d’abonnement", () => {
  const { litter, cycle, appointment } = sampleEvents();
  const body = buildBreedingCalendarICalendar({
    events: [litter, cycle, appointment],
    generatedAt: new Date("2026-07-26T10:00:00.000Z"),
    calendarName: "Calendrier de l’élevage",
    includeSubscriptionHints: true,
  });
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  expect(body).toContain("X-PUBLISHED-TTL:PT1H");
  expect(body).toContain("Camille Dupont");
  expect(body).not.toContain(taskA);
  expect(body).not.toContain(appointmentA);
  expect(body).not.toContain("Description privée");

  const withoutHints = buildBreedingCalendarICalendar({
    events: [litter],
    generatedAt: new Date("2026-07-26T10:00:00.000Z"),
    calendarName: "Calendrier de l’élevage",
  });
  expect(withoutHints).not.toContain("REFRESH-INTERVAL");
});

test("Content-Disposition inline pour le flux et attachment pour l’export", () => {
  expect(CALENDAR_FEED_CONTENT_DISPOSITION).toBe(
    'inline; filename="calendrier-elevage.ics"',
  );
  expect(CALENDAR_EXPORT_CONTENT_DISPOSITION).toBe(
    'attachment; filename="calendrier-elevage.ics"',
  );
  expect(randomBytes(1).byteLength).toBe(1);
});
