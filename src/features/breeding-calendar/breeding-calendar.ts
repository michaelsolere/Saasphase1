import "server-only";

import {
  toAdopterAppointmentCalendarEvent,
  type AdopterAppointmentCalendarRecord,
} from "@/features/breeding-calendar/adopter-appointment-calendar";
import { listOrganizationLitterCareTasks } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import { getLitterDisplayName } from "@/features/litters/formatters";
import { createClient } from "@/lib/supabase/server";

import {
  breedingCalendarEventIdentity,
  toBreedingCalendarEvent as toLitterCareBreedingCalendarEvent,
  type BreedingCalendarEvent,
  type OrganizationBreedingCalendar,
} from "./breeding-calendar-contract";

export type {
  AdopterAppointmentBreedingCalendarEvent,
  BreedingCalendarEvent,
  BreedingCalendarSourceFilter,
  BreedingCalendarSourceType,
  LitterCareBreedingCalendarEvent,
  OrganizationBreedingCalendar,
} from "./breeding-calendar-contract";
export {
  BREEDING_CALENDAR_SOURCE_FILTERS,
  BREEDING_CALENDAR_SOURCE_TYPES,
  breedingCalendarEventIdentity,
  isAdopterAppointmentBreedingCalendarEvent,
  isLitterCareBreedingCalendarEvent,
  toBreedingCalendarEvent,
} from "./breeding-calendar-contract";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function resolveActiveOrganizationId(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unable to load breeding calendar: unauthenticated.");

  const membership = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error || !membership.data?.organization_id) {
    throw new Error("Unable to load breeding calendar: organization unavailable.");
  }

  return membership.data.organization_id as string;
}

function toLitterPlanningCalendarEvent(
  task: LitterCareTaskSummary,
  litterName: string,
): BreedingCalendarEvent | null {
  const event = toLitterCareBreedingCalendarEvent(
    task,
    getLitterDisplayName(litterName, task.litterId),
  );
  if (!event) return null;
  return {
    ...event,
    contextLabel: `Portée ${event.contextLabel}`,
  };
}

export async function listLitterPlanningCalendarEvents(): Promise<OrganizationBreedingCalendar> {
  const result = await listOrganizationLitterCareTasks();
  if (result.outcome !== "success") {
    throw new Error("Unable to load litter planning calendar events.");
  }
  const events = result.tasks
    .map((task) =>
      toLitterPlanningCalendarEvent(task, result.litterNames[task.litterId]),
    )
    .filter((event): event is BreedingCalendarEvent => event !== null);
  return {
    organizationId: result.organizationId,
    events,
    litterNames: result.litterNames,
  };
}

export async function listAdopterAppointmentCalendarEvents(
  organizationId?: string,
): Promise<BreedingCalendarEvent[]> {
  const supabase = await createClient();
  const activeOrganizationId =
    organizationId ?? (await resolveActiveOrganizationId(supabase));

  const eventsResult = await supabase
    .from("events")
    .select("id, reservation_id, event_type, status, planned_at, updated_at, created_at")
    .eq("organization_id", activeOrganizationId)
    .in("event_type", ["puppy_choice", "adoption"])
    .in("status", ["planned", "done"])
    .not("reservation_id", "is", null)
    .not("planned_at", "is", null)
    .is("deleted_at", null);

  if (eventsResult.error) {
    throw new Error("Unable to load adopter appointment calendar events.");
  }

  const rows = eventsResult.data ?? [];
  if (rows.length === 0) return [];

  const reservationIds = [
    ...new Set(
      rows
        .map((row) => row.reservation_id)
        .filter((value): value is string => typeof value === "string" && Boolean(value)),
    ),
  ];

  const reservationsResult = await supabase
    .from("reservations")
    .select("id, contact_id, organization_id, deleted_at")
    .eq("organization_id", activeOrganizationId)
    .in("id", reservationIds)
    .is("deleted_at", null);

  if (reservationsResult.error) {
    throw new Error("Unable to load adopter appointment reservations.");
  }

  const reservations = new Map(
    (reservationsResult.data ?? [])
      .filter((row) => row.organization_id === activeOrganizationId && !row.deleted_at)
      .map((row) => [row.id as string, row]),
  );

  const contactIds = [
    ...new Set(
      [...reservations.values()]
        .map((row) => row.contact_id)
        .filter((value): value is string => typeof value === "string" && Boolean(value)),
    ),
  ];

  const contactsResult =
    contactIds.length === 0
      ? { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[], error: null }
      : await supabase
          .from("contacts")
          .select("id, display_name, first_name, last_name")
          .eq("organization_id", activeOrganizationId)
          .in("id", contactIds)
          .is("deleted_at", null);

  if (contactsResult.error) {
    throw new Error("Unable to load adopter appointment contacts.");
  }

  const contacts = new Map(
    (contactsResult.data ?? []).map((row) => [row.id as string, row]),
  );

  const records: AdopterAppointmentCalendarRecord[] = [];
  for (const row of rows) {
    if (typeof row.reservation_id !== "string" || typeof row.id !== "string") continue;
    if (typeof row.planned_at !== "string") continue;
    const reservation = reservations.get(row.reservation_id);
    if (!reservation) continue;
    const contact = reservation.contact_id
      ? contacts.get(reservation.contact_id as string)
      : null;
    records.push({
      id: row.id,
      reservationId: row.reservation_id,
      eventType: String(row.event_type ?? ""),
      status: String(row.status ?? ""),
      plannedAt: row.planned_at,
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.created_at === "string"
            ? row.created_at
            : new Date(0).toISOString(),
      contactLabel:
        contact?.display_name?.trim() ||
        [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
        "Dossier adoptant",
    });
  }

  return records
    .map(toAdopterAppointmentCalendarEvent)
    .filter(
      (event): event is NonNullable<typeof event> => event !== null,
    );
}

function sortBreedingCalendarEvents(events: BreedingCalendarEvent[]) {
  return [...events].sort(
    (left, right) =>
      left.startsOn.localeCompare(right.startsOn) ||
      (left.startsLocalTime ?? "").localeCompare(right.startsLocalTime ?? "") ||
      left.contextLabel.localeCompare(right.contextLabel) ||
      left.sourceRecordId.localeCompare(right.sourceRecordId),
  );
}

export async function listOrganizationBreedingCalendarEvents(): Promise<OrganizationBreedingCalendar> {
  const litterSource = await listLitterPlanningCalendarEvents();
  const appointments = await listAdopterAppointmentCalendarEvents(
    litterSource.organizationId,
  );
  const seen = new Set<string>();
  const events = sortBreedingCalendarEvents(
    [...litterSource.events, ...appointments].filter((event) => {
      const identity = breedingCalendarEventIdentity(event);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }),
  );
  return { ...litterSource, events };
}
