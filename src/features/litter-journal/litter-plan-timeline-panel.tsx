import { formatLitterDate } from "@/features/litters/formatters";

import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import type {
  LitterPlanTimeline,
  LitterPlanTimelineGeometry,
  LitterPlanTimelineScheduledItem,
} from "./litter-plan-timeline";
import { buildLitterPlanTimelineGeometry, getLitterPlanTimelinePanelState } from "./litter-plan-timeline";

function dateLabel(date: string | null) {
  return date ? formatLitterDate(date) : "Date non renseignée";
}

function Point({ item }: { item: Exclude<LitterPlanTimelineScheduledItem, { kind: "window" }> }) {
  const type = item.kind === "milestone" ? "Jalon" : "Tâche";
  const symbol = item.kind === "milestone" ? "●" : "◇";
  return (
    <li className="absolute top-3 w-40 -translate-x-1/2" style={{ left: `${item.startPercent}%` }} aria-label={`${type} : ${item.title}`}>
      <span aria-hidden="true" className="block text-center text-lg font-bold">{symbol}</span>
      <div className="mt-1 rounded border bg-surface px-2 py-1.5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{type}</p>
        <p className="mt-1 text-sm font-medium">{item.title}</p>
        <p className="mt-1 text-xs text-muted">{dateLabel(item.startsOn)}</p>
      </div>
    </li>
  );
}

function Window({ item }: { item: Extract<LitterPlanTimelineScheduledItem, { kind: "window" }> }) {
  const width = item.endPercent - item.startPercent;
  return (
    <li className="absolute top-4 h-16 border-l" style={{ left: `${item.startPercent}%`, width: `${width}%` }} aria-label={`Fenêtre : ${item.title}`}>
      <div className="absolute inset-y-0 left-0 min-w-36 rounded-md border border-current bg-background px-3 py-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide">Fenêtre</p>
        <p className="mt-1 font-medium">{item.title}</p>
        <p className="mt-1 text-xs">Du {dateLabel(item.startsOn)} au {dateLabel(item.endsOn)}</p>
      </div>
    </li>
  );
}

function Category({ category }: { category: LitterPlanTimelineGeometry["categories"][number] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{litterCareTaskCategoryLabels[category.category]}</h3>
      <div className="mt-3 h-32 overflow-hidden border-t border-dashed">
        <ol className="relative h-full">
          {category.items.map((item) =>
            item.kind === "window" ? <Window key={item.id} item={item} /> : <Point key={item.id} item={item} />,
          )}
        </ol>
      </div>
    </section>
  );
}

function TimelineAxis({ geometry }: { geometry: LitterPlanTimelineGeometry }) {
  return <div className="relative h-12 border-b" aria-label={`Axe du ${dateLabel(geometry.startsOn)} au ${dateLabel(geometry.endsOn)}`}>
    {geometry.ticks.map((tick) => <div key={tick.date} className="absolute top-0 h-full -translate-x-1/2 border-l" style={{ left: `${tick.percent}%` }}>
      <span className="absolute top-5 w-28 -translate-x-1/2 text-center text-xs text-muted">{dateLabel(tick.date)}</span>
    </div>)}
  </div>;
}

export function LitterPlanTimelinePanel({ timeline, unavailable = false }: { timeline: LitterPlanTimeline | null; unavailable?: boolean }) {
  const geometry = timeline ? buildLitterPlanTimelineGeometry(timeline) : null;
  const state = getLitterPlanTimelinePanelState(timeline, unavailable);
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6" aria-labelledby="litter-plan-timeline-title">
      <h2 id="litter-plan-timeline-title" className="text-lg font-semibold">Planning de la portée</h2>
      {state === "unavailable" ? <p className="mt-2 text-sm text-muted">Planning momentanément indisponible</p> : state === "available" && timeline ? (
        <>
          <p className="mt-1 text-sm text-muted">{timeline.title}</p>
          <div className="mt-5 space-y-5">
            {geometry ? <div className="overflow-x-auto pb-2"><div className="min-w-[48rem]"><TimelineAxis geometry={geometry} />
              <div className="mt-5 space-y-5">{geometry.categories.map((category) => <Category key={category.category} category={category} />)}</div>
            </div></div> : <p className="text-sm text-muted">Aucune date exploitable n’est disponible pour tracer ce planning.</p>}
            {geometry?.undatedItems.length ? <section className="rounded-lg border border-dashed p-4"><h3 className="text-sm font-semibold">Éléments sans date exploitable</h3><ul className="mt-3 space-y-2 text-sm">{geometry.undatedItems.map((item) => <li key={item.id}>{item.kind === "window" ? "Fenêtre" : item.kind === "milestone" ? "Jalon" : "Tâche"} · {item.title}</li>)}</ul></section> : null}
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
