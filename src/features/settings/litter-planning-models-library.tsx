"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE,
  LITTER_PLANNING_MODELS_NEWER_VERSION_MESSAGE,
} from "@/features/settings/litter-planning-model-labels";
import type { LitterPlanningModelLibraryCard } from "@/features/settings/litter-planning-models-presentation";

import type { LitterPlanningModelLibraryImportActionState } from "./litter-planning-models-actions";

const initialActionState: LitterPlanningModelLibraryImportActionState = {
  status: "idle",
};

export type LitterPlanningModelLibraryImportAction = (
  previousState: LitterPlanningModelLibraryImportActionState,
  formData: FormData,
) => Promise<LitterPlanningModelLibraryImportActionState>;

function ItemDetailsList({
  model,
}: {
  model: LitterPlanningModelLibraryCard;
}) {
  return (
    <ol className="space-y-3">
      {model.items.map((item) => (
        <li
          key={item.key}
          className="rounded-xl border bg-background p-4 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.title}</p>
            <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
              {item.kindLabel}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Catégorie
              </dt>
              <dd className="mt-1 font-medium">{item.categoryLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Cible
              </dt>
              <dd className="mt-1 font-medium">{item.targetLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Ancrage
              </dt>
              <dd className="mt-1 font-medium">{item.anchorLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Règle temporelle
              </dt>
              <dd className="mt-1 font-medium">{item.scheduleLabel}</dd>
            </div>
            {item.timeLabel ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Heure ou créneaux
                </dt>
                <dd className="mt-1 font-medium">{item.timeLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Priorité
              </dt>
              <dd className="mt-1 font-medium">{item.priorityLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Obligation
              </dt>
              <dd className="mt-1 font-medium">{item.requiredLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Sélection
              </dt>
              <dd className="mt-1 font-medium">{item.selectedByDefaultLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Validation automatique par le Journal
              </dt>
              <dd className="mt-1 font-medium">{item.journalCompletionLabel}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function LibraryModelCard({
  model,
  selected,
  onSelectedChange,
}: {
  model: LitterPlanningModelLibraryCard;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const metadata = [
    ["Espèce", model.speciesLabel],
    ["Race", model.breedLabel],
    ["Famille", model.familyLabel],
    ["Variante", model.variantLabel],
    ["Version", String(model.version)],
    ["Éléments", String(model.itemCount)],
  ] as const;

  return (
    <li
      className="min-w-0 rounded-2xl border bg-background p-5"
      data-library-model={model.selectionKey}
    >
      <div className="flex min-w-0 items-start gap-3">
        {model.isSelectable && onSelectedChange ? (
          <input
            aria-label={`Sélectionner ${model.title}, version ${model.version}`}
            className="mt-1 size-4 shrink-0 accent-accent"
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-base font-semibold">{model.title}</h4>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {model.importStatusLabel}
            </span>
          </div>
          {model.importStatus === "newer_version_available" ? (
            <p className="mt-2 text-xs font-medium leading-5 text-muted">
              Dernière version importée : {model.latestImportedVersion}.{" "}
              {LITTER_PLANNING_MODELS_NEWER_VERSION_MESSAGE}
            </p>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
            {model.description || "Aucune description."}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {metadata.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border bg-surface p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="text-sm font-semibold">Contenu synthétique</p>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {model.contentPreview.map((item) => (
            <li key={`${item.title}-${item.scheduleLabel}`}>
              <span className="font-medium text-foreground">{item.title}</span>
              {" · "}
              {item.kindLabel}
              {" · "}
              {item.scheduleLabel}
            </li>
          ))}
          {model.itemCount > model.contentPreview.length ? (
            <li>
              et {model.itemCount - model.contentPreview.length} autre
              {model.itemCount - model.contentPreview.length > 1 ? "s" : ""}{" "}
              élément
              {model.itemCount - model.contentPreview.length > 1 ? "s" : ""}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen(true)}
        >
          Voir le détail des éléments
        </Button>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {model.title} · version {model.version}
            </DialogTitle>
            <DialogDescription>
              Contenu du modèle recommandé, dans l’ordre défini.
            </DialogDescription>
          </DialogHeader>
          <div id={detailsId}>
            <ItemDetailsList model={model} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Fermer
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function LitterPlanningModelsLibrary({
  models,
  importAction,
}: {
  models: LitterPlanningModelLibraryCard[];
  importAction: LitterPlanningModelLibraryImportAction | null;
}) {
  const router = useRouter();
  const activateId = useId();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activateImported, setActivateImported] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const modelsByKey = useMemo(
    () => new Map(models.map((model) => [model.selectionKey, model])),
    [models],
  );
  const selectableKeys = useMemo(
    () => models.filter((model) => model.isSelectable).map((model) => model.selectionKey),
    [models],
  );
  const selectedModels = Array.from(selectedKeys)
    .map((key) => modelsByKey.get(key))
    .filter((model): model is LitterPlanningModelLibraryCard => Boolean(model));
  const allImported =
    models.length > 0 && models.every((model) => model.importStatus === "imported");

  const submitAction = useCallback(
    async (
      previousState: LitterPlanningModelLibraryImportActionState,
      formData: FormData,
    ) => {
      if (!importAction) return previousState;
      const nextState = await importAction(previousState, formData);
      if (nextState.status === "success") {
        setSelectedKeys(new Set());
        setConfirmationOpen(false);
        router.refresh();
      }
      return nextState;
    },
    [importAction, router],
  );
  const [state, formAction, isPending] = useActionState(
    submitAction,
    initialActionState,
  );

  function setSelected(key: string, selected: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <section aria-labelledby="recommended-planning-library-heading" className="mt-8 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="recommended-planning-library-heading"
            className="text-2xl font-semibold"
          >
            Bibliothèque recommandée
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Consultez les modèles recommandés, vérifiez leur contenu, puis
            importez explicitement ceux à rendre disponibles pour les prochaines
            portées.
          </p>
        </div>
        {importAction ? (
          <p aria-live="polite" className="text-sm font-semibold">
            {selectedKeys.size} sélectionné{selectedKeys.size > 1 ? "s" : ""}
          </p>
        ) : null}
      </div>

      {importAction ? (
        <div className="mt-5 rounded-2xl border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                selectableKeys.length === 0 ||
                selectedKeys.size === selectableKeys.length
              }
              onClick={() => setSelectedKeys(new Set(selectableKeys))}
            >
              Tout sélectionner
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedKeys.size === 0}
              onClick={() => setSelectedKeys(new Set())}
            >
              Tout désélectionner
            </Button>
          </div>
          <label
            htmlFor={activateId}
            className="mt-5 flex items-start gap-3 rounded-xl border bg-background p-4 text-sm"
          >
            <input
              id={activateId}
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-accent"
              checked={activateImported}
              onChange={(event) => setActivateImported(event.target.checked)}
            />
            <span>
              <span className="font-semibold">Activer les modèles importés</span>
              <span className="mt-1 block leading-6 text-muted">
                Option cochée par défaut. Les modèles restent disponibles pour
                les prochaines portées sans modifier les plannings existants.
              </span>
            </span>
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {state.status === "success" && state.message ? (
              <p role="status" className="text-sm font-medium text-foreground">
                {state.message}
              </p>
            ) : (
              <span />
            )}
            <Button
              type="button"
              disabled={selectedKeys.size === 0}
              onClick={() => setConfirmationOpen(true)}
            >
              Vérifier l’import
            </Button>
          </div>
        </div>
      ) : null}

      {models.length === 0 ? (
        <p className="mt-6 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
          Aucun modèle recommandé n’est disponible pour le moment.
        </p>
      ) : allImported ? (
        <p className="mt-6 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
          Tous les modèles recommandés disponibles sont déjà importés.
        </p>
      ) : null}

      <ul className="mt-6 grid min-w-0 gap-4">
        {models.map((model) => (
          <LibraryModelCard
            key={model.selectionKey}
            model={model}
            selected={selectedKeys.has(model.selectionKey)}
            onSelectedChange={
              importAction && model.isSelectable
                ? (selected) => setSelected(model.selectionKey, selected)
                : undefined
            }
          />
        ))}
      </ul>

      {importAction ? (
        <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Confirmer l’import des modèles</DialogTitle>
              <DialogDescription>
                {selectedModels.length} modèle
                {selectedModels.length > 1 ? "s" : ""}
                {selectedModels.length > 1 ? " seront" : " sera"} importé
                {selectedModels.length > 1 ? "s" : ""}
                {activateImported ? " et activé" : " comme inactif"}
                {selectedModels.length > 1 ? "s" : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {selectedModels.map((model) => (
                  <li key={model.selectionKey}>
                    {model.title} · version {model.version}
                    {model.importStatus === "newer_version_available"
                      ? " · nouvelle version"
                      : ""}
                  </li>
                ))}
              </ul>
              {selectedModels.some(
                (model) => model.importStatus === "newer_version_available",
              ) ? (
                <p className="rounded-xl border bg-surface p-4 text-sm leading-6">
                  {LITTER_PLANNING_MODELS_NEWER_VERSION_MESSAGE}
                </p>
              ) : null}
              <p className="rounded-xl border bg-surface p-4 text-sm leading-6">
                {LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE}
              </p>
            </div>
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="confirmation" value="confirmed" />
              <input
                type="hidden"
                name="is_active"
                value={String(activateImported)}
              />
              {selectedModels.map((model) => (
                <input
                  key={model.selectionKey}
                  type="hidden"
                  name="selection"
                  value={model.selectionKey}
                />
              ))}
              {state.status === "error" && state.message ? (
                <p role="alert" className="rounded-xl border bg-surface p-3 text-sm">
                  {state.message}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    Annuler
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={isPending || selectedModels.length === 0}
                >
                  {isPending
                    ? "Import en cours..."
                    : "Importer les modèles sélectionnés"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

export function LitterPlanningModelsLibraryUnavailable() {
  return (
    <section
      aria-labelledby="recommended-planning-library-heading"
      className="mt-8"
    >
      <h2
        id="recommended-planning-library-heading"
        className="text-2xl font-semibold"
      >
        Bibliothèque recommandée
      </h2>
      <div
        role="alert"
        className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-amber-950"
      >
        <p className="font-semibold">
          La bibliothèque recommandée n’est pas disponible pour le moment.
        </p>
        <p className="mt-2 text-sm">
          Vous pouvez continuer à consulter « Mes modèles ».
        </p>
      </div>
    </section>
  );
}
