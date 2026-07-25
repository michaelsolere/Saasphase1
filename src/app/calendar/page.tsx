import { redirect } from "next/navigation";

import { listOrganizationBreedingCalendarEvents } from "@/features/breeding-calendar/breeding-calendar";
import { BreedingCalendarPanel } from "@/features/breeding-calendar/breeding-calendar-panel";
import { formatLitterJournalBusinessDate, getLitterJournalBusinessLocalTime } from "@/features/litter-journal/date";
import { LITTER_CARE_TASK_CATEGORIES, LITTER_CARE_TASK_ITEM_KINDS } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareCalendarCategoryFilter, LitterCareCalendarKindFilter } from "@/features/litter-journal/litter-care-calendar";
import type { LitterCareCalendarView } from "@/features/litter-journal/litter-care-calendar-panel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BreedingCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; date?: string; view?: string; kind?: string; category?: string }> }) {
  const params = await searchParams; const supabase = await createClient(); const auth = await supabase.auth.getUser(); if (!auth.data.user) redirect("/login");
  const kind: LitterCareCalendarKindFilter = params.kind && LITTER_CARE_TASK_ITEM_KINDS.includes(params.kind as never) ? params.kind as LitterCareCalendarKindFilter : "all";
  const category: LitterCareCalendarCategoryFilter = params.category && LITTER_CARE_TASK_CATEGORIES.includes(params.category as never) ? params.category as LitterCareCalendarCategoryFilter : "all";
  const view: LitterCareCalendarView = params.view === "week" || params.view === "agenda" ? params.view : "month";
  let calendar; try { calendar = await listOrganizationBreedingCalendarEvents(); } catch { return <main className="mx-auto max-w-3xl px-4 py-8"><section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h1 className="text-xl font-semibold">Calendrier momentanément indisponible</h1><p className="mt-2 text-sm">Aucune donnée n’a été modifiée.</p></section></main>; }
  const now = new Date(); return <BreedingCalendarPanel events={calendar.events} contextLabels={Object.fromEntries(Object.entries(calendar.litterNames).map(([id, name]) => [id, `Portée ${name}`]))} todayDate={formatLitterJournalBusinessDate(now)} todayLocalTime={getLitterJournalBusinessLocalTime(now)} view={view} month={params.month} date={params.date} kind={kind} category={category} />;
}
