import Link from "next/link";

import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import {
  getLitterCareTaskResolvedBusinessDateTime,
  projectLitterCareToday,
} from "./litter-care-today";
import type { LitterCareTaskSummary } from "./litter-care-tasks-core";
import {
  LitterCareTodayQuickActions as LitterCareTodayQuickActionsComponent,
  type LitterCareTodayQuickActions,
} from "./litter-care-today-quick-actions";
import type { LitterCareTaskScheduleActions } from "./litter-care-task-schedule-dialog";

const itemKindLabels: Record<LitterCareTaskSummary["itemKind"], string> = {
  milestone: "Jalon",
  task: "Tâche",
  recurring_task: "Tâche récurrente",
  window: "Fenêtre",
};

const statusLabels: Record<LitterCareTaskSummary["status"], string> = {
  planned: "À faire",
  done: "Réalisée",
  cancelled: "Annulée",
  not_applicable: "Non applicable",
};

const priorityLabels: Partial<Record<LitterCareTaskSummary["priority"], string>> = {
  organization_critical: "Priorité : critique organisationnelle",
  important: "Priorité : importante",
};

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value: string | null) {
  return value?.slice(0, 5).replace(":", " h ") ?? null;
}

function scheduleLabel(task: LitterCareTaskSummary) {
  if (task.itemKind === "window") {
    const start = formatTime(task.retainedStartsLocalTime);
    const end = formatTime(task.retainedEndsLocalTime);
    if (start && end) return `De ${start} à ${end}`;
    if (start) return `À partir de ${start}`;
    if (end) return `Jusqu’à ${end}`;
    return null;
  }

  const time = formatTime(task.scheduledLocalTime);
  return time ? `À ${time}` : null;
}

function TodayTask({ task, active, quickActions, scheduleActions }: { task: LitterCareTaskSummary; active: boolean; quickActions: LitterCareTodayQuickActions | null; scheduleActions: LitterCareTaskScheduleActions | null }) {
  const priority = priorityLabels[task.priority];
  const schedule = active
    ? scheduleLabel(task)
    : task.resolvedAt
      ? `Traité à ${formatTime(getLitterCareTaskResolvedBusinessDateTime(task.resolvedAt).time)}`
      : null;

  return (
    <li className="rounded-xl border bg-background px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {itemKindLabels[task.itemKind]} · {litterCareTaskCategoryLabels[task.category]}
          </p>
          <h4 className="mt-1 break-words font-semibold">{task.title}</h4>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            {schedule ? <span>{schedule}</span> : null}
            {priority ? <span className="font-medium text-foreground">{priority}</span> : null}
            {!active ? <span className="font-medium text-foreground">Statut : {statusLabels[task.status]}</span> : null}
          </div>
        </div>
        {active ? <div className="flex shrink-0 flex-wrap items-center gap-3">
          {quickActions ? <LitterCareTodayQuickActionsComponent task={task} actions={quickActions} scheduleActions={scheduleActions} /> : null}
          <Link href="#litter-care-tasks" className="text-sm font-semibold text-accent hover:underline">Ouvrir le suivi</Link>
        </div> : null}
      </div>
    </li>
  );
}

function TodaySection({ title, tasks, active, quickActionsByTaskId, scheduleActionsByTaskId }: { title: string; tasks: LitterCareTaskSummary[]; active: boolean; quickActionsByTaskId: Map<string, LitterCareTodayQuickActions>; scheduleActionsByTaskId: Map<string, LitterCareTaskScheduleActions> }) {
  if (tasks.length === 0) return null;

  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold">{title} <span className="text-muted">({tasks.length})</span></h3>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => <TodayTask key={task.id} task={task} active={active} quickActions={active ? quickActionsByTaskId.get(task.id) ?? null : null} scheduleActions={active ? scheduleActionsByTaskId.get(task.id) ?? null : null} />)}
      </ul>
    </section>
  );
}

export function LitterCareTodayPanel({
  tasks,
  todayDate,
  todayLocalTime,
  quickActions = [],
  scheduleActions = [],
  unavailable = false,
}: {
  tasks: LitterCareTaskSummary[];
  todayDate: string;
  todayLocalTime: string;
  quickActions?: LitterCareTodayQuickActions[];
  scheduleActions?: LitterCareTaskScheduleActions[];
  unavailable?: boolean;
}) {
  const projection = projectLitterCareToday(tasks, { date: todayDate, localTime: todayLocalTime });
  const total = projection.dueToday.length + projection.overdue.length + projection.openWindows.length + projection.handledToday.length;
  const quickActionsByTaskId = new Map(quickActions.map((actions) => [actions.taskId, actions]));
  const scheduleActionsByTaskId = new Map(scheduleActions.map((actions) => [actions.taskId, actions]));

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6" aria-labelledby="litter-care-today-heading">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
        <div>
          <h2 id="litter-care-today-heading" className="text-lg font-semibold">Aujourd’hui</h2>
          <p className="mt-1 text-sm text-muted">{formatCivilDate(todayDate)}</p>
        </div>
        {!unavailable ? <p className="text-sm text-muted">{total} élément{total > 1 ? "s" : ""}</p> : null}
      </div>
      {unavailable ? (
        <p className="mt-5 text-sm text-muted">La vue Aujourd’hui n’est pas disponible pour le moment.</p>
      ) : total === 0 ? (
        <p className="mt-5 text-sm text-muted">Rien à signaler aujourd’hui pour cette portée.</p>
      ) : (
        <div className="mt-5 space-y-6">
          <TodaySection title="À faire aujourd’hui" tasks={projection.dueToday} active quickActionsByTaskId={quickActionsByTaskId} scheduleActionsByTaskId={scheduleActionsByTaskId} />
          <TodaySection title="En retard" tasks={projection.overdue} active quickActionsByTaskId={quickActionsByTaskId} scheduleActionsByTaskId={scheduleActionsByTaskId} />
          <TodaySection title="Fenêtres ouvertes" tasks={projection.openWindows} active quickActionsByTaskId={quickActionsByTaskId} scheduleActionsByTaskId={scheduleActionsByTaskId} />
          <TodaySection title="Traité aujourd’hui" tasks={projection.handledToday} active={false} quickActionsByTaskId={quickActionsByTaskId} scheduleActionsByTaskId={scheduleActionsByTaskId} />
        </div>
      )}
    </section>
  );
}
