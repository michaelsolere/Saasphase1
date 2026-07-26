import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listOrganizationBreedingCalendarEvents,
  type BreedingCalendarEvent,
} from "@/features/breeding-calendar/breeding-calendar";
import {
  projectCalendarRemindersForEvents,
  toCalendarReminderRule,
  type CalendarReminderRow,
  type CalendarReminderSummary,
} from "@/features/breeding-calendar/calendar-reminders-core";
import type { CalendarReminderSourceType } from "@/features/breeding-calendar/calendar-reminder-projection";
import {
  DEFAULT_CALENDAR_REMINDER_TIMEZONE,
  CALENDAR_REMINDER_STALE_TRIGGER_MESSAGE,
} from "@/features/breeding-calendar/calendar-reminder-projection";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type CalendarReminderMutationErrorCode =
  | "not_authenticated"
  | "membership_required"
  | "forbidden"
  | "invalid_input"
  | "source_not_found"
  | "source_not_admissible"
  | "duplicate_reminder"
  | "reminder_not_found"
  | "stale_revision"
  | "stale_trigger"
  | "client_command_conflict"
  | "unavailable";

export { CALENDAR_REMINDER_STALE_TRIGGER_MESSAGE };

export type CalendarReminderMutationResult =
  | {
      outcome: "success";
      reminder: CalendarReminderSummary | null;
      revisionNo: number;
      replayed: boolean;
      deletedAt?: string | null;
    }
  | {
      outcome: "error";
      error: { code: CalendarReminderMutationErrorCode; message: string };
    };

const REMINDER_SELECT =
  "id, organization_id, litter_care_task_id, reproductive_cycle_id, adopter_event_id, days_before, local_time, timezone_name, revision_no, acknowledged_trigger_at, acknowledged_at, acknowledged_by" as const;

function mapError(reason: string | null | undefined): CalendarReminderMutationErrorCode {
  switch (reason) {
    case "not_authenticated":
    case "membership_required":
    case "forbidden":
    case "invalid_input":
    case "source_not_found":
    case "source_not_admissible":
    case "duplicate_reminder":
    case "reminder_not_found":
    case "stale_revision":
    case "stale_trigger":
    case "client_command_conflict":
      return reason;
    default:
      return "unavailable";
  }
}

function errorMessage(code: CalendarReminderMutationErrorCode): string {
  switch (code) {
    case "not_authenticated":
      return "Authentification requise.";
    case "membership_required":
      return "Droits insuffisants pour cette action.";
    case "forbidden":
      return "Action interdite.";
    case "invalid_input":
      return "Paramètres de rappel invalides.";
    case "source_not_found":
      return "Événement introuvable.";
    case "source_not_admissible":
      return "Cet événement n’accepte pas de rappel.";
    case "duplicate_reminder":
      return "Un rappel identique existe déjà.";
    case "reminder_not_found":
      return "Rappel introuvable.";
    case "stale_revision":
      return "Le rappel a été modifié ailleurs. Actualisez la page.";
    case "stale_trigger":
      return CALENDAR_REMINDER_STALE_TRIGGER_MESSAGE;
    case "client_command_conflict":
      return "Conflit de commande. Réessayez.";
    case "unavailable":
      return "Les rappels sont momentanément indisponibles.";
  }
}

async function resolveActiveOrganizationId(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const membership = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error || !membership.data?.organization_id) return null;
  return {
    organizationId: membership.data.organization_id as string,
    role: membership.data.role as string,
    userId: user.id,
  };
}

function normalizeLocalTimeForDb(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

export async function listActiveCalendarReminderRows(
  organizationId: string,
  supabase: Supabase,
): Promise<CalendarReminderRow[]> {
  const result = await supabase
    .from("calendar_reminders")
    .select(REMINDER_SELECT)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error("Unable to load calendar reminders.");
  }

  return (result.data ?? []) as CalendarReminderRow[];
}

export async function listOrganizationCalendarReminders(input?: {
  events?: readonly BreedingCalendarEvent[];
  now?: Date;
  supabase?: Supabase;
}): Promise<{
  organizationId: string;
  reminders: CalendarReminderSummary[];
  role: string;
}> {
  const supabase = input?.supabase ?? (await createClient());
  const membership = await resolveActiveOrganizationId(supabase);
  if (!membership) {
    throw new Error("Unable to load calendar reminders: organization unavailable.");
  }

  const events =
    input?.events ??
    (await listOrganizationBreedingCalendarEvents()).events;
  const rows = await listActiveCalendarReminderRows(
    membership.organizationId,
    supabase,
  );
  const reminders = projectCalendarRemindersForEvents({
    rows,
    events,
    now: input?.now ?? new Date(),
  });

  return {
    organizationId: membership.organizationId,
    reminders,
    role: membership.role,
  };
}

function summaryFromRpcRow(
  row: {
    reminder_id: string | null;
    organization_id: string | null;
    source_type: string | null;
    source_record_id: string | null;
    days_before: number | null;
    local_time: string | null;
    timezone_name: string | null;
    revision_no: number | null;
    acknowledged_trigger_at: string | null;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
  },
  events: readonly BreedingCalendarEvent[],
  now: Date,
): CalendarReminderSummary | null {
  if (
    !row.reminder_id ||
    !row.organization_id ||
    !row.source_type ||
    !row.source_record_id ||
    row.days_before == null ||
    !row.local_time ||
    !row.timezone_name ||
    row.revision_no == null
  ) {
    return null;
  }

  const dbRow: CalendarReminderRow = {
    id: row.reminder_id,
    organization_id: row.organization_id,
    litter_care_task_id:
      row.source_type === "litter_care_task" ? row.source_record_id : null,
    reproductive_cycle_id:
      row.source_type === "reproductive_cycle" ? row.source_record_id : null,
    adopter_event_id:
      row.source_type === "adopter_event" ? row.source_record_id : null,
    days_before: row.days_before,
    local_time: row.local_time,
    timezone_name: row.timezone_name,
    revision_no: row.revision_no,
    acknowledged_trigger_at: row.acknowledged_trigger_at,
    acknowledged_at: row.acknowledged_at,
    acknowledged_by: row.acknowledged_by,
  };

  const rule = toCalendarReminderRule(dbRow);
  if (!rule) return null;

  const event =
    events.find((candidate) => {
      if (rule.sourceType === "litter_care_task") {
        return (
          candidate.sourceType === "litter_care" &&
          candidate.sourceRecordId === rule.sourceRecordId
        );
      }
      if (rule.sourceType === "reproductive_cycle") {
        return (
          candidate.sourceType === "reproductive_cycle" &&
          candidate.sourceRecordId === rule.sourceRecordId
        );
      }
      return (
        candidate.sourceType === "adopter_appointment" &&
        candidate.sourceRecordId === rule.sourceRecordId
      );
    }) ?? null;

  return projectCalendarRemindersForEvents({
    rows: [dbRow],
    events: event ? [event] : [],
    now,
  })[0] ?? null;
}

export async function createCalendarReminder(input: {
  sourceType: CalendarReminderSourceType;
  sourceRecordId: string;
  daysBefore: number;
  localTime: string;
  timezoneName?: string;
  clientCommandId: string;
  events?: readonly BreedingCalendarEvent[];
  now?: Date;
}): Promise<CalendarReminderMutationResult> {
  const supabase = await createClient();
  const result = await supabase.rpc("create_calendar_reminder", {
    p_source_type: input.sourceType,
    p_source_record_id: input.sourceRecordId,
    p_days_before: input.daysBefore,
    p_local_time: normalizeLocalTimeForDb(input.localTime),
    p_timezone_name: input.timezoneName ?? DEFAULT_CALENDAR_REMINDER_TIMEZONE,
    p_client_command_id: input.clientCommandId,
  });

  if (result.error) {
    return {
      outcome: "error",
      error: { code: "unavailable", message: errorMessage("unavailable") },
    };
  }

  const row = result.data?.[0];
  if (!row || row.outcome !== "success") {
    const code = mapError(row?.reason);
    return { outcome: "error", error: { code, message: errorMessage(code) } };
  }

  const events =
    input.events ??
    (await listOrganizationBreedingCalendarEvents()).events;

  return {
    outcome: "success",
    reminder: summaryFromRpcRow(row, events, input.now ?? new Date()),
    revisionNo: row.revision_no ?? 1,
    replayed: Boolean(row.replayed),
  };
}

export async function updateCalendarReminder(input: {
  reminderId: string;
  expectedRevisionNo: number;
  daysBefore: number;
  localTime: string;
  timezoneName?: string;
  clientCommandId: string;
  events?: readonly BreedingCalendarEvent[];
  now?: Date;
}): Promise<CalendarReminderMutationResult> {
  const supabase = await createClient();
  const result = await supabase.rpc("update_calendar_reminder", {
    p_reminder_id: input.reminderId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_days_before: input.daysBefore,
    p_local_time: normalizeLocalTimeForDb(input.localTime),
    p_timezone_name: input.timezoneName ?? DEFAULT_CALENDAR_REMINDER_TIMEZONE,
    p_client_command_id: input.clientCommandId,
  });

  if (result.error) {
    return {
      outcome: "error",
      error: { code: "unavailable", message: errorMessage("unavailable") },
    };
  }

  const row = result.data?.[0];
  if (!row || row.outcome !== "success") {
    const code = mapError(row?.reason);
    return { outcome: "error", error: { code, message: errorMessage(code) } };
  }

  const events =
    input.events ??
    (await listOrganizationBreedingCalendarEvents()).events;

  return {
    outcome: "success",
    reminder: summaryFromRpcRow(row, events, input.now ?? new Date()),
    revisionNo: row.revision_no ?? input.expectedRevisionNo + 1,
    replayed: Boolean(row.replayed),
  };
}

export async function acknowledgeCalendarReminder(input: {
  reminderId: string;
  expectedRevisionNo: number;
  expectedTriggerAt: string;
  clientCommandId: string;
  events?: readonly BreedingCalendarEvent[];
  now?: Date;
}): Promise<CalendarReminderMutationResult> {
  const supabase = await createClient();
  const result = await supabase.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: input.reminderId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_expected_trigger_at: input.expectedTriggerAt,
    p_client_command_id: input.clientCommandId,
  });

  if (result.error) {
    return {
      outcome: "error",
      error: { code: "unavailable", message: errorMessage("unavailable") },
    };
  }

  const row = result.data?.[0];
  if (!row || row.outcome !== "success") {
    const code = mapError(row?.reason);
    return { outcome: "error", error: { code, message: errorMessage(code) } };
  }

  const events =
    input.events ??
    (await listOrganizationBreedingCalendarEvents()).events;

  return {
    outcome: "success",
    reminder: summaryFromRpcRow(row, events, input.now ?? new Date()),
    revisionNo: row.revision_no ?? input.expectedRevisionNo + 1,
    replayed: Boolean(row.replayed),
  };
}

export async function deleteCalendarReminder(input: {
  reminderId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
}): Promise<CalendarReminderMutationResult> {
  const supabase = await createClient();
  const result = await supabase.rpc("delete_calendar_reminder", {
    p_reminder_id: input.reminderId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_client_command_id: input.clientCommandId,
  });

  if (result.error) {
    return {
      outcome: "error",
      error: { code: "unavailable", message: errorMessage("unavailable") },
    };
  }

  const row = result.data?.[0];
  if (!row || row.outcome !== "success") {
    const code = mapError(row?.reason);
    return { outcome: "error", error: { code, message: errorMessage(code) } };
  }

  return {
    outcome: "success",
    reminder: null,
    revisionNo: row.revision_no ?? input.expectedRevisionNo + 1,
    replayed: Boolean(row.replayed),
    deletedAt: row.deleted_at,
  };
}
