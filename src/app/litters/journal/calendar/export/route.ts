import { NextResponse } from "next/server";

import { buildLitterCareICalendar, isLitterCareCalendarExportUuid } from "@/features/litter-journal/litter-care-icalendar";
import { LITTER_CARE_TASK_CATEGORIES, LITTER_CARE_TASK_ITEM_KINDS, listLitterCareTasksForLitter } from "@/features/litter-journal/litter-care-tasks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Content-Type": "text/calendar; charset=utf-8" };
function unavailable() { return new Response("Calendrier indisponible.", { status: 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } }); }
function filename(name: string | null) { const safe = (name ?? "portee").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase(); return `${safe || "portee"}-journal.ics`; }

export async function GET(request: Request) {
  const url = new URL(request.url); const litter = url.searchParams.get("litter"); const rawKind = url.searchParams.get("kind") ?? "all"; const rawCategory = url.searchParams.get("category") ?? "all";
  if (!isLitterCareCalendarExportUuid(litter) || ["litter", "kind", "category"].some((key) => url.searchParams.getAll(key).length > 1) || (rawKind !== "all" && !LITTER_CARE_TASK_ITEM_KINDS.includes(rawKind as (typeof LITTER_CARE_TASK_ITEM_KINDS)[number])) || (rawCategory !== "all" && !LITTER_CARE_TASK_CATEGORIES.includes(rawCategory as (typeof LITTER_CARE_TASK_CATEGORIES)[number])) || [...url.searchParams.keys()].some((key) => !["litter", "kind", "category"].includes(key))) return unavailable();
  const supabase = await createClient(); const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return NextResponse.redirect(new URL("/login", request.url));
  const result = await listLitterCareTasksForLitter({ litterId: litter }).catch(() => null);
  if (!result || result.outcome !== "success") return unavailable();
  const litterName = result.litterName?.trim() || "Portée";
  return new Response(buildLitterCareICalendar({ litterName, tasks: result.tasks, filters: { kind: rawKind as "all" | (typeof LITTER_CARE_TASK_ITEM_KINDS)[number], category: rawCategory as "all" | (typeof LITTER_CARE_TASK_CATEGORIES)[number] }, generatedAt: new Date() }), { headers: { ...headers, "Content-Disposition": `attachment; filename="${filename(result.litterName)}"` } });
}
