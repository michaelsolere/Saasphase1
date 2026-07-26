import Link from "next/link";
import { redirect } from "next/navigation";

import { LitterCareCalendarPanel } from "@/features/litter-journal/litter-care-calendar-panel";
import { formatLitterJournalBusinessDate, getLitterJournalBusinessLocalTime } from "@/features/litter-journal/date";
import { loadLitterJournal } from "@/features/litter-journal/loader";
import { LITTER_CARE_TASK_CATEGORIES, LITTER_CARE_TASK_ITEM_KINDS, listLitterCareTasksForLitter } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareCalendarCategoryFilter, LitterCareCalendarKindFilter } from "@/features/litter-journal/litter-care-calendar";
import type { LitterCareCalendarPageView } from "@/features/litter-journal/litter-care-calendar-panel";
import { getLitterCareCalendarDate, getLitterCareCalendarMonth } from "@/features/litter-journal/litter-care-calendar";
import { getLitterCareTimelineZoom } from "@/features/litter-journal/litter-care-timeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function unavailable() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <section
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
      >
        <h1 className="text-xl font-semibold">Calendrier momentanément indisponible</h1>
        <p className="mt-2 text-sm">
          Le calendrier est momentanément indisponible. Aucune donnée n’a été modifiée.
        </p>
      </section>
    </main>
  );
}

function resolvePageView(value: string | undefined): LitterCareCalendarPageView {
  if (value === "timeline" || value === "week" || value === "agenda") return value;
  return "month";
}

export default async function LitterCareCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    litter?: string;
    month?: string;
    date?: string;
    view?: string;
    zoom?: string;
    kind?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayDate = formatLitterJournalBusinessDate(now);
  const todayLocalTime = getLitterJournalBusinessLocalTime(now);
  const kind: LitterCareCalendarKindFilter =
    params.kind &&
    LITTER_CARE_TASK_ITEM_KINDS.includes(params.kind as LitterCareTaskSummary["itemKind"])
      ? (params.kind as LitterCareTaskSummary["itemKind"])
      : "all";
  const category: LitterCareCalendarCategoryFilter =
    params.category &&
    LITTER_CARE_TASK_CATEGORIES.includes(
      params.category as Exclude<LitterCareCalendarCategoryFilter, "all">,
    )
      ? (params.category as LitterCareCalendarCategoryFilter)
      : "all";
  const month = getLitterCareCalendarMonth(params.month, todayDate);
  const date = getLitterCareCalendarDate(
    params.date ?? (params.month ? `${month}-01` : undefined),
    todayDate,
  );
  const view = resolvePageView(params.view);
  const zoom = getLitterCareTimelineZoom(params.zoom);

  let selection;
  try {
    selection = await loadLitterJournal(supabase, params.litter);
  } catch {
    return unavailable();
  }

  const litters = selection.litters;
  if (!litters.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-dashed bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold">Aucune portée active</h1>
          <p className="mt-2 text-sm text-muted">
            Le calendrier sera disponible lorsqu’une portée sera active.
          </p>
          <Link
            className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
            href="/litters"
          >
            Voir les portées actuelles
          </Link>
        </section>
      </main>
    );
  }

  const litter = selection.selectedLitter;
  if (!litter?.id) return unavailable();

  const result = await listLitterCareTasksForLitter({ litterId: litter.id }).catch(() => null);
  if (!result || result.outcome !== "success") return unavailable();

  return (
    <LitterCareCalendarPanel
      litters={litters}
      litter={litter}
      details={selection.selectedDetails}
      tasks={result.tasks}
      todayDate={todayDate}
      todayLocalTime={todayLocalTime}
      month={month}
      date={date}
      view={view}
      zoom={zoom}
      kind={kind}
      category={category}
    />
  );
}
