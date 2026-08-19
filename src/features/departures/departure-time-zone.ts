const zone = "Europe/Paris";
const partsFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function parts(value: Date) {
  return Object.fromEntries(partsFormatter.formatToParts(value).map((part) => [part.type, part.value]));
}

export function parisWallTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 30) {
    const instant = new Date(guess - offsetMinutes * 60_000);
    const verified = parts(instant);
    if (Number(verified.year) === year && Number(verified.month) === month && Number(verified.day) === day && Number(verified.hour) === hour && Number(verified.minute) === minute) return instant.toISOString();
  }
  return null;
}

export function departureDateTimeInputToIso(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return parisWallTimeToIso(value);
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function isoToParisLocalInput(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const rendered = parts(new Date(value));
  return `${rendered.year}-${rendered.month}-${rendered.day}T${rendered.hour}:${rendered.minute}`;
}

export function shiftParisCalendarDays(value: string, dayDelta: number) {
  if (!Number.isInteger(dayDelta) || !Number.isFinite(Date.parse(value))) return null;
  const rendered = parts(new Date(value));
  const date = new Date(Date.UTC(Number(rendered.year), Number(rendered.month) - 1, Number(rendered.day) + dayDelta, 12));
  const shiftedDate = date.toISOString().slice(0, 10);
  return parisWallTimeToIso(`${shiftedDate}T${rendered.hour}:${rendered.minute}`);
}
