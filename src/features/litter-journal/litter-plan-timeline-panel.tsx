import { formatLitterDate } from "@/features/litters/formatters";

import type {
  LitterPlanTimeline,
  LitterPlanTimelineCategory,
  LitterPlanTimelinePoint,
  LitterPlanTimelineWindow,
} from "./litter-plan-timeline";

function categoryLabel(category: LitterPlanTimelineCategory["category"]) {
  return category.replaceAll("_", " ");
}

function dateLabel(date: string | null) {
  return date ? formatLitterDate(date) : "Date non renseignée";
}

function Point({ item }: { item: LitterPlanTimelinePoint }) {
  const type = item.kind === "milestone" ? "Jalon" : "Tâche";
  const symbol = item.kind === "milestone" ? "●" : "◇";
  return (
    <li className="relative min-w-44 px-3 pb-3 pt-8" aria-label={`${type} : ${item.title}`}>
      <span aria-hidden="true" className="absolute left-3 top-2 text-lg font-bold">{symbol}</span>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{type}</p>
      <p className="mt-1 text-sm font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-muted">{dateLabel(item.date)}</p>
    </li>
  );
}

function Window({ item }: { item: LitterPlanTimelineWindow }) {
  return (
    <li className="min-w-64 px-3 pb-3 pt-3" aria-label={`Fenêtre : ${item.title}`}>
      <div className="rounded-md border border-current px-3 py-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide">Fenêtre</p>
        <p className="mt-1 font-medium">{item.title}</p>
        <p className="mt-1 text-xs">Du {dateLabel(item.startsOn)} au {dateLabel(item.endsOn)}</p>
      </div>
    </li>
  );
}

function Category({ category }: { category: LitterPlanTimelineCategory }) {
  return (
    <section>
      <h3 className="text-sm font-semibold capitalize">{categoryLabel(category.category)}</h3>
      <div className="mt-3 overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start divide-x rounded-lg border bg-background">
          {category.items.map((item) =>
            item.kind === "window" ? <Window key={item.id} item={item} /> : <Point key={item.id} item={item} />,
          )}
        </ol>
      </div>
    </section>
  );
}

export function LitterPlanTimelinePanel({ timeline }: { timeline: LitterPlanTimeline | null }) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6" aria-labelledby="litter-plan-timeline-title">
      <h2 id="litter-plan-timeline-title" className="text-lg font-semibold">Planning de la portée</h2>
      {timeline ? (
        <>
          <p className="mt-1 text-sm text-muted">{timeline.title}</p>
          <div className="mt-5 space-y-5">
            {timeline.categories.map((category) => <Category key={category.category} category={category} />)}
            {timeline.pendingAnchorItems.length > 0 ? (
              <section className="rounded-lg border border-dashed p-4">
                <h3 className="text-sm font-semibold">En attente d’une date de référence</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {timeline.pendingAnchorItems.map((item) => (
                    <li key={item.id}><span className="font-medium">{item.kind === "window" ? "Fenêtre" : item.kind === "milestone" ? "Jalon" : "Tâche"}</span> · {item.title}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucun planning n’a encore été appliqué à cette portée.</p>
      )}
    </section>
  );
}
