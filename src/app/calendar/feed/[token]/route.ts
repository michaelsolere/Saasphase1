import { listBreedingCalendarEventsForOrganization } from "@/features/breeding-calendar/breeding-calendar";
import {
  hashCalendarFeedToken,
  isCalendarFeedTokenFormat,
} from "@/features/breeding-calendar/calendar-feed-token";
import {
  CALENDAR_FEED_CACHE_CONTROL,
  CALENDAR_FEED_CONTENT_DISPOSITION,
  CALENDAR_ICS_CONTENT_TYPE,
} from "@/features/breeding-calendar/calendar-ics-http";
import { buildBreedingCalendarICalendar } from "@/features/litter-journal/litter-care-icalendar";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const feedHeaders = {
  "Content-Type": CALENDAR_ICS_CONTENT_TYPE,
  "Content-Disposition": CALENDAR_FEED_CONTENT_DISPOSITION,
  "Cache-Control": CALENDAR_FEED_CACHE_CONTROL,
  "X-Content-Type-Options": "nosniff",
} as const;

function notFound() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function unavailable() {
  return new Response("Service Unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeTokenParam(raw: string) {
  return raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await context.params;
  const token = normalizeTokenParam(rawToken ?? "");

  if (!isCalendarFeedTokenFormat(token)) {
    return notFound();
  }

  const tokenHash = hashCalendarFeedToken(token);

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return unavailable();
  }

  let feed;
  try {
    const result = await supabase
      .from("organization_calendar_feeds")
      .select(
        "id, organization_id, include_litter_care, include_reproductive_cycle, include_adopter_appointment, revoked_at",
      )
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (result.error) {
      return unavailable();
    }
    feed = result.data;
  } catch {
    return unavailable();
  }

  if (!feed?.organization_id || feed.revoked_at) {
    return notFound();
  }

  try {
    const calendar = await listBreedingCalendarEventsForOrganization({
      organizationId: feed.organization_id,
      supabase,
      sources: {
        includeLitterCare: feed.include_litter_care === true,
        includeReproductiveCycle: feed.include_reproductive_cycle === true,
        includeAdopterAppointment: feed.include_adopter_appointment === true,
      },
    });

    const body = buildBreedingCalendarICalendar({
      events: calendar.events,
      generatedAt: new Date(),
      calendarName: "Calendrier de l’élevage",
      includeSubscriptionHints: true,
    });

    return new Response(body, { status: 200, headers: feedHeaders });
  } catch {
    return unavailable();
  }
}
