/** Deterministic local civil wall-time ↔ UTC helpers (IANA time zones). */

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export function isValidCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME.test(value);
}

export function isValidIanaTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeLocalTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

function localParts(instantMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}:${values.get("second")}`;
}

/**
 * Convert a civil local date+time in an IANA zone to a UTC ISO instant.
 * Returns null when the local wall time does not exist (e.g. DST spring gap)
 * or inputs are invalid. Does not depend on the Node process timezone.
 */
export function localCivilDateTimeToUtcIso(
  date: string,
  time: string,
  timezone: string,
): string | null {
  if (!isValidCivilDate(date) || !isValidLocalTime(time) || !isValidIanaTimeZone(timezone)) {
    return null;
  }
  const local = `${date}T${normalizeLocalTime(time)}`;
  const expected = Date.parse(`${local}Z`);
  if (!Number.isFinite(expected)) return null;
  for (let minute = -840; minute <= 840; minute += 1) {
    const candidate = expected + minute * 60_000;
    if (localParts(candidate, timezone) === local) {
      return new Date(candidate).toISOString();
    }
  }
  return null;
}

/** Format a UTC Date as YYYYMMDDTHHMMSSZ for ICS. */
export function formatUtcIcsDateTime(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}${(date.getUTCMonth() + 1).toString().padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}T${date.getUTCHours().toString().padStart(2, "0")}${date.getUTCMinutes().toString().padStart(2, "0")}${date.getUTCSeconds().toString().padStart(2, "0")}Z`;
}

/**
 * Convert civil local date+time to ICS UTC stamp, or null if conversion fails.
 */
export function localCivilDateTimeToUtcIcs(
  date: string,
  time: string,
  timezone: string,
): string | null {
  const iso = localCivilDateTimeToUtcIso(date, time, timezone);
  if (!iso) return null;
  return formatUtcIcsDateTime(new Date(iso));
}

export function addCivilDays(date: string, days: number): string | null {
  if (!isValidCivilDate(date) || !Number.isInteger(days)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1).toString().padStart(2, "0")}-${next.getUTCDate().toString().padStart(2, "0")}`;
}

export function subtractCivilDays(date: string, days: number): string | null {
  if (!Number.isInteger(days) || days < 0) return null;
  return addCivilDays(date, -days);
}

export function formatCivilDateInTimeZone(
  instant: Date,
  timezone: string,
): string | null {
  if (!Number.isFinite(instant.getTime()) || !isValidIanaTimeZone(timezone)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function formatLocalTimeInTimeZone(
  instant: Date,
  timezone: string,
): string | null {
  if (!Number.isFinite(instant.getTime()) || !isValidIanaTimeZone(timezone)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const hour = values.get("hour");
  const minute = values.get("minute");
  if (!hour || !minute) return null;
  return `${hour}:${minute}`;
}
