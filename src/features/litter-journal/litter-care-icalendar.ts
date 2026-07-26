import { createHash } from "node:crypto";

import type { LitterCareCalendarCategoryFilter, LitterCareCalendarKindFilter } from "./litter-care-calendar";
import type { LitterCareTaskSummary } from "./litter-care-tasks";
import type { BreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";

type IcalendarInput = {
  litterName: string;
  tasks: readonly LitterCareTaskSummary[];
  filters: { kind: LitterCareCalendarKindFilter; category: LitterCareCalendarCategoryFilter };
  generatedAt: Date;
};

const CRLF = "\r\n";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function validDate(value: string | null): value is string {
  if (!value || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTime(value: string | null): value is string { return Boolean(value && TIME.test(value)); }
function validTimezone(value: string | null): value is string {
  if (!value?.trim()) return false;
  try { Intl.DateTimeFormat("en-GB", { timeZone: value }); return true; } catch { return false; }
}
function ymd(value: string) { return value.replaceAll("-", ""); }
function hms(value: string) { return value.replaceAll(":", "").padEnd(6, "0"); }
function escapeText(value: string) { return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r\n|\r|\n/g, "\\n"); }
function fold(line: string) {
  const parts: string[] = []; let current = ""; let bytes = 0;
  for (const character of line) {
    const length = Buffer.byteLength(character, "utf8");
    if (bytes + length > 75) { parts.push(current); current = ` ${character}`; bytes = 1 + length; }
    else { current += character; bytes += length; }
  }
  parts.push(current); return parts.join(CRLF);
}
function property(name: string, value: string) { return fold(`${name}:${value}`); }
function formatUtc(date: Date) { return `${date.getUTCFullYear().toString().padStart(4, "0")}${(date.getUTCMonth() + 1).toString().padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}T${date.getUTCHours().toString().padStart(2, "0")}${date.getUTCMinutes().toString().padStart(2, "0")}${date.getUTCSeconds().toString().padStart(2, "0")}Z`; }
function localParts(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}:${values.get("second")}`;
}
function localToUtc(date: string, time: string, timezone: string): string | null {
  const local = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const expected = Date.parse(`${local}Z`); if (!Number.isFinite(expected)) return null;
  for (let minute = -840; minute <= 840; minute += 1) {
    const candidate = expected + minute * 60_000;
    if (localParts(candidate, timezone) === local) return formatUtc(new Date(candidate));
  }
  return null;
}
function dateTime(date: string, time: string, timezone: string | null) {
  if (validTimezone(timezone)) return localToUtc(date, time, timezone) ?? `${ymd(date)}T${hms(time)}`;
  return `${ymd(date)}T${hms(time)}`;
}
function addDay(date: string) { const [year, month, day] = date.split("-").map(Number); const next = new Date(Date.UTC(year, month - 1, day + 1)); return `${next.getUTCFullYear().toString().padStart(4, "0")}${(next.getUTCMonth() + 1).toString().padStart(2, "0")}${next.getUTCDate().toString().padStart(2, "0")}`; }
function uid(task: LitterCareTaskSummary) { return `${createHash("sha256").update(`litter-care:${task.litterId}:${task.id}`).digest("hex")}@saas-elevage`; }
function matches(task: LitterCareTaskSummary, filters: IcalendarInput["filters"]) { return task.status === "planned" && (filters.kind === "all" || task.itemKind === filters.kind) && (filters.category === "all" || task.category === filters.category); }

function breedingCalendarUid(event: BreedingCalendarEvent) {
  if (event.sourceType === "adopter_appointment") {
    return `${createHash("sha256").update(`adopter-appointment:${event.sourceRecordId}`).digest("hex")}@saas-elevage`;
  }
  return `${createHash("sha256").update(`litter-care:${event.litterId}:${event.sourceRecordId}`).digest("hex")}@saas-elevage`;
}

export function buildBreedingCalendarICalendar(input: {
  events: readonly BreedingCalendarEvent[];
  generatedAt: Date;
  calendarName: string;
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SaaS Elevage//Calendrier elevage//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    property("X-WR-CALNAME", escapeText(input.calendarName)),
  ];
  for (const event of input.events) {
    const body: string[] = [
      "BEGIN:VEVENT",
      property("UID", breedingCalendarUid(event)),
      property("DTSTAMP", formatUtc(input.generatedAt)),
      property("SUMMARY", escapeText(`${event.contextLabel} — ${event.title}`)),
      property("CATEGORIES", escapeText(event.category)),
      property("X-SAAS-ELEVAGE-SOURCE", event.sourceType),
      property("X-SAAS-ELEVAGE-KIND", event.kind),
      property("SEQUENCE", String(event.sequence)),
    ];
    if (event.sourceType === "adopter_appointment") {
      const instant = new Date(event.startsAt);
      if (!Number.isFinite(instant.getTime())) continue;
      body.push(property("DTSTART", formatUtc(instant)));
    } else if (event.endsOn) {
      if (!validDate(event.startsOn) || !validDate(event.endsOn)) continue;
      if (validTime(event.startsLocalTime) && validTime(event.endsLocalTime)) {
        body.push(
          property("DTSTART", dateTime(event.startsOn, event.startsLocalTime, event.timezoneName)),
          property("DTEND", dateTime(event.endsOn, event.endsLocalTime, event.timezoneName)),
        );
      } else {
        body.push(
          property("DTSTART;VALUE=DATE", ymd(event.startsOn)),
          property("DTEND;VALUE=DATE", addDay(event.endsOn)),
        );
      }
    } else {
      if (!validDate(event.startsOn)) continue;
      body.push(
        validTime(event.startsLocalTime)
          ? property("DTSTART", dateTime(event.startsOn, event.startsLocalTime, event.timezoneName))
          : property("DTSTART;VALUE=DATE", ymd(event.startsOn)),
      );
    }
    body.push("END:VEVENT");
    lines.push(...body);
  }
  lines.push("END:VCALENDAR");
  return `${lines.join(CRLF)}${CRLF}`;
}

export function buildLitterCareICalendar(input: IcalendarInput) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SaaS Elevage//Journal des portees//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", property("X-WR-CALNAME", escapeText(input.litterName))];
  for (const task of input.tasks) {
    if (!matches(task, input.filters)) continue;
    const event: string[] = ["BEGIN:VEVENT", property("UID", uid(task)), property("DTSTAMP", formatUtc(input.generatedAt)), property("SUMMARY", escapeText(`${input.litterName} — ${task.title}`)), property("CATEGORIES", escapeText(task.category)), property("X-SAAS-ELEVAGE-KIND", task.itemKind), property("SEQUENCE", String(task.revisionNo))];
    if (task.itemKind === "window") {
      if (!validDate(task.retainedStartsOn) || !validDate(task.retainedEndsOn)) continue;
      if (validTime(task.retainedStartsLocalTime) && validTime(task.retainedEndsLocalTime)) { event.push(property("DTSTART", dateTime(task.retainedStartsOn, task.retainedStartsLocalTime, task.scheduleTimezoneName)), property("DTEND", dateTime(task.retainedEndsOn, task.retainedEndsLocalTime, task.scheduleTimezoneName))); }
      else { event.push(property("DTSTART;VALUE=DATE", ymd(task.retainedStartsOn)), property("DTEND;VALUE=DATE", addDay(task.retainedEndsOn))); const oneTime = validTime(task.retainedStartsLocalTime) ? `Heure de début retenue : ${task.retainedStartsLocalTime.slice(0, 5)}.` : validTime(task.retainedEndsLocalTime) ? `Heure de fin retenue : ${task.retainedEndsLocalTime.slice(0, 5)}.` : null; if (oneTime) event.push(property("DESCRIPTION", escapeText(oneTime))); }
    } else {
      if (!validDate(task.plannedFor)) continue;
      event.push(validTime(task.scheduledLocalTime) ? property("DTSTART", dateTime(task.plannedFor, task.scheduledLocalTime, task.scheduleTimezoneName)) : property("DTSTART;VALUE=DATE", ymd(task.plannedFor)));
    }
    event.push("END:VEVENT"); lines.push(...event);
  }
  lines.push("END:VCALENDAR"); return `${lines.join(CRLF)}${CRLF}`;
}

export function isLitterCareCalendarExportUuid(value: string | null): value is string { return Boolean(value && UUID.test(value)); }
