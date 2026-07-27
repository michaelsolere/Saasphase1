"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState } from "react";
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
import { LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE } from "@/features/settings/litter-planning-model-labels";
import type { LitterPlanningModelOrganizationCard } from "@/features/settings/litter-planning-models-presentation";

import type { LitterPlanningModelActiveActionState } from "./litter-planning-models-actions";

const initialActionState: LitterPlanningModelActiveActionState = {
  status: "idle",
};

export type LitterPlanningModelActiveAction = (
  previousState: LitterPlanningModelActiveActionState,
  formData: FormData,
) => Promise<LitterPlanningModelActiveActionState>;

export type LitterPlanningModelWriteActions = {
  model: LitterPlanningModelOrganizationCard;
  activeAction: LitterPlanningModelActiveAction;
};

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function LitterPlanningModelActiveControl({
  model,
  action,
}: {
  model: LitterPlanningModelOrganizationCard;
  action: LitterPlanningModelActiveAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const submitAction = useCallback(
    async (
      previousState: LitterPlanningModelActiveActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        setOpen(false);
        setStatusMessage(nextState.message ?? null);
        router.refresh();
      } else if (nextState.code === "stale_revision") {
        setStatusMessage(nextState.message ?? null);
        router.refresh();
      }
      return nextState;
    },
    [action, router],
  );
  const [state, formAction] = useActionState(submitAction, initialActionState);

  if (!model.isActive) {
    return (
      <div className="space-y-2">
        {statusMessage || (state.status !== "idle" && state.message) ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className="text-sm"
          >
            {statusMessage ?? state.message}
          </p>
        ) : null}
        <form action={formAction}>
          <SubmitButton label="Réactiver" pendingLabel="Activation..." />
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {statusMessage || (state.status === "error" && state.message) ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="text-sm"
        >
          {statusMessage ?? state.message}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Désactiver
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Désactiver ce modèle ?</DialogTitle>
            <DialogDescription>
              Le modèle restera consultable dans « Mes modèles », mais ne pourra
              plus être choisi pour les prochaines portées.{" "}
              {LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            {state.status === "error" && state.message ? (
              <p
                role="alert"
                className="rounded-xl border bg-surface p-3 text-sm"
              >
                {state.message}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton label="Désactiver" pendingLabel="Désactivation..." />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrganizationModelCard({
  model,
  actions,
}: {
  model: LitterPlanningModelOrganizationCard;
  actions?: LitterPlanningModelWriteActions;
}) {
  const metadata = [
    ["Statut", model.statusLabel],
    ["Espèce", model.speciesLabel],
    ["Race", model.breedLabel],
    ["Révision", String(model.revision)],
    ["Éléments", String(model.itemCount)],
    ["Origine", model.originLabel],
  ] as const;

  return (
    <li
      className="min-w-0 rounded-2xl border bg-surface p-5 sm:p-6"
      data-organization-model={model.id}
    >
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-semibold">{model.title}</h3>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {model.statusLabel}
            </span>
          </div>
          {model.libraryOriginDetail ? (
            <p className="mt-2 text-xs font-medium text-muted">
              {model.libraryOriginDetail}
            </p>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
            {model.description || "Aucune description."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/settings/litter-planning-models/${model.id}`}>
              Ouvrir la fiche
            </Link>
          </Button>
          {actions ? (
            <LitterPlanningModelActiveControl
              model={model}
              action={actions.activeAction}
            />
          ) : null}
        </div>
      </div>
      <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {metadata.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border bg-background p-3">
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

export function LitterPlanningModelsManager({
  models,
  modelActions,
  canManage,
}: {
  models: LitterPlanningModelOrganizationCard[];
  modelActions: LitterPlanningModelWriteActions[];
  canManage: boolean;
}) {
  const activeModels = models.filter((model) => model.isActive);
  const inactiveModels = models.filter((model) => !model.isActive);
  const actionsByModel = new Map(
    modelActions.map((actions) => [actions.model.id, actions]),
  );

  return (
    <div className="mt-8 min-w-0 space-y-10">
      {!canManage ? (
        <p className="rounded-xl border bg-surface px-4 py-3 text-sm text-muted">
          Votre rôle permet de consulter ces modèles, mais pas de les importer
          ni de les activer ou désactiver.
        </p>
      ) : null}

      {models.length === 0 ? (
        <p className="rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
          Aucun modèle n’est encore disponible dans votre organisation.
        </p>
      ) : null}

      <section aria-labelledby="active-planning-models-heading">
        <h3 id="active-planning-models-heading" className="text-xl font-semibold">
          Modèles actifs
        </h3>
        {activeModels.length === 0 ? (
          <p className="mt-4 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
            Aucun modèle de planning actif.
          </p>
        ) : (
          <ul className="mt-4 grid min-w-0 gap-4">
            {activeModels.map((model) => (
              <OrganizationModelCard
                key={model.id}
                model={model}
                actions={actionsByModel.get(model.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inactive-planning-models-heading">
        <h3
          id="inactive-planning-models-heading"
          className="text-xl font-semibold"
        >
          Modèles inactifs
        </h3>
        {inactiveModels.length === 0 ? (
          <p className="mt-4 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
            Aucun modèle de planning inactif.
          </p>
        ) : (
          <ul className="mt-4 grid min-w-0 gap-4">
            {inactiveModels.map((model) => (
              <OrganizationModelCard
                key={model.id}
                model={model}
                actions={actionsByModel.get(model.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function LitterPlanningModelsOrganizationUnavailable() {
  return (
    <div
      role="alert"
      className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-amber-950"
    >
      <p className="font-semibold">
        Les modèles de votre organisation ne sont pas disponibles pour le
        moment.
      </p>
      <p className="mt-2 text-sm">
        Vous pouvez continuer à consulter la bibliothèque recommandée si elle
        est disponible.
      </p>
    </div>
  );
}
