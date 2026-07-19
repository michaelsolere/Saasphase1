import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export const WHELPING_SESSION_STATUSES = ["open", "closed"] as const;
export type WhelpingSessionStatus = (typeof WHELPING_SESSION_STATUSES)[number];

export const WHELPING_EVENT_TYPES = [
  "labor_started",
  "contractions",
  "water_broke",
  "placenta",
  "nursing",
  "vet_called",
  "intervention",
  "observation",
  "birth",
  "session_closed",
] as const;
export type WhelpingEventType = (typeof WHELPING_EVENT_TYPES)[number];

export const GENERIC_WHELPING_EVENT_TYPES = [
  "labor_started",
  "contractions",
  "water_broke",
  "placenta",
  "nursing",
  "vet_called",
  "intervention",
  "observation",
] as const;
export type GenericWhelpingEventType =
  (typeof GENERIC_WHELPING_EVENT_TYPES)[number];

export type WhelpingServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_litter"
  | "invalid_mother"
  | "invalid_session"
  | "already_open"
  | "session_closed"
  | "conflict"
  | "database_error";

export type WhelpingServiceError = {
  code: WhelpingServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: WhelpingServiceError;
};

export type WhelpingSessionSummary = {
  id: string;
  litterId: string;
  motherId: string;
  status: WhelpingSessionStatus;
  startedAt: string;
  endedAt: string | null;
  timezoneName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type WhelpingEventSummary = {
  id: string;
  sessionId: string;
  sequenceNo: number;
  occurredAt: string;
  recordedAt: string;
  eventType: WhelpingEventType;
  note: string | null;
  authorId: string;
};

export type GetOpenWhelpingSessionForLitterInput = { litterId: string };
export type ListWhelpingSessionsForLitterInput = { litterId: string };
export type ListWhelpingEventsForSessionInput = { sessionId: string };

export type GetOpenWhelpingSessionForLitterResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      session: WhelpingSessionSummary | null;
    }
  | ErrorResult;

export type ListWhelpingSessionsForLitterResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      sessions: WhelpingSessionSummary[];
    }
  | ErrorResult;

export type ListWhelpingEventsForSessionResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      events: WhelpingEventSummary[];
    }
  | ErrorResult;

export type OpenWhelpingSessionInput = {
  litterId: string;
  clientCommandId: string;
  startedAt: string;
  timezoneName: string;
  note?: string | null;
};

export type OpenWhelpingSessionResult =
  | {
      outcome: "success";
      sessionId: string;
      litterId: string;
      motherId: string;
      replayed: boolean;
    }
  | ErrorResult;

export type RecordWhelpingEventInput = {
  sessionId: string;
  clientCommandId: string;
  occurredAt: string;
  eventType: GenericWhelpingEventType;
  note?: string | null;
};

export type RecordWhelpingEventResult =
  | {
      outcome: "success";
      eventId: string;
      sessionId: string;
      sequenceNo: number;
      replayed: boolean;
    }
  | ErrorResult;

export type CloseWhelpingSessionInput = {
  sessionId: string;
  clientCommandId: string;
  endedAt: string;
  note?: string | null;
};

export type CloseWhelpingSessionResult =
  | {
      outcome: "success";
      sessionId: string;
      eventId: string;
      sequenceNo: number;
      replayed: boolean;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LitterRow = Pick<
  Database["public"]["Tables"]["litters"]["Row"],
  "id" | "organization_id"
>;
type SessionRow = Database["public"]["Tables"]["whelping_sessions"]["Row"];
type EventRow = Database["public"]["Tables"]["whelping_events"]["Row"];

function failure(code: WhelpingServiceErrorCode, message: string): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

function invalidInput(message = "Les informations transmises sont invalides.") {
  return failure("invalid_input", message);
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return failure(
    "database_error",
    "Une erreur technique empêche momentanément cette opération.",
  );
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return null;
  }
  return new Date(value).toISOString();
}

function normalizeTimezone(value: unknown) {
  if (typeof value !== "string") return null;
  const timezoneName = value.trim();
  if (!timezoneName || timezoneName.length > 255) return null;

  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezoneName });
    return timezoneName;
  } catch {
    return null;
  }
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function isOrganizationRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

function isGenericEventType(value: unknown): value is GenericWhelpingEventType {
  return (
    typeof value === "string" &&
    GENERIC_WHELPING_EVENT_TYPES.includes(value as GenericWhelpingEventType)
  );
}

function mapSession(row: SessionRow): WhelpingSessionSummary {
  return {
    id: row.id,
    litterId: row.litter_id,
    motherId: row.mother_id,
    status: row.status as WhelpingSessionStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    timezoneName: row.timezone_name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function mapEvent(row: EventRow): WhelpingEventSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequenceNo: row.sequence_no,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    eventType: row.event_type as WhelpingEventType,
    note: row.note,
    authorId: row.author_id,
  };
}

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
}

async function authorizeOrganizationRead(
  supabase: Supabase,
  organizationId: string,
  userId: string,
  notFoundMessage: string,
): Promise<OrganizationRole | ErrorResult> {
  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membership.error) {
    return databaseFailure("whelping_membership_read_failed", membership.error);
  }
  if (!membership.data || !isOrganizationRole(membership.data.role)) {
    return failure("not_found", notFoundMessage);
  }
  return membership.data.role;
}

async function authorizeLitterRead(
  supabase: Supabase,
  rawLitterId: unknown,
): Promise<{ role: OrganizationRole; litter: LitterRow } | ErrorResult> {
  const litterId = normalizeUuid(rawLitterId);
  if (!litterId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const litter = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litter.error) return databaseFailure("whelping_litter_read_failed", litter.error);
  if (!litter.data) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  const role = await authorizeOrganizationRead(
    supabase,
    litter.data.organization_id,
    userId,
    "La portée demandée est introuvable.",
  );
  if (typeof role !== "string") return role;
  return { role, litter: litter.data };
}

async function authorizeSessionRead(
  supabase: Supabase,
  rawSessionId: unknown,
): Promise<{ role: OrganizationRole; session: SessionRow } | ErrorResult> {
  const sessionId = normalizeUuid(rawSessionId);
  if (!sessionId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const session = await supabase
    .from("whelping_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (session.error) {
    return databaseFailure("whelping_session_read_failed", session.error);
  }
  if (!session.data) {
    return failure("not_found", "La session demandée est introuvable.");
  }

  const role = await authorizeOrganizationRead(
    supabase,
    session.data.organization_id,
    userId,
    "La session demandée est introuvable.",
  );
  if (typeof role !== "string") return role;
  return { role, session: session.data };
}

function commandFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure("forbidden", "Vous n’avez pas les droits nécessaires.");
    case "litter_not_found":
      return failure("not_found", "La portée demandée est introuvable.");
    case "session_not_found":
      return failure("not_found", "La session demandée est introuvable.");
    case "litter_not_open":
      return failure("invalid_litter", "Cette portée ne permet pas d’ouvrir une session.");
    case "mother_ineligible":
      return failure("invalid_mother", "La mère associée à cette portée est invalide.");
    case "invalid_session":
      return failure("invalid_session", "La session de mise-bas est incohérente.");
    case "session_already_open":
      return failure("already_open", "Une session est déjà ouverte pour cette portée.");
    case "session_closed":
      return failure("session_closed", "Cette session est déjà clôturée.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

export async function getOpenWhelpingSessionForLitterCore(
  input: GetOpenWhelpingSessionForLitterInput,
  supabase: Supabase,
): Promise<GetOpenWhelpingSessionForLitterResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  const session = await supabase
    .from("whelping_sessions")
    .select("*")
    .eq("organization_id", authorization.litter.organization_id)
    .eq("litter_id", authorization.litter.id)
    .eq("status", "open")
    .maybeSingle();

  if (session.error) {
    return databaseFailure("whelping_open_session_read_failed", session.error);
  }
  return {
    outcome: "success",
    role: authorization.role,
    session: session.data ? mapSession(session.data) : null,
  };
}

export async function listWhelpingSessionsForLitterCore(
  input: ListWhelpingSessionsForLitterInput,
  supabase: Supabase,
): Promise<ListWhelpingSessionsForLitterResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  const sessions = await supabase
    .from("whelping_sessions")
    .select("*")
    .eq("organization_id", authorization.litter.organization_id)
    .eq("litter_id", authorization.litter.id)
    .order("started_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (sessions.error) {
    return databaseFailure("whelping_sessions_list_failed", sessions.error);
  }
  return {
    outcome: "success",
    role: authorization.role,
    sessions: (sessions.data ?? []).map(mapSession),
  };
}

export async function listWhelpingEventsForSessionCore(
  input: ListWhelpingEventsForSessionInput,
  supabase: Supabase,
): Promise<ListWhelpingEventsForSessionResult> {
  const authorization = await authorizeSessionRead(supabase, input.sessionId);
  if ("outcome" in authorization) return authorization;

  const events = await supabase
    .from("whelping_events")
    .select("*")
    .eq("organization_id", authorization.session.organization_id)
    .eq("session_id", authorization.session.id)
    .order("sequence_no", { ascending: true });

  if (events.error) {
    return databaseFailure("whelping_events_list_failed", events.error);
  }
  return {
    outcome: "success",
    role: authorization.role,
    events: (events.data ?? []).map(mapEvent),
  };
}

export async function openWhelpingSessionCore(
  input: OpenWhelpingSessionInput,
  supabase: Supabase,
): Promise<OpenWhelpingSessionResult> {
  const litterId = normalizeUuid(input.litterId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const startedAt = normalizeTimestamp(input.startedAt);
  const timezoneName = normalizeTimezone(input.timezoneName);
  const note = normalizeOptionalText(input.note, 5_000);

  if (!litterId || !clientCommandId || !startedAt || !timezoneName || note === undefined) {
    return invalidInput();
  }

  const opened = await supabase.rpc("open_whelping_session", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_started_at: startedAt,
    p_timezone_name: timezoneName,
    p_note: note,
  });

  if (opened.error) return databaseFailure("whelping_session_open_failed", opened.error);
  const result = opened.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.session_id ||
    !result.litter_id ||
    !result.mother_id
  ) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    sessionId: result.session_id,
    litterId: result.litter_id,
    motherId: result.mother_id,
    replayed: result.replayed === true,
  };
}

export async function recordWhelpingEventCore(
  input: RecordWhelpingEventInput,
  supabase: Supabase,
): Promise<RecordWhelpingEventResult> {
  const sessionId = normalizeUuid(input.sessionId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const occurredAt = normalizeTimestamp(input.occurredAt);
  const note = normalizeOptionalText(input.note, 5_000);

  if (
    !sessionId ||
    !clientCommandId ||
    !occurredAt ||
    !isGenericEventType(input.eventType) ||
    note === undefined
  ) {
    return invalidInput();
  }

  const recorded = await supabase.rpc("record_whelping_event", {
    p_session_id: sessionId,
    p_client_command_id: clientCommandId,
    p_occurred_at: occurredAt,
    p_event_type: input.eventType,
    p_note: note,
  });

  if (recorded.error) return databaseFailure("whelping_event_record_failed", recorded.error);
  const result = recorded.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.event_id ||
    !result.session_id ||
    !result.sequence_no
  ) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    eventId: result.event_id,
    sessionId: result.session_id,
    sequenceNo: result.sequence_no,
    replayed: result.replayed === true,
  };
}

export async function closeWhelpingSessionCore(
  input: CloseWhelpingSessionInput,
  supabase: Supabase,
): Promise<CloseWhelpingSessionResult> {
  const sessionId = normalizeUuid(input.sessionId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const endedAt = normalizeTimestamp(input.endedAt);
  const note = normalizeOptionalText(input.note, 5_000);

  if (!sessionId || !clientCommandId || !endedAt || note === undefined) {
    return invalidInput();
  }

  const closed = await supabase.rpc("close_whelping_session", {
    p_session_id: sessionId,
    p_client_command_id: clientCommandId,
    p_ended_at: endedAt,
    p_note: note,
  });

  if (closed.error) return databaseFailure("whelping_session_close_failed", closed.error);
  const result = closed.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.session_id ||
    !result.event_id ||
    !result.sequence_no
  ) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    sessionId: result.session_id,
    eventId: result.event_id,
    sequenceNo: result.sequence_no,
    replayed: result.replayed === true,
  };
}
