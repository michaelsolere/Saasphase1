import { NextResponse } from "next/server";

import { listOrganizationBreedingCalendarEvents } from "@/features/breeding-calendar/breeding-calendar";
import { buildBreedingCalendarICalendar } from "@/features/litter-journal/litter-care-icalendar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="calendrier-elevage.ics"' };
export async function GET(request: Request) {
  const supabase = await createClient(); const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return NextResponse.redirect(new URL("/login", request.url));
  try { const calendar = await listOrganizationBreedingCalendarEvents(); return new Response(buildBreedingCalendarICalendar({ events: calendar.events, generatedAt: new Date(), calendarName: "Calendrier de l’élevage" }), { headers }); } catch { return new Response("Calendrier indisponible.", { status: 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } }); }
}
