import type {
  LitterCareCalendarCategoryFilter,
  LitterCareCalendarKindFilter,
} from "./litter-care-calendar";
import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import type { LitterCareTaskCategory, LitterCareTaskSummary } from "./litter-care-tasks-core";
import type { LitterJournalDetails, LitterJournalListItem } from "./types";

export type LitterCareTimelineZoom =
  | "cycle"
  | "gestation"
  | "four_weeks"
  | "week";

export type LitterCareTimelineAnchorKind = "estimated_ovulation" | "first_mating" | null;

export type LitterCareTimelineAnchor = {
  kind: LitterCareTimelineAnchorKind;
  date: string | null;
  message: string;
};

export type LitterCareTimelineMarkerKind =
  | "estimated_ovulation"
  | "first_mating"
  | "second_mating"
  | "pregnancy_confirmed"
  | "expected_birth"
  | "actual_birth"
  | "today"
  | "biological_day"
  | "biological_week";

export type LitterCareTimelineMarker = {
  id: string;
  kind: LitterCareTimelineMarkerKind;
  date: string;
  label: string;
  shape: "diamond" | "dot" | "today" | "tick" | "week";
  columnIndex: number;
  emphasis?: "strong" | "normal";
};

export type LitterCareTimelineItemVisual =
  | "milestone"
  | "task"
  | "window"
  | "recurring_task";

export type LitterCareTimelineProjectedItem = {
  id: string;
  taskId: string;
  title: string;
  category: LitterCareTaskCategory;
  kind: LitterCareTaskSummary["itemKind"];
  visual: LitterCareTimelineItemVisual;
  status: LitterCareTaskSummary["status"];
  scheduleSource: LitterCareTaskSummary["scheduleSource"];
  isScheduleLocked: boolean;
  isSuggestedOnly: boolean;
  isOverdue: boolean;
  startsOn: string;
  endsOn: string;
  startColumn: number;
  endColumn: number;
  truncatedLeft: boolean;
  truncatedRight: boolean;
  lane: number;
  accessibleLabel: string;
  resolvedAt: string | null;
  occurrenceNo: number;
};

export type LitterCareTimelineCategoryLane = {
  category: LitterCareTaskCategory;
  label: string;
  laneCount: number;
  items: LitterCareTimelineProjectedItem[];
};

export type LitterCareTimelineHeader = {
  litterName: string;
  parentsLabel: string;
  statusLabel: string;
  biologicalDayLabel: string | null;
  ovulationLabel: string | null;
  matingsLabel: string | null;
  expectedBirthLabel: string | null;
  actualBirthLabel: string | null;
  nextActionLabel: string | null;
  anchorMessage: string;
};

export type LitterCareTimelineProjection = {
  zoom: LitterCareTimelineZoom;
  startsOn: string;
  endsOn: string;
  dates: string[];
  columnCount: number;
  todayColumnIndex: number | null;
  anchor: LitterCareTimelineAnchor;
  gestationZoomAvailable: boolean;
  header: LitterCareTimelineHeader;
  markers: LitterCareTimelineMarker[];
  categories: LitterCareTimelineCategoryLane[];
  unpositionedCount: number;
  hasPlannedItems: boolean;
  hasFilteredItems: boolean;
  referenceDate: string;
};

const TIMELINE_CATEGORY_ORDER: LitterCareTaskCategory[] = [
  "reproduction",
  "maternal_health",
  "veterinary",
  "maternal_feeding",
  "preparation",
  "offspring_weight",
  "offspring_health",
  "offspring_feeding",
  "socialization",
  "identification",
  "vaccination",
  "other",
];

const BIOLOGICAL_DAY_OFFSETS = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63] as const;

const kindLabels: Record<LitterCareTaskSummary["itemKind"], string> = {
  milestone: "Jalon",
  task: "Tâche",
  recurring_task: "Suivi récurrent",
  window: "Fenêtre",
};

const statusLabels: Record<LitterCareTaskSummary["status"], string> = {
  planned: "Planifiée",
  done: "Réalisée",
  cancelled: "Annulée",
  not_applicable: "Non applicable",
};

const journalStatusLabels: Record<string, string> = {
  mating_done: "Saillie réalisée",
  pregnancy_unconfirmed: "Gestation à confirmer",
  pregnancy_confirmed: "Gestation confirmée",
  birth_expected: "Mise-bas attendue",
  birth_in_progress: "Mise-bas en cours",
  born: "Chiots nés",
  puppies_created: "Chiots enregistrés",
  choice_period: "Période de choix",
  ready_to_leave: "Prêts au départ",
};

function isCivilDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toCivilDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isCivilDate(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match && isCivilDate(match[1]) ? match[1] : null;
}

function dateParts(value: string) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

export function addLitterCareTimelineCivilDays(value: string, offsetDays: number) {
  if (!isCivilDate(value)) return null;
  const parts = dateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

export function getLitterCareTimelineWeekStart(value: string) {
  if (!isCivilDate(value)) return null;
  const parts = dateParts(value);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return addLitterCareTimelineCivilDays(value, -((weekday + 6) % 7));
}

function civilDayNumber(value: string) {
  const parts = dateParts(value);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function daysBetween(start: string, end: string) {
  return civilDayNumber(end) - civilDayNumber(start);
}

function enumerateDates(startsOn: string, endsOn: string) {
  if (!isCivilDate(startsOn) || !isCivilDate(endsOn) || startsOn > endsOn) return [] as string[];
  const dates: string[] = [];
  for (let offset = 0; ; offset += 1) {
    const date = addLitterCareTimelineCivilDays(startsOn, offset);
    if (!date || date > endsOn) break;
    dates.push(date);
  }
  return dates;
}

function formatShortCivilDate(value: string) {
  const parts = dateParts(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

function formatFullCivilDate(value: string) {
  const parts = dateParts(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function getLitterCareTimelineZoom(
  value: string | undefined,
): LitterCareTimelineZoom {
  if (
    value === "cycle" ||
    value === "gestation" ||
    value === "four_weeks" ||
    value === "week"
  ) {
    return value;
  }
  return "cycle";
}

export function resolveLitterCareTimelineAnchor(
  details: LitterJournalDetails | null,
): LitterCareTimelineAnchor {
  const ovulation = toCivilDate(details?.estimated_ovulation_date);
  if (ovulation) {
    return {
      kind: "estimated_ovulation",
      date: ovulation,
      message: `Calcul fondé sur l’ovulation estimée du ${formatShortCivilDate(ovulation)}`,
    };
  }

  const mating = toCivilDate(details?.mating_date);
  if (mating) {
    return {
      kind: "first_mating",
      date: mating,
      message: `Repère fondé sur la première saillie du ${formatShortCivilDate(mating)}`,
    };
  }

  return {
    kind: null,
    date: null,
    message:
      "Repère biologique J0 indisponible. La frise utilise uniquement les dates civiles retenues.",
  };
}

export function buildLitterCareTimelineBiologicalDays(anchorDate: string) {
  return BIOLOGICAL_DAY_OFFSETS.map((offset) => ({
    offset,
    label: `J${offset}`,
    date: addLitterCareTimelineCivilDays(anchorDate, offset)!,
  }));
}

export function buildLitterCareTimelineBiologicalWeeks(anchorDate: string) {
  return Array.from({ length: 9 }, (_, index) => {
    const week = index + 1;
    const startsOn = addLitterCareTimelineCivilDays(anchorDate, index * 7)!;
    const endsOn = addLitterCareTimelineCivilDays(anchorDate, index * 7 + 6)!;
    return { week, label: `S${week}`, startsOn, endsOn };
  });
}

function taskPointDate(task: LitterCareTaskSummary): string | null {
  if (task.itemKind === "window") return null;
  return toCivilDate(task.plannedFor) ?? toCivilDate(task.suggestedFor);
}

function taskWindowRange(task: LitterCareTaskSummary): { startsOn: string; endsOn: string; suggestedOnly: boolean } | null {
  if (task.itemKind !== "window") return null;
  const retainedStart = toCivilDate(task.retainedStartsOn);
  const retainedEnd = toCivilDate(task.retainedEndsOn);
  if (retainedStart && retainedEnd && retainedStart <= retainedEnd) {
    return { startsOn: retainedStart, endsOn: retainedEnd, suggestedOnly: false };
  }
  const suggestedStart = toCivilDate(task.suggestedStartsOn);
  const suggestedEnd = toCivilDate(task.suggestedEndsOn);
  if (suggestedStart && suggestedEnd && suggestedStart <= suggestedEnd) {
    return { startsOn: suggestedStart, endsOn: suggestedEnd, suggestedOnly: true };
  }
  return null;
}

function taskSpan(task: LitterCareTaskSummary): { startsOn: string; endsOn: string; suggestedOnly: boolean } | null {
  if (task.itemKind === "window") return taskWindowRange(task);
  const date = taskPointDate(task);
  if (!date) return null;
  const suggestedOnly =
    !toCivilDate(task.plannedFor) && Boolean(toCivilDate(task.suggestedFor));
  return { startsOn: date, endsOn: date, suggestedOnly };
}

function matchesFilters(
  task: LitterCareTaskSummary,
  kind: LitterCareCalendarKindFilter,
  category: LitterCareCalendarCategoryFilter,
) {
  return (
    (kind === "all" || task.itemKind === kind) &&
    (category === "all" || task.category === category)
  );
}

function collectUsableDates(
  litter: LitterJournalListItem,
  details: LitterJournalDetails | null,
  tasks: readonly LitterCareTaskSummary[],
) {
  const dates: string[] = [];
  const push = (value: string | null | undefined) => {
    const date = toCivilDate(value);
    if (date) dates.push(date);
  };
  push(details?.estimated_ovulation_date);
  push(details?.mating_date);
  push(details?.mating_date_2);
  push(toCivilDate(details?.pregnancy_confirmed_at));
  push(litter.expected_birth_date);
  push(litter.actual_birth_date);
  for (const task of tasks) {
    const span = taskSpan(task);
    if (!span) continue;
    dates.push(span.startsOn, span.endsOn);
  }
  return dates;
}

function resolveCycleRange({
  litter,
  details,
  tasks,
  anchor,
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  tasks: readonly LitterCareTaskSummary[];
  anchor: LitterCareTimelineAnchor;
}) {
  const usable = collectUsableDates(litter, details, tasks).sort();
  const start =
    anchor.date ??
    usable[0] ??
    litter.expected_birth_date ??
    litter.actual_birth_date ??
    null;
  if (!start || !isCivilDate(start)) {
    return null;
  }

  const endCandidates = [
    litter.actual_birth_date,
    litter.expected_birth_date,
    ...usable,
    anchor.date ? addLitterCareTimelineCivilDays(anchor.date, 63) : null,
  ]
    .map((value) => toCivilDate(value))
    .filter((value): value is string => Boolean(value))
    .sort();

  let end = endCandidates[endCandidates.length - 1] ?? start;
  if (end < start) end = start;

  const spanDays = daysBetween(start, end);
  if (spanDays < 13) {
    end = addLitterCareTimelineCivilDays(start, 13)!;
  } else {
    const paddedEnd = addLitterCareTimelineCivilDays(end, 2);
    if (paddedEnd) end = paddedEnd;
  }

  return { startsOn: start, endsOn: end };
}

function resolveVisibleRange({
  zoom,
  litter,
  details,
  tasks,
  anchor,
  todayDate,
  requestedDate,
}: {
  zoom: LitterCareTimelineZoom;
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  tasks: readonly LitterCareTaskSummary[];
  anchor: LitterCareTimelineAnchor;
  todayDate: string;
  requestedDate: string | undefined;
}): { startsOn: string; endsOn: string; referenceDate: string; gestationZoomAvailable: boolean } | null {
  const gestationZoomAvailable = Boolean(anchor.date);
  const cycle = resolveCycleRange({ litter, details, tasks, anchor });
  const safeToday = isCivilDate(todayDate) ? todayDate : cycle?.startsOn ?? "1970-01-01";
  const requested = requestedDate && isCivilDate(requestedDate) ? requestedDate : null;

  if (zoom === "gestation") {
    if (!anchor.date) {
      if (!cycle) return null;
      return {
        startsOn: cycle.startsOn,
        endsOn: cycle.endsOn,
        referenceDate: requested ?? safeToday,
        gestationZoomAvailable: false,
      };
    }
    return {
      startsOn: anchor.date,
      endsOn: addLitterCareTimelineCivilDays(anchor.date, 63)!,
      referenceDate: requested ?? safeToday,
      gestationZoomAvailable: true,
    };
  }

  if (zoom === "week") {
    const focus = requested ?? safeToday;
    const startsOn = getLitterCareTimelineWeekStart(focus);
    if (!startsOn) return null;
    return {
      startsOn,
      endsOn: addLitterCareTimelineCivilDays(startsOn, 6)!,
      referenceDate: focus,
      gestationZoomAvailable,
    };
  }

  if (zoom === "four_weeks") {
    const cycleStart = cycle?.startsOn;
    const cycleEnd = cycle?.endsOn;
    const nextAction = findNextAction(tasks, safeToday)?.date ?? null;
    let focus =
      requested ??
      (cycleStart && cycleEnd && safeToday >= cycleStart && safeToday <= cycleEnd
        ? safeToday
        : null) ??
      nextAction ??
      cycleStart ??
      safeToday;
    if (!isCivilDate(focus)) focus = safeToday;
    const startsOn = addLitterCareTimelineCivilDays(focus, -13)!;
    const endsOn = addLitterCareTimelineCivilDays(focus, 14)!;
    return {
      startsOn,
      endsOn,
      referenceDate: focus,
      gestationZoomAvailable,
    };
  }

  if (!cycle) return null;
  return {
    startsOn: cycle.startsOn,
    endsOn: cycle.endsOn,
    referenceDate: requested ?? safeToday,
    gestationZoomAvailable,
  };
}

function findNextAction(tasks: readonly LitterCareTaskSummary[], todayDate: string) {
  const candidates = tasks
    .filter((task) => task.status === "planned")
    .map((task) => {
      const span = taskSpan(task);
      if (!span) return null;
      return { task, date: span.startsOn };
    })
    .filter((value): value is { task: LitterCareTaskSummary; date: string } => Boolean(value))
    .filter((value) => value.date >= todayDate)
    .sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      if (byDate) return byDate;
      return left.task.id.localeCompare(right.task.id);
    });
  return candidates[0] ?? null;
}

export type LitterCareTimelineLaneInterval = {
  id: string;
  startsOn: string;
  endsOn: string;
};

export function packLitterCareTimelineLanes(
  items: readonly LitterCareTimelineLaneInterval[],
): Map<string, number> {
  const sorted = [...items].sort((left, right) => {
    const byStart = left.startsOn.localeCompare(right.startsOn);
    if (byStart) return byStart;
    const byEnd = left.endsOn.localeCompare(right.endsOn);
    if (byEnd) return byEnd;
    return left.id.localeCompare(right.id);
  });

  const laneEnds: string[] = [];
  const lanes = new Map<string, number>();

  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.startsOn);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endsOn);
    } else {
      laneEnds[lane] = item.endsOn;
    }
    lanes.set(item.id, lane);
  }

  return lanes;
}

function buildAccessibleLabel(item: {
  kind: LitterCareTaskSummary["itemKind"];
  title: string;
  category: LitterCareTaskCategory;
  startsOn: string;
  endsOn: string;
  status: LitterCareTaskSummary["status"];
  scheduleSource: LitterCareTaskSummary["scheduleSource"];
  isScheduleLocked: boolean;
  isSuggestedOnly: boolean;
  isOverdue: boolean;
  resolvedAt: string | null;
}) {
  const period =
    item.startsOn === item.endsOn
      ? formatFullCivilDate(item.startsOn)
      : `du ${formatFullCivilDate(item.startsOn)} au ${formatFullCivilDate(item.endsOn)}`;
  const schedule = item.isScheduleLocked
    ? "programmation verrouillée"
    : item.scheduleSource === "manual"
      ? "programmation ajustée"
      : item.isSuggestedOnly
        ? "programmation suggérée"
        : "programmation suggérée";
  const overdue = item.isOverdue ? " ; en retard" : "";
  const resolved =
    item.status === "done" && item.resolvedAt
      ? ` ; réalisée le ${formatFullCivilDate(toCivilDate(item.resolvedAt) ?? item.resolvedAt.slice(0, 10))}`
      : "";
  return `${kindLabels[item.kind]} ; ${item.title} ; ${litterCareTaskCategoryLabels[item.category]} ; ${period} ; ${statusLabels[item.status]} ; ${schedule}${overdue}${resolved}`;
}

function buildHeader({
  litter,
  details,
  anchor,
  todayDate,
  tasks,
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  anchor: LitterCareTimelineAnchor;
  todayDate: string;
  tasks: readonly LitterCareTaskSummary[];
}): LitterCareTimelineHeader {
  const mother = litter.mother_display_name?.trim() || "Mère non renseignée";
  const father = litter.father_display_name?.trim() || "Père non renseigné";
  const ovulation = toCivilDate(details?.estimated_ovulation_date);
  const mating1 = toCivilDate(details?.mating_date);
  const mating2 = toCivilDate(details?.mating_date_2);
  const expectedBirth = toCivilDate(litter.expected_birth_date);
  const actualBirth = toCivilDate(litter.actual_birth_date);
  const next = findNextAction(tasks, todayDate);

  let biologicalDayLabel: string | null = null;
  if (anchor.date && isCivilDate(todayDate)) {
    const day = daysBetween(anchor.date, todayDate);
    if (Number.isFinite(day)) biologicalDayLabel = `J${day}`;
  }

  let matingsLabel: string | null = null;
  if (mating1 && mating2) {
    matingsLabel = `${formatShortCivilDate(mating1)} et ${formatShortCivilDate(mating2)}`;
  } else if (mating1) {
    matingsLabel = formatShortCivilDate(mating1);
  } else if (mating2) {
    matingsLabel = formatShortCivilDate(mating2);
  }

  return {
    litterName: litter.name?.trim() || litter.id || "Portée",
    parentsLabel: `${mother} × ${father}`,
    statusLabel: litter.status
      ? journalStatusLabels[litter.status] ?? litter.status.replaceAll("_", " ")
      : "Statut inconnu",
    biologicalDayLabel,
    ovulationLabel: ovulation ? formatShortCivilDate(ovulation) : null,
    matingsLabel,
    expectedBirthLabel: expectedBirth ? formatShortCivilDate(expectedBirth) : null,
    actualBirthLabel: actualBirth ? formatShortCivilDate(actualBirth) : null,
    nextActionLabel: next?.task.title ?? null,
    anchorMessage: anchor.message,
  };
}

function buildMarkers({
  litter,
  details,
  anchor,
  dates,
  todayDate,
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  anchor: LitterCareTimelineAnchor;
  dates: string[];
  todayDate: string;
}): LitterCareTimelineMarker[] {
  const indexByDate = new Map(dates.map((date, index) => [date, index]));
  const markers: LitterCareTimelineMarker[] = [];
  const push = (
    kind: LitterCareTimelineMarkerKind,
    date: string | null,
    label: string,
    shape: LitterCareTimelineMarker["shape"],
    emphasis: LitterCareTimelineMarker["emphasis"] = "normal",
  ) => {
    if (!date || !indexByDate.has(date)) return;
    markers.push({
      id: `${kind}:${date}`,
      kind,
      date,
      label,
      shape,
      columnIndex: indexByDate.get(date)!,
      emphasis,
    });
  };

  push(
    "estimated_ovulation",
    toCivilDate(details?.estimated_ovulation_date),
    "Ovulation estimée",
    "diamond",
  );
  push("first_mating", toCivilDate(details?.mating_date), "Première saillie", "dot");
  push("second_mating", toCivilDate(details?.mating_date_2), "Deuxième saillie", "dot");
  push(
    "pregnancy_confirmed",
    toCivilDate(details?.pregnancy_confirmed_at),
    "Confirmation de gestation",
    "dot",
  );
  push(
    "expected_birth",
    toCivilDate(litter.expected_birth_date),
    "Mise-bas centrale estimée",
    "diamond",
  );
  push(
    "actual_birth",
    toCivilDate(litter.actual_birth_date),
    "Naissance réelle",
    "dot",
    "strong",
  );
  push("today", isCivilDate(todayDate) ? todayDate : null, "Aujourd’hui", "today", "strong");

  if (anchor.date) {
    for (const day of buildLitterCareTimelineBiologicalDays(anchor.date)) {
      push("biological_day", day.date, day.label, "tick");
    }
    for (const week of buildLitterCareTimelineBiologicalWeeks(anchor.date)) {
      if (!indexByDate.has(week.startsOn)) continue;
      markers.push({
        id: `biological_week:${week.week}`,
        kind: "biological_week",
        date: week.startsOn,
        label: week.label,
        shape: "week",
        columnIndex: indexByDate.get(week.startsOn)!,
      });
    }
  }

  return markers;
}

export function projectLitterCareTimeline({
  litter,
  details,
  tasks,
  todayDate,
  zoom: requestedZoom = "cycle",
  requestedDate,
  kind = "all",
  category = "all",
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  tasks: readonly LitterCareTaskSummary[];
  todayDate: string;
  zoom?: LitterCareTimelineZoom;
  requestedDate?: string;
  kind?: LitterCareCalendarKindFilter;
  category?: LitterCareCalendarCategoryFilter;
}): LitterCareTimelineProjection | null {
  const zoom = getLitterCareTimelineZoom(requestedZoom);
  const anchor = resolveLitterCareTimelineAnchor(details);
  const visible = resolveVisibleRange({
    zoom,
    litter,
    details,
    tasks,
    anchor,
    todayDate,
    requestedDate,
  });
  if (!visible) return null;

  const dates = enumerateDates(visible.startsOn, visible.endsOn);
  if (!dates.length) return null;
  const indexByDate = new Map(dates.map((date, index) => [date, index]));
  const header = buildHeader({ litter, details, anchor, todayDate, tasks });
  const markers = buildMarkers({
    litter,
    details,
    anchor,
    dates,
    todayDate,
  });

  const filtered = tasks.filter((task) => matchesFilters(task, kind, category));
  let unpositionedCount = 0;
  const projected: LitterCareTimelineProjectedItem[] = [];

  for (const task of filtered) {
    const span = taskSpan(task);
    if (!span) {
      unpositionedCount += 1;
      continue;
    }

    if (span.endsOn < visible.startsOn || span.startsOn > visible.endsOn) {
      continue;
    }

    const truncatedLeft = span.startsOn < visible.startsOn;
    const truncatedRight = span.endsOn > visible.endsOn;
    const visibleStart = truncatedLeft ? visible.startsOn : span.startsOn;
    const visibleEnd = truncatedRight ? visible.endsOn : span.endsOn;
    const startColumn = indexByDate.get(visibleStart);
    const endColumn = indexByDate.get(visibleEnd);
    if (startColumn == null || endColumn == null) {
      unpositionedCount += 1;
      continue;
    }

    const isSuggestedOnly =
      task.scheduleSource === "suggested" || span.suggestedOnly;
    const isOverdue =
      task.status === "planned" &&
      ((task.itemKind === "window" && span.endsOn < todayDate) ||
        (task.itemKind !== "window" && span.startsOn < todayDate));

    projected.push({
      id: task.id,
      taskId: task.id,
      title: task.title,
      category: task.category,
      kind: task.itemKind,
      visual: task.itemKind,
      status: task.status,
      scheduleSource: task.scheduleSource,
      isScheduleLocked: task.isScheduleLocked,
      isSuggestedOnly,
      isOverdue,
      startsOn: span.startsOn,
      endsOn: span.endsOn,
      startColumn,
      endColumn,
      truncatedLeft,
      truncatedRight,
      lane: 0,
      accessibleLabel: buildAccessibleLabel({
        kind: task.itemKind,
        title: task.title,
        category: task.category,
        startsOn: span.startsOn,
        endsOn: span.endsOn,
        status: task.status,
        scheduleSource: task.scheduleSource,
        isScheduleLocked: task.isScheduleLocked,
        isSuggestedOnly,
        isOverdue,
        resolvedAt: task.resolvedAt,
      }),
      resolvedAt: task.resolvedAt,
      occurrenceNo: task.occurrenceNo,
    });
  }

  const categories: LitterCareTimelineCategoryLane[] = [];
  for (const categoryKey of TIMELINE_CATEGORY_ORDER) {
    const items = projected.filter((item) => item.category === categoryKey);
    if (!items.length) continue;
    const lanes = packLitterCareTimelineLanes(
      items.map((item) => ({
        id: item.id,
        startsOn: dates[item.startColumn]!,
        endsOn: dates[item.endColumn]!,
      })),
    );
    for (const item of items) {
      item.lane = lanes.get(item.id) ?? 0;
    }
    const laneCount = items.reduce((max, item) => Math.max(max, item.lane + 1), 1);
    categories.push({
      category: categoryKey,
      label: litterCareTaskCategoryLabels[categoryKey],
      laneCount,
      items,
    });
  }

  return {
    zoom,
    startsOn: visible.startsOn,
    endsOn: visible.endsOn,
    dates,
    columnCount: dates.length,
    todayColumnIndex: indexByDate.get(todayDate) ?? null,
    anchor,
    gestationZoomAvailable: visible.gestationZoomAvailable,
    header,
    markers,
    categories,
    unpositionedCount,
    hasPlannedItems: tasks.length > 0,
    hasFilteredItems: filtered.length > 0,
    referenceDate: visible.referenceDate,
  };
}

export function getLitterCareTimelineCategoryOrder() {
  return [...TIMELINE_CATEGORY_ORDER];
}
