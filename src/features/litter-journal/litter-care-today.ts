import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
} from "./date";
import {
  getLitterCareTaskWindowState,
  type LitterCareTaskSummary,
} from "./litter-care-tasks-core";

export type LitterCareTodayProjection = {
  dueToday: LitterCareTaskSummary[];
  overdue: LitterCareTaskSummary[];
  openWindows: LitterCareTaskSummary[];
  handledToday: LitterCareTaskSummary[];
};

const priorityOrder: Record<LitterCareTaskSummary["priority"], number> = {
  organization_critical: 0,
  important: 1,
  normal: 2,
};

function relevantDateAndTime(task: LitterCareTaskSummary) {
  if (task.itemKind === "window") {
    return {
      date: task.retainedStartsOn ?? task.retainedEndsOn ?? "",
      time: task.retainedStartsLocalTime ?? task.retainedEndsLocalTime ?? "",
    };
  }

  return { date: task.plannedFor ?? "", time: task.scheduledLocalTime ?? "" };
}

function compareTasks(left: LitterCareTaskSummary, right: LitterCareTaskSummary) {
  const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDifference !== 0) return priorityDifference;

  const leftSchedule = relevantDateAndTime(left);
  const rightSchedule = relevantDateAndTime(right);
  const dateDifference = leftSchedule.date.localeCompare(rightSchedule.date);
  if (dateDifference !== 0) return dateDifference;

  const timeDifference = leftSchedule.time.localeCompare(rightSchedule.time);
  if (timeDifference !== 0) return timeDifference;

  return left.title.localeCompare(right.title, "fr");
}

function sorted(tasks: LitterCareTaskSummary[]) {
  return [...tasks].sort(compareTasks);
}

export function getLitterCareTaskResolvedBusinessDateTime(resolvedAt: string) {
  const instant = new Date(resolvedAt);

  return {
    date: formatLitterJournalBusinessDate(instant),
    time: getLitterJournalBusinessLocalTime(instant),
  };
}

function compareHandledTasks(left: LitterCareTaskSummary, right: LitterCareTaskSummary) {
  const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDifference !== 0) return priorityDifference;

  const leftResolved = getLitterCareTaskResolvedBusinessDateTime(left.resolvedAt!);
  const rightResolved = getLitterCareTaskResolvedBusinessDateTime(right.resolvedAt!);
  const dateDifference = leftResolved.date.localeCompare(rightResolved.date);
  if (dateDifference !== 0) return dateDifference;

  const timeDifference = leftResolved.time.localeCompare(rightResolved.time);
  if (timeDifference !== 0) return timeDifference;

  return left.title.localeCompare(right.title, "fr");
}

function sortedHandled(tasks: LitterCareTaskSummary[]) {
  return [...tasks].sort(compareHandledTasks);
}

export function projectLitterCareToday(
  tasks: LitterCareTaskSummary[],
  reference: { date: string; localTime: string },
): LitterCareTodayProjection {
  const dueToday: LitterCareTaskSummary[] = [];
  const overdue: LitterCareTaskSummary[] = [];
  const openWindows: LitterCareTaskSummary[] = [];
  const handledToday: LitterCareTaskSummary[] = [];

  for (const task of tasks) {
    if (task.status !== "planned") {
      if (
        task.resolvedAt &&
        getLitterCareTaskResolvedBusinessDateTime(task.resolvedAt).date === reference.date
      ) {
        handledToday.push(task);
      }
      continue;
    }

    if (task.itemKind === "window") {
      const state = getLitterCareTaskWindowState(task, reference);
      if (state === "open") openWindows.push(task);
      if (state === "overdue") overdue.push(task);
      continue;
    }

    if (!task.plannedFor) continue;
    if (task.plannedFor === reference.date) dueToday.push(task);
    if (task.plannedFor < reference.date) overdue.push(task);
  }

  return {
    dueToday: sorted(dueToday),
    overdue: sorted(overdue),
    openWindows: sorted(openWindows),
    handledToday: sortedHandled(handledToday),
  };
}
