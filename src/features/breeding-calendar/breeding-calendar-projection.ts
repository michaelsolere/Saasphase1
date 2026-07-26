import { getLitterCareTaskWindowState } from "@/features/litter-journal/litter-care-tasks-core";
import {
  getLitterCareCalendarDate,
  getLitterCareCalendarMonth,
  getLitterCareCalendarWeekStart,
  type LitterCareCalendarCategoryFilter,
  type LitterCareCalendarKindFilter,
  type LitterCareCalendarOperationalState,
  type LitterCareCalendarWindowPosition,
} from "@/features/litter-journal/litter-care-calendar";

import {
  breedingCalendarEventIdentity,
  isLitterCareBreedingCalendarEvent,
  type AdopterAppointmentBreedingCalendarEvent,
  type BreedingCalendarEvent,
  type BreedingCalendarSourceFilter,
} from "./breeding-calendar-contract";

export type BreedingCalendarProjectedItem = {
  event: BreedingCalendarEvent;
  date: string;
  time: string | null;
  windowPosition: LitterCareCalendarWindowPosition | null;
  operationalState: LitterCareCalendarOperationalState;
  retainedStartsOn: string | null;
  retainedEndsOn: string | null;
};

export type BreedingCalendarProjectedDay = {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: BreedingCalendarProjectedItem[];
};

export type BreedingCalendarProjection = {
  month: string;
  startsOn: string;
  endsOn: string;
  days: BreedingCalendarProjectedDay[];
  hasPlannedItems: boolean;
  hasFilteredItems: boolean;
};

function dateParts(value: string) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function civilDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

function pointState(date: string, todayDate: string): LitterCareCalendarOperationalState {
  if (date < todayDate) return "overdue";
  if (date === todayDate) return "today";
  return "upcoming";
}

function matchesSource(event: BreedingCalendarEvent, source: BreedingCalendarSourceFilter) {
  return source === "all" || event.sourceType === source;
}

function matchesLitterFilters(
  event: BreedingCalendarEvent,
  kind: LitterCareCalendarKindFilter,
  category: LitterCareCalendarCategoryFilter,
) {
  if (!isLitterCareBreedingCalendarEvent(event)) return true;
  return (
    (kind === "all" || event.itemKind === kind) &&
    (category === "all" || event.category === category)
  );
}

function compareItems(left: BreedingCalendarProjectedItem, right: BreedingCalendarProjectedItem) {
  if (Boolean(left.time) !== Boolean(right.time)) return left.time ? -1 : 1;
  if (left.time && right.time && left.time !== right.time) {
    return left.time.localeCompare(right.time);
  }
  const sourceOrder =
    Number(left.event.sourceType === "adopter_appointment") -
    Number(right.event.sourceType === "adopter_appointment");
  if (sourceOrder) return sourceOrder;
  const title = left.event.title.localeCompare(right.event.title, "fr");
  if (title) return title;
  return breedingCalendarEventIdentity(left.event).localeCompare(
    breedingCalendarEventIdentity(right.event),
  );
}

function agendaTime(item: BreedingCalendarProjectedItem) {
  if (isLitterCareBreedingCalendarEvent(item.event) && item.event.itemKind === "window") {
    return item.event.startsLocalTime;
  }
  return item.time;
}

export function sortBreedingCalendarAgendaItems(
  items: readonly BreedingCalendarProjectedItem[],
) {
  return [...items].sort((left, right) => {
    const leftTime = agendaTime(left);
    const rightTime = agendaTime(right);
    if (leftTime && rightTime && leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }
    if (Boolean(leftTime) !== Boolean(rightTime)) return leftTime ? -1 : 1;
    const title = left.event.title.localeCompare(right.event.title, "fr");
    if (title) return title;
    return breedingCalendarEventIdentity(left.event).localeCompare(
      breedingCalendarEventIdentity(right.event),
    );
  });
}

export function filterBreedingCalendarEvents({
  events,
  source = "all",
  kind = "all",
  category = "all",
}: {
  events: readonly BreedingCalendarEvent[];
  source?: BreedingCalendarSourceFilter;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}) {
  return events.filter(
    (event) => matchesSource(event, source) && matchesLitterFilters(event, kind, category),
  );
}

export function projectBreedingCalendarRange({
  events,
  startsOn,
  endsOn,
  currentMonth,
  todayDate,
  todayLocalTime,
  source = "all",
  kind = "all",
  category = "all",
}: {
  events: readonly BreedingCalendarEvent[];
  startsOn: string;
  endsOn: string;
  currentMonth?: string;
  todayDate: string;
  todayLocalTime: string;
  source?: BreedingCalendarSourceFilter;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}): BreedingCalendarProjection {
  const start = getLitterCareCalendarDate(startsOn, todayDate);
  const end = getLitterCareCalendarDate(endsOn, start);
  const visibleDates =
    start <= end
      ? Array.from(
          {
            length:
              Math.round(
                (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
                  86_400_000,
              ) + 1,
          },
          (_, index) => {
            const startParts = dateParts(start);
            return civilDate(startParts.year, startParts.month, startParts.day + index);
          },
        )
      : [];
  const byDate = new Map(visibleDates.map((date) => [date, [] as BreedingCalendarProjectedItem[]]));
  const sourceMatched = events.filter((event) => matchesSource(event, source));
  const filtered = sourceMatched.filter((event) => matchesLitterFilters(event, kind, category));

  for (const event of filtered) {
    if (isLitterCareBreedingCalendarEvent(event) && event.itemKind === "window") {
      if (!event.endsOn || event.startsOn > event.endsOn) continue;
      for (const date of visibleDates) {
        if (date < event.startsOn || date > event.endsOn) continue;
        const position: LitterCareCalendarWindowPosition =
          event.startsOn === event.endsOn
            ? "single"
            : date === event.startsOn
              ? "start"
              : date === event.endsOn
                ? "end"
                : "middle";
        const windowState = getLitterCareTaskWindowState(
          {
            itemKind: "window",
            retainedStartsOn: event.startsOn,
            retainedStartsLocalTime: event.startsLocalTime,
            retainedEndsOn: event.endsOn,
            retainedEndsLocalTime: event.endsLocalTime,
            status: "planned",
          },
          { date: todayDate, localTime: todayLocalTime },
        );
        byDate.get(date)?.push({
          event,
          date,
          time:
            date === event.startsOn
              ? event.startsLocalTime
              : date === event.endsOn
                ? event.endsLocalTime
                : null,
          windowPosition: position,
          operationalState:
            windowState === "open"
              ? "open"
              : windowState === "overdue"
                ? "overdue"
                : windowState === "upcoming"
                  ? "upcoming"
                  : null,
          retainedStartsOn: event.startsOn,
          retainedEndsOn: event.endsOn,
        });
      }
      continue;
    }

    if (!byDate.has(event.startsOn)) continue;
    byDate.get(event.startsOn)?.push({
      event,
      date: event.startsOn,
      time: event.startsLocalTime,
      windowPosition: null,
      operationalState: pointState(event.startsOn, todayDate),
      retainedStartsOn: null,
      retainedEndsOn: null,
    });
  }

  return {
    month: start.slice(0, 7),
    startsOn: start,
    endsOn: end,
    hasPlannedItems: sourceMatched.length > 0,
    hasFilteredItems: filtered.length > 0,
    days: visibleDates.map((date) => ({
      date,
      isCurrentMonth: date.startsWith(currentMonth ?? start.slice(0, 7)),
      isToday: date === todayDate,
      items: (byDate.get(date) ?? []).sort(compareItems),
    })),
  };
}

export function projectBreedingCalendarMonth({
  events,
  requestedMonth,
  todayDate,
  todayLocalTime,
  source = "all",
  kind = "all",
  category = "all",
}: {
  events: readonly BreedingCalendarEvent[];
  requestedMonth: string | undefined;
  todayDate: string;
  todayLocalTime: string;
  source?: BreedingCalendarSourceFilter;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}): BreedingCalendarProjection {
  const month = getLitterCareCalendarMonth(requestedMonth, todayDate);
  const { year, month: monthNumber } = dateParts(`${month}-01`);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const gridStart = civilDate(year, monthNumber, 1 - ((firstWeekday + 6) % 7));
  const gridEndParts = dateParts(gridStart);
  const calendar = projectBreedingCalendarRange({
    events,
    startsOn: gridStart,
    endsOn: civilDate(gridEndParts.year, gridEndParts.month, gridEndParts.day + 41),
    currentMonth: month,
    todayDate,
    todayLocalTime,
    source,
    kind,
    category,
  });
  return { ...calendar, month };
}

export function projectBreedingCalendarWeek({
  events,
  requestedDate,
  todayDate,
  todayLocalTime,
  source = "all",
  kind = "all",
  category = "all",
}: {
  events: readonly BreedingCalendarEvent[];
  requestedDate: string | undefined;
  todayDate: string;
  todayLocalTime: string;
  source?: BreedingCalendarSourceFilter;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}): BreedingCalendarProjection {
  const startsOn = getLitterCareCalendarWeekStart(requestedDate, todayDate);
  const parts = dateParts(startsOn);
  return projectBreedingCalendarRange({
    events,
    startsOn,
    endsOn: civilDate(parts.year, parts.month, parts.day + 6),
    todayDate,
    todayLocalTime,
    source,
    kind,
    category,
  });
}

export function filterAdopterAppointmentsForToday(
  events: readonly BreedingCalendarEvent[],
  todayDate: string,
): AdopterAppointmentBreedingCalendarEvent[] {
  return events
    .filter(
      (event): event is AdopterAppointmentBreedingCalendarEvent =>
        event.sourceType === "adopter_appointment" && event.startsOn === todayDate,
    )
    .sort(
      (left, right) =>
        (left.startsLocalTime ?? "").localeCompare(right.startsLocalTime ?? "") ||
        left.contextLabel.localeCompare(right.contextLabel, "fr") ||
        left.sourceRecordId.localeCompare(right.sourceRecordId),
    );
}
