"use client";

import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

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

import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import type { LitterCareTaskScheduleView } from "./litter-care-task-schedule-view";

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";
const initialState: LitterCareTaskActionState = { status: "idle" };

type TaskAction = (
  previousState: LitterCareTaskActionState,
  formData: FormData,
) => Promise<LitterCareTaskActionState>;

export type LitterCareTaskScheduleActionSet = {
  rescheduleAction: TaskAction;
  replaceLockedAction: TaskAction;
  lockAction: TaskAction;
  unlockAction: TaskAction;
  reapplySuggestionAction: TaskAction | null;
};

/** @deprecated Prefer LitterCareTaskScheduleActionSet */
export type LitterCareTaskScheduleActions = LitterCareTaskScheduleActionSet;

export type LitterCareTaskScheduleActionBinding = {
  taskId: string;
  domIdPrefix: string;
  view: LitterCareTaskScheduleView;
  actions: LitterCareTaskScheduleActionSet;
};

function timeInputValue(value: string | null) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value ?? "");
  return match?.[0].slice(0, 5) ?? "";
}

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

function formatLocalTime(value: string | null) {
  const time = timeInputValue(value);
  return time ? ` à ${time.replace(":", " h ")}` : "";
}

function scheduleDetails(view: LitterCareTaskScheduleView) {
  if (view.itemKind === "window") {
    const suggested =
      view.suggestedStartsOn && view.suggestedEndsOn
        ? `Fenêtre suggérée : du ${formatCivilDate(view.suggestedStartsOn)}${formatLocalTime(view.suggestedStartsLocalTime)} au ${formatCivilDate(view.suggestedEndsOn)}${formatLocalTime(view.suggestedEndsLocalTime)}`
        : null;
    const retained =
      view.retainedStartsOn && view.retainedEndsOn
        ? `Fenêtre retenue : du ${formatCivilDate(view.retainedStartsOn)}${formatLocalTime(view.retainedStartsLocalTime)} au ${formatCivilDate(view.retainedEndsOn)}${formatLocalTime(view.retainedEndsLocalTime)}`
        : "Planification indisponible";
    return { suggested, retained };
  }
  return {
    suggested: view.suggestedFor
      ? `Date suggérée : ${formatCivilDate(view.suggestedFor)}${formatLocalTime(view.suggestedLocalTime)}`
      : null,
    retained: view.plannedFor
      ? `Date retenue : ${formatCivilDate(view.plannedFor)}${formatLocalTime(view.scheduledLocalTime)}`
      : "Planification indisponible",
  };
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
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

export function ScheduleSubmitButton({
  locked,
  refreshRequested,
}: {
  locked: boolean;
  refreshRequested: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || refreshRequested}>
      {pending
        ? "Enregistrement..."
        : refreshRequested
          ? "Actualisation…"
          : locked
            ? "Remplacer la programmation"
            : "Enregistrer"}
    </Button>
  );
}

export function ScheduleSecondaryAction({
  action,
  label,
  reason,
  disabled,
  onMutationSuccess,
}: {
  action: TaskAction | null;
  label: string;
  reason: string;
  disabled: boolean;
  onMutationSuccess: (message: string) => void;
}) {
  const submitAction = useCallback(
    async (previousState: LitterCareTaskActionState, formData: FormData) => {
      if (!action) return previousState;
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        onMutationSuccess(nextState.message);
      }
      return nextState;
    },
    [action, onMutationSuccess],
  );
  const [state, formAction] = useActionState(submitAction, initialState);
  if (!action) return null;
  return (
    <form action={formAction}>
      <input type="hidden" name="reason" value={reason} />
      <Button type="submit" variant="outline" size="sm" disabled={disabled}>
        {disabled ? "Actualisation…" : label}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ScheduleTaskDialog({
  view,
  actions,
  onSuccess,
  triggerLabel = "Modifier la programmation",
  domIdPrefix,
}: {
  view: LitterCareTaskScheduleView;
  actions: LitterCareTaskScheduleActionSet;
  onSuccess: (message: string) => void;
  triggerLabel?: string;
  domIdPrefix: string;
}) {
  const idPrefix = domIdPrefix;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plannedFor, setPlannedFor] = useState(view.plannedFor ?? "");
  const [start, setStart] = useState(view.retainedStartsOn ?? "");
  const [end, setEnd] = useState(view.retainedEndsOn ?? "");
  const [startTime, setStartTime] = useState(
    timeInputValue(
      view.itemKind === "window"
        ? view.retainedStartsLocalTime
        : view.scheduledLocalTime,
    ),
  );
  const [endTime, setEndTime] = useState(
    timeInputValue(view.retainedEndsLocalTime),
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [timezone, setTimezone] = useState(view.scheduleTimezoneName ?? "UTC");
  const [refreshRequested, setRefreshRequested] = useState(false);
  const action = view.isScheduleLocked
    ? actions.replaceLockedAction
    : actions.rescheduleAction;
  const handleMutationSuccess = useCallback(
    (message: string) => {
      setRefreshRequested(true);
      onSuccess(message);
      router.refresh();
    },
    [onSuccess, router],
  );
  const submitAction = useCallback(
    async (previousState: LitterCareTaskActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        handleMutationSuccess(nextState.message);
      }
      return nextState;
    },
    [action, handleMutationSuccess],
  );
  const [state, formAction] = useActionState(submitAction, initialState);
  const isWindow = view.itemKind === "window";
  const suggestion = scheduleDetails(view);
  const boundsValid =
    !isWindow ||
    (!!start &&
      !!end &&
      (start < end ||
        (start === end &&
          (!startTime || !endTime || startTime <= endTime))));
  const lockToggle = view.isScheduleLocked
    ? { action: actions.unlockAction, label: "Déverrouiller" }
    : { action: actions.lockAction, label: "Verrouiller la programmation" };
  const handleOpenChange = (nextOpen: boolean) => {
    if (refreshRequested) return;
    if (nextOpen && !view.scheduleTimezoneName) setTimezone(browserTimezone());
    setOpen(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="fixed left-auto right-0 top-0 h-dvh max-h-dvh w-full translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l sm:max-w-xl sm:rounded-none"
        aria-describedby={`${idPrefix}-description`}
      >
        <DialogHeader>
          <DialogTitle>Modifier la programmation</DialogTitle>
          <DialogDescription id={`${idPrefix}-description`}>
            {view.title}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="timezone_name" value={timezone} />
          {view.isScheduleLocked ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Programmation verrouillée</p>
              <p className="mt-1">
                Son remplacement exige votre confirmation explicite.
              </p>
            </div>
          ) : null}
          {suggestion.suggested ? (
            <p className="rounded-xl border bg-muted/20 p-3 text-sm">
              {suggestion.suggested}
            </p>
          ) : null}
          {isWindow ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`${idPrefix}-start`}>
                    Date retenue de début
                  </label>
                  <input
                    id={`${idPrefix}-start`}
                    className={inputClass}
                    type="date"
                    name="retained_starts_on"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor={`${idPrefix}-start-time`}
                  >
                    Heure de début (facultative)
                  </label>
                  <input
                    id={`${idPrefix}-start-time`}
                    className={inputClass}
                    type="time"
                    name="retained_starts_on_local_time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`${idPrefix}-end`}>
                    Date retenue de fin
                  </label>
                  <input
                    id={`${idPrefix}-end`}
                    className={inputClass}
                    type="date"
                    name="retained_ends_on"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor={`${idPrefix}-end-time`}
                  >
                    Heure de fin (facultative)
                  </label>
                  <input
                    id={`${idPrefix}-end-time`}
                    className={inputClass}
                    type="time"
                    name="retained_ends_on_local_time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
              </div>
              <p
                role={boundsValid ? "status" : "alert"}
                className={`text-sm ${boundsValid ? "text-muted" : "text-destructive"}`}
              >
                {boundsValid
                  ? "L’ordre des bornes est valide."
                  : "La date de début doit précéder ou égaler la date de fin."}
              </p>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-date`}>
                  Date retenue
                </label>
                <input
                  id={`${idPrefix}-date`}
                  className={inputClass}
                  type="date"
                  name="planned_for"
                  value={plannedFor}
                  onChange={(event) => setPlannedFor(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-time`}>
                  Heure (facultative)
                </label>
                <input
                  id={`${idPrefix}-time`}
                  className={inputClass}
                  type="time"
                  name="planned_for_local_time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
            </div>
          )}
          <p className="text-sm text-muted">Fuseau actuel : {timezone}</p>
          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-reason`}>
              Motif (facultatif)
            </label>
            <textarea
              id={`${idPrefix}-reason`}
              className={inputClass}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          {view.isScheduleLocked ? (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="locked_confirmation"
                value="confirmed"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{" "}
              Je confirme le remplacement de la programmation verrouillée.
            </label>
          ) : null}
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={refreshRequested}>
                Annuler
              </Button>
            </DialogClose>
            <ScheduleSubmitButton
              locked={view.isScheduleLocked}
              refreshRequested={refreshRequested}
            />
          </DialogFooter>
        </form>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <ScheduleSecondaryAction
            action={lockToggle.action}
            label={lockToggle.label}
            reason={reason}
            disabled={refreshRequested}
            onMutationSuccess={handleMutationSuccess}
          />
          <ScheduleSecondaryAction
            action={actions.reapplySuggestionAction}
            label="Revenir à la suggestion"
            reason={reason}
            disabled={refreshRequested}
            onMutationSuccess={handleMutationSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
