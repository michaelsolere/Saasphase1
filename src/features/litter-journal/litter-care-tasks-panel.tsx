"use client";

import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import {
  litterCareTaskCategoryLabels as categoryLabels,
  litterCareTaskTargetLabels as targetLabels,
} from "./litter-care-task-labels";
import {
  ScheduleTaskDialog,
  type LitterCareTaskScheduleActionBinding,
} from "./litter-care-task-schedule-dialog";
import { LITTER_PLAN_AD_HOC_TASKS_PANEL_HINT } from "./litter-plan-ad-hoc-programmer";
import { LitterCareTaskResolutionDialog } from "./litter-care-task-resolution-dialog";

import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import type { LitterCareTaskSummary } from "./litter-care-tasks";

const sourceLabels: Record<LitterCareTaskSummary["source"], string> = {
  manual: "Ajout manuel",
  organization_template: "Jalon personnalisé",
  system_template: "Jalon standard",
};

const statusLabels: Record<LitterCareTaskSummary["status"], string> = {
  planned: "À faire",
  done: "Réalisée",
  cancelled: "Annulée",
  not_applicable: "Non applicable",
};


type TaskAction = (
  previousState: LitterCareTaskActionState,
  formData: FormData,
) => Promise<LitterCareTaskActionState>;

export type LitterCareTaskResolutionAction = {
  taskId: string;
  clientCommandId: string;
  action: TaskAction;
};

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatResolvedAt(task: LitterCareTaskSummary) {
  if (!task.resolvedAt) return "Non renseignée";

  const date = new Date(task.resolvedAt);
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: task.resolvedTimezoneName || "UTC",
  };

  try {
    return new Intl.DateTimeFormat("fr-FR", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}

function timeInputValue(value: string | null) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(
    value ?? "",
  );

  return match?.[0].slice(0, 5) ?? "";
}

function formatLocalTime(value: string | null) {
  const time = timeInputValue(value);
  return time ? ` à ${time.replace(":", " h ")}` : "";
}

function scheduleDetails(task: LitterCareTaskSummary) {
  if (task.itemKind === "window") {
    const suggested = task.suggestedStartsOn && task.suggestedEndsOn
      ? `Fenêtre suggérée : du ${formatCivilDate(task.suggestedStartsOn)}${formatLocalTime(task.suggestedStartsLocalTime)} au ${formatCivilDate(task.suggestedEndsOn)}${formatLocalTime(task.suggestedEndsLocalTime)}`
      : null;
    const retained = task.retainedStartsOn && task.retainedEndsOn
      ? `Fenêtre retenue : du ${formatCivilDate(task.retainedStartsOn)}${formatLocalTime(task.retainedStartsLocalTime)} au ${formatCivilDate(task.retainedEndsOn)}${formatLocalTime(task.retainedEndsLocalTime)}`
      : "Planification indisponible";
    return { suggested, retained };
  }
  return {
    suggested: task.suggestedFor
      ? `Date suggérée : ${formatCivilDate(task.suggestedFor)}${formatLocalTime(task.suggestedLocalTime)}`
      : null,
    retained: task.plannedFor
      ? `Date retenue : ${formatCivilDate(task.plannedFor)}${formatLocalTime(task.scheduledLocalTime)}`
      : "Planification indisponible",
  };
}

function browserCivilDate() {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}

function TaskMetadata({ task }: { task: LitterCareTaskSummary }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
      <span>
        {task.itemKind === "recurring_task"
          ? `Tâche récurrente · occurrence ${task.occurrenceNo}`
          : task.itemKind === "milestone"
            ? "Jalon"
            : task.itemKind === "window"
              ? "Fenêtre"
              : "Tâche"}
      </span>
      <span aria-hidden="true">·</span>
      <span>{categoryLabels[task.category]}</span>
      <span aria-hidden="true">·</span>
      <span>{targetLabels[task.targetScope]}</span>
      <span aria-hidden="true">·</span>
      <span>{sourceLabels[task.source]}</span>
    </p>
  );
}

function TaskScheduleSummary({ task }: { task: LitterCareTaskSummary }) {
  const details = scheduleDetails(task);
  return <div className="mt-2 space-y-1 text-sm text-muted">
    {details.suggested ? <p>{details.suggested}</p> : null}
    <p>{details.retained}</p>
    <p>{task.scheduleSource === "suggested" ? "Selon la suggestion" : "Ajustée manuellement"}</p>
    {task.isScheduleLocked ? <p className="flex items-center gap-1 font-medium text-foreground"><LockKeyhole aria-hidden="true" className="size-4" /> Verrouillée</p> : null}
  </div>;
}

function PlannedTasks({
  tasks,
  today,
  actions,
  scheduleActions,
  onSuccess,
}: {
  tasks: LitterCareTaskSummary[];
  today: string | null;
  actions: Map<string, LitterCareTaskResolutionAction>;
  scheduleActions: Map<string, LitterCareTaskScheduleActionBinding>;
  onSuccess: (message: string) => void;
}) {
  return (
    <section aria-labelledby="litter-care-planned-heading">
      <h3 id="litter-care-planned-heading" className="text-base font-semibold">
        À faire
      </h3>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune tâche en attente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border">
          {tasks.map((task, index) => {
            const resolutionAction = actions.get(task.id);
            const scheduleAction = scheduleActions.get(task.id);
            const dueDate = task.plannedFor ?? task.retainedEndsOn;
            const overdue =
              today !== null && dueDate !== null && dueDate < today;

            return (
              <li key={task.id} className="min-w-0 p-4 sm:p-5">
                <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-semibold">{task.title}</p>
                      {overdue ? (
                        <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
                          En retard
                        </span>
                      ) : null}
                    </div>
                    <TaskScheduleSummary task={task} />
                    <TaskMetadata task={task} />
                    {task.description ? (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  {resolutionAction ? (
                    <LitterCareTaskResolutionDialog
                      key={resolutionAction.clientCommandId}
                      itemTitle={task.title}
                      action={resolutionAction.action}
                      triggerLabel="Traiter la tâche"
                      dialogTitle="Traiter la tâche"
                      objectLabel="tâche"
                      domIdPrefix={`litter-care-task-${index + 1}`}
                      onSuccess={onSuccess}
                    />
                  ) : null}
                  {scheduleAction ? (
                    <ScheduleTaskDialog
                      key={scheduleAction.domIdPrefix}
                      view={scheduleAction.view}
                      actions={scheduleAction.actions}
                      onSuccess={onSuccess}
                      domIdPrefix={scheduleAction.domIdPrefix}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskHistory({ tasks }: { tasks: LitterCareTaskSummary[] }) {
  return (
    <section aria-labelledby="litter-care-history-heading">
      <h3 id="litter-care-history-heading" className="text-base font-semibold">
        Historique
      </h3>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune tâche terminée.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border">
          {tasks.map((task) => (
            <li key={task.id} className="min-w-0 p-4 sm:p-5">
              <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{task.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {task.itemKind === "window" &&
                    task.retainedStartsOn &&
                    task.retainedEndsOn
                      ? `Fenêtre du ${formatCivilDate(task.retainedStartsOn)} au ${formatCivilDate(task.retainedEndsOn)}`
                      : task.plannedFor
                        ? `Prévue le ${formatCivilDate(task.plannedFor)}`
                        : "Planification indisponible"}
                  </p>
                </div>
                <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold">
                  {statusLabels[task.status]}
                </span>
              </div>
              <TaskMetadata task={task} />
              <p className="mt-3 text-sm text-muted">
                Traitée le {formatResolvedAt(task)}
              </p>
              {task.resolutionNote ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                  {task.resolutionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LitterCareTasksPanel({
  tasks,
  resolutionActions,
  scheduleActions,
  loadError = false,
}: {
  tasks: LitterCareTaskSummary[];
  resolutionActions: LitterCareTaskResolutionAction[];
  scheduleActions: LitterCareTaskScheduleActionBinding[];
  loadError?: boolean;
}) {
  const [today, setToday] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const updateAfterMount = window.setTimeout(() => {
      setToday(browserCivilDate());
    }, 0);

    return () => window.clearTimeout(updateAfterMount);
  }, []);

  const plannedTasks = tasks.filter((task) => task.status === "planned");
  const historyTasks = tasks.filter((task) => task.status !== "planned");
  const actionsByTaskId = new Map(
    resolutionActions.map((resolutionAction) => [
      resolutionAction.taskId,
      resolutionAction,
    ]),
  );
  const scheduleActionsByTaskId = new Map(
    scheduleActions.map((scheduleAction) => [scheduleAction.taskId, scheduleAction]),
  );

  return (
    <section id="litter-care-tasks" className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Tâches de suivi</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Tâches prévues et historique de suivi de cette portée.
        </p>
        {!loadError ? (
          <p className="mt-2 text-xs text-muted">
            {LITTER_PLAN_AD_HOC_TASKS_PANEL_HINT}
          </p>
        ) : null}
      </div>
      {confirmation ? (
        <p
          role="status"
          className="mt-4 rounded-xl border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {confirmation}
        </p>
      ) : null}
      {loadError ? (
        <p className="mt-5 text-sm text-muted">
          Les tâches de suivi ne sont pas disponibles pour le moment.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">
              Aucune tâche de suivi enregistrée pour cette portée.
            </p>
          ) : null}
          <PlannedTasks
            tasks={plannedTasks}
            today={today}
            actions={actionsByTaskId}
            scheduleActions={scheduleActionsByTaskId}
            onSuccess={setConfirmation}
          />
          <TaskHistory tasks={historyTasks} />
        </div>
      )}
    </section>
  );
}
