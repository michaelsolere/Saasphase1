"use client";

import { useActionState, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

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
  litterCareTaskCategoryLabels,
  litterCareTaskTargetLabels,
} from "./litter-care-task-labels";
import type { LitterPlanAdHocProgrammerActionState } from "./litter-plan-ad-hoc-programmer-actions";
import {
  LITTER_PLAN_AD_HOC_LOCK_HELP,
  LITTER_PLAN_AD_HOC_PROGRAMMER_KIND_CHOICES,
  LITTER_PLAN_AD_HOC_RECURRENCE_DAY_COUNT_HELP,
  buildLitterPlanAdHocProgrammerPreview,
  buildLitterPlanAdHocProgrammerPublicKey,
  changeLitterPlanAdHocProgrammerKind,
  createInitialLitterPlanAdHocProgrammerFormState,
  estimateLitterPlanAdHocProgrammerOccurrences,
  formatLitterPlanAdHocProgrammerOccurrenceEstimate,
  litterPlanAdHocProgrammerPriorityLabels,
  validateLitterPlanAdHocProgrammerForm,
  type LitterPlanAdHocProgrammerFormState,
  type LitterPlanAdHocProgrammerKind,
  type LitterPlanAdHocProgrammerPreview,
} from "./litter-plan-ad-hoc-programmer";

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";
const initialActionState: LitterPlanAdHocProgrammerActionState = {
  status: "idle",
};

type ProgrammerAction = (
  previousState: LitterPlanAdHocProgrammerActionState,
  formData: FormData,
) => Promise<LitterPlanAdHocProgrammerActionState>;

function ProgrammerSubmitButton({
  disabled,
  refreshRequested,
}: {
  disabled: boolean;
  refreshRequested: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled || refreshRequested}>
      {pending
        ? "Programmation…"
        : refreshRequested
          ? "Actualisation…"
          : "Programmer"}
    </Button>
  );
}

function PanelPreviewSummary({
  preview,
  estimateText,
}: {
  preview: LitterPlanAdHocProgrammerPreview | null;
  estimateText: string | null;
}) {
  if (!preview) {
    return (
      <div
        className="rounded-xl border border-dashed p-3 text-sm text-muted"
        aria-live="polite"
      >
        Aperçu indisponible tant que les dates minimales ne sont pas valides.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3 text-sm"
      aria-live="polite"
      data-programmer-panel-preview={preview.publicKey}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Aperçu
      </p>
      <p className="mt-1 font-medium">
        {preview.panelSummary.kindLabel} · {preview.panelSummary.title}
      </p>
      <p className="mt-1 text-muted">{preview.panelSummary.timingLine}</p>
      <p className="mt-2 text-xs font-semibold">{preview.statusLabel}</p>
      {preview.recurringDetails ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          <li>{preview.recurringDetails.cadenceLabel}</li>
          <li>Créneaux : {preview.recurringDetails.slotsLabel}</li>
          <li>
            {preview.recurringDetails.totalOccurrences} occurrences au total
          </li>
          <li>
            {preview.recurringDetails.initialPrepared} préparées sur{" "}
            {preview.recurringDetails.horizonDays} jours
          </li>
        </ul>
      ) : null}
      {estimateText && !preview.recurringDetails ? (
        <p className="mt-2 whitespace-pre-line text-xs text-muted">
          {estimateText}
        </p>
      ) : null}
    </div>
  );
}

function KindChooser({
  value,
  onChange,
  idPrefix,
}: {
  value: LitterPlanAdHocProgrammerKind;
  onChange: (kind: LitterPlanAdHocProgrammerKind) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={labelClass}>Type d’élément</legend>
      <div
        className="grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Type d’élément"
      >
        {LITTER_PLAN_AD_HOC_PROGRAMMER_KIND_CHOICES.map((choice) => {
          const selected = value === choice.kind;
          const optionId = `${idPrefix}-kind-${choice.kind}`;
          return (
            <button
              key={choice.kind}
              id={optionId}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${choice.title}. ${choice.description}`}
              onClick={() => onChange(choice.kind)}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  onChange(choice.kind);
                }
              }}
              className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected
                  ? "border-accent bg-accent/10"
                  : "border-border bg-background hover:border-accent/50"
              }`}
            >
              <span className="block text-sm font-semibold">{choice.title}</span>
              <span className="mt-1 block text-xs text-muted">
                {choice.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function LitterPlanAdHocProgrammerDialog({
  action,
  instanceKey,
  businessDate,
  onPreviewChange,
  onSuccess,
}: {
  action: ProgrammerAction;
  instanceKey: string;
  businessDate: string;
  onPreviewChange: (preview: LitterPlanAdHocProgrammerPreview | null) => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const reactId = useId();
  const idPrefix = buildLitterPlanAdHocProgrammerPublicKey(
    instanceKey,
    reactId.replace(/:/g, ""),
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() =>
    createInitialLitterPlanAdHocProgrammerFormState(businessDate),
  );
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [refreshRequested, setRefreshRequested] = useState(false);

  const preview = useMemo(
    () => (open ? buildLitterPlanAdHocProgrammerPreview(form, instanceKey) : null),
    [form, instanceKey, open],
  );

  const recurringEstimate = useMemo(() => {
    if (form.kind !== "recurring_task") return null;
    const intervalDays = Number(form.intervalDays);
    if (!Number.isInteger(intervalDays)) return null;
    return estimateLitterPlanAdHocProgrammerOccurrences({
      startsOn: form.recurringStartsOn,
      intervalDays,
      endKind: form.endKind,
      endsOn:
        form.endKind === "fixed_end_date" ? form.recurringEndsOn || null : null,
      recurrenceDayCount:
        form.endKind === "fixed_recurrence_day_count"
          ? Number(form.recurrenceDayCount)
          : null,
      timeSlots: form.timeSlots,
    });
  }, [form]);

  const estimateText = recurringEstimate
    ? formatLitterPlanAdHocProgrammerOccurrenceEstimate(recurringEstimate)
    : null;
  const exceedsCeiling = Boolean(recurringEstimate?.exceedsCeiling);

  useEffect(() => {
    onPreviewChange(preview);
  }, [onPreviewChange, preview]);

  const submitAction = useCallback(
    async (
      previousState: LitterPlanAdHocProgrammerActionState,
      formData: FormData,
    ) => {
      if (refreshRequested) return previousState;
      const validation = validateLitterPlanAdHocProgrammerForm(form);
      if (!validation.ok) {
        const nextErrors: Record<string, string | undefined> = {};
        for (const error of validation.errors) {
          nextErrors[error.field] = error.message;
        }
        setLocalErrors(nextErrors);
        setLocalMessage(validation.message);
        return previousState;
      }
      setLocalErrors({});
      setLocalMessage(null);
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setRefreshRequested(true);
        onPreviewChange(null);
        onSuccess(nextState.message);
        router.refresh();
      } else if (nextState.requiresRefresh) {
        setRefreshRequested(true);
      }
      return nextState;
    },
    [
      action,
      form,
      onPreviewChange,
      onSuccess,
      refreshRequested,
      router,
    ],
  );

  const [state, formAction] = useActionState(submitAction, initialActionState);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onPreviewChange(null);
      setLocalErrors({});
      setLocalMessage(null);
      setOpen(false);
      return;
    }
    if (refreshRequested) return;
    setOpen(true);
  };

  const updateForm = (
    patch: Partial<LitterPlanAdHocProgrammerFormState>,
  ) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const changeKind = (kind: LitterPlanAdHocProgrammerKind) => {
    setForm((current) =>
      changeLitterPlanAdHocProgrammerKind(current, kind, businessDate),
    );
    setLocalErrors({});
    setLocalMessage(null);
  };

  const fieldError = (field: string) => localErrors[field];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" data-programmer-open>
          <Plus aria-hidden="true" />
          Programmer
        </Button>
      </DialogTrigger>
      <DialogContent
        className="fixed left-auto right-0 top-0 h-dvh max-h-dvh w-full translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l sm:max-w-xl sm:rounded-none"
        aria-describedby={`${idPrefix}-description`}
      >
        <DialogHeader>
          <DialogTitle>Programmer un élément</DialogTitle>
          <DialogDescription id={`${idPrefix}-description`}>
            Ajoutez un élément propre à cette portée. Il n’affectera pas les
            modèles de l’organisation.
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          className="space-y-4"
          onSubmit={(event) => {
            const validation = validateLitterPlanAdHocProgrammerForm(form);
            if (!validation.ok || exceedsCeiling || refreshRequested) {
              event.preventDefault();
              if (!validation.ok) {
                const nextErrors: Record<string, string | undefined> = {};
                for (const error of validation.errors) {
                  nextErrors[error.field] = error.message;
                }
                setLocalErrors(nextErrors);
                setLocalMessage(validation.message);
              }
            }
          }}
        >
          <input type="hidden" name="kind" value={form.kind} />
          <KindChooser
            value={form.kind}
            onChange={changeKind}
            idPrefix={idPrefix}
          />

          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-title`}>
              Titre
            </label>
            <input
              id={`${idPrefix}-title`}
              className={inputClass}
              name="title"
              value={form.title}
              onChange={(event) => updateForm({ title: event.target.value })}
              maxLength={255}
              required
              aria-invalid={Boolean(fieldError("title"))}
              aria-describedby={
                fieldError("title") ? `${idPrefix}-title-error` : undefined
              }
            />
            {fieldError("title") ? (
              <p
                id={`${idPrefix}-title-error`}
                className="mt-1 text-sm text-destructive"
                role="alert"
              >
                {fieldError("title")}
              </p>
            ) : null}
          </div>

          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-description`}>
              Description facultative
            </label>
            <textarea
              id={`${idPrefix}-description`}
              className={inputClass}
              name="description"
              value={form.description}
              onChange={(event) =>
                updateForm({ description: event.target.value })
              }
              rows={3}
              maxLength={5000}
              aria-invalid={Boolean(fieldError("description"))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-category`}>
                Catégorie
              </label>
              <select
                id={`${idPrefix}-category`}
                className={inputClass}
                name="category"
                value={form.category}
                onChange={(event) =>
                  updateForm({
                    category: event.target
                      .value as LitterPlanAdHocProgrammerFormState["category"],
                  })
                }
              >
                {Object.entries(litterCareTaskCategoryLabels).map(
                  ([option, label]) => (
                    <option key={option} value={option}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-target`}>
                Cible
              </label>
              <select
                id={`${idPrefix}-target`}
                className={inputClass}
                name="target_scope"
                value={form.targetScope}
                onChange={(event) =>
                  updateForm({
                    targetScope: event.target
                      .value as LitterPlanAdHocProgrammerFormState["targetScope"],
                  })
                }
              >
                {Object.entries(litterCareTaskTargetLabels).map(
                  ([option, label]) => (
                    <option key={option} value={option}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-priority`}>
                Priorité
              </label>
              <select
                id={`${idPrefix}-priority`}
                className={inputClass}
                name="priority"
                value={form.priority}
                onChange={(event) =>
                  updateForm({
                    priority: event.target
                      .value as LitterPlanAdHocProgrammerFormState["priority"],
                  })
                }
              >
                {Object.entries(litterPlanAdHocProgrammerPriorityLabels).map(
                  ([option, label]) => (
                    <option key={option} value={option}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                name="lock_schedule"
                value="true"
                checked={form.lockSchedule}
                onChange={(event) =>
                  updateForm({ lockSchedule: event.target.checked })
                }
              />
              <span>
                <span className="font-semibold">Verrouiller la programmation</span>
                <span className="mt-1 block text-muted">
                  {LITTER_PLAN_AD_HOC_LOCK_HELP}
                </span>
              </span>
            </label>
          </div>

          {form.kind === "milestone" || form.kind === "task" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  className={labelClass}
                  htmlFor={`${idPrefix}-scheduled-date`}
                >
                  Date
                </label>
                <input
                  id={`${idPrefix}-scheduled-date`}
                  className={inputClass}
                  type="date"
                  name="scheduled_date"
                  value={form.scheduledDate}
                  onChange={(event) =>
                    updateForm({ scheduledDate: event.target.value })
                  }
                  required
                  aria-invalid={Boolean(fieldError("scheduled_date"))}
                />
              </div>
              <div>
                <label
                  className={labelClass}
                  htmlFor={`${idPrefix}-local-time`}
                >
                  Heure facultative
                </label>
                <input
                  id={`${idPrefix}-local-time`}
                  className={inputClass}
                  type="time"
                  name="local_time"
                  value={form.localTime}
                  onChange={(event) =>
                    updateForm({ localTime: event.target.value })
                  }
                />
              </div>
            </div>
          ) : null}

          {form.kind === "window" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className={labelClass}
                    htmlFor={`${idPrefix}-starts-on`}
                  >
                    Date de début
                  </label>
                  <input
                    id={`${idPrefix}-starts-on`}
                    className={inputClass}
                    type="date"
                    name="starts_on"
                    value={form.startsOn}
                    onChange={(event) =>
                      updateForm({ startsOn: event.target.value })
                    }
                    required
                    aria-invalid={Boolean(fieldError("starts_on"))}
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor={`${idPrefix}-starts-local-time`}
                  >
                    Heure de début facultative
                  </label>
                  <input
                    id={`${idPrefix}-starts-local-time`}
                    className={inputClass}
                    type="time"
                    name="starts_local_time"
                    value={form.startsLocalTime}
                    onChange={(event) =>
                      updateForm({ startsLocalTime: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`${idPrefix}-ends-on`}>
                    Date de fin
                  </label>
                  <input
                    id={`${idPrefix}-ends-on`}
                    className={inputClass}
                    type="date"
                    name="ends_on"
                    value={form.endsOn}
                    onChange={(event) =>
                      updateForm({ endsOn: event.target.value })
                    }
                    required
                    aria-invalid={Boolean(
                      fieldError("ends_on") || fieldError("ends_local_time"),
                    )}
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor={`${idPrefix}-ends-local-time`}
                  >
                    Heure de fin facultative
                  </label>
                  <input
                    id={`${idPrefix}-ends-local-time`}
                    className={inputClass}
                    type="time"
                    name="ends_local_time"
                    value={form.endsLocalTime}
                    onChange={(event) =>
                      updateForm({ endsLocalTime: event.target.value })
                    }
                  />
                </div>
              </div>
              {fieldError("ends_on") || fieldError("ends_local_time") ? (
                <p className="text-sm text-destructive" role="alert">
                  {fieldError("ends_on") ?? fieldError("ends_local_time")}
                </p>
              ) : null}
            </>
          ) : null}

          {form.kind === "recurring_task" ? (
            <>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-starts-on`}>
                  Date de début
                </label>
                <input
                  id={`${idPrefix}-starts-on`}
                  className={inputClass}
                  type="date"
                  name="starts_on"
                  value={form.recurringStartsOn}
                  onChange={(event) =>
                    updateForm({ recurringStartsOn: event.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label
                  className={labelClass}
                  htmlFor={`${idPrefix}-interval-days`}
                >
                  Tous les N jours
                </label>
                <input
                  id={`${idPrefix}-interval-days`}
                  className={inputClass}
                  type="number"
                  name="interval_days"
                  min={1}
                  max={365}
                  value={form.intervalDays}
                  onChange={(event) =>
                    updateForm({ intervalDays: event.target.value })
                  }
                  required
                />
              </div>
              <fieldset className="space-y-3 rounded-xl border p-3">
                <legend className={labelClass}>Mode de fin</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="end_kind"
                    value="fixed_end_date"
                    checked={form.endKind === "fixed_end_date"}
                    onChange={() =>
                      updateForm({ endKind: "fixed_end_date" })
                    }
                  />
                  Jusqu’à une date
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="end_kind"
                    value="fixed_recurrence_day_count"
                    checked={form.endKind === "fixed_recurrence_day_count"}
                    onChange={() =>
                      updateForm({ endKind: "fixed_recurrence_day_count" })
                    }
                  />
                  Nombre de dates de suivi
                </label>
                {form.endKind === "fixed_end_date" ? (
                  <div>
                    <label
                      className={labelClass}
                      htmlFor={`${idPrefix}-recurring-ends-on`}
                    >
                      Date de fin
                    </label>
                    <input
                      id={`${idPrefix}-recurring-ends-on`}
                      className={inputClass}
                      type="date"
                      name="ends_on"
                      value={form.recurringEndsOn}
                      onChange={(event) =>
                        updateForm({ recurringEndsOn: event.target.value })
                      }
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      className={labelClass}
                      htmlFor={`${idPrefix}-recurrence-day-count`}
                    >
                      Nombre de dates programmées
                    </label>
                    <input
                      id={`${idPrefix}-recurrence-day-count`}
                      className={inputClass}
                      type="number"
                      name="recurrence_day_count"
                      min={1}
                      max={500}
                      value={form.recurrenceDayCount}
                      onChange={(event) =>
                        updateForm({ recurrenceDayCount: event.target.value })
                      }
                      required
                    />
                    <p className="mt-1 text-xs text-muted">
                      {LITTER_PLAN_AD_HOC_RECURRENCE_DAY_COUNT_HELP}
                    </p>
                  </div>
                )}
              </fieldset>
              <div className="space-y-3">
                <p className={labelClass}>Créneaux horaires</p>
                {form.timeSlots.map((slot, index) => (
                  <div key={`${idPrefix}-slot-${index}`} className="flex gap-2">
                    <input
                      className={inputClass}
                      type="time"
                      name="time_slot"
                      value={slot}
                      required
                      aria-label={`Créneau ${index + 1}`}
                      onChange={(event) => {
                        const next = [...form.timeSlots];
                        next[index] = event.target.value;
                        updateForm({ timeSlots: next });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Supprimer le créneau ${index + 1}`}
                      disabled={form.timeSlots.length <= 1}
                      onClick={() => {
                        updateForm({
                          timeSlots: form.timeSlots.filter(
                            (_, slotIndex) => slotIndex !== index,
                          ),
                        });
                      }}
                    >
                      Supprimer
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.timeSlots.length >= 8}
                  onClick={() =>
                    updateForm({
                      timeSlots: [...form.timeSlots, "08:00"],
                    })
                  }
                >
                  Ajouter un créneau
                </Button>
                {fieldError("time_slot") ? (
                  <p className="text-sm text-destructive" role="alert">
                    {fieldError("time_slot")}
                  </p>
                ) : null}
              </div>
              {estimateText ? (
                <p
                  className={`whitespace-pre-line rounded-xl border px-3 py-2 text-sm ${
                    exceedsCeiling
                      ? "border-amber-300 bg-amber-50 text-amber-950"
                      : "bg-muted/20"
                  }`}
                  aria-live="polite"
                  role={exceedsCeiling ? "alert" : "status"}
                >
                  {estimateText}
                </p>
              ) : null}
            </>
          ) : null}

          <PanelPreviewSummary preview={preview} estimateText={estimateText} />

          {localMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {localMessage}
            </p>
          ) : null}
          {state.status === "error" && state.message ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">{state.message}</p>
              {state.requiresRefresh || refreshRequested ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  Recharger le Journal
                </Button>
              ) : null}
            </div>
          ) : null}
          {state.status === "success" && state.message ? (
            <p className="whitespace-pre-line text-sm" role="status" aria-live="polite">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={refreshRequested}>
                Annuler
              </Button>
            </DialogClose>
            <ProgrammerSubmitButton
              disabled={exceedsCeiling}
              refreshRequested={refreshRequested}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
