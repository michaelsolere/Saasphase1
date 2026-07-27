import type { LitterCareTaskSummary } from "./litter-care-tasks";

export type LitterCareTaskScheduleView = {
  title: string;
  itemKind: "milestone" | "task" | "window";
  suggestedFor: string | null;
  suggestedLocalTime: string | null;
  plannedFor: string | null;
  scheduledLocalTime: string | null;
  suggestedStartsOn: string | null;
  suggestedStartsLocalTime: string | null;
  suggestedEndsOn: string | null;
  suggestedEndsLocalTime: string | null;
  retainedStartsOn: string | null;
  retainedStartsLocalTime: string | null;
  retainedEndsOn: string | null;
  retainedEndsLocalTime: string | null;
  scheduleTimezoneName: string | null;
  isScheduleLocked: boolean;
};

export function toLitterCareTaskScheduleView(
  task: LitterCareTaskSummary,
): LitterCareTaskScheduleView | null {
  if (
    task.itemKind !== "milestone" &&
    task.itemKind !== "task" &&
    task.itemKind !== "window"
  ) {
    return null;
  }

  return {
    title: task.title,
    itemKind: task.itemKind,
    suggestedFor: task.suggestedFor,
    suggestedLocalTime: task.suggestedLocalTime,
    plannedFor: task.plannedFor,
    scheduledLocalTime: task.scheduledLocalTime,
    suggestedStartsOn: task.suggestedStartsOn,
    suggestedStartsLocalTime: task.suggestedStartsLocalTime,
    suggestedEndsOn: task.suggestedEndsOn,
    suggestedEndsLocalTime: task.suggestedEndsLocalTime,
    retainedStartsOn: task.retainedStartsOn,
    retainedStartsLocalTime: task.retainedStartsLocalTime,
    retainedEndsOn: task.retainedEndsOn,
    retainedEndsLocalTime: task.retainedEndsLocalTime,
    scheduleTimezoneName: task.scheduleTimezoneName,
    isScheduleLocked: task.isScheduleLocked,
  };
}

export function scheduleViewContainsForbiddenIdentity(
  view: LitterCareTaskScheduleView,
  forbidden: string[],
) {
  const serialized = JSON.stringify(view).toLowerCase();
  return forbidden.some((value) => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 && serialized.includes(trimmed);
  });
}
