import type {
  LitterCareTaskCategory,
  LitterCareTaskSummary,
} from "./litter-care-tasks";
import type { LitterPlanDetail } from "./litter-plans";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type InteractiveTimelineItemKind = "milestone" | "task" | "window";

export type InteractiveTimelineStatus =
  | "planned"
  | "done"
  | "cancelled"
  | "not_applicable";

export type InteractiveTimelineScheduleSource = "suggested" | "manual";

export type InteractiveTimelineInteractionMode =
  | "point_move"
  | "window_move_and_resize"
  | "read_only";

export type InteractiveTimelineReadOnlyReason =
  | "viewer"
  | "terminal"
  | "pending_anchor"
  | "missing_task"
  | "locked"
  | null;

export type InteractiveTimelineItem = {
  publicKey: string;
  kind: InteractiveTimelineItemKind;
  title: string;
  category: LitterCareTaskCategory;
  suggestedStartDate: string | null;
  suggestedEndDate: string | null;
  retainedStartDate: string | null;
  retainedEndDate: string | null;
  scheduleSource: InteractiveTimelineScheduleSource;
  isLocked: boolean;
  status: InteractiveTimelineStatus;
  interactionMode: InteractiveTimelineInteractionMode;
  readOnlyReason: InteractiveTimelineReadOnlyReason;
  statusLabel: string;
};

export type InteractiveTimelineDomain = {
  startsOn: string;
  endsOn: string;
  dayCount: number;
  marginDays: number;
};

export type InteractiveTimelineGeometryItem = InteractiveTimelineItem & {
  displayStartDate: string;
  displayEndDate: string;
  startPercent: number;
  endPercent: number;
};

export type InteractiveTimelineGeometry = {
  domain: InteractiveTimelineDomain;
  ticks: Array<{ date: string; percent: number }>;
  categories: Array<{
    category: LitterCareTaskCategory;
    items: InteractiveTimelineGeometryItem[];
  }>;
  undatedItems: InteractiveTimelineItem[];
  pendingAnchorItems: InteractiveTimelineItem[];
};

export type MoveTimelinePointIntention = {
  taskId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
  scheduledLocalTime: string | null;
  timezoneName: string | null;
};

export type MoveTimelineWindowIntention = {
  taskId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
  retainedStartsLocalTime: string | null;
  retainedEndsLocalTime: string | null;
  timezoneName: string | null;
};

export type InteractiveTimelineBinding = {
  publicKey: string;
  kind: InteractiveTimelineItemKind;
  task: LitterCareTaskSummary;
  canMoveGraphically: boolean;
  canOpenPrecisePanel: boolean;
  canResolve: boolean;
};

export type InteractiveLitterPlanTimeline = {
  title: string;
  items: InteractiveTimelineItem[];
  pendingAnchorItems: InteractiveTimelineItem[];
};

export type InteractiveLitterPlanTimelineBuildResult = InteractiveLitterPlanTimeline & {
  bindings: InteractiveTimelineBinding[];
};

const INTERACTIVE_KINDS = new Set<InteractiveTimelineItemKind>([
  "milestone",
  "task",
  "window",
]);

const TERMINAL_STATUSES = new Set<InteractiveTimelineStatus>([
  "done",
  "cancelled",
  "not_applicable",
]);

const WRITABLE_ROLES = new Set<OrganizationRole>(["owner", "admin", "member"]);

const MIN_MARGIN_DAYS = 7;
const MAX_MARGIN_DAYS = 21;

export function buildLitterPlanTimelineItemPublicKey(
  instanceKey: string,
  index: number,
) {
  return `timeline-item-${instanceKey}-${index}`;
}

export function isOpaqueTimelinePublicKey(publicKey: string, instanceKey: string) {
  if (!publicKey.startsWith(`timeline-item-${instanceKey}-`)) return false;
  const suffix = publicKey.slice(`timeline-item-${instanceKey}-`.length);
  return /^\d+$/.test(suffix);
}

export function publicKeyContainsForbiddenOpaqueData(
  publicKey: string,
  forbidden: string[],
) {
  const lowered = publicKey.toLowerCase();
  return forbidden.some((value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return lowered.includes(trimmed.toLowerCase());
  });
}

function isCivilDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function civilDayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function addCivilDays(date: string, days: number) {
  if (!isCivilDate(date) || !Number.isInteger(days)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  const result = [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return isCivilDate(result) ? result : null;
}

export function civilDayDelta(from: string, to: string) {
  if (!isCivilDate(from) || !isCivilDate(to)) return null;
  return civilDayNumber(to) - civilDayNumber(from);
}

export function civilInclusiveDurationDays(start: string, end: string) {
  const delta = civilDayDelta(start, end);
  return delta === null ? null : delta + 1;
}

export function computeInteractiveTimelineMarginDays(spanDays: number) {
  const span = Math.max(0, spanDays);
  const proportional = Math.ceil(span * 0.1);
  return Math.min(MAX_MARGIN_DAYS, Math.max(MIN_MARGIN_DAYS, proportional));
}

export function computeInteractiveTimelineDomain(
  items: InteractiveTimelineItem[],
): InteractiveTimelineDomain | null {
  const dates: string[] = [];
  for (const item of items) {
    for (const date of [
      item.suggestedStartDate,
      item.suggestedEndDate,
      item.retainedStartDate,
      item.retainedEndDate,
    ]) {
      if (isCivilDate(date)) dates.push(date);
    }
  }
  if (dates.length === 0) return null;

  const earliest = dates.reduce((min, date) => (date < min ? date : min));
  const latest = dates.reduce((max, date) => (date > max ? date : max));
  const spanDays = civilDayNumber(latest) - civilDayNumber(earliest);
  const marginDays = computeInteractiveTimelineMarginDays(spanDays);
  const startsOn = addCivilDays(earliest, -marginDays);
  const endsOn = addCivilDays(latest, marginDays);
  if (!startsOn || !endsOn) return null;

  return {
    startsOn,
    endsOn,
    dayCount: civilDayNumber(endsOn) - civilDayNumber(startsOn),
    marginDays,
  };
}

export function dateToDomainPercent(domain: InteractiveTimelineDomain, date: string) {
  if (!isCivilDate(date)) return null;
  if (domain.dayCount === 0) return 50;
  const offset = civilDayNumber(date) - civilDayNumber(domain.startsOn);
  return (offset / domain.dayCount) * 100;
}

export function domainPercentToDate(
  domain: InteractiveTimelineDomain,
  percent: number,
) {
  if (!Number.isFinite(percent)) return null;
  if (domain.dayCount === 0) return domain.startsOn;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = Math.round((clamped / 100) * domain.dayCount);
  return addCivilDays(domain.startsOn, offset);
}

export function pointerDeltaToCivilDays(
  domain: InteractiveTimelineDomain,
  deltaPx: number,
  trackWidthPx: number,
) {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(trackWidthPx) || trackWidthPx <= 0) {
    return 0;
  }
  if (domain.dayCount === 0) return 0;
  const days = (deltaPx / trackWidthPx) * domain.dayCount;
  return Math.trunc(days);
}

export function keyboardScheduleDayStep(shiftKey: boolean, direction: -1 | 1) {
  return direction * (shiftKey ? 7 : 1);
}

export function previewPointMove(baseDate: string, dayDelta: number) {
  if (!isCivilDate(baseDate) || !Number.isInteger(dayDelta)) return null;
  return addCivilDays(baseDate, dayDelta);
}

export function previewWindowMove(
  startDate: string,
  endDate: string,
  dayDelta: number,
) {
  if (
    !isCivilDate(startDate) ||
    !isCivilDate(endDate) ||
    startDate > endDate ||
    !Number.isInteger(dayDelta)
  ) {
    return null;
  }
  const nextStart = addCivilDays(startDate, dayDelta);
  const nextEnd = addCivilDays(endDate, dayDelta);
  if (!nextStart || !nextEnd) return null;
  return { startDate: nextStart, endDate: nextEnd };
}

export function previewWindowResizeStart(
  startDate: string,
  endDate: string,
  dayDelta: number,
) {
  if (
    !isCivilDate(startDate) ||
    !isCivilDate(endDate) ||
    startDate > endDate ||
    !Number.isInteger(dayDelta)
  ) {
    return null;
  }
  const nextStart = addCivilDays(startDate, dayDelta);
  if (!nextStart || nextStart > endDate) return null;
  return { startDate: nextStart, endDate };
}

export function previewWindowResizeEnd(
  startDate: string,
  endDate: string,
  dayDelta: number,
) {
  if (
    !isCivilDate(startDate) ||
    !isCivilDate(endDate) ||
    startDate > endDate ||
    !Number.isInteger(dayDelta)
  ) {
    return null;
  }
  const nextEnd = addCivilDays(endDate, dayDelta);
  if (!nextEnd || nextEnd < startDate) return null;
  return { startDate, endDate: nextEnd };
}

export function interactiveTimelineStatusLabel(item: {
  status: InteractiveTimelineStatus;
  scheduleSource: InteractiveTimelineScheduleSource;
  isLocked: boolean;
  readOnlyReason: InteractiveTimelineReadOnlyReason;
}) {
  if (item.readOnlyReason === "pending_anchor") {
    return "En attente d’ancre";
  }
  if (item.readOnlyReason === "missing_task") {
    return "Programmation indisponible";
  }
  if (item.status === "done") return "Traité";
  if (item.status === "cancelled") return "Annulé";
  if (item.status === "not_applicable") return "Non applicable";
  if (item.isLocked) return "Verrouillé";
  if (item.scheduleSource === "manual") return "Ajusté";
  return "Suggestion";
}

export function interactiveTimelinePendingLabel() {
  return "En attente d’une date de référence";
}

function resolveInteraction(input: {
  kind: InteractiveTimelineItemKind;
  role: OrganizationRole | null;
  status: InteractiveTimelineStatus;
  isLocked: boolean;
  hasTask: boolean;
  pendingAnchor: boolean;
}): {
  interactionMode: InteractiveTimelineInteractionMode;
  readOnlyReason: InteractiveTimelineReadOnlyReason;
} {
  if (input.pendingAnchor) {
    return { interactionMode: "read_only", readOnlyReason: "pending_anchor" };
  }
  if (!input.hasTask) {
    return { interactionMode: "read_only", readOnlyReason: "missing_task" };
  }
  if (TERMINAL_STATUSES.has(input.status)) {
    return { interactionMode: "read_only", readOnlyReason: "terminal" };
  }
  if (!input.role || input.role === "viewer" || !WRITABLE_ROLES.has(input.role)) {
    return { interactionMode: "read_only", readOnlyReason: "viewer" };
  }
  if (input.isLocked) {
    return { interactionMode: "read_only", readOnlyReason: "locked" };
  }
  if (input.kind === "window") {
    return { interactionMode: "window_move_and_resize", readOnlyReason: null };
  }
  return { interactionMode: "point_move", readOnlyReason: null };
}

function linkedTasks(tasks: LitterCareTaskSummary[]) {
  return new Map(
    tasks.flatMap((task) =>
      task.litterPlanItemId ? [[task.litterPlanItemId, task] as const] : [],
    ),
  );
}

export function buildInteractiveLitterPlanTimeline(input: {
  plan: LitterPlanDetail;
  tasks: LitterCareTaskSummary[];
  role: OrganizationRole | null;
  instanceKey: string;
}): InteractiveLitterPlanTimelineBuildResult {
  const taskByPlanItemId = linkedTasks(input.tasks);
  const items: InteractiveTimelineItem[] = [];
  const pendingAnchorItems: InteractiveTimelineItem[] = [];
  const bindings: InteractiveTimelineBinding[] = [];
  let publicIndex = 0;

  for (const item of input.plan.items) {
    if (item.item_kind === "recurring_task") continue;
    if (!INTERACTIVE_KINDS.has(item.item_kind as InteractiveTimelineItemKind)) {
      continue;
    }

    const kind = item.item_kind as InteractiveTimelineItemKind;
    const category = item.category as LitterCareTaskCategory;
    publicIndex += 1;
    const publicKey = buildLitterPlanTimelineItemPublicKey(
      input.instanceKey,
      publicIndex,
    );
    const pendingAnchor = item.materialization_state === "pending_anchor";
    const task = taskByPlanItemId.get(item.id) ?? null;

    const suggestedStartDate =
      kind === "window"
        ? task?.suggestedStartsOn ?? null
        : task?.suggestedFor ?? null;
    const suggestedEndDate =
      kind === "window" ? task?.suggestedEndsOn ?? null : suggestedStartDate;
    const retainedStartDate =
      kind === "window"
        ? task?.retainedStartsOn ?? null
        : task?.plannedFor ?? null;
    const retainedEndDate =
      kind === "window" ? task?.retainedEndsOn ?? null : retainedStartDate;

    const status = (task?.status ?? "planned") as InteractiveTimelineStatus;
    const scheduleSource = (task?.scheduleSource ??
      "suggested") as InteractiveTimelineScheduleSource;
    const isLocked = task?.isScheduleLocked === true;
    const interaction = resolveInteraction({
      kind,
      role: input.role,
      status,
      isLocked,
      hasTask: Boolean(task),
      pendingAnchor,
    });

    const projected: InteractiveTimelineItem = {
      publicKey,
      kind,
      title: item.title,
      category,
      suggestedStartDate,
      suggestedEndDate,
      retainedStartDate,
      retainedEndDate,
      scheduleSource,
      isLocked,
      status,
      interactionMode: interaction.interactionMode,
      readOnlyReason: interaction.readOnlyReason,
      statusLabel: interactiveTimelineStatusLabel({
        status,
        scheduleSource,
        isLocked,
        readOnlyReason: interaction.readOnlyReason,
      }),
    };

    if (pendingAnchor) {
      pendingAnchorItems.push(projected);
      continue;
    }

    items.push(projected);

    if (!task) continue;

    const canOpenPrecisePanel =
      Boolean(input.role) &&
      WRITABLE_ROLES.has(input.role!) &&
      task.status === "planned";
    const canMoveGraphically =
      canOpenPrecisePanel &&
      interaction.interactionMode !== "read_only";
    const canResolve =
      Boolean(input.role) &&
      WRITABLE_ROLES.has(input.role!) &&
      task.status === "planned" &&
      !pendingAnchor;

    if (canOpenPrecisePanel || canMoveGraphically || canResolve) {
      bindings.push({
        publicKey,
        kind,
        task,
        canMoveGraphically,
        canOpenPrecisePanel,
        canResolve,
      });
    }
  }

  return {
    title: input.plan.header.title,
    items,
    pendingAnchorItems,
    bindings,
  };
}

export function buildInteractiveTimelineGeometry(
  timeline: InteractiveLitterPlanTimeline,
  overrides?: Record<
    string,
    { startDate: string; endDate: string } | undefined
  >,
): InteractiveTimelineGeometry | null {
  const domain = computeInteractiveTimelineDomain([
    ...timeline.items,
    ...timeline.pendingAnchorItems,
  ]);
  if (!domain) return null;

  const dated: InteractiveTimelineGeometryItem[] = [];
  const undatedItems: InteractiveTimelineItem[] = [];

  for (const item of timeline.items) {
    const override = overrides?.[item.publicKey];
    const startDate = override?.startDate ?? item.retainedStartDate;
    const endDate = override?.endDate ?? item.retainedEndDate;
    if (
      !isCivilDate(startDate) ||
      !isCivilDate(endDate) ||
      startDate > endDate
    ) {
      undatedItems.push(item);
      continue;
    }
    const startPercent = dateToDomainPercent(domain, startDate);
    const endPercent = dateToDomainPercent(domain, endDate);
    if (startPercent === null || endPercent === null) {
      undatedItems.push(item);
      continue;
    }
    dated.push({
      ...item,
      displayStartDate: startDate,
      displayEndDate: endDate,
      startPercent,
      endPercent,
    });
  }

  const categoryOrder = new Map<LitterCareTaskCategory, number>();
  for (const item of timeline.items) {
    if (!categoryOrder.has(item.category)) {
      categoryOrder.set(item.category, categoryOrder.size);
    }
  }

  const categories = [...new Set(dated.map((item) => item.category))]
    .map((category) => ({
      category,
      items: dated
        .filter((item) => item.category === category)
        .sort(
          (left, right) =>
            left.displayStartDate.localeCompare(right.displayStartDate) ||
            left.displayEndDate.localeCompare(right.displayEndDate) ||
            left.title.localeCompare(right.title),
        ),
    }))
    .sort(
      (left, right) =>
        left.items[0].displayStartDate.localeCompare(
          right.items[0].displayStartDate,
        ) ||
        (categoryOrder.get(left.category) ?? 0) -
          (categoryOrder.get(right.category) ?? 0),
    );

  const tickDates = [
    ...new Set(
      dated.flatMap((item) => [item.displayStartDate, item.displayEndDate]),
    ),
  ].sort();

  return {
    domain,
    ticks: tickDates.flatMap((date) => {
      const percent = dateToDomainPercent(domain, date);
      return percent === null ? [] : [{ date, percent }];
    }),
    categories,
    undatedItems,
    pendingAnchorItems: timeline.pendingAnchorItems,
  };
}

export function formatCivilDayOffsetLabel(dayDelta: number) {
  if (dayDelta === 0) return "0 jour";
  const abs = Math.abs(dayDelta);
  const unit = abs === 1 ? "jour" : "jours";
  return `${dayDelta > 0 ? "+" : "−"}${abs} ${unit}`;
}

export type TimelineDragHandle =
  | "point"
  | "window-start"
  | "window-end"
  | "window-move";

export function cumulativeDayDeltaForHandle(
  handle: TimelineDragHandle,
  originStart: string,
  originEnd: string,
  previewStart: string,
  previewEnd: string,
) {
  if (handle === "point") {
    return civilDayDelta(originStart, previewStart);
  }
  if (handle === "window-start") {
    return civilDayDelta(originStart, previewStart);
  }
  if (handle === "window-end") {
    return civilDayDelta(originEnd, previewEnd);
  }
  const startDelta = civilDayDelta(originStart, previewStart);
  const endDelta = civilDayDelta(originEnd, previewEnd);
  if (startDelta === null || endDelta === null) return null;
  if (startDelta !== endDelta) return null;
  return startDelta;
}

export function formatHandleDisplacementLabel(
  handle: TimelineDragHandle,
  dayDelta: number,
) {
  const offset = formatCivilDayOffsetLabel(dayDelta);
  if (handle === "point") return `Décalage : ${offset}`;
  if (handle === "window-start") return `Début déplacé de ${offset}`;
  if (handle === "window-end") return `Fin déplacée de ${offset}`;
  return `Période déplacée de ${offset}`;
}

export function buildTimelinePreviewLiveMessage(input: {
  kind: "milestone" | "task" | "window";
  handle: TimelineDragHandle;
  currentDateLabel: string;
  newDateLabel: string;
  startLabel: string;
  endLabel: string;
  durationDays: number | null;
  dayDelta: number;
}) {
  const displacement = formatHandleDisplacementLabel(
    input.handle,
    input.dayDelta,
  );
  if (input.kind === "window") {
    return `Aperçu — non enregistré. Du ${input.startLabel} au ${input.endLabel}. Durée : ${input.durationDays ?? "?"} jours. ${displacement}.`;
  }
  return `Aperçu — non enregistré. Date actuelle : ${input.currentDateLabel}. Nouvelle date : ${input.newDateLabel}. ${displacement}.`;
}

export function timelineScheduleResultRequiresRefresh(state: {
  status: "idle" | "success" | "error";
  requiresRefresh?: boolean;
  code?: string;
}) {
  if (state.requiresRefresh === true) return true;
  if (state.requiresRefresh === false) return false;
  if (state.status === "success") return true;
  if (state.status !== "error") return false;
  return Boolean(state.code);
}
