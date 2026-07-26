import Link from "next/link";
import type { ReactNode } from "react";

import { getLitterDisplayName } from "@/features/litters/formatters";

import type {
  LitterCareCalendarCategoryFilter,
  LitterCareCalendarKindFilter,
} from "./litter-care-calendar";
import {
  addLitterCareTimelineCivilDays,
  getLitterCareTimelineWeekStart,
  projectLitterCareTimeline,
  type LitterCareTimelineProjectedItem,
  type LitterCareTimelineProjection,
  type LitterCareTimelineZoom,
} from "./litter-care-timeline";
import type { LitterCareTaskSummary } from "./litter-care-tasks-core";
import type { LitterJournalDetails, LitterJournalListItem } from "./types";

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/litters/journal/calendar?${search.toString()}`;
}

function zoomLabel(zoom: LitterCareTimelineZoom) {
  if (zoom === "gestation") return "9 semaines";
  if (zoom === "four_weeks") return "4 semaines";
  if (zoom === "week") return "Cette semaine";
  return "Cycle complet";
}

function itemClasses(item: LitterCareTimelineProjectedItem) {
  const muted =
    item.status === "cancelled" || item.status === "not_applicable"
      ? "opacity-50 line-through"
      : "";
  const outline = item.isSuggestedOnly
    ? "border-2 border-dashed border-accent/60"
    : "border border-accent/50";
  const shape =
    item.visual === "milestone"
      ? "min-h-8 justify-center"
      : item.visual === "window"
        ? "min-h-8"
        : item.visual === "recurring_task"
          ? "min-h-7"
          : "min-h-8";
  return `relative z-[1] m-0.5 flex items-center overflow-hidden rounded-md bg-surface px-2 py-1 text-[11px] leading-tight text-foreground hover:bg-accent/10 ${outline} ${shape} ${muted}`;
}

function TimelineItemCard({
  item,
  litterId,
}: {
  item: LitterCareTimelineProjectedItem;
  litterId: string;
}) {
  const marker =
    item.visual === "milestone"
      ? "◆ "
      : item.visual === "recurring_task"
        ? "⋯ "
        : item.visual === "window"
          ? ""
          : "▰ ";
  return (
    <Link
      href={`/litters/journal?litter=${encodeURIComponent(litterId)}#litter-care-tasks`}
      className={itemClasses(item)}
      style={{
        gridColumn: `${item.startColumn + 1} / ${item.endColumn + 2}`,
        gridRow: item.lane + 1,
      }}
      title={item.accessibleLabel}
      aria-label={item.accessibleLabel}
      data-timeline-item={item.taskId}
      data-timeline-kind={item.kind}
      data-timeline-status={item.status}
      data-timeline-schedule={item.scheduleSource}
      data-timeline-locked={item.isScheduleLocked ? "true" : "false"}
      data-timeline-truncated-left={item.truncatedLeft ? "true" : "false"}
      data-timeline-truncated-right={item.truncatedRight ? "true" : "false"}
    >
      {item.truncatedLeft ? (
        <span aria-hidden="true" className="mr-1 shrink-0 text-muted">
          ←
        </span>
      ) : null}
      <span className="truncate font-semibold">
        {marker}
        {item.title}
      </span>
      {item.truncatedRight ? (
        <span aria-hidden="true" className="ml-1 shrink-0 text-muted">
          →
        </span>
      ) : null}
      {item.isScheduleLocked ? (
        <span aria-label="Programmation verrouillée" className="ml-1 shrink-0">
          🔒
        </span>
      ) : null}
      {item.scheduleSource === "manual" ? (
        <span className="ml-1 shrink-0">Ajustée</span>
      ) : null}
      {item.status === "done" ? (
        <span aria-label="Réalisé" className="ml-1 shrink-0">
          ✓
        </span>
      ) : null}
      {item.isOverdue ? (
        <span className="ml-1 shrink-0 font-semibold">En retard</span>
      ) : null}
    </Link>
  );
}

function TimelineHeaderSummary({
  projection,
  litter,
}: {
  projection: LitterCareTimelineProjection;
  litter: LitterJournalListItem;
}) {
  const { header } = projection;
  return (
    <section
      aria-label="En-tête biologique de la frise"
      className="rounded-2xl border bg-surface p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {getLitterDisplayName(litter.name, litter.id)}
      </h2>
      <p className="mt-1 text-lg text-muted">{header.parentsLabel}</p>
      <p className="mt-2 text-sm font-medium">
        {header.statusLabel}
        {header.biologicalDayLabel ? ` — ${header.biologicalDayLabel}` : ""}
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {header.ovulationLabel ? (
          <div>
            <dt className="text-muted">Ovulation estimée</dt>
            <dd>{header.ovulationLabel}</dd>
          </div>
        ) : null}
        {header.matingsLabel ? (
          <div>
            <dt className="text-muted">Saillies</dt>
            <dd>{header.matingsLabel}</dd>
          </div>
        ) : null}
        {header.expectedBirthLabel ? (
          <div>
            <dt className="text-muted">Mise-bas centrale estimée</dt>
            <dd>{header.expectedBirthLabel}</dd>
          </div>
        ) : null}
        {header.actualBirthLabel ? (
          <div>
            <dt className="text-muted">Naissance réelle</dt>
            <dd>{header.actualBirthLabel}</dd>
          </div>
        ) : null}
        {header.nextActionLabel ? (
          <div>
            <dt className="text-muted">Prochaine action</dt>
            <dd>{header.nextActionLabel}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-sm text-muted" data-timeline-anchor-message>
        {header.anchorMessage}
      </p>
      <p className="mt-1 text-xs text-muted">
        Les dates estimées sont indicatives et ne constituent pas une certitude
        médicale.
      </p>
    </section>
  );
}

function TimelineLegend() {
  return (
    <section
      aria-label="Légende de la frise"
      className="rounded-2xl border bg-surface p-4 text-sm"
    >
      <h3 className="font-semibold">Légende</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <li>◆ Jalon</li>
        <li>● Fait enregistré</li>
        <li>▰ Tâche</li>
        <li>━━━━ Fenêtre</li>
        <li>⋯ Suivi récurrent</li>
        <li>- - - Date suggérée</li>
        <li>🔒 Programmation verrouillée</li>
        <li>✓ Réalisé</li>
      </ul>
    </section>
  );
}

function DayAxis({
  projection,
  label,
  children,
}: {
  projection: LitterCareTimelineProjection;
  label: string;
  children?: (date: string, index: number) => ReactNode;
}) {
  return (
    <div
      className="grid border-b"
      style={{
        gridTemplateColumns: `9rem repeat(${projection.columnCount}, minmax(2.25rem, 1fr))`,
      }}
    >
      <div className="sticky left-0 z-20 border-r bg-surface px-3 py-2 text-xs font-semibold">
        {label}
      </div>
      {projection.dates.map((date, index) => (
        <div
          key={`${label}-${date}`}
          className="border-r px-0.5 py-2 text-center text-[10px] text-muted"
          data-timeline-date={label === "Repères" ? date : undefined}
        >
          {children ? children(date, index) : null}
        </div>
      ))}
    </div>
  );
}

function TimelineGrid({
  projection,
  litterId,
}: {
  projection: LitterCareTimelineProjection;
  litterId: string;
}) {
  const dayMarkers = projection.markers.filter(
    (marker) => marker.kind === "biological_day",
  );
  const weekMarkers = projection.markers.filter(
    (marker) => marker.kind === "biological_week",
  );
  const fixedMarkers = projection.markers.filter(
    (marker) =>
      marker.kind !== "biological_day" &&
      marker.kind !== "biological_week" &&
      marker.kind !== "today",
  );

  return (
    <section
      aria-label={`Frise biologique du ${projection.startsOn} au ${projection.endsOn}`}
      className="max-w-full overflow-x-auto rounded-2xl border bg-surface"
      data-timeline-grid
    >
      <div className="relative min-w-[48rem]">
        <DayAxis projection={projection} label="Repères">
          {(date) => (
            <>
              <span className="block font-medium text-foreground">
                {date.slice(8, 10)}
              </span>
              <span className="block">{date.slice(5, 7)}</span>
            </>
          )}
        </DayAxis>

        {weekMarkers.length ? (
          <DayAxis projection={projection} label="Semaines">
            {(_date, index) => {
              const week = weekMarkers.find(
                (marker) => marker.columnIndex === index,
              );
              return (
                <span
                  className="block text-xs font-semibold text-foreground"
                  data-timeline-week={week?.label}
                >
                  {week?.label ?? ""}
                </span>
              );
            }}
          </DayAxis>
        ) : null}

        {dayMarkers.length ? (
          <DayAxis projection={projection} label="Jours">
            {(_date, index) => {
              const day = dayMarkers.find(
                (marker) => marker.columnIndex === index,
              );
              return (
                <span
                  className="block text-xs font-semibold text-foreground"
                  data-timeline-bio-day={day?.label}
                >
                  {day?.label ?? ""}
                </span>
              );
            }}
          </DayAxis>
        ) : null}

        <div
          className="relative grid min-h-16 border-b"
          style={{
            gridTemplateColumns: `9rem 1fr`,
          }}
          aria-label="Repères fixes de la portée"
        >
          <div className="sticky left-0 z-20 border-r bg-surface px-3 py-3 text-xs font-semibold">
            Biologie
          </div>
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${projection.columnCount}, minmax(2.25rem, 1fr))`,
            }}
          >
            {projection.dates.map((date, index) => {
              const markers = fixedMarkers.filter(
                (marker) => marker.columnIndex === index,
              );
              return (
                <div key={`fixed-${date}`} className="relative border-r px-1 py-3">
                  {markers.map((marker) => (
                    <span
                      key={marker.id}
                      className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-xs ${
                        marker.shape === "diamond"
                          ? "h-3 w-3 rotate-45 border border-accent bg-accent/20"
                          : marker.emphasis === "strong"
                            ? "h-3.5 w-3.5 rounded-full bg-accent"
                            : "h-2.5 w-2.5 rounded-full bg-foreground"
                      }`}
                      title={marker.label}
                      aria-label={`${marker.label} le ${marker.date}`}
                      data-timeline-marker={marker.kind}
                    >
                      <span className="sr-only">{marker.label}</span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {projection.categories.map((category) => (
          <div
            key={category.category}
            className="relative grid border-b last:border-b-0"
            style={{ gridTemplateColumns: "9rem 1fr" }}
            data-timeline-category={category.category}
          >
            <div className="sticky left-0 z-20 border-r bg-surface px-3 py-3 text-xs font-semibold">
              {category.label}
            </div>
            <div
              className="relative grid gap-y-1 py-1"
              style={{
                gridTemplateColumns: `repeat(${projection.columnCount}, minmax(2.25rem, 1fr))`,
                gridTemplateRows: `repeat(${category.laneCount}, minmax(2.5rem, auto))`,
              }}
            >
              {projection.dates.map((date) => (
                <div
                  key={`${category.category}-bg-${date}`}
                  className="row-span-full border-r"
                  style={{ gridRow: `1 / ${category.laneCount + 1}` }}
                  aria-hidden="true"
                />
              ))}
              {category.items.map((item) => (
                <TimelineItemCard
                  key={item.id}
                  item={item}
                  litterId={litterId}
                />
              ))}
            </div>
          </div>
        ))}

        {projection.todayColumnIndex != null ? (
          <div
            aria-hidden="true"
            data-timeline-today-line
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-accent"
            style={{
              left: `calc(9rem + ((100% - 9rem) / ${projection.columnCount}) * ${projection.todayColumnIndex + 0.5})`,
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

export function LitterCareTimelinePanel({
  litter,
  details,
  tasks,
  todayDate,
  zoom,
  date,
  kind,
  category,
  viewControls,
  litterSelector,
  filters,
  exportPanel,
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  tasks: LitterCareTaskSummary[];
  todayDate: string;
  zoom: LitterCareTimelineZoom;
  date?: string;
  kind: LitterCareCalendarKindFilter;
  category: LitterCareCalendarCategoryFilter;
  viewControls: ReactNode;
  litterSelector: ReactNode;
  filters: ReactNode;
  exportPanel: ReactNode;
}) {
  const litterId = litter.id!;
  const projection = projectLitterCareTimeline({
    litter,
    details,
    tasks,
    todayDate,
    zoom,
    requestedDate: date,
    kind,
    category,
  });

  const navigation = {
    litter: litterId,
    view: "timeline",
    zoom: zoom === "cycle" ? undefined : zoom,
    kind: kind === "all" ? undefined : kind,
    category: category === "all" ? undefined : category,
  };

  const adjacentFourWeeks = (difference: number) => {
    const focus = projection?.referenceDate ?? date ?? todayDate;
    return addLitterCareTimelineCivilDays(focus, difference * 28) ?? focus;
  };
  const adjacentWeek = (difference: number) => {
    const focus = projection?.referenceDate ?? date ?? todayDate;
    const start = getLitterCareTimelineWeekStart(focus) ?? focus;
    return addLitterCareTimelineCivilDays(start, difference * 7) ?? focus;
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-wide text-accent">
              Calendrier de la portée
            </h1>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {getLitterDisplayName(litter.name, litter.id)}
            </h2>
            <p className="mt-1 text-lg text-muted">
              Frise biologique · {zoomLabel(zoom)}
            </p>
            <Link
              href={`/litters/journal?litter=${encodeURIComponent(litterId)}`}
              className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
            >
              Retour au Journal
            </Link>
          </div>
          {litterSelector}
        </div>
        {viewControls}
        <nav
          aria-label="Niveaux de zoom de la frise"
          className="mt-3 flex flex-wrap gap-3"
        >
          {(
            [
              ["cycle", "Cycle complet"],
              ["gestation", "9 semaines"],
              ["four_weeks", "4 semaines"],
              ["week", "Cette semaine"],
            ] as const
          ).map(([value, label]) => {
            const disabled =
              value === "gestation" && !projection?.gestationZoomAvailable;
            if (disabled) {
              return (
                <span
                  key={value}
                  aria-disabled="true"
                  className="rounded-lg border px-3 py-2 text-sm font-medium text-muted"
                  title="Repère biologique J0 indisponible"
                >
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={value}
                aria-current={zoom === value ? "page" : undefined}
                className={`rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted ${zoom === value ? "bg-muted" : ""}`}
                href={query({
                  ...navigation,
                  zoom: value === "cycle" ? undefined : value,
                  date: projection?.referenceDate,
                })}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {zoom === "four_weeks" || zoom === "week" ? (
          <nav
            aria-label="Navigation de la frise"
            className="mt-3 flex flex-wrap gap-3"
          >
            <Link
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
              href={query({
                ...navigation,
                date: zoom === "week" ? adjacentWeek(-1) : adjacentFourWeeks(-1),
              })}
            >
              Précédent
            </Link>
            <Link
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
              href={query({ ...navigation, date: todayDate })}
            >
              Aujourd’hui
            </Link>
            <Link
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
              href={query({
                ...navigation,
                date: zoom === "week" ? adjacentWeek(1) : adjacentFourWeeks(1),
              })}
            >
              Suivant
            </Link>
          </nav>
        ) : null}
      </header>

      {filters}
      {exportPanel}

      {!projection ? (
        <p
          role="status"
          className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
        >
          Aucune période exploitable pour construire la frise.
        </p>
      ) : (
        <>
          <TimelineHeaderSummary projection={projection} litter={litter} />
          <TimelineLegend />
          {!projection.hasPlannedItems ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
            >
              Aucun élément planifié pour cette portée. La frise affiche les
              repères biologiques disponibles.
            </p>
          ) : null}
          {projection.hasPlannedItems && !projection.hasFilteredItems ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
            >
              Aucun élément ne correspond aux filtres sélectionnés.
            </p>
          ) : null}
          {projection.unpositionedCount > 0 ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
            >
              {projection.unpositionedCount === 1
                ? "1 élément ne peut pas être positionné sur la frise."
                : `${projection.unpositionedCount} éléments ne peuvent pas être positionnés sur la frise.`}
            </p>
          ) : null}
          {!projection.gestationZoomAvailable && zoom === "gestation" ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
            >
              Zoom 9 semaines indisponible sans ancrage biologique J0. Affichage
              civil de repli.
            </p>
          ) : null}
          <TimelineGrid projection={projection} litterId={litterId} />
        </>
      )}
    </main>
  );
}
