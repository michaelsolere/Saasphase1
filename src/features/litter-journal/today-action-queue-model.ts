// File d'actions de l'onglet « Aujourd'hui » du Journal des portées.
// Projection pure à partir des tâches déjà chargées : tri urgence puis échéance,
// libellés d'échéance, aucune action serveur ni accès base ici.

export type TodayQueueUrgency = "overdue" | "today" | "upcoming";

export type TodayQueueTaskInput = {
  id: string;
  title: string;
  detail: string | null;
  itemKind: "milestone" | "task" | "window";
  status: string;
  scheduledFor: string | null;
  scheduledEndsOn: string | null;
  suggestedFor: string | null;
};

export type TodayActionQueueEntry = {
  task: TodayQueueTaskInput;
  urgency: TodayQueueUrgency;
  dueLabel: string | null;
};

const URGENCY_ORDER: Record<TodayQueueUrgency, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
};

function civilDate(value: string): string {
  return value.slice(0, 10);
}

function compareCivilDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function resolveDueDate(task: TodayQueueTaskInput): string | null {
  const candidate =
    task.scheduledFor ?? task.scheduledEndsOn ?? task.suggestedFor;
  return candidate ? civilDate(candidate) : null;
}

function formatDueLabel(dueDate: string, todayDate: string): string {
  if (dueDate === todayDate) return "Aujourd’hui";
  if (dueDate < todayDate) return "En retard";
  // Format civil court « 28 juin » sans reformatage lourd côté client.
  const [year, month, day] = dueDate.split("-");
  const months = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (
    !year ||
    Number.isNaN(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    Number.isNaN(dayNumber)
  ) {
    return dueDate;
  }
  return `${dayNumber} ${months[monthIndex]}`;
}

function resolveUrgency(
  task: TodayQueueTaskInput,
  dueDate: string | null,
  todayDate: string,
): TodayQueueUrgency {
  if (task.status !== "planned") return "upcoming";
  if (!dueDate) return "upcoming";
  if (dueDate < todayDate) return "overdue";
  if (dueDate === todayDate) return "today";
  return "upcoming";
}

/**
 * Construit la file « À faire » : uniquement les tâches planifiées,
 * triées par urgence (retard > aujourd'hui > planifié) puis par date.
 */
export function buildTodayActionQueue(
  tasks: readonly TodayQueueTaskInput[],
  todayDate: string,
): TodayActionQueueEntry[] {
  const open = tasks
    .filter((task) => task.status === "planned")
    .map((task) => {
      const dueDate = resolveDueDate(task);
      return {
        task,
        urgency: resolveUrgency(task, dueDate, todayDate),
        dueDate,
        dueLabel:
          dueDate === null
            ? null
            : formatDueLabel(dueDate, todayDate),
      };
    });

  return open
    .sort(
      (left, right) =>
        URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency] ||
        compareCivilDates(left.dueDate ?? "9999-12-31", right.dueDate ?? "9999-12-31") ||
        left.task.id.localeCompare(right.task.id),
    )
    .map(({ task, urgency, dueLabel }) => ({ task, urgency, dueLabel }));
}
