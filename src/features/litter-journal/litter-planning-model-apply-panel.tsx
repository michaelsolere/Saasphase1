"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  LITTER_PLANNING_MODEL_APPLY_CONFIRMATION_WARNING,
  toggleLitterPlanningModelSelection,
  type LitterPlanningModelApplicationCardDto,
  type LitterPlanningModelApplicationItemDto,
  type LitterPlanningModelApplicationPanelDto,
} from "./litter-planning-model-apply";
import type { ApplyLitterPlanningModelActionState } from "./litter-planning-model-apply-actions";

type OrganizationRole = "owner" | "admin" | "member" | "viewer";

type ApplyAction = (
  previousState: ApplyLitterPlanningModelActionState,
  formData: FormData,
) => Promise<ApplyLitterPlanningModelActionState>;

const initialState: ApplyLitterPlanningModelActionState = { status: "idle" };

function ApplySubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Application..." : "Appliquer le modèle"}
    </Button>
  );
}

function ReloadJournalButton() {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" onClick={() => router.refresh()}>
      Recharger le Journal
    </Button>
  );
}

function PlanSummary({
  panel,
}: {
  panel: LitterPlanningModelApplicationPanelDto;
}) {
  if (!panel.planSummary) {
    return (
      <p className="mt-4 rounded-xl border border-dashed px-4 py-3 text-sm leading-6 text-muted">
        {panel.noPlanMessage}
      </p>
    );
  }

  const summary = panel.planSummary;
  return (
    <dl className="mt-4 grid gap-3 rounded-xl border px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt className="font-medium text-muted">Statut</dt>
        <dd className="mt-1">{summary.statusLabel}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted">Révision</dt>
        <dd className="mt-1">{summary.revision}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted">Fuseau</dt>
        <dd className="mt-1">{summary.timezoneName}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted">Modèles déjà appliqués</dt>
        <dd className="mt-1">{summary.appliedModelCount}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted">Éléments au total</dt>
        <dd className="mt-1">{summary.totalItemCount}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted">En attente d’ancre</dt>
        <dd className="mt-1">{summary.pendingAnchorItemCount}</dd>
      </div>
    </dl>
  );
}

function ItemDetails({ item }: { item: LitterPlanningModelApplicationItemDto }) {
  return (
    <div className="mt-3 space-y-1 text-sm text-muted">
      <p>
        {item.kindLabel} · {item.categoryLabel} · {item.targetLabel}
      </p>
      <p>
        Priorité {item.priorityLabel.toLowerCase()} · {item.requiredLabel} ·{" "}
        {item.selectedByDefaultLabel}
      </p>
      <p>{item.scheduleLabel}</p>
      {item.timeLabel ? <p>{item.timeLabel}</p> : null}
      <p className="font-medium text-foreground">{item.preview.label}</p>
    </div>
  );
}

function ConfirmationSummary({
  model,
  selectedIndexes,
}: {
  model: LitterPlanningModelApplicationCardDto;
  selectedIndexes: number[];
}) {
  const selected = model.items.filter((item) =>
    selectedIndexes.includes(item.publicIndex),
  );
  const requiredCount = selected.filter((item) => item.isRequired).length;
  const optionalCount = selected.length - requiredCount;
  const immediateCount = selected.filter(
    (item) => item.preview.kind !== "pending_anchor",
  ).length;
  const pendingCount = selected.length - immediateCount;
  const recurringEstimate = selected.reduce((sum, item) => {
    if (item.kind !== "recurring_task") return sum;
    return sum + (item.estimatedInitialOccurrenceCount ?? 0);
  }, 0);
  const hasRecurring = selected.some((item) => item.kind === "recurring_task");

  return (
    <div className="space-y-3 text-sm leading-6">
      <p>
        Modèle : <span className="font-semibold">{model.title}</span>
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>
          {selected.length} élément{selected.length > 1 ? "s" : ""} sélectionné
          {selected.length > 1 ? "s" : ""}
        </li>
        <li>
          {requiredCount} obligatoire{requiredCount > 1 ? "s" : ""}
        </li>
        <li>
          {optionalCount} facultatif{optionalCount > 1 ? "s" : ""}
        </li>
        <li>
          {immediateCount} immédiatement programmé
          {immediateCount > 1 ? "s" : ""}
        </li>
        <li>
          {pendingCount} en attente d’ancre
          {pendingCount > 1 ? "s" : ""}
        </li>
        {hasRecurring ? (
          <li>
            Suivi récurrent inclus
            {recurringEstimate > 0
              ? ` · environ ${recurringEstimate} occurrence${recurringEstimate > 1 ? "s" : ""} initialement préparée${recurringEstimate > 1 ? "s" : ""}`
              : ""}
          </li>
        ) : null}
      </ul>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
        {LITTER_PLANNING_MODEL_APPLY_CONFIRMATION_WARNING}
      </p>
    </div>
  );
}

function ModelApplyDialog({
  model,
  action,
  onSuccess,
}: {
  model: LitterPlanningModelApplicationCardDto;
  action: ApplyAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const checkboxIdPrefix = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"selection" | "confirmation">("selection");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>(
    model.initialSelectedIndexes,
  );
  const selectionItems = useMemo(
    () =>
      model.items.map((item) => ({
        publicIndex: item.publicIndex,
        isRequired: item.isRequired,
        isSelectedByDefault: item.isSelectedByDefault,
      })),
    [model.items],
  );

  const [state, formAction] = useActionState(
    async (
      previousState: ApplyLitterPlanningModelActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        setStep("selection");
        setSelectedIndexes(model.initialSelectedIndexes);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    initialState,
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("selection");
      setDetailsOpen(false);
      setSelectedIndexes(model.initialSelectedIndexes);
    }
  }

  function toggleIndex(publicIndex: number) {
    const next = toggleLitterPlanningModelSelection({
      items: selectionItems,
      selectedIndexes,
      publicIndex,
    });
    if (next) setSelectedIndexes(next);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Appliquer ce modèle
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
          {step === "selection" ? (
            <>
              <DialogHeader>
                <DialogTitle>Sélectionner les éléments du modèle</DialogTitle>
                <DialogDescription>
                  Les éléments obligatoires restent cochés. Les facultatifs
                  peuvent être retirés avant l’application.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  {selectedIndexes.length} élément
                  {selectedIndexes.length > 1 ? "s" : ""} sélectionné
                  {selectedIndexes.length > 1 ? "s" : ""}
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-accent hover:underline"
                  aria-expanded={detailsOpen}
                  aria-controls={detailsId}
                  onClick={() => setDetailsOpen((current) => !current)}
                >
                  {detailsOpen
                    ? "Masquer le détail du modèle"
                    : "Afficher le détail du modèle"}
                </button>
                <ul
                  id={detailsId}
                  className="divide-y divide-border rounded-xl border"
                >
                  {model.items.map((item) => {
                    const checkboxId = `${checkboxIdPrefix}-${item.publicIndex}`;
                    const checked = selectedIndexes.includes(item.publicIndex);
                    return (
                      <li key={item.publicIndex} className="p-4">
                        <label
                          htmlFor={checkboxId}
                          className="flex cursor-pointer items-start gap-3"
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            className="mt-1 size-4 accent-[var(--accent)]"
                            checked={checked}
                            disabled={item.isRequired}
                            onChange={() => toggleIndex(item.publicIndex)}
                          />
                          <span className="min-w-0">
                            <span className="block break-words font-semibold">
                              {item.title}
                            </span>
                            <span className="mt-1 block text-sm text-muted">
                              {item.kindLabel} · {item.requiredLabel}
                            </span>
                            {detailsOpen ? <ItemDetails item={item} /> : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  disabled={selectedIndexes.length === 0}
                  onClick={() => setStep("confirmation")}
                >
                  Continuer
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirmer l’application</DialogTitle>
                <DialogDescription>
                  Vérifiez le contenu qui sera copié dans le planning de cette
                  portée.
                </DialogDescription>
              </DialogHeader>
              <ConfirmationSummary
                model={model}
                selectedIndexes={selectedIndexes}
              />
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="confirmation" value="confirmed" />
                {selectedIndexes.map((index) => (
                  <input
                    key={index}
                    type="hidden"
                    name="selected_public_index"
                    value={String(index)}
                  />
                ))}
                {state.status === "error" && state.message ? (
                  <div
                    role="alert"
                    className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                  >
                    <p>{state.message}</p>
                    {state.requiresReload ? <ReloadJournalButton /> : null}
                  </div>
                ) : null}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("selection")}
                  >
                    Retour
                  </Button>
                  <ApplySubmitButton disabled={selectedIndexes.length === 0} />
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelCard({
  model,
  action,
  onSuccess,
}: {
  model: LitterPlanningModelApplicationCardDto;
  action: ApplyAction | null;
  onSuccess: (message: string) => void;
}) {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <li className="min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-base font-semibold">{model.title}</p>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {model.statusLabel}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {model.isActive ? "Actif" : "Inactif"}
            </span>
          </div>
          {model.description ? (
            <p className="text-sm leading-6 text-muted">{model.description}</p>
          ) : null}
          <p className="text-sm text-muted">
            {model.speciesLabel} · {model.breedLabel} · {model.originLabel}
          </p>
          <p className="text-sm text-muted">
            Révision actuelle {model.currentRevision} · {model.totalItemCount}{" "}
            élément{model.totalItemCount > 1 ? "s" : ""}
          </p>
          {model.status === "already_applied" ? (
            <p className="text-sm text-muted">
              Révision appliquée {model.appliedRevision} ·{" "}
              {model.instantiatedItemCount} élément
              {model.instantiatedItemCount > 1 ? "s" : ""} réellement
              instancié{model.instantiatedItemCount > 1 ? "s" : ""}
            </p>
          ) : null}
          {model.revisionDivergenceMessage ? (
            <p className="rounded-xl border border-dashed px-3 py-2 text-sm leading-6 text-muted">
              {model.revisionDivergenceMessage}
            </p>
          ) : null}
          <button
            type="button"
            className="text-sm font-semibold text-accent hover:underline"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            {detailsOpen ? "Masquer le contenu" : "Consulter le contenu"}
          </button>
          {detailsOpen ? (
            <ul id={detailsId} className="divide-y divide-border rounded-xl border">
              {model.items.map((item) => (
                <li key={item.publicIndex} className="p-4">
                  <p className="font-semibold">{item.title}</p>
                  <ItemDetails item={item} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="shrink-0">
          {model.canApply && action ? (
            <ModelApplyDialog
              key={model.publicKey}
              model={model}
              action={action}
              onSuccess={onSuccess}
            />
          ) : model.status === "already_applied" ? (
            <p className="text-sm font-medium text-muted">Déjà présent</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function LitterPlanningModelApplyPanel({
  panel,
  actionsByPublicKey,
  loadError = false,
}: {
  panel: LitterPlanningModelApplicationPanelDto | null;
  actionsByPublicKey: Record<string, ApplyAction>;
  loadError?: boolean;
  role?: OrganizationRole | null;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);

  return (
    <section
      className="rounded-2xl border bg-surface p-5 sm:p-6"
      aria-labelledby="litter-planning-model-apply-heading"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2
            id="litter-planning-model-apply-heading"
            className="text-lg font-semibold"
          >
            Programmer le planning de la portée
          </h2>
          <p className="mt-1 text-sm font-medium text-foreground">
            Programmer depuis un modèle complet
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Les modèles complets assemblent plusieurs jalons, périodes et
            suivis. Les jalons isolés permettent d’ajouter ponctuellement un
            seul repère.
          </p>
        </div>
      </div>

      {confirmation ? (
        <p
          role="status"
          className="mt-4 whitespace-pre-line rounded-xl border bg-surface px-3 py-2 text-sm text-foreground"
        >
          {confirmation}
        </p>
      ) : null}

      {loadError || !panel ? (
        <p className="mt-5 text-sm text-muted">
          Les modèles de planning ne sont pas disponibles pour le moment. Les
          autres sections du Journal restent consultables.
        </p>
      ) : (
        <>
          <p className="mt-4 rounded-xl border border-dashed px-4 py-3 text-sm leading-6 text-muted">
            {panel.independenceMessage}
          </p>
          <PlanSummary panel={panel} />
          {panel.models.length === 0 ? (
            <p className="mt-5 text-sm leading-6 text-muted">
              {panel.emptyMessage}{" "}
              <Link
                href={panel.settingsHref}
                className="font-semibold text-accent hover:underline"
              >
                Gérer les modèles de planning
              </Link>
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-border rounded-xl border">
              {panel.models.map((model) => (
                <ModelCard
                  key={model.publicKey}
                  model={model}
                  action={actionsByPublicKey[model.publicKey] ?? null}
                  onSuccess={setConfirmation}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
