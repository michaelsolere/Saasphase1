import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  BREEDING_CALENDAR_SOURCE_FILTERS,
  listOrganizationBreedingCalendarEvents,
  type BreedingCalendarSourceFilter,
} from "@/features/breeding-calendar/breeding-calendar";
import { BreedingCalendarPanel } from "@/features/breeding-calendar/breeding-calendar-panel";
import { getActiveOrganizationCalendarFeed } from "@/features/breeding-calendar/calendar-feed-service";
import { CalendarFeedSubscriptionPanel } from "@/features/breeding-calendar/calendar-feed-subscription-panel";
import type { OrganizationCalendarFeedMetadata } from "@/features/breeding-calendar/calendar-feed-types";
import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
} from "@/features/litter-journal/date";
import {
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_ITEM_KINDS,
} from "@/features/litter-journal/litter-care-tasks";
import type {
  LitterCareCalendarCategoryFilter,
  LitterCareCalendarKindFilter,
} from "@/features/litter-journal/litter-care-calendar";
import type { LitterCareCalendarView } from "@/features/litter-journal/litter-care-calendar-panel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BreedingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    date?: string;
    view?: string;
    source?: string;
    kind?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (!auth.data.user) redirect("/login");

  const source: BreedingCalendarSourceFilter =
    params.source &&
    (BREEDING_CALENDAR_SOURCE_FILTERS as readonly string[]).includes(params.source)
      ? (params.source as BreedingCalendarSourceFilter)
      : "all";
  const kind: LitterCareCalendarKindFilter =
    params.kind && LITTER_CARE_TASK_ITEM_KINDS.includes(params.kind as never)
      ? (params.kind as LitterCareCalendarKindFilter)
      : "all";
  const category: LitterCareCalendarCategoryFilter =
    params.category && LITTER_CARE_TASK_CATEGORIES.includes(params.category as never)
      ? (params.category as LitterCareCalendarCategoryFilter)
      : "all";
  const view: LitterCareCalendarView =
    params.view === "week" || params.view === "agenda" ? params.view : "month";

  let calendar;
  try {
    calendar = await listOrganizationBreedingCalendarEvents();
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <section
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
        >
          <h1 className="text-xl font-semibold">Calendrier momentanément indisponible</h1>
          <p className="mt-2 text-sm">Aucune donnée n’a été modifiée.</p>
        </section>
      </main>
    );
  }

  let feedMetadata: OrganizationCalendarFeedMetadata | null | undefined;
  let feedLoadFailed = false;
  try {
    const feedResult = await getActiveOrganizationCalendarFeed(supabase);
    if (feedResult.outcome === "success") {
      feedMetadata = feedResult.feed;
    } else {
      feedMetadata = undefined;
    }
  } catch {
    feedLoadFailed = true;
  }

  let feedPanel: ReactNode = null;
  if (feedLoadFailed) {
    feedPanel = (
      <section
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"
        data-calendar-feed-panel
      >
        <h2 className="font-semibold">Abonnement calendrier externe</h2>
        <p className="mt-2">
          La gestion de l’abonnement est momentanément indisponible. Le calendrier
          interne reste consultable.
        </p>
      </section>
    );
  } else if (feedMetadata !== undefined) {
    feedPanel = <CalendarFeedSubscriptionPanel initialFeed={feedMetadata} />;
  }

  const now = new Date();
  return (
    <BreedingCalendarPanel
      events={calendar.events}
      todayDate={formatLitterJournalBusinessDate(now)}
      todayLocalTime={getLitterJournalBusinessLocalTime(now)}
      view={view}
      month={params.month}
      date={params.date}
      source={source}
      kind={kind}
      category={category}
      feedPanel={feedPanel}
    />
  );
}
