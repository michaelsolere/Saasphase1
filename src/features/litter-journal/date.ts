export const LITTER_JOURNAL_TIME_ZONE = "Europe/Paris";

export type BusinessDateParts = {
  year: number;
  month: number;
  day: number;
};

const businessDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LITTER_JOURNAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Missing ${type} in business date.`);
  }

  return Number(value);
}

function parseSqlDate(value: string): BusinessDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Expected a SQL civil date in YYYY-MM-DD format.");
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toCalendarDayNumber(date: BusinessDateParts) {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

export function getLitterJournalBusinessDateParts(
  instant: Date,
): BusinessDateParts {
  const parts = businessDateFormatter.formatToParts(instant);

  return {
    year: getPart(parts, "year"),
    month: getPart(parts, "month"),
    day: getPart(parts, "day"),
  };
}

export function formatLitterJournalBusinessDate(instant: Date) {
  const { year, month, day } = getLitterJournalBusinessDateParts(instant);

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function compareSqlDateToLitterJournalBusinessDay(
  sqlDate: string,
  instant: Date,
) {
  return sqlDate.localeCompare(formatLitterJournalBusinessDate(instant));
}

export function getLitterJournalCalendarDaysElapsed(
  sqlDate: string,
  instant: Date,
) {
  return (
    toCalendarDayNumber(getLitterJournalBusinessDateParts(instant)) -
    toCalendarDayNumber(parseSqlDate(sqlDate))
  );
}
