import {
  getLitterCareTaskWindowState,
  type LitterCareTaskSummary,
} from "./litter-care-tasks-core";

export type LitterCareCalendarKindFilter = "all" | LitterCareTaskSummary["itemKind"];
export type LitterCareCalendarCategoryFilter = "all" | LitterCareTaskSummary["category"];
export type LitterCareCalendarWindowPosition = "single" | "start" | "middle" | "end";
export type LitterCareCalendarOperationalState = "overdue" | "today" | "upcoming" | "open" | null;

export type LitterCareCalendarItem = {
  task: LitterCareTaskSummary;
  date: string;
  kind: LitterCareTaskSummary["itemKind"];
  time: string | null;
  windowPosition: LitterCareCalendarWindowPosition | null;
  operationalState: LitterCareCalendarOperationalState;
  retainedStartsOn: string | null;
  retainedEndsOn: string | null;
};

export type LitterCareCalendarDay = {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: LitterCareCalendarItem[];
};

export type LitterCareCalendar = {
  month: string;
  days: LitterCareCalendarDay[];
  hasPlannedItems: boolean;
  hasFilteredItems: boolean;
};

const priorityOrder: Record<LitterCareTaskSummary["priority"], number> = {
  organization_critical: 0,
  important: 1,
  normal: 2,
};

function isCivilDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function dateParts(value: string) {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) };
}

function civilDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

export function getLitterCareCalendarMonth(value: string | undefined, todayDate: string) {
  if (value && /^\d{4}-\d{2}$/.test(value) && isCivilDate(`${value}-01`)) return value;
  return todayDate.slice(0, 7);
}

function compareItems(left: LitterCareCalendarItem, right: LitterCareCalendarItem) {
  const priority = priorityOrder[left.task.priority] - priorityOrder[right.task.priority];
  if (priority) return priority;
  if (Boolean(left.time) !== Boolean(right.time)) return left.time ? -1 : 1;
  if (left.time && right.time && left.time !== right.time) return left.time.localeCompare(right.time);
  if ((left.kind === "window") !== (right.kind === "window")) return left.kind === "window" ? -1 : 1;
  return left.task.title.localeCompare(right.task.title, "fr");
}

function pointState(date: string, todayDate: string): LitterCareCalendarOperationalState {
  if (date < todayDate) return "overdue";
  if (date === todayDate) return "today";
  return "upcoming";
}

function matches(task: LitterCareTaskSummary, kind: LitterCareCalendarKindFilter, category: LitterCareCalendarCategoryFilter) {
  return task.status === "planned" && (kind === "all" || task.itemKind === kind) && (category === "all" || task.category === category);
}

export function projectLitterCareCalendar({
  tasks,
  requestedMonth,
  todayDate,
  todayLocalTime,
  kind = "all",
  category = "all",
}: {
  tasks: readonly LitterCareTaskSummary[];
  requestedMonth: string | undefined;
  todayDate: string;
  todayLocalTime: string;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}): LitterCareCalendar {
  const month = getLitterCareCalendarMonth(requestedMonth, todayDate);
  const { year, month: monthNumber } = dateParts(`${month}-01`);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const gridStart = civilDate(year, monthNumber, 1 - ((firstWeekday + 6) % 7));
  const visibleDates = Array.from({ length: 42 }, (_, index) => {
    const start = dateParts(gridStart);
    return civilDate(start.year, start.month, start.day + index);
  });
  const byDate = new Map(visibleDates.map((date) => [date, [] as LitterCareCalendarItem[]]));
  const planned = tasks.filter((task) => task.status === "planned");
  const filtered = planned.filter((task) => matches(task, kind, category));

  for (const task of filtered) {
    if (task.itemKind !== "window") {
      if (!task.plannedFor || !byDate.has(task.plannedFor)) continue;
      byDate.get(task.plannedFor)?.push({ task, date: task.plannedFor, kind: task.itemKind, time: task.scheduledLocalTime, windowPosition: null, operationalState: pointState(task.plannedFor, todayDate), retainedStartsOn: null, retainedEndsOn: null });
      continue;
    }
    if (!task.retainedStartsOn || !task.retainedEndsOn || task.retainedStartsOn > task.retainedEndsOn) continue;
    for (const date of visibleDates) {
      if (date < task.retainedStartsOn || date > task.retainedEndsOn) continue;
      const position: LitterCareCalendarWindowPosition = task.retainedStartsOn === task.retainedEndsOn ? "single" : date === task.retainedStartsOn ? "start" : date === task.retainedEndsOn ? "end" : "middle";
      const windowState = getLitterCareTaskWindowState(task, { date: todayDate, localTime: todayLocalTime });
      byDate.get(date)?.push({ task, date, kind: task.itemKind, time: date === task.retainedStartsOn ? task.retainedStartsLocalTime : date === task.retainedEndsOn ? task.retainedEndsLocalTime : null, windowPosition: position, operationalState: windowState === "open" ? "open" : windowState === "overdue" ? "overdue" : windowState === "upcoming" ? "upcoming" : null, retainedStartsOn: task.retainedStartsOn, retainedEndsOn: task.retainedEndsOn });
    }
  }

  return {
    month,
    hasPlannedItems: planned.length > 0,
    hasFilteredItems: filtered.length > 0,
    days: visibleDates.map((date) => ({ date, isCurrentMonth: date.startsWith(month), isToday: date === todayDate, items: (byDate.get(date) ?? []).sort(compareItems) })),
  };
}
