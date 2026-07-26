import Link from "next/link";

import {
  adopterAppointmentStatusLabels,
} from "@/features/breeding-calendar/adopter-appointment-calendar";
import {
  BREEDING_CALENDAR_SOURCE_FILTERS,
  isAdopterAppointmentBreedingCalendarEvent,
  isLitterCareBreedingCalendarEvent,
  isReproductiveCycleBreedingCalendarEvent,
  type BreedingCalendarEvent,
  type BreedingCalendarSourceFilter,
} from "@/features/breeding-calendar/breeding-calendar-contract";
import {
  projectBreedingCalendarMonth,
  projectBreedingCalendarWeek,
  sortBreedingCalendarAgendaItems,
  type BreedingCalendarProjectedItem,
  type BreedingCalendarProjection,
} from "@/features/breeding-calendar/breeding-calendar-projection";
import {
  reproductiveCycleCalendarStatusLabels,
} from "@/features/breeding-calendar/reproductive-cycle-calendar";
import {
  getLitterCareCalendarDate,
  getLitterCareCalendarMonth,
  type LitterCareCalendarCategoryFilter,
  type LitterCareCalendarKindFilter,
} from "@/features/litter-journal/litter-care-calendar";
import type { LitterCareCalendarView } from "@/features/litter-journal/litter-care-calendar-panel";
import { litterCareTaskCategoryLabels } from "@/features/litter-journal/litter-care-task-labels";
import { LITTER_CARE_TASK_CATEGORIES } from "@/features/litter-journal/litter-care-tasks";

const kindLabels = {
  milestone: "Jalon",
  task: "Tâche",
  recurring_task: "Tâche récurrente",
  window: "Fenêtre",
} as const;

const sourceFilterLabels: Record<BreedingCalendarSourceFilter, string> = {
  all: "Tous les plannings",
  litter_care: "Portées",
  reproductive_cycle: "Cheptel — reproduction",
  adopter_appointment: "Rendez-vous adoptants",
};

const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function civilDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function adjacentMonth(month: string, difference: number) {
  const [year, value] = month.split("-").map(Number);
  return civilDate(year, value + difference, 1).slice(0, 7);
}

function adjacentWeek(date: string, difference: number) {
  return civilDate(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)) + difference * 7,
  );
}

function dayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function query(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/calendar?${search.toString()}`;
}

function BreedingCalendarEventCard({
  item,
  agenda = false,
}: {
  item: BreedingCalendarProjectedItem;
  agenda?: boolean;
}) {
  const { event } = item;
  const isAppointment = isAdopterAppointmentBreedingCalendarEvent(event);
  const isCycle = isReproductiveCycleBreedingCalendarEvent(event);
  const windowSegment =
    item.windowPosition === "start"
      ? "Début"
      : item.windowPosition === "middle"
        ? "En cours"
        : item.windowPosition === "end"
          ? "Fin"
          : item.windowPosition === "single"
            ? "Fenêtre"
            : null;
  const state =
    item.operationalState === "today"
      ? "Aujourd’hui"
      : item.operationalState === "overdue"
        ? "En retard"
        : item.operationalState === "open"
          ? "Fenêtre ouverte"
          : null;
  const border =
    !agenda && item.windowPosition === "start"
      ? "border-l-4"
      : !agenda && item.windowPosition === "end"
        ? "border-r-4"
        : !agenda && item.windowPosition === "middle"
          ? "border-x-0"
          : "";
  const showTitle =
    agenda ||
    !item.windowPosition ||
    item.windowPosition === "single" ||
    item.windowPosition === "start" ||
    item.windowPosition === "end";
  const fullWindow =
    agenda &&
    isLitterCareBreedingCalendarEvent(event) &&
    event.itemKind === "window" &&
    item.retainedStartsOn &&
    item.retainedEndsOn
      ? `Du ${item.retainedStartsOn}${event.startsLocalTime ? ` à ${event.startsLocalTime.slice(0, 5)}` : ""} au ${item.retainedEndsOn}${event.endsLocalTime ? ` à ${event.endsLocalTime.slice(0, 5)}` : ""}`
      : null;
  const appointmentStatus = isAppointment
    ? adopterAppointmentStatusLabels[event.appointmentStatus]
    : null;
  const cycleStatus = isCycle
    ? reproductiveCycleCalendarStatusLabels[event.cycleStatus]
    : null;
  const meta = isAppointment
    ? `Rendez-vous · ${appointmentStatus}`
    : isCycle
      ? `Reproduction · ${cycleStatus}`
      : `${kindLabels[event.itemKind]} · ${litterCareTaskCategoryLabels[event.category as keyof typeof litterCareTaskCategoryLabels] ?? event.category}`;
  const cardClass = isAppointment
    ? "border-sky-500/50 bg-sky-50/60"
    : isCycle
      ? "border-rose-500/45 bg-rose-50/55"
      : "border-accent/40 bg-surface";
  const srLabel = isAppointment
    ? "Ouvrir le parcours adoptant : "
    : isCycle
      ? "Ouvrir la reproduction de la femelle : "
      : "Ouvrir le suivi dans le Journal : ";

  return (
    <Link
      href={event.href}
      data-calendar-source={event.sourceType}
      className={`block rounded border px-2 py-1.5 text-xs text-foreground hover:bg-accent/10 ${cardClass} ${border}`}
    >
      <span className="sr-only">{srLabel}</span>
      {showTitle ? (
        <span className="block break-words font-semibold">
          {event.contextLabel ? `${event.contextLabel} — ` : ""}
          {event.title}
        </span>
      ) : (
        <span className="block font-medium">{windowSegment}</span>
      )}
      <span className="mt-0.5 block text-muted">
        {windowSegment && !agenda ? `${windowSegment} · ` : ""}
        {meta}
      </span>
      {fullWindow ? <span className="block text-muted">{fullWindow}</span> : null}
      {!fullWindow && item.time ? (
        <span className="block text-muted">{item.time.slice(0, 5)}</span>
      ) : null}
      {agenda && isCycle ? (
        <span className="block text-muted">{item.date}</span>
      ) : null}
      {state && !isAppointment && !isCycle ? (
        <span className="block font-medium">{state}</span>
      ) : null}
      {cycleStatus && agenda ? (
        <span className="block font-medium">{cycleStatus}</span>
      ) : null}
      {appointmentStatus && agenda ? (
        <span className="block font-medium">{appointmentStatus}</span>
      ) : null}
    </Link>
  );
}

function BreedingCalendarMonthView({ calendar }: { calendar: BreedingCalendarProjection }) {
  return (
    <section
      aria-label={`Calendrier du mois ${calendar.month}`}
      className="overflow-hidden rounded-2xl border bg-surface"
    >
      <div className="grid grid-cols-7 border-b text-center text-xs font-semibold uppercase tracking-wide text-muted">
        {weekdays.map((day) => (
          <p key={day} className="border-r px-2 py-2 last:border-r-0">
            {day}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendar.days.map((day) => (
          <article
            key={day.date}
            data-calendar-date={day.date}
            className={`min-h-40 border-b border-r p-2 ${day.isCurrentMonth ? "" : "bg-muted/30 text-muted"} ${day.isToday ? "outline outline-2 outline-accent outline-offset-[-2px]" : ""}`}
          >
            <p className="mb-2 text-sm font-semibold">
              {day.isToday ? `Aujourd’hui · ${day.date.slice(8, 10)}` : day.date.slice(8, 10)}
            </p>
            <div className="space-y-1.5">
              {day.items.map((item) => (
                <BreedingCalendarEventCard
                  key={`${item.event.identitySource}:${item.event.sourceRecordId}:${day.date}`}
                  item={item}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BreedingCalendarWeekView({ calendar }: { calendar: BreedingCalendarProjection }) {
  return (
    <section
      aria-label={`Calendrier de la semaine du ${calendar.startsOn}`}
      className="grid grid-cols-1 overflow-hidden rounded-2xl border bg-surface sm:grid-cols-7"
    >
      {calendar.days.map((day, index) => (
        <article
          key={day.date}
          data-calendar-date={day.date}
          className={`min-h-64 border-r p-2 last:border-r-0 ${day.isToday ? "outline outline-2 outline-accent outline-offset-[-2px]" : ""}`}
        >
          <p className="mb-3 text-center text-sm font-semibold">
            {weekdays[index]}
            <span className="block text-xs text-muted">{day.date.slice(8, 10)}</span>
          </p>
          <div className="space-y-1.5">
            {day.items.map((item) => (
              <BreedingCalendarEventCard
                key={`${item.event.identitySource}:${item.event.sourceRecordId}:${day.date}`}
                item={item}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function BreedingCalendarAgendaView({ calendar }: { calendar: BreedingCalendarProjection }) {
  const days = calendar.days
    .map((day) => ({ ...day, items: sortBreedingCalendarAgendaItems(day.items) }))
    .filter((day) => day.items.length > 0);

  if (days.length === 0) {
    return (
      <p role="status" className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted">
        Aucun élément planifié pour cette semaine.
      </p>
    );
  }

  return (
    <section
      aria-label={`Agenda du ${calendar.startsOn} au ${calendar.endsOn}`}
      className="space-y-4 rounded-2xl border bg-surface p-4 sm:p-6"
    >
      {days.map((day) => (
        <article key={day.date} data-agenda-date={day.date}>
          <h3 className="mb-2 text-sm font-semibold capitalize">
            {day.isToday ? `Aujourd’hui · ${dayLabel(day.date)}` : dayLabel(day.date)}
          </h3>
          <div className="space-y-2">
            {day.items.map((item) => (
              <BreedingCalendarEventCard
                key={`${item.event.identitySource}:${item.event.sourceRecordId}`}
                item={item}
                agenda
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export function BreedingCalendarPanel({
  events,
  todayDate,
  todayLocalTime,
  view,
  month,
  date,
  source,
  kind,
  category,
}: {
  events: readonly BreedingCalendarEvent[];
  todayDate: string;
  todayLocalTime: string;
  view: LitterCareCalendarView;
  month?: string;
  date?: string;
  source: BreedingCalendarSourceFilter;
  kind: LitterCareCalendarKindFilter;
  category: LitterCareCalendarCategoryFilter;
}) {
  const monthValue = getLitterCareCalendarMonth(month, todayDate);
  const monthCalendar = projectBreedingCalendarMonth({
    events,
    requestedMonth: monthValue,
    todayDate,
    todayLocalTime,
    source,
    kind,
    category,
  });
  const requestedDate = getLitterCareCalendarDate(
    date ?? `${monthCalendar.month}-01`,
    todayDate,
  );
  const weekCalendar = projectBreedingCalendarWeek({
    events,
    requestedDate,
    todayDate,
    todayLocalTime,
    source,
    kind,
    category,
  });
  const calendar = view === "month" ? monthCalendar : weekCalendar;
  const dateForView = view === "month" ? `${monthCalendar.month}-01` : weekCalendar.startsOn;
  const showLitterFilters = source === "all" || source === "litter_care";
  const preserved = {
    source: source === "all" ? undefined : source,
    kind: showLitterFilters && kind !== "all" ? kind : undefined,
    category: showLitterFilters && category !== "all" ? category : undefined,
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border bg-surface p-5 sm:p-6">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-accent">
          Calendrier de l’élevage
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Ce calendrier rassemble le planning des portées, les chaleurs du
          cheptel et les rendez-vous adoptants programmés.
        </p>
        <nav aria-label="Choix de la vue" className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/calendar/today"
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Aujourd’hui
          </Link>
          {(["month", "week", "agenda"] as const).map((candidate) => (
            <Link
              key={candidate}
              aria-current={view === candidate ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted ${view === candidate ? "bg-muted" : ""}`}
              href={query({
                view: candidate === "month" ? undefined : candidate,
                month: candidate === "month" ? monthCalendar.month : undefined,
                date: candidate === "month" ? undefined : dateForView,
                ...preserved,
              })}
            >
              {candidate === "month" ? "Mois" : candidate === "week" ? "Semaine" : "Agenda"}
            </Link>
          ))}
        </nav>
        <nav aria-label="Navigation temporelle" className="mt-3 flex flex-wrap gap-3">
          {view === "month" ? (
            <>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({ month: adjacentMonth(monthCalendar.month, -1), ...preserved })}
              >
                Mois précédent
              </Link>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({ month: todayDate.slice(0, 7), ...preserved })}
              >
                Revenir à aujourd’hui
              </Link>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({ month: adjacentMonth(monthCalendar.month, 1), ...preserved })}
              >
                Mois suivant
              </Link>
            </>
          ) : (
            <>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({
                  view,
                  date: adjacentWeek(weekCalendar.startsOn, -1),
                  ...preserved,
                })}
              >
                Semaine précédente
              </Link>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({ view, date: todayDate, ...preserved })}
              >
                Revenir à aujourd’hui
              </Link>
              <Link
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                href={query({
                  view,
                  date: adjacentWeek(weekCalendar.startsOn, 1),
                  ...preserved,
                })}
              >
                Semaine suivante
              </Link>
            </>
          )}
        </nav>
      </header>

      <form
        method="get"
        className="flex flex-col gap-4 rounded-2xl border bg-surface p-5 sm:flex-row sm:flex-wrap sm:items-end sm:p-6"
      >
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="month" value={monthCalendar.month} />
        {view !== "month" ? (
          <input type="hidden" name="date" value={weekCalendar.startsOn} />
        ) : null}
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
          Planning
          <select
            name="source"
            defaultValue={source}
            className="rounded-lg border bg-surface px-3 py-2"
            aria-label="Filtrer par planning"
          >
            {BREEDING_CALENDAR_SOURCE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {sourceFilterLabels[value]}
              </option>
            ))}
          </select>
        </label>
        {showLitterFilters ? (
          <>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
              Type (portées)
              <select name="kind" defaultValue={kind} className="rounded-lg border bg-surface px-3 py-2">
                <option value="all">Tous les types</option>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
              Catégorie (portées)
              <select
                name="category"
                defaultValue={category}
                className="rounded-lg border bg-surface px-3 py-2"
              >
                <option value="all">Toutes les catégories</option>
                {LITTER_CARE_TASK_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {litterCareTaskCategoryLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Appliquer
        </button>
        <Link
          href="/calendar"
          className="rounded-lg border px-4 py-2 text-center text-sm font-semibold"
        >
          Réinitialiser
        </Link>
      </form>

      <div className="rounded-2xl border bg-surface p-5 text-sm">
        <Link
          href="/calendar/export"
          className="inline-flex rounded-lg border px-4 py-2 font-semibold hover:bg-muted"
        >
          Télécharger le calendrier global
        </Link>
      </div>

      {!calendar.hasPlannedItems ? (
        <p
          role="status"
          className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
        >
          Aucune action planifiée pour l’élevage.
        </p>
      ) : null}
      {calendar.hasPlannedItems && !calendar.hasFilteredItems ? (
        <p
          role="status"
          className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted"
        >
          Aucun élément ne correspond aux filtres sélectionnés.
        </p>
      ) : null}

      {view === "month" ? (
        <BreedingCalendarMonthView calendar={monthCalendar} />
      ) : view === "week" ? (
        <BreedingCalendarWeekView calendar={weekCalendar} />
      ) : (
        <BreedingCalendarAgendaView calendar={weekCalendar} />
      )}
    </main>
  );
}
