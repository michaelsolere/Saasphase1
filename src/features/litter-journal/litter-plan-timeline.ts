import type { LitterCareTaskCategory, LitterCareTaskSummary } from "./litter-care-tasks";
import type { LitterPlanDetail } from "./litter-plans";

export type LitterPlanTimelineItemKind = "milestone" | "task" | "window";

export type LitterPlanTimelinePoint = {
  id: string;
  kind: Exclude<LitterPlanTimelineItemKind, "window">;
  title: string;
  date: string | null;
};

export type LitterPlanTimelineWindow = {
  id: string;
  kind: "window";
  title: string;
  startsOn: string | null;
  endsOn: string | null;
};

export type LitterPlanTimelineCategory = {
  category: LitterCareTaskCategory;
  items: Array<LitterPlanTimelinePoint | LitterPlanTimelineWindow>;
};

export type LitterPlanTimeline = {
  title: string;
  categories: LitterPlanTimelineCategory[];
  pendingAnchorItems: Array<{
    id: string;
    kind: LitterPlanTimelineItemKind;
    title: string;
    category: LitterCareTaskCategory;
  }>;
};

export type LitterPlanTimelineScheduledItem =
  | (LitterPlanTimelinePoint & { startsOn: string; endsOn: string; startPercent: number; endPercent: number })
  | (LitterPlanTimelineWindow & { startsOn: string; endsOn: string; startPercent: number; endPercent: number });

export type LitterPlanTimelineGeometry = {
  startsOn: string;
  endsOn: string;
  ticks: Array<{ date: string; percent: number }>;
  categories: Array<{ category: LitterCareTaskCategory; items: LitterPlanTimelineScheduledItem[] }>;
  undatedItems: Array<LitterPlanTimelinePoint | LitterPlanTimelineWindow>;
};

export type LitterPlanTimelinePanelState = "available" | "empty" | "unavailable";

export function getLitterPlanTimelinePanelState(
  timeline: LitterPlanTimeline | null,
  unavailable: boolean,
): LitterPlanTimelinePanelState {
  if (unavailable) return "unavailable";
  return timeline ? "available" : "empty";
}

const timelineKinds = new Set<LitterPlanTimelineItemKind>([
  "milestone",
  "task",
  "window",
]);

function linkedTasks(tasks: LitterCareTaskSummary[]) {
  return new Map(
    tasks.flatMap((task) =>
      task.litterPlanItemId ? [[task.litterPlanItemId, task] as const] : [],
    ),
  );
}

export function projectLitterPlanTimeline(
  plan: LitterPlanDetail,
  tasks: LitterCareTaskSummary[],
): LitterPlanTimeline {
  const taskByPlanItemId = linkedTasks(tasks);
  const categories = new Map<LitterCareTaskCategory, LitterPlanTimelineCategory>();
  const pendingAnchorItems: LitterPlanTimeline["pendingAnchorItems"] = [];

  for (const item of plan.items) {
    if (!timelineKinds.has(item.item_kind as LitterPlanTimelineItemKind)) continue;
    const kind = item.item_kind as LitterPlanTimelineItemKind;
    const category = item.category as LitterCareTaskCategory;

    if (item.materialization_state === "pending_anchor") {
      pendingAnchorItems.push({ id: item.id, kind, title: item.title, category });
      continue;
    }

    const task = taskByPlanItemId.get(item.id);
    const group = categories.get(category) ?? { category, items: [] };
    if (!categories.has(category)) categories.set(category, group);

    if (kind === "window") {
      group.items.push({
        id: item.id,
        kind,
        title: item.title,
        startsOn: task?.retainedStartsOn ?? null,
        endsOn: task?.retainedEndsOn ?? null,
      });
    } else {
      group.items.push({
        id: item.id,
        kind,
        title: item.title,
        date: task?.plannedFor ?? null,
      });
    }
  }

  return {
    title: plan.header.title,
    categories: [...categories.values()],
    pendingAnchorItems,
  };
}

function dayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function schedule(item: LitterPlanTimelineCategory["items"][number]) {
  if (item.kind === "window") {
    if (!item.startsOn || !item.endsOn || item.startsOn > item.endsOn) return null;
    return { startsOn: item.startsOn, endsOn: item.endsOn };
  }
  if (!item.date) return null;
  return { startsOn: item.date, endsOn: item.date };
}

export function buildLitterPlanTimelineGeometry(
  timeline: LitterPlanTimeline,
): LitterPlanTimelineGeometry | null {
  const scheduled = timeline.categories.flatMap((category) =>
    category.items.flatMap((item) => {
      const dates = schedule(item);
      return dates ? [{ category: category.category, item, ...dates }] : [];
    }),
  );
  if (scheduled.length === 0) return null;

  const startsOn = scheduled.reduce((earliest, item) => earliest < item.startsOn ? earliest : item.startsOn, scheduled[0].startsOn);
  const endsOn = scheduled.reduce((latest, item) => latest > item.endsOn ? latest : item.endsOn, scheduled[0].endsOn);
  const range = dayNumber(endsOn) - dayNumber(startsOn);
  const percent = (date: string) => range === 0 ? 50 : ((dayNumber(date) - dayNumber(startsOn)) / range) * 100;
  const categoryOrder = new Map(timeline.categories.map((category, index) => [category.category, index]));
  const categories = [...new Set(scheduled.map((item) => item.category))]
    .map((category) => ({
      category,
      items: scheduled
        .filter((item) => item.category === category)
        .sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.endsOn.localeCompare(right.endsOn) || left.item.title.localeCompare(right.item.title))
        .map(({ item, startsOn: itemStartsOn, endsOn: itemEndsOn }) => ({ ...item, startsOn: itemStartsOn, endsOn: itemEndsOn, startPercent: percent(itemStartsOn), endPercent: percent(itemEndsOn) })),
    }))
    .sort((left, right) => (left.items[0].startsOn.localeCompare(right.items[0].startsOn) || (categoryOrder.get(left.category) ?? 0) - (categoryOrder.get(right.category) ?? 0)));
  const undatedItems = timeline.categories.flatMap((category) => category.items.filter((item) => !schedule(item)));
  const ticks = [...new Set(scheduled.flatMap((item) => [item.startsOn, item.endsOn]))]
    .sort()
    .map((date) => ({ date, percent: percent(date) }));

  return { startsOn, endsOn, ticks, categories, undatedItems };
}
