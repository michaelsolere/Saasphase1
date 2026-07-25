import Link from "next/link";

import { getLitterDisplayName } from "@/features/litters/formatters";

import {
  LITTER_CARE_TASK_CATEGORIES,
  type LitterCareTaskSummary,
} from "./litter-care-tasks";
import {
  projectLitterCareCalendar,
  type LitterCareCalendarCategoryFilter,
  type LitterCareCalendarKindFilter,
} from "./litter-care-calendar";
import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import { LitterJournalSelector } from "./litter-journal-selector";
import type { LitterJournalListItem } from "./types";

const kindLabels: Record<LitterCareTaskSummary["itemKind"], string> = {
  milestone: "Jalon",
  task: "Tâche",
  recurring_task: "Tâche récurrente",
  window: "Fenêtre",
};

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1)));
}

function adjacentMonth(month: string, difference: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + difference, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function query({ litter, month, kind, category }: { litter: string; month?: string; kind: string; category: string }) {
  const params = new URLSearchParams({ litter, kind, category });
  if (month) params.set("month", month);
  return `/litters/journal/calendar?${params.toString()}`;
}

function CalendarCard({ item, litterId }: { item: ReturnType<typeof projectLitterCareCalendar>["days"][number]["items"][number]; litterId: string }) {
  const windowSegment = item.windowPosition === "start" ? "Début" : item.windowPosition === "middle" ? "En cours" : item.windowPosition === "end" ? "Fin" : item.windowPosition === "single" ? "Fenêtre" : null;
  const state = item.operationalState === "today" ? "Aujourd’hui" : item.operationalState === "overdue" ? "En retard" : item.operationalState === "open" ? "Fenêtre ouverte" : null;
  const border = item.windowPosition === "start" ? "border-l-4" : item.windowPosition === "end" ? "border-r-4" : item.windowPosition === "middle" ? "border-x-0" : "";
  const showTitle = !item.windowPosition || item.windowPosition === "single" || item.windowPosition === "start" || item.windowPosition === "end";

  return (
    <Link href={`/litters/journal?litter=${encodeURIComponent(litterId)}#litter-care-tasks`} className={`block rounded border border-accent/40 bg-surface px-2 py-1.5 text-xs text-foreground hover:bg-accent/10 ${border}`}>
      <span className="sr-only">Ouvrir le suivi dans le Journal : </span>
      {showTitle ? <span className="block break-words font-semibold">{item.task.title}</span> : <span className="block font-medium">{windowSegment}</span>}
      <span className="mt-0.5 block text-muted">{windowSegment ? `${windowSegment} · ` : ""}{kindLabels[item.kind]} · {litterCareTaskCategoryLabels[item.task.category]}</span>
      {item.time ? <span className="block text-muted">{item.time.slice(0, 5)}</span> : null}
      {state ? <span className="block font-medium">{state}</span> : null}
      {item.task.isScheduleLocked ? <span className="block font-medium" aria-label="Programmation verrouillée">🔒 Verrouillée</span> : null}
      {item.task.scheduleSource === "manual" ? <span className="block">Ajustée</span> : null}
    </Link>
  );
}

export function LitterCareCalendarPanel({ litters, litter, tasks, todayDate, todayLocalTime, month, kind, category }: {
  litters: LitterJournalListItem[];
  litter: LitterJournalListItem;
  tasks: LitterCareTaskSummary[];
  todayDate: string;
  todayLocalTime: string;
  month?: string;
  kind: LitterCareCalendarKindFilter;
  category: LitterCareCalendarCategoryFilter;
}) {
  const calendar = projectLitterCareCalendar({ tasks, requestedMonth: month, todayDate, todayLocalTime, kind, category });
  const litterId = litter.id!;
  const navigation = { litter: litterId, kind, category };

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
    <header className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-wide text-accent">Calendrier de la portée</h1>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{getLitterDisplayName(litter.name, litter.id)}</h2>
          <p className="mt-1 text-lg capitalize text-muted">{monthLabel(calendar.month)}</p>
          <Link href={`/litters/journal?litter=${encodeURIComponent(litterId)}`} className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Retour au Journal</Link>
        </div>
        <LitterJournalSelector litters={litters} selectedLitterId={litterId} basePath="/litters/journal/calendar" preservedSearchParams={{ month: calendar.month, kind, category }} />
      </div>
      <nav aria-label="Navigation mensuelle" className="mt-5 flex flex-wrap gap-3">
        <Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: adjacentMonth(calendar.month, -1) })}>Mois précédent</Link>
        <Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: todayDate.slice(0, 7) })}>Aujourd’hui</Link>
        <Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: adjacentMonth(calendar.month, 1) })}>Mois suivant</Link>
      </nav>
    </header>

    <form method="get" className="flex flex-col gap-4 rounded-2xl border bg-surface p-5 sm:flex-row sm:items-end sm:p-6">
      <input type="hidden" name="litter" value={litterId} />
      <input type="hidden" name="month" value={calendar.month} />
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">Type d’élément
        <select name="kind" defaultValue={kind} className="rounded-lg border bg-surface px-3 py-2"><option value="all">Tous les types</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">Catégorie
        <select name="category" defaultValue={category} className="rounded-lg border bg-surface px-3 py-2"><option value="all">Toutes les catégories</option>{LITTER_CARE_TASK_CATEGORIES.map((value) => <option key={value} value={value}>{litterCareTaskCategoryLabels[value]}</option>)}</select>
      </label>
      <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Appliquer</button>
      <Link href={`/litters/journal/calendar?litter=${encodeURIComponent(litterId)}`} className="rounded-lg border px-4 py-2 text-center text-sm font-semibold hover:bg-muted">Réinitialiser</Link>
    </form>

    {!calendar.hasPlannedItems ? <p role="status" className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted">Aucun élément planifié pour cette portée.</p> : null}
    {calendar.hasPlannedItems && !calendar.hasFilteredItems ? <p role="status" className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted">Aucun élément ne correspond aux filtres sélectionnés.</p> : null}
    <section aria-label={`Calendrier ${monthLabel(calendar.month)}`} className="max-w-full overflow-x-auto rounded-2xl border bg-surface">
      <div className="grid min-w-[980px] grid-cols-7">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="border-b px-3 py-3 text-center text-sm font-semibold">{day}</div>)}
        {calendar.days.map((day) => <article key={day.date} data-calendar-date={day.date} className={`min-h-40 border-b border-r p-2 ${day.isCurrentMonth ? "" : "bg-muted/30 text-muted"} ${day.isToday ? "outline outline-2 outline-accent outline-offset-[-2px]" : ""}`}>
          <p className="mb-2 text-sm font-semibold">{day.isToday ? `Aujourd’hui · ${day.date.slice(8, 10)}` : day.date.slice(8, 10)}</p>
          <div className="space-y-1.5">{day.items.map((item) => <CalendarCard key={`${item.task.id}:${day.date}`} item={item} litterId={litterId} />)}</div>
        </article>)}
      </div>
    </section>
  </main>;
}
