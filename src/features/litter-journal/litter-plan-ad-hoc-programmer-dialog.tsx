"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
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
  buildLitterPlanAdHocProgrammerDomIds,
  buildLitterPlanAdHocProgrammerPreview,
  buildLitterPlanAdHocProgrammerPublicKey,
  changeLitterPlanAdHocProgrammerKind,
  createInitialLitterPlanAdHocProgrammerFormState,
  estimateLitterPlanAdHocProgrammerOccurrences,
  formatLitterPlanAdHocProgrammerOccurrenceEstimate,
  formatLitterPlanAdHocProgrammerPreparedLine,
  litterPlanAdHocProgrammerPriorityLabels,
  nextLitterPlanAdHocProgrammerKind,
  parseLitterPlanAdHocProgrammerPositiveInteger,
  previousLitterPlanAdHocProgrammerKind,
  shouldRemountLitterPlanAdHocProgrammerFormSession,
  validateLitterPlanAdHocProgrammerForm,
  type LitterPlanAdHocProgrammerDomIds,
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

function FieldError({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

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

  const preparedLine = preview.recurringDetails
    ? formatLitterPlanAdHocProgrammerPreparedLine({
        total: preview.recurringDetails.totalOccurrences,
        initialPrepared: preview.recurringDetails.initialPrepared,
        horizonDays: preview.recurringDetails.horizonDays,
      })
    : null;

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
          {preparedLine ? <li>{preparedLine}</li> : null}
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
  const focusKind = (kind: LitterPlanAdHocProgrammerKind) => {
    const node = document.getElementById(`${idPrefix}-kind-${kind}`);
    node?.focus();
  };

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
              tabIndex={selected ? 0 : -1}
              aria-label={`${choice.title}. ${choice.description}`}
              onClick={() => onChange(choice.kind)}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  onChange(choice.kind);
                  return;
                }
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const next = nextLitterPlanAdHocProgrammerKind(value);
                  onChange(next);
                  focusKind(next);
                  return;
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const previous = previousLitterPlanAdHocProgrammerKind(value);
                  onChange(previous);
                  focusKind(previous);
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

function ProgrammerFormSession({
  action,
  instanceKey,
  idPrefix,
  ids,
  businessDate,
  open,
  refreshRequested,
  onPreviewChange,
  onSuccess,
  onCommandConsumed,
}: {
  action: ProgrammerAction;
  instanceKey: string;
  idPrefix: string;
  ids: LitterPlanAdHocProgrammerDomIds;
  businessDate: string;
  open: boolean;
  refreshRequested: boolean;
  onPreviewChange: (preview: LitterPlanAdHocProgrammerPreview | null) => void;
  onSuccess: (message: string) => void;
  onCommandConsumed: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    createInitialLitterPlanAdHocProgrammerFormState(businessDate),
  );
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const preview = useMemo(
    () => (open ? buildLitterPlanAdHocProgrammerPreview(form, instanceKey) : null),
    [form, instanceKey, open],
  );

  const recurringEstimate = useMemo(() => {
    if (form.kind !== "recurring_task") return null;
    const intervalDays = parseLitterPlanAdHocProgrammerPositiveInteger(
      form.intervalDays,
      1,
      365,
    );
    if (intervalDays === null) return null;
    const recurrenceDayCount =
      form.endKind === "fixed_recurrence_day_count"
        ? parseLitterPlanAdHocProgrammerPositiveInteger(
            form.recurrenceDayCount,
            1,
            500,
          )
        : null;
    if (
      form.endKind === "fixed_recurrence_day_count" &&
      recurrenceDayCount === null
    ) {
      return null;
    }
    return estimateLitterPlanAdHocProgrammerOccurrences({
      startsOn: form.recurringStartsOn,
      intervalDays,
      endKind: form.endKind,
      endsOn:
        form.endKind === "fixed_end_date" ? form.recurringEndsOn || null : null,
      recurrenceDayCount,
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
        onCommandConsumed();
        onPreviewChange(null);
        onSuccess(nextState.message);
        router.refresh();
      } else if (nextState.requiresRefresh) {
        onCommandConsumed();
      }
      return nextState;
    },
    [
      action,
      form,
      onCommandConsumed,
      onPreviewChange,
      onSuccess,
      refreshRequested,
      router,
    ],
  );

  const [state, formAction] = useActionState(submitAction, initialActionState);

  const updateForm = (patch: Partial<LitterPlanAdHocProgrammerFormState>) => {
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
      <KindChooser value={form.kind} onChange={changeKind} idPrefix={idPrefix} />

      <div>
        <label className={labelClass} htmlFor={ids.title}>
          Titre
        </label>
        <input
          id={ids.title}
          className={inputClass}
          name="title"
          value={form.title}
          onChange={(event) => updateForm({ title: event.target.value })}
          maxLength={255}
          required
          aria-invalid={Boolean(fieldError("title"))}
          aria-describedby={
            fieldError("title") ? ids.titleError : undefined
          }
        />
        <FieldError id={ids.titleError} message={fieldError("title")} />
      </div>

      <div>
        <label className={labelClass} htmlFor={ids.descriptionInput}>
          Description facultative
        </label>
        <textarea
          id={ids.descriptionInput}
          className={inputClass}
          name="description"
          value={form.description}
          onChange={(event) => updateForm({ description: event.target.value })}
          rows={3}
          maxLength={5000}
          aria-invalid={Boolean(fieldError("description"))}
          aria-describedby={
            fieldError("description") ? ids.descriptionError : undefined
          }
        />
        <FieldError
          id={ids.descriptionError}
          message={fieldError("description")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor={ids.category}>
            Catégorie
          </label>
          <select
            id={ids.category}
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
          <label className={labelClass} htmlFor={ids.target}>
            Cible
          </label>
          <select
            id={ids.target}
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
          <label className={labelClass} htmlFor={ids.priority}>
            Priorité
          </label>
          <select
            id={ids.priority}
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
            <label className={labelClass} htmlFor={ids.scheduledDate}>
              Date
            </label>
            <input
              id={ids.scheduledDate}
              className={inputClass}
              type="date"
              name="scheduled_date"
              value={form.scheduledDate}
              onChange={(event) =>
                updateForm({ scheduledDate: event.target.value })
              }
              required
              aria-invalid={Boolean(fieldError("scheduled_date"))}
              aria-describedby={
                fieldError("scheduled_date")
                  ? ids.scheduledDateError
                  : undefined
              }
            />
            <FieldError
              id={ids.scheduledDateError}
              message={fieldError("scheduled_date")}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={ids.localTime}>
              Heure facultative
            </label>
            <input
              id={ids.localTime}
              className={inputClass}
              type="time"
              name="local_time"
              value={form.localTime}
              onChange={(event) =>
                updateForm({ localTime: event.target.value })
              }
              aria-invalid={Boolean(fieldError("local_time"))}
              aria-describedby={
                fieldError("local_time") ? ids.localTimeError : undefined
              }
            />
            <FieldError
              id={ids.localTimeError}
              message={fieldError("local_time")}
            />
          </div>
        </div>
      ) : null}

      {form.kind === "window" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={ids.startsOn}>
                Date de début
              </label>
              <input
                id={ids.startsOn}
                className={inputClass}
                type="date"
                name="starts_on"
                value={form.startsOn}
                onChange={(event) =>
                  updateForm({ startsOn: event.target.value })
                }
                required
                aria-invalid={Boolean(fieldError("starts_on"))}
                aria-describedby={
                  fieldError("starts_on") ? ids.startsOnError : undefined
                }
              />
              <FieldError
                id={ids.startsOnError}
                message={fieldError("starts_on")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={ids.startsLocalTime}>
                Heure de début facultative
              </label>
              <input
                id={ids.startsLocalTime}
                className={inputClass}
                type="time"
                name="starts_local_time"
                value={form.startsLocalTime}
                onChange={(event) =>
                  updateForm({ startsLocalTime: event.target.value })
                }
                aria-invalid={Boolean(fieldError("starts_local_time"))}
                aria-describedby={
                  fieldError("starts_local_time")
                    ? ids.startsLocalTimeError
                    : undefined
                }
              />
              <FieldError
                id={ids.startsLocalTimeError}
                message={fieldError("starts_local_time")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={ids.endsOn}>
                Date de fin
              </label>
              <input
                id={ids.endsOn}
                className={inputClass}
                type="date"
                name="ends_on"
                value={form.endsOn}
                onChange={(event) => updateForm({ endsOn: event.target.value })}
                required
                aria-invalid={Boolean(fieldError("ends_on"))}
                aria-describedby={
                  fieldError("ends_on") ? ids.endsOnError : undefined
                }
              />
              <FieldError
                id={ids.endsOnError}
                message={fieldError("ends_on")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={ids.endsLocalTime}>
                Heure de fin facultative
              </label>
              <input
                id={ids.endsLocalTime}
                className={inputClass}
                type="time"
                name="ends_local_time"
                value={form.endsLocalTime}
                onChange={(event) =>
                  updateForm({ endsLocalTime: event.target.value })
                }
                aria-invalid={Boolean(fieldError("ends_local_time"))}
                aria-describedby={
                  fieldError("ends_local_time")
                    ? ids.endsLocalTimeError
                    : undefined
                }
              />
              <FieldError
                id={ids.endsLocalTimeError}
                message={fieldError("ends_local_time")}
              />
            </div>
          </div>
        </>
      ) : null}

      {form.kind === "recurring_task" ? (
        <>
          <div>
            <label className={labelClass} htmlFor={ids.startsOn}>
              Date de début
            </label>
            <input
              id={ids.startsOn}
              className={inputClass}
              type="date"
              name="starts_on"
              value={form.recurringStartsOn}
              onChange={(event) =>
                updateForm({ recurringStartsOn: event.target.value })
              }
              required
              aria-invalid={Boolean(fieldError("starts_on"))}
              aria-describedby={
                fieldError("starts_on") ? ids.startsOnError : undefined
              }
            />
            <FieldError
              id={ids.startsOnError}
              message={fieldError("starts_on")}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={ids.intervalDays}>
              Tous les N jours
            </label>
            <input
              id={ids.intervalDays}
              className={inputClass}
              type="text"
              inputMode="numeric"
              name="interval_days"
              value={form.intervalDays}
              onChange={(event) =>
                updateForm({ intervalDays: event.target.value })
              }
              required
              aria-invalid={Boolean(fieldError("interval_days"))}
              aria-describedby={
                fieldError("interval_days")
                  ? ids.intervalDaysError
                  : undefined
              }
            />
            <FieldError
              id={ids.intervalDaysError}
              message={fieldError("interval_days")}
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
                onChange={() => updateForm({ endKind: "fixed_end_date" })}
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
                <label className={labelClass} htmlFor={ids.recurringEndsOn}>
                  Date de fin
                </label>
                <input
                  id={ids.recurringEndsOn}
                  className={inputClass}
                  type="date"
                  name="ends_on"
                  value={form.recurringEndsOn}
                  onChange={(event) =>
                    updateForm({ recurringEndsOn: event.target.value })
                  }
                  required
                  aria-invalid={Boolean(fieldError("ends_on"))}
                  aria-describedby={
                    fieldError("ends_on") ? ids.recurringEndsOnError : undefined
                  }
                />
                <FieldError
                  id={ids.recurringEndsOnError}
                  message={fieldError("ends_on")}
                />
              </div>
            ) : (
              <div>
                <label
                  className={labelClass}
                  htmlFor={ids.recurrenceDayCount}
                >
                  Nombre de dates programmées
                </label>
                <input
                  id={ids.recurrenceDayCount}
                  className={inputClass}
                  type="text"
                  inputMode="numeric"
                  name="recurrence_day_count"
                  value={form.recurrenceDayCount}
                  onChange={(event) =>
                    updateForm({ recurrenceDayCount: event.target.value })
                  }
                  required
                  aria-invalid={Boolean(fieldError("recurrence_day_count"))}
                  aria-describedby={
                    fieldError("recurrence_day_count")
                      ? ids.recurrenceDayCountError
                      : undefined
                  }
                />
                <p className="mt-1 text-xs text-muted">
                  {LITTER_PLAN_AD_HOC_RECURRENCE_DAY_COUNT_HELP}
                </p>
                <FieldError
                  id={ids.recurrenceDayCountError}
                  message={fieldError("recurrence_day_count")}
                />
              </div>
            )}
          </fieldset>
          <fieldset
            className="space-y-3"
            aria-invalid={Boolean(fieldError("time_slot")) || undefined}
            aria-describedby={
              fieldError("time_slot") ? ids.timeSlotsError : undefined
            }
          >
            <legend className={labelClass}>Créneaux horaires</legend>
            {form.timeSlots.map((slot, index) => (
              <div key={`${idPrefix}-slot-${index}`} className="flex gap-2">
                <input
                  className={inputClass}
                  type="time"
                  name="time_slot"
                  value={slot}
                  required
                  aria-label={`Créneau ${index + 1}`}
                  aria-invalid={Boolean(fieldError("time_slot"))}
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
            <FieldError
              id={ids.timeSlotsError}
              message={fieldError("time_slot")}
            />
          </fieldset>
          {estimateText ? (
            <p
              id={ids.occurrences}
              className={`whitespace-pre-line rounded-xl border px-3 py-2 text-sm ${
                exceedsCeiling || fieldError("occurrences")
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "bg-muted/20"
              }`}
              aria-live="polite"
              role={
                exceedsCeiling || fieldError("occurrences") ? "alert" : "status"
              }
              aria-invalid={
                Boolean(exceedsCeiling || fieldError("occurrences")) ||
                undefined
              }
              aria-describedby={
                fieldError("occurrences") ? ids.occurrencesError : undefined
              }
            >
              {estimateText}
            </p>
          ) : null}
          <FieldError
            id={ids.occurrencesError}
            message={fieldError("occurrences")}
          />
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
        <p
          className="whitespace-pre-line text-sm"
          role="status"
          aria-live="polite"
        >
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
  const reactId = useId();
  const idPrefix = buildLitterPlanAdHocProgrammerPublicKey(
    instanceKey,
    reactId.replace(/:/g, ""),
  );
  const ids = useMemo(
    () => buildLitterPlanAdHocProgrammerDomIds(idPrefix),
    [idPrefix],
  );
  const [open, setOpen] = useState(false);
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [refreshRequested, setRefreshRequested] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onPreviewChange(null);
      if (
        shouldRemountLitterPlanAdHocProgrammerFormSession({
          panelClosed: true,
          commandConsumed: refreshRequested,
        })
      ) {
        setFormSessionKey((current) => current + 1);
      }
      setOpen(false);
      return;
    }
    if (refreshRequested) return;
    setOpen(true);
  };

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
        aria-describedby={ids.dialogDescription}
      >
        <DialogHeader>
          <DialogTitle>Programmer un élément</DialogTitle>
          <DialogDescription id={ids.dialogDescription}>
            Ajoutez un élément propre à cette portée. Il n’affectera pas les
            modèles de l’organisation.
          </DialogDescription>
        </DialogHeader>

        <ProgrammerFormSession
          key={formSessionKey}
          action={action}
          instanceKey={instanceKey}
          idPrefix={idPrefix}
          ids={ids}
          businessDate={businessDate}
          open={open}
          refreshRequested={refreshRequested}
          onPreviewChange={onPreviewChange}
          onSuccess={onSuccess}
          onCommandConsumed={() => setRefreshRequested(true)}
        />
      </DialogContent>
    </Dialog>
  );
}
