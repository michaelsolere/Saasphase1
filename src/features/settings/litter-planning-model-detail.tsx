import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LitterPlanningModelDuplicateButton } from "@/features/settings/litter-planning-model-duplicate-button";
import {
  LitterPlanningModelActiveControl,
  type LitterPlanningModelWriteActions,
} from "@/features/settings/litter-planning-models-manager";
import type { LitterPlanningModelDetailPresentation } from "@/features/settings/litter-planning-models-presentation";

function DetailItemCard({
  item,
}: {
  item: LitterPlanningModelDetailPresentation["items"][number];
}) {
  const metadata = [
    ["Type", item.kindLabel],
    ["Catégorie", item.categoryLabel],
    ["Cible", item.targetLabel],
    ["Ancrage", item.anchorLabel],
    ["Règle temporelle", item.scheduleLabel],
    ...(item.timeLabel
      ? ([["Heure ou créneaux", item.timeLabel]] as const)
      : []),
    ["Priorité", item.priorityLabel],
    ["Obligation", item.requiredLabel],
    ["Sélection", item.selectedByDefaultLabel],
    ["Validation automatique par le Journal", item.journalCompletionLabel],
  ] as const;

  return (
    <li className="min-w-0 rounded-2xl border bg-surface p-5">
      <h3 className="break-words text-lg font-semibold">{item.title}</h3>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
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

export function LitterPlanningModelDetailView({
  model,
  writeActions,
}: {
  model: LitterPlanningModelDetailPresentation;
  writeActions: LitterPlanningModelWriteActions | null;
}) {
  const summary = [
    ["Statut", model.statusLabel],
    ["Espèce", model.speciesLabel],
    ["Race", model.breedLabel],
    ["Révision", String(model.revision)],
    ["Origine", model.originLabel],
    ["Éléments", String(model.items.length)],
  ] as const;

  const organizationCard = {
    id: model.id,
    title: model.title,
    description: model.description,
    isActive: model.isActive,
    statusLabel: model.statusLabel,
    speciesLabel: model.speciesLabel,
    breedLabel: model.breedLabel,
    revision: model.revision,
    itemCount: model.items.length,
    originLabel: model.originLabel,
    libraryOriginDetail: model.libraryOriginDetail,
    isLibraryImport: model.isLibraryImport,
    canEditDirectly: model.canEditDirectly,
  };

  return (
    <div className="mt-8 space-y-10">
      <section
        aria-labelledby="planning-model-summary-heading"
        className="rounded-2xl border bg-surface p-5 sm:p-6"
        data-organization-model={model.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="planning-model-summary-heading"
                className="break-words text-2xl font-semibold"
              >
                {model.title}
              </h2>
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
          {writeActions ? (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {model.canEditDirectly ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/settings/litter-planning-models/${model.id}/edit`}>
                    Modifier
                  </Link>
                </Button>
              ) : null}
              <LitterPlanningModelDuplicateButton
                action={writeActions.duplicateAction}
              />
              <LitterPlanningModelActiveControl
                model={organizationCard}
                action={writeActions.activeAction}
              />
            </div>
          ) : null}
        </div>
        <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {summary.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl border bg-background p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                {label}
              </dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="planning-model-items-heading">
        <h2 id="planning-model-items-heading" className="text-2xl font-semibold">
          Éléments du modèle
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ordre défini dans le modèle. Les titres affichés sont ceux des jalons
          ou tâches élémentaires, jamais leur seul identifiant technique.
        </p>
        {model.items.length === 0 ? (
          <p className="mt-4 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
            Ce modèle ne contient aucun élément.
          </p>
        ) : (
          <ol className="mt-4 grid min-w-0 gap-4">
            {model.items.map((item) => (
              <DetailItemCard key={item.key} item={item} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
