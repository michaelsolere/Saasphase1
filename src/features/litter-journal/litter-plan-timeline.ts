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
