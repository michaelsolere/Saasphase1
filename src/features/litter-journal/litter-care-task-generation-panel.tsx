"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useId, useState } from "react";
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
  formatLitterCareTaskOffset,
  litterCareTaskAnchorLabels,
  litterCareTaskCategoryLabels,
  litterCareTaskTargetLabels,
} from "./litter-care-task-labels";
import type { GenerateLitterCareTasksActionState } from "./litter-care-tasks-actions";
import type {
  LitterCareTaskGenerationState,
  LitterCareTaskTemplateSummary,
} from "./litter-care-tasks";

type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type LitterCareTaskGenerationPanelEntry = {
  template: Pick<
    LitterCareTaskTemplateSummary,
    "id" | "title" | "category" | "targetScope" | "anchorType" | "offsetDays"
  >;
  state: LitterCareTaskGenerationState;
  plannedFor: string | null;
};

type GenerationAction = (
  previousState: GenerateLitterCareTasksActionState,
  formData: FormData,
) => Promise<GenerateLitterCareTasksActionState>;

const initialState: GenerateLitterCareTasksActionState = { status: "idle" };

const stateLabels: Record<LitterCareTaskGenerationState, string> = {
  ready: "Prêt à générer",
  already_generated: "Déjà créé",
  missing_anchor: "Date de référence manquante",
  inactive: "Modèle inactif",
  species_mismatch: "Espèce non applicable",
  breed_mismatch: "Race non applicable",
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

function stateExplanation(entry: LitterCareTaskGenerationPanelEntry) {
  switch (entry.state) {
    case "ready":
      return entry.plannedFor
        ? `Date prévue : ${formatCivilDate(entry.plannedFor)}`
        : "La date prévue n’est pas disponible.";
    case "already_generated":
      return "Une tâche issue de ce modèle existe déjà pour cette portée.";
    case "missing_anchor":
      return `La date « ${litterCareTaskAnchorLabels[entry.template.anchorType]} » n’est pas renseignée pour cette portée.`;
    case "inactive":
      return "Ce modèle est désactivé dans les paramètres.";
    case "species_mismatch":
      return "L’espèce de ce modèle ne correspond pas à celle de la portée.";
    case "breed_mismatch":
      return "La race de ce modèle ne correspond pas à celle de la portée.";
  }
}

function TemplateMetadata({
  entry,
}: {
  entry: LitterCareTaskGenerationPanelEntry;
}) {
  return (
    <>
      <p className="mt-2 text-sm text-muted">
        {litterCareTaskCategoryLabels[entry.template.category]} ·{" "}
        {litterCareTaskTargetLabels[entry.template.targetScope]}
      </p>
      <p className="mt-1 text-sm text-muted">
        {litterCareTaskAnchorLabels[entry.template.anchorType]} ·{" "}
        {formatLitterCareTaskOffset(
          entry.template.anchorType,
          entry.template.offsetDays,
        )}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {stateExplanation(entry)}
      </p>
    </>
  );
}

function GenerateSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Création..." : "Créer les tâches sélectionnées"}
    </Button>
  );
}

function GenerationDialog({
  entries,
  action,
  onSuccess,
}: {
  entries: LitterCareTaskGenerationPanelEntry[];
  action: GenerationAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const checkboxIdPrefix = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"selection" | "confirmation">(
    "selection",
  );
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const readyEntries = entries.filter(
    (entry) => entry.state === "ready" && entry.plannedFor,
  );
  const selectedTemplateIdSet = new Set(selectedTemplateIds);
  const selectedEntries = readyEntries.filter((entry) =>
    selectedTemplateIdSet.has(entry.template.id),
  );
  const submitAction = useCallback(
    async (
      previousState: GenerateLitterCareTasksActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        setStep("selection");
        setSelectedTemplateIds([]);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(submitAction, initialState);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("selection");
      setSelectedTemplateIds([]);
    }
  }

  function toggleTemplate(templateId: string) {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );
  }

  function toggleAll() {
    setSelectedTemplateIds((current) =>
      current.length === readyEntries.length
        ? []
        : readyEntries.map((entry) => entry.template.id),
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Sélectionner des tâches
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
          {step === "selection" ? (
            <>
              <DialogHeader>
                <DialogTitle>Sélectionner les tâches applicables</DialogTitle>
                <DialogDescription>
                  Aucune tâche n’est sélectionnée par défaut. Choisissez seulement
                  les jalons à créer maintenant.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted">
                    {selectedEntries.length} sélectionnée
                    {selectedEntries.length > 1 ? "s" : ""}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleAll}
                  >
                    {selectedTemplateIds.length === readyEntries.length
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </Button>
                </div>
                <ul className="divide-y divide-border rounded-xl border">
                  {readyEntries.map((entry, index) => {
                    const checkboxId = `${checkboxIdPrefix}-${index}`;
                    return (
                      <li key={entry.template.id} className="p-4">
                        <label
                          htmlFor={checkboxId}
                          className="flex cursor-pointer items-start gap-3"
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            className="mt-1 size-4 accent-[var(--accent)]"
                            checked={selectedTemplateIdSet.has(entry.template.id)}
                            onChange={() => toggleTemplate(entry.template.id)}
                          />
                          <span className="min-w-0">
                            <span className="block break-words font-semibold">
                              {entry.template.title}
                            </span>
                            <span className="mt-1 block text-sm text-muted">
                              Prévue le {formatCivilDate(entry.plannedFor!)}
                            </span>
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
                  disabled={selectedEntries.length === 0}
                  onClick={() => setStep("confirmation")}
                >
                  Continuer
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirmer la création</DialogTitle>
                <DialogDescription>
                  {selectedEntries.length} tâche
                  {selectedEntries.length > 1 ? "s" : ""}{" "}
                  {selectedEntries.length > 1 ? "seront" : "sera"} créée
                  {selectedEntries.length > 1 ? "s" : ""}.
                </DialogDescription>
              </DialogHeader>
              <ul className="divide-y divide-border rounded-xl border">
                {selectedEntries.map((entry) => (
                  <li key={entry.template.id} className="p-4">
                    <p className="break-words font-semibold">
                      {entry.template.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Prévue le {formatCivilDate(entry.plannedFor!)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-6 text-muted">
                Les tâches existantes ne seront ni déplacées ni recalculées.
              </p>
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="confirmation" value="confirmed" />
                {selectedEntries.map((entry) => (
                  <input
                    key={entry.template.id}
                    type="hidden"
                    name="template_id"
                    value={entry.template.id}
                  />
                ))}
                {state.status === "error" && state.message ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                  >
                    {state.message}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("selection")}
                  >
                    Retour
                  </Button>
                  <GenerateSubmitButton />
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LitterCareTaskGenerationPanel({
  entries,
  role,
  action,
  loadError = false,
}: {
  entries: LitterCareTaskGenerationPanelEntry[];
  role: OrganizationRole | null;
  action: GenerationAction | null;
  loadError?: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";
  const readyEntries = entries.filter((entry) => entry.state === "ready");

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">Jalons issus des modèles</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Consultez le plan préparé pour cette portée et créez seulement les
            tâches utiles.
          </p>
        </div>
        {!loadError && canWrite && action && readyEntries.length > 0 ? (
          <GenerationDialog
            entries={entries}
            action={action}
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
          Le plan des modèles n’est pas disponible pour le moment. Les autres
          sections du Journal restent consultables.
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-muted">
          Aucun modèle de jalon n’est configuré.{" "}
          <Link
            href="/settings/litter-care-task-templates"
            className="font-semibold text-accent hover:underline"
          >
            Gérer les modèles
          </Link>
        </p>
      ) : (
        <>
          {readyEntries.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed px-4 py-3 text-sm text-muted">
              Aucun modèle n’est actuellement applicable à cette portée.
            </p>
          ) : null}
          <ul className="mt-5 divide-y divide-border rounded-xl border">
            {entries.map((entry) => (
              <li key={entry.template.id} className="min-w-0 p-4 sm:p-5">
                <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {entry.template.title}
                    </p>
                    <TemplateMetadata entry={entry} />
                  </div>
                  <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold">
                    {stateLabels[entry.state]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
