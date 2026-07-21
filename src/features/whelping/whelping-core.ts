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
  "session_reopened",
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
  | "measured_before_birth"
  | "birth_weight_already_recorded"
  | "invalid_birth_relations"
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

export const WHELPING_BIRTH_SEXES = ["male", "female", "unknown"] as const;
export type WhelpingBirthSex = (typeof WHELPING_BIRTH_SEXES)[number];

export const WHELPING_BIRTH_VIABILITIES = [
  "alive",
  "stillborn",
  "unknown",
] as const;
export type WhelpingBirthViability =
  (typeof WHELPING_BIRTH_VIABILITIES)[number];

export type BirthWeightMeasurementSummary = {
  id: string;
  animalId: string;
  measuredAt: string;
  grams: number;
  note: string | null;
  createdAt: string;
  createdBy: string;
};

export type WhelpingBirthAnimalSummary = {
  id: string;
  litterId: string;
  motherId: string | null;
  fatherId: string | null;
  species: string;
  breed: string;
  sex: WhelpingBirthSex;
  status: string;
  ownershipStatus: string;
  birthDate: string;
  birthTime: string;
  birthOrder: number;
  birthWeightGrams: number | null;
  collarColorInitial: string | null;
  collarColorCurrent: string | null;
  deathDate: string | null;
};

export type WhelpingBirthSummary = {
  id: string;
  sessionId: string;
  birthOrder: number;
  sex: WhelpingBirthSex;
  viability: WhelpingBirthViability;
  initialCollarColor: string | null;
  createdAt: string;
  createdBy: string;
  event: WhelpingEventSummary;
  animal: WhelpingBirthAnimalSummary;
  birthWeightMeasurement: BirthWeightMeasurementSummary | null;
};

export type GetOpenWhelpingSessionForLitterInput = { litterId: string };
export type ListWhelpingSessionsForLitterInput = { litterId: string };
export type ListWhelpingEventsForSessionInput = { sessionId: string };
export type ListWhelpingBirthsForSessionInput = { sessionId: string };

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

export type ListWhelpingBirthsForSessionResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      births: WhelpingBirthSummary[];
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

export type RecordWhelpingBirthInput = {
  sessionId: string;
  clientCommandId: string;
  occurredAt: string;
  sex: WhelpingBirthSex;
  viability: WhelpingBirthViability;
  initialCollarColor?: string | null;
  birthWeightGrams?: number | null;
  measuredAt?: string | null;
  note?: string | null;
};

export type RecordWhelpingBirthResult =
  | {
      outcome: "success";
      birthId: string;
      eventId: string;
      animalId: string;
      weightMeasurementId: string | null;
      eventSequenceNo: number;
      birthOrder: number;
      replayed: boolean;
    }
  | ErrorResult;

export type RecordWhelpingBirthWeightInput = {
  birthId: string;
  clientCommandId: string;
  weightGrams: number;
  measuredAt: string;
  note?: string | null;
};

export type RecordWhelpingBirthWeightResult =
  | {
      outcome: "success";
      birthId: string;
      animalId: string;
      weightMeasurementId: string;
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

export type ReopenWhelpingSessionInput = {
  sessionId: string;
  clientCommandId: string;
  reopenedAt: string;
  reason: string;
};

export type ReopenWhelpingSessionResult =
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
type BirthRow = Database["public"]["Tables"]["whelping_births"]["Row"];
type WeightRow =
  Database["public"]["Tables"]["animal_weight_measurements"]["Row"];
type BirthAnimalRow = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  | "id"
  | "litter_id"
  | "mother_id"
  | "father_id"
  | "species"
  | "breed"
  | "sex"
  | "status"
  | "ownership_status"
  | "birth_date"
  | "birth_time"
  | "birth_order"
  | "birth_weight_grams"
  | "collar_color_initial"
  | "collar_color_current"
  | "death_date"
>;

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

function isBirthSex(value: unknown): value is WhelpingBirthSex {
  return (
    typeof value === "string" &&
    WHELPING_BIRTH_SEXES.includes(value as WhelpingBirthSex)
  );
}

function isBirthViability(value: unknown): value is WhelpingBirthViability {
  return (
    typeof value === "string" &&
    WHELPING_BIRTH_VIABILITIES.includes(value as WhelpingBirthViability)
  );
}

function normalizeOptionalWeight(value: unknown) {
  if (value === undefined || value === null) return null;
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100_000
    ? Number(value)
    : undefined;
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

function mapBirthAnimal(row: BirthAnimalRow): WhelpingBirthAnimalSummary {
  return {
    id: row.id,
    litterId: row.litter_id!,
    motherId: row.mother_id,
    fatherId: row.father_id,
    species: row.species,
    breed: row.breed,
    sex: row.sex as WhelpingBirthSex,
    status: row.status,
    ownershipStatus: row.ownership_status,
    birthDate: row.birth_date!,
    birthTime: row.birth_time!,
    birthOrder: row.birth_order!,
    birthWeightGrams: row.birth_weight_grams,
    collarColorInitial: row.collar_color_initial,
    collarColorCurrent: row.collar_color_current,
    deathDate: row.death_date,
  };
}

function mapWeight(row: WeightRow): BirthWeightMeasurementSummary {
  return {
    id: row.id,
    animalId: row.animal_id,
    measuredAt: row.measured_at,
    grams: row.grams,
    note: row.note,
    createdAt: row.created_at,
    createdBy: row.created_by,
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
    case "birth_not_found":
      return failure("not_found", "La naissance demandée est introuvable.");
    case "litter_not_open":
      return failure("invalid_litter", "Cette portée ne permet pas d’ouvrir une session.");
    case "mother_ineligible":
      return failure("invalid_mother", "La mère associée à cette portée est invalide.");
    case "invalid_session":
      return failure("invalid_session", "La session de mise-bas est incohérente.");
    case "invalid_parent":
      return failure("invalid_mother", "Les parents associés à cette portée sont invalides.");
    case "session_already_open":
      return failure("already_open", "Une session est déjà ouverte pour cette portée.");
    case "session_closed":
      return failure("session_closed", "Cette session est déjà clôturée.");
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    case "measured_before_birth":
      return failure(
        "measured_before_birth",
        "L’heure de pesée ne peut pas précéder l’heure de naissance.",
      );
    case "birth_weight_already_recorded":
      return failure(
        "birth_weight_already_recorded",
        "Un poids de naissance est déjà enregistré.",
      );
    case "birth_relations_inconsistent":
    case "birth_weight_inconsistent":
      return failure(
        "invalid_birth_relations",
        "Les données liées à cette naissance sont incohérentes.",
      );
    case "technical_error":
      return failure(
        "database_error",
        "Une erreur technique empêche momentanément cette opération.",
      );
    case "administrative_offspring_exists":
      return failure(
        "conflict",
        "Cette portée contient déjà des animaux créés hors du Journal.",
      );
    case "actual_birth_date_conflict":
      return failure(
        "conflict",
        "La date de naissance enregistrée pour cette portée est incompatible.",
      );
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

export async function listWhelpingBirthsForSessionCore(
  input: ListWhelpingBirthsForSessionInput,
  supabase: Supabase,
): Promise<ListWhelpingBirthsForSessionResult> {
  const authorization = await authorizeSessionRead(supabase, input.sessionId);
  if ("outcome" in authorization) return authorization;

  const births = await supabase
    .from("whelping_births")
    .select("*")
    .eq("organization_id", authorization.session.organization_id)
    .eq("session_id", authorization.session.id)
    .order("birth_order", { ascending: true });

  if (births.error) {
    return databaseFailure("whelping_births_list_failed", births.error);
  }

  const birthRows = births.data ?? [];
  if (birthRows.length === 0) {
    return { outcome: "success", role: authorization.role, births: [] };
  }

  const [events, animals, weights] = await Promise.all([
    supabase
      .from("whelping_events")
      .select("*")
      .eq("organization_id", authorization.session.organization_id)
      .in(
        "id",
        birthRows.map((birth) => birth.event_id),
      ),
    supabase
      .from("animals")
      .select(
        "id, litter_id, mother_id, father_id, species, breed, sex, status, ownership_status, birth_date, birth_time, birth_order, birth_weight_grams, collar_color_initial, collar_color_current, death_date",
      )
      .eq("organization_id", authorization.session.organization_id)
      .in(
        "id",
        birthRows.map((birth) => birth.animal_id),
      ),
    supabase
      .from("animal_weight_measurements")
      .select("*")
      .eq("organization_id", authorization.session.organization_id)
      .eq("measurement_kind", "birth")
      .in(
        "source_birth_id",
        birthRows.map((birth) => birth.id),
      ),
  ]);

  if (events.error || animals.error || weights.error) {
    return databaseFailure("whelping_birth_relations_read_failed", {
      events: events.error,
      animals: animals.error,
      weights: weights.error,
    });
  }

  const eventsById = new Map((events.data ?? []).map((event) => [event.id, event]));
  const animalsById = new Map(
    (animals.data ?? []).map((animal) => [animal.id, animal]),
  );
  const weightsByBirthId = new Map(
    (weights.data ?? [])
      .filter((weight) => weight.source_birth_id)
      .map((weight) => [weight.source_birth_id!, weight]),
  );
  const incompleteBirth = birthRows.find(
    (birth) => !eventsById.has(birth.event_id) || !animalsById.has(birth.animal_id),
  );
  if (incompleteBirth) {
    return databaseFailure("whelping_birth_relations_incomplete", {
      birthId: incompleteBirth.id,
    });
  }

  return {
    outcome: "success",
    role: authorization.role,
    births: birthRows.map((birth: BirthRow) => {
      const weight = weightsByBirthId.get(birth.id);
      return {
        id: birth.id,
        sessionId: birth.session_id,
        birthOrder: birth.birth_order,
        sex: birth.sex as WhelpingBirthSex,
        viability: birth.viability as WhelpingBirthViability,
        initialCollarColor: birth.initial_collar_color,
        createdAt: birth.created_at,
        createdBy: birth.created_by,
        event: mapEvent(eventsById.get(birth.event_id)!),
        animal: mapBirthAnimal(animalsById.get(birth.animal_id)!),
        birthWeightMeasurement: weight ? mapWeight(weight) : null,
      };
    }),
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

export async function recordWhelpingBirthCore(
  input: RecordWhelpingBirthInput,
  supabase: Supabase,
): Promise<RecordWhelpingBirthResult> {
  const sessionId = normalizeUuid(input.sessionId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const occurredAt = normalizeTimestamp(input.occurredAt);
  const initialCollarColor = normalizeOptionalText(input.initialCollarColor, 255);
  const birthWeightGrams = normalizeOptionalWeight(input.birthWeightGrams);
  const measuredAt =
    input.measuredAt === undefined || input.measuredAt === null
      ? null
      : normalizeTimestamp(input.measuredAt);
  const note = normalizeOptionalText(input.note, 5_000);

  if (
    !sessionId ||
    !clientCommandId ||
    !occurredAt ||
    !isBirthSex(input.sex) ||
    !isBirthViability(input.viability) ||
    initialCollarColor === undefined ||
    birthWeightGrams === undefined ||
    measuredAt === undefined ||
    note === undefined ||
    (birthWeightGrams !== null && measuredAt === null) ||
    (birthWeightGrams === null && measuredAt !== null)
  ) {
    return invalidInput();
  }

  const recorded = await supabase.rpc("record_whelping_birth", {
    p_session_id: sessionId,
    p_client_command_id: clientCommandId,
    p_occurred_at: occurredAt,
    p_sex: input.sex,
    p_viability: input.viability,
    p_initial_collar_color: initialCollarColor,
    p_weight_grams: birthWeightGrams,
    p_measured_at: measuredAt,
    p_note: note,
  });

  if (recorded.error) {
    return databaseFailure("whelping_birth_record_failed", recorded.error);
  }
  const result = recorded.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.birth_id ||
    !result.event_id ||
    !result.animal_id ||
    !result.event_sequence_no ||
    !result.birth_order
  ) {
    return commandFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    birthId: result.birth_id,
    eventId: result.event_id,
    animalId: result.animal_id,
    weightMeasurementId: result.weight_measurement_id,
    eventSequenceNo: result.event_sequence_no,
    birthOrder: result.birth_order,
    replayed: result.replayed === true,
  };
}

export async function recordWhelpingBirthWeightCore(
  input: RecordWhelpingBirthWeightInput,
  supabase: Supabase,
): Promise<RecordWhelpingBirthWeightResult> {
  const birthId = normalizeUuid(input.birthId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const weightGrams = normalizeOptionalWeight(input.weightGrams);
  const measuredAt = normalizeTimestamp(input.measuredAt);
  const note = normalizeOptionalText(input.note, 5_000);

  if (
    !birthId ||
    !clientCommandId ||
    weightGrams === null ||
    weightGrams === undefined ||
    !measuredAt ||
    note === undefined
  ) {
    return invalidInput();
  }

  const recorded = await supabase.rpc("record_whelping_birth_weight", {
    p_birth_id: birthId,
    p_client_command_id: clientCommandId,
    p_weight_grams: weightGrams,
    p_measured_at: measuredAt,
    p_note: note,
  });

  if (recorded.error) {
    return databaseFailure("whelping_birth_weight_record_failed", recorded.error);
  }
  const result = recorded.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.birth_id ||
    !result.animal_id ||
    !result.weight_measurement_id
  ) {
    return commandFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    birthId: result.birth_id,
    animalId: result.animal_id,
    weightMeasurementId: result.weight_measurement_id,
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

export async function reopenWhelpingSessionCore(
  input: ReopenWhelpingSessionInput,
  supabase: Supabase,
): Promise<ReopenWhelpingSessionResult> {
  const sessionId = normalizeUuid(input.sessionId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const reopenedAt = normalizeTimestamp(input.reopenedAt);
  const reason = normalizeOptionalText(input.reason, 500);

  if (!sessionId || !clientCommandId || !reopenedAt || !reason) {
    return invalidInput();
  }

  const reopened = await supabase.rpc("reopen_whelping_session", {
    p_session_id: sessionId,
    p_client_command_id: clientCommandId,
    p_reopened_at: reopenedAt,
    p_reason: reason,
  });

  if (reopened.error) {
    return databaseFailure("whelping_session_reopen_failed", reopened.error);
  }
  const result = reopened.data?.[0];
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
