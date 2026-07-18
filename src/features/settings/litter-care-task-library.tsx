"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useMemo, useState } from "react";

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
  formatLitterCareTaskOffset,
  litterCareTaskAnchorLabels,
  litterCareTaskCategoryLabels,
  litterCareTaskSpeciesLabels,
  litterCareTaskTargetLabels,
} from "@/features/litter-journal/litter-care-task-labels";
import type {
  LitterCareTaskLibraryPackSummary,
  LitterCareTaskLibraryTemplateSummary,
} from "@/features/litter-journal/litter-care-tasks";

import type { LitterCareTaskLibraryImportActionState } from "./litter-care-task-templates-actions";

const initialActionState: LitterCareTaskLibraryImportActionState = {
  status: "idle",
};

export type LitterCareTaskLibraryImportAction = (
  previousState: LitterCareTaskLibraryImportActionState,
  formData: FormData,
) => Promise<LitterCareTaskLibraryImportActionState>;

function selectionKey(template: LitterCareTaskLibraryTemplateSummary) {
  return `${template.code}:${template.version}`;
}

function importStatus(template: LitterCareTaskLibraryTemplateSummary) {
  if (template.isImported) {
    return template.organizationTemplateIsActive
      ? "Importé · actif"
      : "Importé · inactif";
  }
  if (
    template.latestImportedVersion &&
    template.latestImportedVersion.version < template.version
  ) {
    return "Nouvelle version disponible";
  }
  return "Disponible";
}

function LibraryTemplateCard({
  template,
  selected,
  onSelectedChange,
}: {
  template: LitterCareTaskLibraryTemplateSummary;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const metadata = [
    ["Catégorie", litterCareTaskCategoryLabels[template.category]],
    ["Cible", litterCareTaskTargetLabels[template.targetScope]],
    ["Repère chronologique", litterCareTaskAnchorLabels[template.anchorType]],
    [
      "Décalage",
      formatLitterCareTaskOffset(template.anchorType, template.offsetDays),
    ],
    ["Espèce", litterCareTaskSpeciesLabels[template.species]],
    ["Race", template.breed ?? "Toutes les races"],
    ["Version disponible", String(template.version)],
  ] as const;
  const selectable = !template.isImported && Boolean(onSelectedChange);

  return (
    <li
      className="min-w-0 rounded-2xl border bg-background p-5"
      data-library-template={selectionKey(template)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {selectable ? (
          <input
            aria-label={`Sélectionner ${template.title}, version ${template.version}`}
            className="mt-1 size-4 shrink-0 accent-accent"
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-base font-semibold">
              {template.title}
            </h4>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {importStatus(template)}
            </span>
          </div>
          {template.latestImportedVersion && !template.isImported ? (
            <p className="mt-2 text-xs font-medium text-muted">
              Dernière version importée : {template.latestImportedVersion.version}
            </p>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
            {template.description || "Aucune description."}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {metadata.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border bg-surface p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function LitterCareTaskLibrary({
  packs,
  templates,
  importAction,
}: {
  packs: LitterCareTaskLibraryPackSummary[];
  templates: LitterCareTaskLibraryTemplateSummary[];
  importAction: LitterCareTaskLibraryImportAction | null;
}) {
  const router = useRouter();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isActive, setIsActive] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const templatesByKey = useMemo(
    () => new Map(templates.map((template) => [selectionKey(template), template])),
    [templates],
  );
  const selectableKeys = useMemo(
    () => templates.filter((template) => !template.isImported).map(selectionKey),
    [templates],
  );
  const selectedTemplates = Array.from(selectedKeys)
    .map((key) => templatesByKey.get(key))
    .filter(
      (template): template is LitterCareTaskLibraryTemplateSummary =>
        Boolean(template),
    );
  const submitAction = useCallback(
    async (
      previousState: LitterCareTaskLibraryImportActionState,
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
    <section aria-labelledby="recommended-library-heading" className="mt-8 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="recommended-library-heading" className="text-2xl font-semibold">
            Bibliothèque recommandée
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Parcourez les jalons proposés et choisissez explicitement les copies à
            ajouter à votre organisation.
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
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">Statut initial des copies</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border bg-background p-4 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="library_activation_choice"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                  />
                  Importer comme modèles actifs
                </span>
                <span className="mt-2 block leading-6 text-muted">
                  Disponibles immédiatement dans le plan du Journal.
                </span>
              </label>
              <label className="rounded-xl border bg-background p-4 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="library_activation_choice"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                  />
                  Importer comme modèles inactifs
                </span>
                <span className="mt-2 block leading-6 text-muted">
                  Importés dans « Mes modèles », mais ignorés par le plan tant
                  qu’ils ne sont pas réactivés.
                </span>
              </label>
            </div>
            <p className="mt-3 text-sm text-muted">Ce choix ne crée aucune tâche.</p>
          </fieldset>
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

      <div className="mt-6 space-y-8">
        {packs.map((pack) => {
          const packTemplates = templates.filter(
            (template) => template.packCode === pack.code,
          );
          return (
            <section
              key={pack.code}
              aria-labelledby={`library-pack-${pack.code}`}
              className="rounded-2xl border bg-surface p-5 sm:p-6"
              data-library-pack={pack.code}
            >
              <h3 id={`library-pack-${pack.code}`} className="text-xl font-semibold">
                {pack.title}
              </h3>
              {pack.description ? (
                <p className="mt-2 text-sm leading-6 text-muted">{pack.description}</p>
              ) : null}
              <ul className="mt-5 grid min-w-0 gap-4">
                {packTemplates.map((template) => (
                  <LibraryTemplateCard
                    key={selectionKey(template)}
                    template={template}
                    selected={selectedKeys.has(selectionKey(template))}
                    onSelectedChange={
                      importAction && !template.isImported
                        ? (selected) => setSelected(selectionKey(template), selected)
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {importAction ? (
        <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Confirmer l’import des modèles</DialogTitle>
              <DialogDescription>
                {selectedTemplates.length} modèle{selectedTemplates.length > 1 ? "s" : ""}
                {selectedTemplates.length > 1 ? " seront" : " sera"} importé
                {selectedTemplates.length > 1 ? "s" : ""} comme modèle
                {selectedTemplates.length > 1 ? "s" : ""} {isActive ? "actif" : "inactif"}
                {selectedTemplates.length > 1 ? "s" : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {packs.map((pack) => {
                const selectedForPack = selectedTemplates.filter(
                  (template) => template.packCode === pack.code,
                );
                if (selectedForPack.length === 0) return null;
                return (
                  <section key={pack.code} className="rounded-xl border p-4">
                    <h3 className="font-semibold">{pack.title}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {selectedForPack.map((template) => (
                        <li key={selectionKey(template)}>
                          {template.title} · version {template.version}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              <p className="rounded-xl border bg-surface p-4 text-sm leading-6">
                L’import créera des copies indépendantes dans « Mes modèles ». Il ne
                créera aucune tâche et une future mise à jour de la bibliothèque ne
                modifiera pas ces copies.
              </p>
            </div>
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="confirmation" value="confirmed" />
              <input type="hidden" name="is_active" value={String(isActive)} />
              {selectedTemplates.map((template) => (
                <input
                  key={selectionKey(template)}
                  type="hidden"
                  name="selection"
                  value={selectionKey(template)}
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
                <Button type="submit" disabled={isPending || selectedTemplates.length === 0}>
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

export function LitterCareTaskLibraryUnavailable() {
  return (
    <section aria-labelledby="recommended-library-heading" className="mt-8">
      <h2 id="recommended-library-heading" className="text-2xl font-semibold">
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
          Vous pouvez continuer à consulter et gérer « Mes modèles ».
        </p>
      </div>
    </section>
  );
}
