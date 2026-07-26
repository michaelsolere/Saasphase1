import { createHash, randomBytes } from "node:crypto";

export const CALENDAR_FEED_TOKEN_BYTE_LENGTH = 32;
export const CALENDAR_FEED_TOKEN_HINT_LENGTH = 4;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type CalendarFeedSources = {
  includeLitterCare: boolean;
  includeReproductiveCycle: boolean;
  includeAdopterAppointment: boolean;
};

export function generateCalendarFeedToken(): string {
  return randomBytes(CALENDAR_FEED_TOKEN_BYTE_LENGTH).toString("base64url");
}

export function isCalendarFeedTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  if (!BASE64URL.test(token)) return false;
  // 32 bytes → 43 base64url chars without padding
  if (token.length !== 43) return false;
  try {
    return Buffer.from(token, "base64url").byteLength === CALENDAR_FEED_TOKEN_BYTE_LENGTH;
  } catch {
    return false;
  }
}

export function hashCalendarFeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function calendarFeedTokenHint(token: string): string {
  if (token.length < CALENDAR_FEED_TOKEN_HINT_LENGTH) {
    throw new Error("Calendar feed token is too short for a hint.");
  }
  return token.slice(-CALENDAR_FEED_TOKEN_HINT_LENGTH);
}

/** Relative private feed path. Never includes a host or scheme. */
export function buildCalendarFeedPath(token: string): string {
  if (!isCalendarFeedTokenFormat(token)) {
    throw new Error("Invalid calendar feed token.");
  }
  return `/calendar/feed/${token}`;
}

/**
 * Builds the absolute subscription URL from a relative path and the page origin.
 * Call only in the browser with `window.location.origin` — never from proxy headers.
 */
export function absoluteCalendarFeedUrl(feedPath: string, pageOrigin: string): string {
  if (!feedPath.startsWith("/calendar/feed/")) {
    throw new Error("Invalid calendar feed path.");
  }
  return new URL(feedPath, pageOrigin).toString();
}

export function hasAtLeastOneCalendarFeedSource(sources: CalendarFeedSources): boolean {
  return (
    sources.includeLitterCare ||
    sources.includeReproductiveCycle ||
    sources.includeAdopterAppointment
  );
}

export function normalizeCalendarFeedSources(input: Partial<CalendarFeedSources> | null | undefined): CalendarFeedSources | null {
  const sources: CalendarFeedSources = {
    includeLitterCare: input?.includeLitterCare === true,
    includeReproductiveCycle: input?.includeReproductiveCycle === true,
    includeAdopterAppointment: input?.includeAdopterAppointment === true,
  };
  if (!hasAtLeastOneCalendarFeedSource(sources)) return null;
  return sources;
}

export const DEFAULT_CALENDAR_FEED_SOURCES: CalendarFeedSources = {
  includeLitterCare: true,
  includeReproductiveCycle: true,
  includeAdopterAppointment: true,
};
