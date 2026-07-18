"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  litterCareTaskCategoryLabels as categoryLabels,
  litterCareTaskTargetLabels as targetLabels,
} from "./litter-care-task-labels";

import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import type {
  LitterCareTaskCategory,
  LitterCareTaskResolutionStatus,
  LitterCareTaskSummary,
  LitterCareTaskTargetScope,
} from "./litter-care-tasks";

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

const resolutionStatusLabels: Record<
  LitterCareTaskResolutionStatus,
  string
> = {
  done: "Réalisée",
  cancelled: "Annulée",
  not_applicable: "Non applicable",
};

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";
const initialState: LitterCareTaskActionState = { status: "idle" };

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

function browserCivilDate() {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function currentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function ActionMessage({ state }: { state: LitterCareTaskActionState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className="rounded-xl border bg-surface px-3 py-2 text-sm text-foreground"
    >
      {state.message}
    </p>
  );
}

function CreateSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Ajout..." : "Ajouter la tâche"}
    </Button>
  );
}

function ResolveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Traitement..." : "Valider le résultat"}
    </Button>
  );
}

function AddTaskDialog({
  action,
  onSuccess,
}: {
  action: TaskAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedFor, setPlannedFor] = useState("");
  const [category, setCategory] =
    useState<LitterCareTaskCategory>("preparation");
  const [targetScope, setTargetScope] =
    useState<LitterCareTaskTargetScope>("litter");
  const submitAction = useCallback(
    async (previousState: LitterCareTaskActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(submitAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus aria-hidden="true" />
          Ajouter une tâche
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une tâche de suivi</DialogTitle>
          <DialogDescription>
            Ajoutez une tâche ponctuelle propre à cette portée.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="litter-care-task-title">
              Titre
            </label>
            <input
              id="litter-care-task-title"
              className={inputClass}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              required
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor="litter-care-task-description"
            >
              Description (facultative)
            </label>
            <textarea
              id="litter-care-task-description"
              className={inputClass}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={5000}
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor="litter-care-task-planned-for"
            >
              Date prévue
            </label>
            <input
              id="litter-care-task-planned-for"
              className={inputClass}
              name="planned_for"
              type="date"
              value={plannedFor}
              onChange={(event) => setPlannedFor(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className={labelClass}
                htmlFor="litter-care-task-category"
              >
                Catégorie
              </label>
              <select
                id="litter-care-task-category"
                className={inputClass}
                name="category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as LitterCareTaskCategory)
                }
                required
              >
                {Object.entries(categoryLabels).map(([option, label]) => (
                  <option key={option} value={option}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className={labelClass}
                htmlFor="litter-care-task-target"
              >
                Cible
              </label>
              <select
                id="litter-care-task-target"
                className={inputClass}
                name="target_scope"
                value={targetScope}
                onChange={(event) =>
                  setTargetScope(event.target.value as LitterCareTaskTargetScope)
                }
                required
              >
                {Object.entries(targetLabels).map(([option, label]) => (
                  <option key={option} value={option}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <CreateSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveTaskDialog({
  task,
  action,
  onSuccess,
}: {
  task: LitterCareTaskSummary;
  action: TaskAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolvedAt, setResolvedAt] = useState("");
  const [status, setStatus] =
    useState<LitterCareTaskResolutionStatus>("done");
  const [note, setNote] = useState("");
  const resolvedAtRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: LitterCareTaskActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(submitAction, initialState);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      setResolvedAt(currentLocalDateTime());
    }

    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (resolvedAtRef.current) {
      resolvedAtRef.current.value = localDateTimeToIso(resolvedAt);
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = browserTimezone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Traiter la tâche
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Traiter la tâche</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <form
          action={formAction}
          onSubmit={prepareSubmission}
          className="space-y-4"
        >
          <input ref={resolvedAtRef} type="hidden" name="resolved_at" />
          <input
            ref={timezoneNameRef}
            type="hidden"
            name="timezone_name"
          />
          <div>
            <label
              className={labelClass}
              htmlFor="litter-care-task-result"
            >
              Résultat
            </label>
            <select
              id="litter-care-task-result"
              className={inputClass}
              name="resolution_status"
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value as LitterCareTaskResolutionStatus,
                )
              }
              required
            >
              {Object.entries(resolutionStatusLabels).map(([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor="litter-care-task-resolved-at"
            >
              Date et heure de résolution
            </label>
            <input
              id="litter-care-task-resolved-at"
              className={inputClass}
              type="datetime-local"
              value={resolvedAt}
              onChange={(event) => setResolvedAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor="litter-care-task-resolution-note"
            >
              Note (facultative)
            </label>
            <textarea
              id="litter-care-task-resolution-note"
              className={inputClass}
              name="resolution_note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              maxLength={5000}
            />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <ResolveSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskMetadata({ task }: { task: LitterCareTaskSummary }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
      <span>{categoryLabels[task.category]}</span>
      <span aria-hidden="true">·</span>
      <span>{targetLabels[task.targetScope]}</span>
      <span aria-hidden="true">·</span>
      <span>{sourceLabels[task.source]}</span>
    </p>
  );
}

function PlannedTasks({
  tasks,
  today,
  actions,
  onSuccess,
}: {
  tasks: LitterCareTaskSummary[];
  today: string | null;
  actions: Map<string, LitterCareTaskResolutionAction>;
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
          {tasks.map((task) => {
            const resolutionAction = actions.get(task.id);
            const overdue = today !== null && task.plannedFor < today;

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
                    <p className="mt-1 text-sm text-muted">
                      Prévue le {formatCivilDate(task.plannedFor)}
                    </p>
                    <TaskMetadata task={task} />
                    {task.description ? (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  {resolutionAction ? (
                    <ResolveTaskDialog
                      key={resolutionAction.clientCommandId}
                      task={task}
                      action={resolutionAction.action}
                      onSuccess={onSuccess}
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
                    Prévue le {formatCivilDate(task.plannedFor)}
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
  role,
  createAction,
  createClientCommandId,
  resolutionActions,
  loadError = false,
}: {
  tasks: LitterCareTaskSummary[];
  role: "owner" | "admin" | "member" | "viewer" | null;
  createAction: TaskAction | null;
  createClientCommandId: string;
  resolutionActions: LitterCareTaskResolutionAction[];
  loadError?: boolean;
}) {
  const [today, setToday] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";

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

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">Tâches de suivi</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Tâches prévues et historique de suivi de cette portée.
          </p>
        </div>
        {!loadError && canWrite && createAction ? (
          <AddTaskDialog
            key={createClientCommandId}
            action={createAction}
            onSuccess={setConfirmation}
          />
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
            onSuccess={setConfirmation}
          />
          <TaskHistory tasks={historyTasks} />
        </div>
      )}
    </section>
  );
}
