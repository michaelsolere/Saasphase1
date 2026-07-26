import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  toAdopterAppointmentCalendarEvent,
  type AdopterAppointmentCalendarRecord,
} from "@/features/breeding-calendar/adopter-appointment-calendar";
import {
  type CalendarFeedSources,
  DEFAULT_CALENDAR_FEED_SOURCES,
} from "@/features/breeding-calendar/calendar-feed-token";
import {
  resolveReproductiveCycleAnimalLabel,
  toReproductiveCycleCalendarEvent,
  type ReproductiveCycleCalendarRecord,
} from "@/features/breeding-calendar/reproductive-cycle-calendar";
import {
  listLitterCareTasksForOrganization,
  listOrganizationLitterCareTasks,
} from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import { getLitterDisplayName } from "@/features/litters/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

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
  ReproductiveCycleBreedingCalendarEvent,
} from "./breeding-calendar-contract";
export {
  BREEDING_CALENDAR_SOURCE_FILTERS,
  BREEDING_CALENDAR_SOURCE_TYPES,
  breedingCalendarEventIdentity,
  filterBreedingCalendarEventsBySources,
  isAdopterAppointmentBreedingCalendarEvent,
  isLitterCareBreedingCalendarEvent,
  isReproductiveCycleBreedingCalendarEvent,
  toBreedingCalendarEvent,
} from "./breeding-calendar-contract";

export type { CalendarFeedSources } from "./calendar-feed-token";
export { DEFAULT_CALENDAR_FEED_SOURCES } from "./calendar-feed-token";

type Supabase = SupabaseClient<Database>;

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

export async function listLitterPlanningCalendarEventsForOrganization(
  organizationId: string,
  supabase: Supabase,
): Promise<OrganizationBreedingCalendar> {
  const result = await listLitterCareTasksForOrganization(organizationId, supabase);
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

export async function listReproductiveCycleCalendarEventsForOrganization(
  organizationId: string,
  supabase: Supabase,
): Promise<BreedingCalendarEvent[]> {
  const cyclesResult = await supabase
    .from("reproductive_cycles")
    .select(
      "id, organization_id, mother_id, status, started_on, updated_at, created_at, deleted_at",
    )
    .eq("organization_id", organizationId)
    .in("status", ["planned", "in_progress"])
    .is("deleted_at", null);

  if (cyclesResult.error) {
    throw new Error("Unable to load reproductive cycle calendar events.");
  }

  const rows = cyclesResult.data ?? [];
  if (rows.length === 0) return [];

  const motherIds = [
    ...new Set(
      rows
        .map((row) => row.mother_id)
        .filter((value): value is string => typeof value === "string" && Boolean(value)),
    ),
  ];

  const animalsResult =
    motherIds.length === 0
      ? {
          data: [] as {
            id: string;
            organization_id: string;
            call_name: string | null;
            official_name: string | null;
            deleted_at: string | null;
          }[],
          error: null,
        }
      : await supabase
          .from("animals")
          .select("id, organization_id, call_name, official_name, deleted_at")
          .eq("organization_id", organizationId)
          .in("id", motherIds)
          .is("deleted_at", null);

  if (animalsResult.error) {
    throw new Error("Unable to load reproductive cycle calendar animals.");
  }

  const animals = new Map(
    (animalsResult.data ?? [])
      .filter((row) => row.organization_id === organizationId && !row.deleted_at)
      .map((row) => [row.id as string, row]),
  );

  const records: ReproductiveCycleCalendarRecord[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.mother_id !== "string") continue;
    if (typeof row.started_on !== "string") continue;
    if (row.organization_id !== organizationId || row.deleted_at) continue;
    const animal = animals.get(row.mother_id);
    if (!animal) continue;
    records.push({
      id: row.id,
      motherId: row.mother_id,
      status: String(row.status ?? ""),
      startedOn: row.started_on,
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.created_at === "string"
            ? row.created_at
            : new Date(0).toISOString(),
      animalLabel: resolveReproductiveCycleAnimalLabel({
        callName: animal.call_name,
        officialName: animal.official_name,
      }),
    });
  }

  return records
    .map(toReproductiveCycleCalendarEvent)
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

export async function listReproductiveCycleCalendarEvents(
  organizationId?: string,
): Promise<BreedingCalendarEvent[]> {
  const supabase = await createClient();
  const activeOrganizationId =
    organizationId ?? (await resolveActiveOrganizationId(supabase));
  return listReproductiveCycleCalendarEventsForOrganization(
    activeOrganizationId,
    supabase,
  );
}

export async function listAdopterAppointmentCalendarEventsForOrganization(
  organizationId: string,
  supabase: Supabase,
): Promise<BreedingCalendarEvent[]> {
  const eventsResult = await supabase
    .from("events")
    .select("id, reservation_id, event_type, status, planned_at, updated_at, created_at")
    .eq("organization_id", organizationId)
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
    .eq("organization_id", organizationId)
    .in("id", reservationIds)
    .is("deleted_at", null);

  if (reservationsResult.error) {
    throw new Error("Unable to load adopter appointment reservations.");
  }

  const reservations = new Map(
    (reservationsResult.data ?? [])
      .filter((row) => row.organization_id === organizationId && !row.deleted_at)
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
      ? {
          data: [] as {
            id: string;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
          }[],
          error: null,
        }
      : await supabase
          .from("contacts")
          .select("id, display_name, first_name, last_name")
          .eq("organization_id", organizationId)
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
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

export async function listAdopterAppointmentCalendarEvents(
  organizationId?: string,
): Promise<BreedingCalendarEvent[]> {
  const supabase = await createClient();
  const activeOrganizationId =
    organizationId ?? (await resolveActiveOrganizationId(supabase));
  return listAdopterAppointmentCalendarEventsForOrganization(
    activeOrganizationId,
    supabase,
  );
}

function sourceSortRank(sourceType: BreedingCalendarEvent["sourceType"]) {
  if (sourceType === "litter_care") return 0;
  if (sourceType === "reproductive_cycle") return 1;
  return 2;
}

function sortBreedingCalendarEvents(events: BreedingCalendarEvent[]) {
  return [...events].sort(
    (left, right) =>
      left.startsOn.localeCompare(right.startsOn) ||
      (left.startsLocalTime ?? "").localeCompare(right.startsLocalTime ?? "") ||
      sourceSortRank(left.sourceType) - sourceSortRank(right.sourceType) ||
      left.contextLabel.localeCompare(right.contextLabel) ||
      left.sourceRecordId.localeCompare(right.sourceRecordId),
  );
}

export async function listBreedingCalendarEventsForOrganization(input: {
  organizationId: string;
  supabase: Supabase;
  sources?: CalendarFeedSources;
}): Promise<OrganizationBreedingCalendar> {
  const sources = input.sources ?? DEFAULT_CALENDAR_FEED_SOURCES;
  const litterSource = sources.includeLitterCare
    ? await listLitterPlanningCalendarEventsForOrganization(
        input.organizationId,
        input.supabase,
      )
    : {
        organizationId: input.organizationId,
        events: [] as BreedingCalendarEvent[],
        litterNames: {} as Record<string, string>,
      };

  const [cycles, appointments] = await Promise.all([
    sources.includeReproductiveCycle
      ? listReproductiveCycleCalendarEventsForOrganization(
          input.organizationId,
          input.supabase,
        )
      : Promise.resolve([] as BreedingCalendarEvent[]),
    sources.includeAdopterAppointment
      ? listAdopterAppointmentCalendarEventsForOrganization(
          input.organizationId,
          input.supabase,
        )
      : Promise.resolve([] as BreedingCalendarEvent[]),
  ]);

  const seen = new Set<string>();
  const events = sortBreedingCalendarEvents(
    [...litterSource.events, ...cycles, ...appointments].filter((event) => {
      const identity = breedingCalendarEventIdentity(event);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }),
  );

  return {
    organizationId: input.organizationId,
    events,
    litterNames: litterSource.litterNames,
  };
}

export async function listOrganizationBreedingCalendarEvents(): Promise<OrganizationBreedingCalendar> {
  const supabase = await createClient();
  const organizationId = await resolveActiveOrganizationId(supabase);
  return listBreedingCalendarEventsForOrganization({
    organizationId,
    supabase,
    sources: DEFAULT_CALENDAR_FEED_SOURCES,
  });
}
