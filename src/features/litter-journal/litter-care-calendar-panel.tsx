import Link from "next/link";

import { getLitterDisplayName } from "@/features/litters/formatters";

import { LITTER_CARE_TASK_CATEGORIES, type LitterCareTaskSummary } from "./litter-care-tasks";
import {
  projectLitterCareCalendar,
  projectLitterCareCalendarWeek,
  type LitterCareCalendar,
  type LitterCareCalendarCategoryFilter,
  type LitterCareCalendarItem,
  type LitterCareCalendarKindFilter,
} from "./litter-care-calendar";
import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import { LitterJournalSelector } from "./litter-journal-selector";
import type { LitterJournalListItem } from "./types";

export type LitterCareCalendarView = "month" | "week" | "agenda";

const kindLabels: Record<LitterCareTaskSummary["itemKind"], string> = { milestone: "Jalon", task: "Tâche", recurring_task: "Tâche récurrente", window: "Fenêtre" };
const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function monthLabel(month: string) { const [year, value] = month.split("-").map(Number); return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1))); }
function dayLabel(date: string) { const [year, month, day] = date.split("-").map(Number); return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))); }
function dateParts(value: string) { return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) }; }
function civilDate(year: number, month: number, day: number) { const date = new Date(Date.UTC(year, month - 1, day)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function adjacentMonth(month: string, difference: number) { const [year, value] = month.split("-").map(Number); return civilDate(year, value + difference, 1).slice(0, 7); }
function adjacentWeek(date: string, difference: number) { const parts = dateParts(date); return civilDate(parts.year, parts.month, parts.day + difference * 7); }

function query({ litter, view, month, date, kind, category }: { litter: string; view?: LitterCareCalendarView; month?: string; date?: string; kind: string; category: string }) {
  const params = new URLSearchParams({ litter, kind, category });
  if (view && view !== "month") params.set("view", view);
  if (month) params.set("month", month);
  if (date) params.set("date", date);
  return `/litters/journal/calendar?${params.toString()}`;
}

function CalendarCard({ item, litterId, agenda = false }: { item: LitterCareCalendarItem; litterId: string; agenda?: boolean }) {
  const windowSegment = item.windowPosition === "start" ? "Début" : item.windowPosition === "middle" ? "En cours" : item.windowPosition === "end" ? "Fin" : item.windowPosition === "single" ? "Fenêtre" : null;
  const state = item.operationalState === "today" ? "Aujourd’hui" : item.operationalState === "overdue" ? "En retard" : item.operationalState === "open" ? "Fenêtre ouverte" : null;
  const border = !agenda && item.windowPosition === "start" ? "border-l-4" : !agenda && item.windowPosition === "end" ? "border-r-4" : !agenda && item.windowPosition === "middle" ? "border-x-0" : "";
  const showTitle = agenda || !item.windowPosition || item.windowPosition === "single" || item.windowPosition === "start" || item.windowPosition === "end";
  const fullWindow = agenda && item.kind === "window" && item.retainedStartsOn && item.retainedEndsOn ? `Du ${item.retainedStartsOn}${item.task.retainedStartsLocalTime ? ` à ${item.task.retainedStartsLocalTime.slice(0, 5)}` : ""} au ${item.retainedEndsOn}${item.task.retainedEndsLocalTime ? ` à ${item.task.retainedEndsLocalTime.slice(0, 5)}` : ""}` : null;
  return <Link href={`/litters/journal?litter=${encodeURIComponent(litterId)}#litter-care-tasks`} className={`block rounded border border-accent/40 bg-surface px-2 py-1.5 text-xs text-foreground hover:bg-accent/10 ${border}`}>
    <span className="sr-only">Ouvrir le suivi dans le Journal : </span>
    {showTitle ? <span className="block break-words font-semibold">{item.task.title}</span> : <span className="block font-medium">{windowSegment}</span>}
    <span className="mt-0.5 block text-muted">{windowSegment && !agenda ? `${windowSegment} · ` : ""}{kindLabels[item.kind]} · {litterCareTaskCategoryLabels[item.task.category]}</span>
    {fullWindow ? <span className="block text-muted">{fullWindow}</span> : null}
    {!fullWindow && item.time ? <span className="block text-muted">{item.time.slice(0, 5)}</span> : null}
    {state ? <span className="block font-medium">{state}</span> : null}
    {item.task.isScheduleLocked ? <span className="block font-medium" aria-label="Programmation verrouillée">🔒 Verrouillée</span> : null}
    {item.task.scheduleSource === "manual" ? <span className="block">Ajustée</span> : null}
  </Link>;
}

function MonthView({ calendar, litterId }: { calendar: LitterCareCalendar; litterId: string }) {
  return <section aria-label={`Calendrier ${monthLabel(calendar.month)}`} className="max-w-full overflow-x-auto rounded-2xl border bg-surface"><div className="grid min-w-[980px] grid-cols-7">
    {weekdays.map((day) => <div key={day} className="border-b px-3 py-3 text-center text-sm font-semibold">{day}</div>)}
    {calendar.days.map((day) => <article key={day.date} data-calendar-date={day.date} className={`min-h-40 border-b border-r p-2 ${day.isCurrentMonth ? "" : "bg-muted/30 text-muted"} ${day.isToday ? "outline outline-2 outline-accent outline-offset-[-2px]" : ""}`}><p className="mb-2 text-sm font-semibold">{day.isToday ? `Aujourd’hui · ${day.date.slice(8, 10)}` : day.date.slice(8, 10)}</p><div className="space-y-1.5">{day.items.map((item) => <CalendarCard key={`${item.task.id}:${day.date}`} item={item} litterId={litterId} />)}</div></article>)}
  </div></section>;
}

function WeekView({ calendar, litterId }: { calendar: LitterCareCalendar; litterId: string }) {
  return <section aria-label={`Semaine du ${calendar.startsOn} au ${calendar.endsOn}`} className="max-w-full overflow-x-auto rounded-2xl border bg-surface"><div className="grid min-w-[980px] grid-cols-7">
    {calendar.days.map((day, index) => <article key={day.date} data-calendar-date={day.date} className={`min-h-64 border-r p-2 last:border-r-0 ${day.isToday ? "outline outline-2 outline-accent outline-offset-[-2px]" : ""}`}><p className="mb-3 text-center text-sm font-semibold">{weekdays[index]}<span className="block text-xs text-muted">{day.date.slice(8, 10)}</span></p><div className="space-y-1.5">{day.items.map((item) => <CalendarCard key={`${item.task.id}:${day.date}`} item={item} litterId={litterId} />)}</div></article>)}
  </div></section>;
}

function AgendaView({ calendar, litterId }: { calendar: LitterCareCalendar; litterId: string }) {
  const seen = new Set<string>();
  const days = calendar.days.map((day) => ({ ...day, items: day.items.filter((item) => { if (seen.has(item.task.id)) return false; seen.add(item.task.id); return true; }) })).filter((day) => day.items.length > 0);
  return <section aria-label={`Agenda du ${calendar.startsOn} au ${calendar.endsOn}`} className="space-y-4 rounded-2xl border bg-surface p-4 sm:p-6">{days.map((day) => <article key={day.date} data-agenda-date={day.date}><h3 className="mb-2 text-sm font-semibold capitalize">{day.isToday ? `Aujourd’hui · ${dayLabel(day.date)}` : dayLabel(day.date)}</h3><div className="space-y-2">{day.items.map((item) => <CalendarCard key={item.task.id} item={item} litterId={litterId} agenda />)}</div></article>)}</section>;
}

export function LitterCareCalendarPanel({ litters, litter, tasks, todayDate, todayLocalTime, month, date, view = "month", kind, category }: { litters: LitterJournalListItem[]; litter: LitterJournalListItem; tasks: LitterCareTaskSummary[]; todayDate: string; todayLocalTime: string; month?: string; date?: string; view?: LitterCareCalendarView; kind: LitterCareCalendarKindFilter; category: LitterCareCalendarCategoryFilter }) {
  const monthCalendar = projectLitterCareCalendar({ tasks, requestedMonth: month, todayDate, todayLocalTime, kind, category });
  const requestedDate = date ?? `${monthCalendar.month}-01`;
  const weekCalendar = projectLitterCareCalendarWeek({ tasks, requestedDate, todayDate, todayLocalTime, kind, category });
  const calendar = view === "month" ? monthCalendar : weekCalendar;
  const litterId = litter.id!;
  const dateForView = view === "month" ? `${monthCalendar.month}-01` : weekCalendar.startsOn;
  const navigation = { litter: litterId, kind, category };

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6"><header className="rounded-2xl border bg-surface p-5 sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-sm font-semibold uppercase tracking-wide text-accent">Calendrier de la portée</h1><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{getLitterDisplayName(litter.name, litter.id)}</h2><p className="mt-1 text-lg capitalize text-muted">{view === "month" ? monthLabel(monthCalendar.month) : `Semaine du ${weekCalendar.startsOn} au ${weekCalendar.endsOn}`}</p><Link href={`/litters/journal?litter=${encodeURIComponent(litterId)}`} className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Retour au Journal</Link></div><LitterJournalSelector litters={litters} selectedLitterId={litterId} basePath="/litters/journal/calendar" preservedSearchParams={{ view: view === "month" ? undefined : view, month: monthCalendar.month, date: dateForView, kind, category }} /></div>
    <nav aria-label="Choix de la vue" className="mt-5 flex flex-wrap gap-3">{(["month", "week", "agenda"] as const).map((candidate) => <Link key={candidate} aria-current={view === candidate ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted ${view === candidate ? "bg-muted" : ""}`} href={query({ ...navigation, view: candidate, month: candidate === "month" ? (view === "month" ? monthCalendar.month : weekCalendar.startsOn.slice(0, 7)) : monthCalendar.month, date: candidate === "month" ? undefined : dateForView })}>{candidate === "month" ? "Mois" : candidate === "week" ? "Semaine" : "Agenda"}</Link>)}</nav>
    {view === "month" ? <nav aria-label="Navigation mensuelle" className="mt-3 flex flex-wrap gap-3"><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: adjacentMonth(monthCalendar.month, -1) })}>Mois précédent</Link><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: todayDate.slice(0, 7) })}>Aujourd’hui</Link><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, month: adjacentMonth(monthCalendar.month, 1) })}>Mois suivant</Link></nav> : <nav aria-label="Navigation hebdomadaire" className="mt-3 flex flex-wrap gap-3"><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, view, month: weekCalendar.startsOn.slice(0, 7), date: adjacentWeek(weekCalendar.startsOn, -1) })}>Semaine précédente</Link><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, view, month: todayDate.slice(0, 7), date: todayDate })}>Aujourd’hui</Link><Link className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href={query({ ...navigation, view, month: weekCalendar.startsOn.slice(0, 7), date: adjacentWeek(weekCalendar.startsOn, 1) })}>Semaine suivante</Link></nav>}</header>
    <form method="get" className="flex flex-col gap-4 rounded-2xl border bg-surface p-5 sm:flex-row sm:items-end sm:p-6"><input type="hidden" name="litter" value={litterId} /><input type="hidden" name="view" value={view} /><input type="hidden" name="month" value={monthCalendar.month} />{view !== "month" ? <input type="hidden" name="date" value={weekCalendar.startsOn} /> : null}<label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">Type d’élément<select name="kind" defaultValue={kind} className="rounded-lg border bg-surface px-3 py-2"><option value="all">Tous les types</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">Catégorie<select name="category" defaultValue={category} className="rounded-lg border bg-surface px-3 py-2"><option value="all">Toutes les catégories</option>{LITTER_CARE_TASK_CATEGORIES.map((value) => <option key={value} value={value}>{litterCareTaskCategoryLabels[value]}</option>)}</select></label><button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Appliquer</button><Link href={`/litters/journal/calendar?litter=${encodeURIComponent(litterId)}`} className="rounded-lg border px-4 py-2 text-center text-sm font-semibold hover:bg-muted">Réinitialiser</Link></form>
    {!calendar.hasPlannedItems ? <p role="status" className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted">Aucun élément planifié pour cette portée.</p> : null}{calendar.hasPlannedItems && !calendar.hasFilteredItems ? <p role="status" className="rounded-2xl border border-dashed bg-surface p-5 text-sm text-muted">Aucun élément ne correspond aux filtres sélectionnés.</p> : null}{view === "month" ? <MonthView calendar={monthCalendar} litterId={litterId} /> : view === "week" ? <WeekView calendar={weekCalendar} litterId={litterId} /> : <AgendaView calendar={weekCalendar} litterId={litterId} />}
  </main>;
}
