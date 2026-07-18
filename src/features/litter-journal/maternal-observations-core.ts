import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export const MATERNAL_OBSERVATION_TYPES = [
  "temperature",
  "appetite",
  "behavior",
  "discharge",
  "contractions",
  "lactation",
  "health",
  "other",
] as const;
export type MaternalObservationType =
  (typeof MATERNAL_OBSERVATION_TYPES)[number];

export const MATERNAL_OBSERVATION_SEVERITIES = [
  "routine",
  "watch",
  "concern",
  "urgent",
] as const;
export type MaternalObservationSeverity =
  (typeof MATERNAL_OBSERVATION_SEVERITIES)[number];

export const MATERNAL_OBSERVATION_TEMPERATURE_UNITS = [
  "celsius",
  "fahrenheit",
] as const;
export type MaternalObservationTemperatureUnit =
  (typeof MATERNAL_OBSERVATION_TEMPERATURE_UNITS)[number];

export type MaternalObservationServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_litter"
  | "invalid_mother"
  | "conflict"
  | "database_error";

export type MaternalObservationServiceError = {
  code: MaternalObservationServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: MaternalObservationServiceError;
};

export type MaternalObservationSummary = {
  id: string;
  litterId: string;
  motherId: string;
  observationType: MaternalObservationType;
  observedAt: string;
  timezoneName: string;
  numericValue: number | null;
  unit: MaternalObservationTemperatureUnit | null;
  severity: MaternalObservationSeverity;
  note: string | null;
  clientCommandId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type ListMaternalObservationsForLitterInput = {
  litterId: string;
};

export type ListMaternalObservationsForLitterResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      observations: MaternalObservationSummary[];
    }
  | ErrorResult;

export type RecordMaternalObservationInput = {
  litterId: string;
  clientCommandId: string;
  observedAt: string;
  timezoneName: string;
  observationType: MaternalObservationType;
  numericValue?: number | null;
  unit?: MaternalObservationTemperatureUnit | null;
  severity?: MaternalObservationSeverity;
  note?: string | null;
};

export type RecordMaternalObservationResult =
  | {
      outcome: "success";
      observationId: string;
      litterId: string;
      motherId: string;
      replayed: boolean;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LitterRow = Pick<
  Database["public"]["Tables"]["litters"]["Row"],
  "id" | "organization_id"
>;
type MaternalObservationRow =
  Database["public"]["Tables"]["maternal_observations"]["Row"];

function failure(
  code: MaternalObservationServiceErrorCode,
  message: string,
): ErrorResult {
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

function isObservationType(value: unknown): value is MaternalObservationType {
  return (
    typeof value === "string" &&
    MATERNAL_OBSERVATION_TYPES.includes(value as MaternalObservationType)
  );
}

function isSeverity(value: unknown): value is MaternalObservationSeverity {
  return (
    typeof value === "string" &&
    MATERNAL_OBSERVATION_SEVERITIES.includes(
      value as MaternalObservationSeverity,
    )
  );
}

function isTemperatureUnit(
  value: unknown,
): value is MaternalObservationTemperatureUnit {
  return (
    typeof value === "string" &&
    MATERNAL_OBSERVATION_TEMPERATURE_UNITS.includes(
      value as MaternalObservationTemperatureUnit,
    )
  );
}

function mapObservation(
  row: MaternalObservationRow,
): MaternalObservationSummary {
  return {
    id: row.id,
    litterId: row.litter_id,
    motherId: row.mother_id,
    observationType: row.observation_type as MaternalObservationType,
    observedAt: row.observed_at,
    timezoneName: row.timezone_name,
    numericValue: row.numeric_value,
    unit: row.unit as MaternalObservationTemperatureUnit | null,
    severity: row.severity as MaternalObservationSeverity,
    note: row.note,
    clientCommandId: row.client_command_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
}

async function authorizeLitterRead(
  supabase: Supabase,
  rawLitterId: unknown,
): Promise<
  | { role: OrganizationRole; litter: LitterRow }
  | ErrorResult
> {
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

  if (litter.error) {
    return databaseFailure("maternal_observation_litter_read_failed", litter.error);
  }
  if (!litter.data) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", litter.data.organization_id)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membership.error) {
    return databaseFailure(
      "maternal_observation_membership_read_failed",
      membership.error,
    );
  }
  if (!membership.data || !isOrganizationRole(membership.data.role)) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  return { role: membership.data.role, litter: litter.data };
}

function recordFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure(
        "forbidden",
        "Vous n’avez pas les droits nécessaires pour cette opération.",
      );
    case "litter_not_found":
      return failure("not_found", "La portée demandée est introuvable.");
    case "mother_ineligible":
      return failure(
        "invalid_mother",
        "La mère associée à cette portée ne peut pas être utilisée.",
      );
    case "litter_not_open":
      return failure(
        "invalid_litter",
        "Cette portée ne permet pas cet enregistrement.",
      );
    case "client_command_conflict":
      return failure("conflict", "Cette commande a déjà été utilisée.");
    default:
      return invalidInput();
  }
}

export async function listMaternalObservationsForLitterCore(
  input: ListMaternalObservationsForLitterInput,
  supabase: Supabase,
): Promise<ListMaternalObservationsForLitterResult> {
  const authorization = await authorizeLitterRead(supabase, input.litterId);
  if ("outcome" in authorization) return authorization;

  const observations = await supabase
    .from("maternal_observations")
    .select("*")
    .eq("organization_id", authorization.litter.organization_id)
    .eq("litter_id", authorization.litter.id)
    .order("observed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (observations.error) {
    return databaseFailure(
      "maternal_observations_list_failed",
      observations.error,
    );
  }

  return {
    outcome: "success",
    role: authorization.role,
    observations: (observations.data ?? []).map(mapObservation),
  };
}

export async function recordMaternalObservationCore(
  input: RecordMaternalObservationInput,
  supabase: Supabase,
): Promise<RecordMaternalObservationResult> {
  const litterId = normalizeUuid(input.litterId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const observedAt = normalizeTimestamp(input.observedAt);
  const timezoneName = normalizeTimezone(input.timezoneName);
  const severity = input.severity ?? "routine";
  const note = normalizeOptionalText(input.note, 5_000);
  const numericValue = input.numericValue ?? null;
  const unit = input.unit ?? null;

  if (
    !litterId ||
    !clientCommandId ||
    !observedAt ||
    !timezoneName ||
    !isObservationType(input.observationType) ||
    !isSeverity(severity) ||
    note === undefined ||
    (numericValue !== null &&
      (typeof numericValue !== "number" || !Number.isFinite(numericValue)))
  ) {
    return invalidInput();
  }

  if (input.observationType === "temperature") {
    if (numericValue === null || numericValue <= 0 || !isTemperatureUnit(unit)) {
      return invalidInput();
    }
  } else if (numericValue !== null || unit !== null || note === null) {
    return invalidInput();
  }

  const recorded = await supabase.rpc("record_maternal_observation", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_observed_at: observedAt,
    p_timezone_name: timezoneName,
    p_observation_type: input.observationType,
    p_numeric_value: numericValue,
    p_unit: unit,
    p_severity: severity,
    p_note: note,
  });

  if (recorded.error) {
    return databaseFailure("maternal_observation_record_failed", recorded.error);
  }

  const result = recorded.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.observation_id ||
    !result.litter_id ||
    !result.mother_id
  ) {
    return recordFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    observationId: result.observation_id,
    litterId: result.litter_id,
    motherId: result.mother_id,
    replayed: result.replayed === true,
  };
}
