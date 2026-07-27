"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
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
  litterCareTaskCategoryLabels,
  litterCareTaskTargetLabels,
} from "./litter-care-task-labels";
import type { LitterPlanSeriesActionState } from "./litter-plan-series-actions";
import {
  formatCivilDateFr,
  formatLitterPlanSeriesAnchorPendingLabel,
  formatLitterPlanSeriesEndLabel,
  formatLitterPlanSeriesHorizonLabel,
  formatLitterPlanSeriesLocalTime,
  formatLitterPlanSeriesScheduleLabel,
  formatLitterPlanSeriesStateLabel,
  getLitterPlanSeriesAvailableActions,
  proposeLitterPlanSeriesMaterializeThrough,
  type LitterPlanSeriesActionKind,
  type LitterPlanSeriesSummary,
} from "./litter-plan-series-summary";

const initialState: LitterPlanSeriesActionState = { status: "idle" };

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";

type SeriesAction = (
  previousState: LitterPlanSeriesActionState,
  formData: FormData,
) => Promise<LitterPlanSeriesActionState>;

export type LitterPlanSeriesPanelActions = {
  seriesId: string;
  suspendAction: SeriesAction | null;
  resumeAction: SeriesAction | null;
  materializeAction: SeriesAction | null;
  completeAction: SeriesAction | null;
  cancelAction: SeriesAction | null;
  notApplicableAction: SeriesAction | null;
};

function SubmitButton({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "En cours…" : label}
    </Button>
  );
}

function useActionFeedback(
  state: LitterPlanSeriesActionState,
  onMessage: (message: string | null) => void,
) {
  const router = useRouter();
  const handled = useRef<LitterPlanSeriesActionState | null>(null);

  useEffect(() => {
    if (state === handled.current) return;
    if (state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      onMessage(state.message ?? null);
      router.refresh();
      return;
    }
    if (state.status === "error") {
      onMessage(state.message ?? "Une erreur est survenue.");
      if (state.code === "stale_revision") {
        router.refresh();
      }
    }
  }, [state, onMessage, router]);
}

function StateBadge({ series }: { series: LitterPlanSeriesSummary }) {
  const label = formatLitterPlanSeriesStateLabel(series.state);
  const tone =
    series.state === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : series.state === "suspended"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-border bg-muted/40 text-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
      aria-label={`État : ${label}`}
    >
      {label}
    </span>
  );
}

function AnchorBadge() {
  const label = formatLitterPlanSeriesAnchorPendingLabel();
  return (
    <span
      className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-950"
      aria-label={label}
    >
      {label}
    </span>
  );
}

function TerminalDialog({
  title,
  description,
  actionLabel,
  action,
  onMessage,
}: {
  title: string;
  description: string;
  actionLabel: string;
  action: SeriesAction;
  onMessage: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialState);
  useActionFeedback(state, (message) => {
    onMessage(message);
    if (state.status === "success") setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {actionLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="terminal_confirmation" value="confirmed" />
          <div>
            <label htmlFor={`${actionLabel}-reason`} className="text-sm font-semibold">
              Motif (facultatif)
            </label>
            <textarea
              id={`${actionLabel}-reason`}
              name="reason"
              maxLength={5000}
              rows={3}
              className={inputClass}
            />
          </div>
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-amber-900">
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton label={actionLabel} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaterializeDialog({
  series,
  action,
  onMessage,
}: {
  series: LitterPlanSeriesSummary;
  action: SeriesAction;
  onMessage: (message: string | null) => void;
}) {
  const proposed =
    proposeLitterPlanSeriesMaterializeThrough({
      startsOn: series.startsOn,
      endsOn: series.endsOn,
      materializedThrough: series.materializedThrough,
      recurrenceIntervalDays: series.recurrenceIntervalDays,
      absoluteMaxOccurrences: series.absoluteMaxOccurrences,
      timeSlotCount: Math.max(series.timeSlots.length, 1),
      initialMaterializationHorizonDays:
        series.initialMaterializationHorizonDays,
    }) ?? "";
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialState);
  useActionFeedback(state, (message) => {
    onMessage(message);
    if (state.status === "success") setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          Préparer les prochaines occurrences
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Préparer les occurrences</DialogTitle>
          <DialogDescription>
            {series.anchorPending
              ? "La date d’ancrage n’est pas encore disponible pour ce suivi."
              : "Préparez les prochaines occurrences sans dupliquer celles déjà créées."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor={`materialize-${series.id}`}
              className="text-sm font-semibold"
            >
              Préparer les occurrences jusqu’au
            </label>
            <input
              id={`materialize-${series.id}`}
              name="requested_through"
              type="date"
              required
              defaultValue={proposed}
              disabled={series.anchorPending}
              className={inputClass}
            />
          </div>
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-amber-900">
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Fermer
              </Button>
            </DialogClose>
            <SubmitButton
              label="Préparer"
              variant="secondary"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImmediateActionForm({
  label,
  action,
  onMessage,
}: {
  label: string;
  action: SeriesAction;
  onMessage: (message: string | null) => void;
}) {
  const [state, formAction] = useActionState(action, initialState);
  useActionFeedback(state, onMessage);

  return (
    <form action={formAction}>
      <SubmitButton label={label} variant="outline" />
      {state.status === "error" ? (
        <p role="alert" className="mt-2 text-xs text-amber-900">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SeriesActions({
  series,
  actions,
  canWrite,
  onMessage,
}: {
  series: LitterPlanSeriesSummary;
  actions: LitterPlanSeriesPanelActions | null;
  canWrite: boolean;
  onMessage: (message: string | null) => void;
}) {
  const available = getLitterPlanSeriesAvailableActions({
    state: series.state,
    canWrite,
  });
  if (available.length === 0 || !actions) return null;

  const buttons: {
    kind: LitterPlanSeriesActionKind;
    node: ReactNode;
  }[] = [];

  if (available.includes("suspend") && actions.suspendAction) {
    buttons.push({
      kind: "suspend",
      node: (
        <ImmediateActionForm
          key="suspend"
          label="Suspendre"
          action={actions.suspendAction}
          onMessage={onMessage}
        />
      ),
    });
  }
  if (available.includes("resume") && actions.resumeAction) {
    buttons.push({
      kind: "resume",
      node: (
        <ImmediateActionForm
          key="resume"
          label="Reprendre"
          action={actions.resumeAction}
          onMessage={onMessage}
        />
      ),
    });
  }
  if (available.includes("materialize") && actions.materializeAction) {
    buttons.push({
      kind: "materialize",
      node: (
        <MaterializeDialog
          key="materialize"
          series={series}
          action={actions.materializeAction}
          onMessage={onMessage}
        />
      ),
    });
  }
  if (available.includes("complete") && actions.completeAction) {
    buttons.push({
      kind: "complete",
      node: (
        <TerminalDialog
          key="complete"
          title="Terminer ce suivi"
          description="Les occurrences encore à faire seront clôturées. Cette action est définitive."
          actionLabel="Terminer"
          action={actions.completeAction}
          onMessage={onMessage}
        />
      ),
    });
  }
  if (available.includes("cancel") && actions.cancelAction) {
    buttons.push({
      kind: "cancel",
      node: (
        <TerminalDialog
          key="cancel"
          title="Annuler ce suivi"
          description="Les occurrences encore à faire seront annulées. Cette action est définitive."
          actionLabel="Annuler"
          action={actions.cancelAction}
          onMessage={onMessage}
        />
      ),
    });
  }
  if (available.includes("not_applicable") && actions.notApplicableAction) {
    buttons.push({
      kind: "not_applicable",
      node: (
        <TerminalDialog
          key="not_applicable"
          title="Déclarer non applicable"
          description="Les occurrences encore à faire seront marquées non applicables. Cette action est définitive."
          actionLabel="Déclarer non applicable"
          action={actions.notApplicableAction}
          onMessage={onMessage}
        />
      ),
    });
  }

  return (
    <div className="mt-4">
      <div className="hidden flex-wrap gap-2 sm:flex">
        {buttons.map((button) => button.node)}
      </div>
      <details className="sm:hidden">
        <summary className="cursor-pointer list-none rounded-xl border px-3 py-2 text-sm font-semibold">
          Actions du suivi
        </summary>
        <div className="mt-3 flex flex-col gap-2">{buttons.map((button) => button.node)}</div>
      </details>
    </div>
  );
}

function SeriesCard({
  series,
  actions,
  canWrite,
  onMessage,
}: {
  series: LitterPlanSeriesSummary;
  actions: LitterPlanSeriesPanelActions | null;
  canWrite: boolean;
  onMessage: (message: string | null) => void;
}) {
  const counts = series.occurrenceCounts;
  const next = series.nextOccurrence;

  return (
    <article
      className="rounded-2xl border bg-background p-4 sm:p-5"
      data-series-id={series.id}
      data-series-state={series.state}
      data-anchor-pending={series.anchorPending ? "true" : "false"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{series.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {litterCareTaskCategoryLabels[series.category]} ·{" "}
            {litterCareTaskTargetLabels[series.targetScope]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StateBadge series={series} />
          {series.anchorPending ? <AnchorBadge /> : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted">Fréquence</dt>
          <dd className="mt-1">
            {formatLitterPlanSeriesScheduleLabel({
              recurrenceIntervalDays: series.recurrenceIntervalDays,
              timeSlots: series.timeSlots,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Période</dt>
          <dd className="mt-1">
            {series.startsOn
              ? `Du ${formatCivilDateFr(series.startsOn)}`
              : "Date de début en attente"}
            {" · "}
            {formatLitterPlanSeriesEndLabel({
              endKind: series.endKind,
              endsOn: series.endsOn,
              recurrenceDayCount: series.recurrenceDayCount,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Horizon préparé</dt>
          <dd className="mt-1">
            {formatLitterPlanSeriesHorizonLabel(series.materializedThrough)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Occurrences</dt>
          <dd className="mt-1">
            {counts.total} au total · {counts.planned} à faire · {counts.done}{" "}
            réalisées · {counts.cancelled} annulées · {counts.notApplicable} non
            applicables
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">Prochaine occurrence</dt>
          <dd className="mt-1">
            {next
              ? `${formatCivilDateFr(next.plannedFor)}${
                  next.scheduledLocalTime
                    ? ` · ${formatLitterPlanSeriesLocalTime(next.scheduledLocalTime)}`
                    : ""
                }`
              : "Aucune occurrence planifiée"}
          </dd>
        </div>
      </dl>

      {series.anchorPending ? (
        <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          En attente de la date d’ancrage. Le suivi ne peut pas encore être
          programmé tant que cette date n’est pas renseignée.
        </p>
      ) : null}

      <SeriesActions
        series={series}
        actions={actions}
        canWrite={canWrite}
        onMessage={onMessage}
      />
    </article>
  );
}

export function LitterPlanSeriesPanel({
  series,
  role,
  actions,
  loadError = false,
}: {
  series: LitterPlanSeriesSummary[];
  role: "owner" | "admin" | "member" | "viewer" | null;
  actions: LitterPlanSeriesPanelActions[];
  loadError?: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";
  const actionsById = new Map(
    actions.map((action) => [action.seriesId, action]),
  );

  return (
    <section
      id="litter-recurring-series"
      className="rounded-2xl border bg-surface p-5 sm:p-6"
      aria-labelledby="litter-recurring-series-title"
    >
      <div>
        <h2 id="litter-recurring-series-title" className="text-lg font-semibold">
          Suivis récurrents
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Règles de série du planning actif. Les occurrences restent des tâches
          individuelles dans la liste ci-dessous.
        </p>
      </div>

      {confirmation ? (
        <p
          role="status"
          className="mt-4 rounded-xl border bg-background px-3 py-2 text-sm"
        >
          {confirmation}
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-5 text-sm text-muted">
          Les suivis récurrents ne sont pas disponibles pour le moment.
        </p>
      ) : series.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun suivi récurrent n’est encore associé à cette portée.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {series.map((item) => (
            <SeriesCard
              key={item.id}
              series={item}
              actions={actionsById.get(item.id) ?? null}
              canWrite={canWrite}
              onMessage={setConfirmation}
            />
          ))}
        </div>
      )}
    </section>
  );
}
