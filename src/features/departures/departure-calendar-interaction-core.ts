const PIXELS_PER_HOUR = 64;
const RESIZE_STEP_MINUTES = 15;
export const DEPARTURE_DRAG_STEP_PIXELS = PIXELS_PER_HOUR / 4;

export function validateDeparturePlanDraft(input: {
  durationMinutes: number;
  litterCount: number;
  earliestDatesValid: boolean;
}) {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) {
    return { ok: false as const, reason: "duration_invalid" as const };
  }
  if (input.litterCount === 0) return { ok: false as const, reason: "litter_required" as const };
  if (!input.earliestDatesValid) return { ok: false as const, reason: "departure_date_invalid" as const };
  return { ok: true as const };
}

export function departureBlockHeightPixels(durationMinutes: number, pixelsPerHour = PIXELS_PER_HOUR) {
  return Math.max(1, Math.round((durationMinutes / 60) * pixelsPerHour));
}

export function departureDurationFromResize(input: {
  initialDurationMinutes: number;
  deltaPixels: number;
  pixelsPerHour?: number;
  maxDurationMinutes?: number;
}) {
  const pixelsPerHour = input.pixelsPerHour ?? PIXELS_PER_HOUR;
  const deltaMinutes = Math.round((input.deltaPixels / pixelsPerHour) * 60 / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
  return Math.min(480, input.maxDurationMinutes ?? 480, Math.max(5, input.initialDurationMinutes + deltaMinutes));
}

export function departureDropTargetFromDelta(input: {
  sourceDateKey: string;
  sourceHour: number;
  sourceMinute: number;
  durationMinutes: number;
  deltaX: number;
  deltaY: number;
  dayColumnWidth: number;
  weekStartKey: string;
  pixelsPerHour?: number;
}) {
  const pixelsPerHour = input.pixelsPerHour ?? PIXELS_PER_HOUR;
  if (Math.hypot(input.deltaX, input.deltaY) < 6) return null;
  const deltaMinutes = Math.round(input.deltaY / (pixelsPerHour / 4)) * 15;
  const totalMinutes = input.sourceHour * 60 + input.sourceMinute + deltaMinutes;
  const dayDelta = Math.round(input.deltaX / input.dayColumnWidth) + Math.floor(totalMinutes / (24 * 60));
  const wrappedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrappedMinutes / 60);
  const minute = wrappedMinutes % 60;
  const date = new Date(`${input.sourceDateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  const dateKey = date.toISOString().slice(0, 10);
  const weekEnd = new Date(`${input.weekStartKey}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  if (dateKey < input.weekStartKey || dateKey > weekEnd.toISOString().slice(0, 10) || wrappedMinutes < 8 * 60 || wrappedMinutes + input.durationMinutes > 20 * 60) return null;
  return { dateKey, hour, minute };
}
