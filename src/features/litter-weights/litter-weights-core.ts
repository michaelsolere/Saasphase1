import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import { buildLitterWeighingSessionStatistics } from "./litter-weighing-session-statistics";

type Supabase = SupabaseClient<Database>;
export type LitterWeightOrganizationRole =
  | "owner"
  | "admin"
  | "member"
  | "viewer";

export type LitterWeightServiceErrorCode =
  | "invalid_input"
  | "too_many_animals"
  | "duplicate_animal"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "animal_ineligible"
  | "measured_before_birth"
  | "measured_after_death"
  | "measurement_already_recorded"
  | "command_conflict"
  | "inconsistent_relations"
  | "database_error";

export type LitterWeightServiceError = {
  code: LitterWeightServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: LitterWeightServiceError;
};

export type RecordLitterRoutineWeightItemInput = {
  animalId: string;
  grams: number;
  note?: string | null;
};

export type RecordLitterRoutineWeightsInput = {
  litterId: string;
  clientCommandId: string;
  measuredAt: string;
  timezoneName: string;
  note?: string | null;
  items: RecordLitterRoutineWeightItemInput[];
};

export type RecordLitterRoutineWeightsResult =
  | {
      outcome: "success";
      litterId: string;
      sessionId: string;
      measurementIds: string[];
      measurementCount: number;
      replayed: boolean;
    }
  | ErrorResult;

export type LitterWeightHistoryAnimal = {
  id: string;
  ownershipStatus: string;
  birthOrder: number | null;
  sex: string;
  callName: string | null;
  officialName: string | null;
  initialCollarColor: string | null;
  currentCollarColor: string | null;
  status: string;
  birthDate: string | null;
  deathDate: string | null;
  birthWeightGrams: number | null;
};

export type LitterWeightHistorySession = {
  id: string;
  measuredAt: string;
  timezoneName: string;
  note: string | null;
  measurementCount: number;
  averageGrams: number | null;
  minimumGrams: number | null;
  maximumGrams: number | null;
  createdBy: string;
  createdAt: string;
};

export type LitterWeightHistoryMeasurement = {
  id: string;
  animalId: string;
  sessionId: string | null;
  type: "birth" | "routine";
  grams: number;
  measuredAt: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

export type ListLitterWeightHistoryInput = { litterId: string };

export type ListLitterWeightHistoryResult =
  | {
      outcome: "success";
      role: LitterWeightOrganizationRole;
      animals: LitterWeightHistoryAnimal[];
      sessions: LitterWeightHistorySession[];
      measurements: LitterWeightHistoryMeasurement[];
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(
  code: LitterWeightServiceErrorCode,
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

function isOrganizationRole(value: string): value is LitterWeightOrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

function commandFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure("forbidden", "Vous n’avez pas les droits nécessaires.");
    case "litter_not_found":
    case "animal_not_found":
      return failure("not_found", "La portée ou l’animal demandé est introuvable.");
    case "too_many_animals":
      return failure("too_many_animals", "Une séance est limitée à 30 animaux.");
    case "duplicate_animal":
      return failure("duplicate_animal", "Un animal apparaît plusieurs fois.");
    case "animal_ineligible":
      return failure("animal_ineligible", "Un animal ne peut pas être pesé.");
    case "measured_before_birth":
      return failure(
        "measured_before_birth",
        "La pesée ne peut pas précéder la naissance.",
      );
    case "measured_after_death":
      return failure(
        "measured_after_death",
        "La pesée ne peut pas être postérieure au décès.",
      );
    case "measurement_already_recorded":
      return failure(
        "measurement_already_recorded",
        "Une mesure existe déjà pour cet animal à cet instant.",
      );
    case "client_command_conflict":
      return failure(
        "command_conflict",
        "Cette commande a déjà été utilisée avec d’autres informations.",
      );
    case "relations_inconsistent":
      return failure(
        "inconsistent_relations",
        "Les relations entre la portée, la séance et les animaux sont incohérentes.",
      );
    case "technical_error":
      return failure(
        "database_error",
        "Une erreur technique empêche momentanément cette opération.",
      );
    default:
      return invalidInput();
  }
}

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
}

async function authorizeLitterRead(
  rawLitterId: unknown,
  supabase: Supabase,
): Promise<
  | {
      litterId: string;
      organizationId: string;
      role: LitterWeightOrganizationRole;
    }
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
    return databaseFailure("litter_weight_history_litter_read_failed", litter.error);
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
      "litter_weight_history_membership_read_failed",
      membership.error,
    );
  }
  if (!membership.data || !isOrganizationRole(membership.data.role)) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  return {
    litterId: litter.data.id,
    organizationId: litter.data.organization_id,
    role: membership.data.role,
  };
}

export async function recordLitterRoutineWeightsCore(
  input: RecordLitterRoutineWeightsInput,
  supabase: Supabase,
): Promise<RecordLitterRoutineWeightsResult> {
  const litterId = normalizeUuid(input.litterId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const measuredAt = normalizeTimestamp(input.measuredAt);
  const timezoneName = normalizeTimezone(input.timezoneName);
  const note = normalizeOptionalText(input.note, 5_000);

  if (
    !litterId ||
    !clientCommandId ||
    !measuredAt ||
    !timezoneName ||
    note === undefined ||
    !Array.isArray(input.items) ||
    input.items.length < 1
  ) {
    return invalidInput();
  }
  if (input.items.length > 30) {
    return failure("too_many_animals", "Une séance est limitée à 30 animaux.");
  }

  const normalizedItems: Array<{
    animal_id: string;
    grams: number;
    note: string | null;
  }> = [];
  const animalIds = new Set<string>();

  for (const item of input.items) {
    const animalId = normalizeUuid(item?.animalId);
    const itemNote = normalizeOptionalText(item?.note, 5_000);
    if (
      !animalId ||
      !Number.isInteger(item?.grams) ||
      item.grams < 1 ||
      item.grams > 100_000 ||
      itemNote === undefined
    ) {
      return invalidInput();
    }
    if (animalIds.has(animalId)) {
      return failure("duplicate_animal", "Un animal apparaît plusieurs fois.");
    }

    animalIds.add(animalId);
    normalizedItems.push({
      animal_id: animalId,
      grams: item.grams,
      note: itemNote,
    });
  }

  const recorded = await supabase.rpc("record_litter_routine_weights", {
    p_litter_id: litterId,
    p_client_command_id: clientCommandId,
    p_measured_at: measuredAt,
    p_timezone_name: timezoneName,
    p_note: note,
    p_items: normalizedItems as Json,
  });

  if (recorded.error) {
    return databaseFailure("litter_routine_weights_record_failed", recorded.error);
  }

  const result = recorded.data?.[0];
  if (
    !result ||
    result.outcome !== "success" ||
    !result.litter_id ||
    !result.litter_weighing_session_id ||
    !result.measurement_ids ||
    result.measurement_count === null
  ) {
    return commandFailure(result?.reason ?? null);
  }

  return {
    outcome: "success",
    litterId: result.litter_id,
    sessionId: result.litter_weighing_session_id,
    measurementIds: result.measurement_ids,
    measurementCount: result.measurement_count,
    replayed: result.replayed === true,
  };
}

export async function listLitterWeightHistoryCore(
  input: ListLitterWeightHistoryInput,
  supabase: Supabase,
): Promise<ListLitterWeightHistoryResult> {
  const authorization = await authorizeLitterRead(input.litterId, supabase);
  if ("outcome" in authorization) return authorization;

  const animals = await supabase
    .from("animals")
    .select(
      "id, ownership_status, birth_order, sex, call_name, official_name, collar_color_initial, collar_color_current, status, birth_date, death_date, birth_weight_grams",
    )
    .eq("organization_id", authorization.organizationId)
    .eq("litter_id", authorization.litterId)
    .is("deleted_at", null)
    .order("birth_order", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (animals.error) {
    return databaseFailure("litter_weight_history_animals_read_failed", animals.error);
  }

  const animalRows = animals.data ?? [];
  const animalIds = animalRows.map((animal) => animal.id);
  const sessions = await supabase
    .from("litter_weighing_sessions")
    .select("id, measured_at, timezone_name, note, created_by, created_at")
    .eq("organization_id", authorization.organizationId)
    .eq("litter_id", authorization.litterId)
    .order("measured_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (sessions.error) {
    return databaseFailure("litter_weight_history_relations_read_failed", {
      sessions: sessions.error,
    });
  }

  const sessionIds = (sessions.data ?? []).map((session) => session.id);
  const [measurements, sessionMeasurements] = await Promise.all([
    animalIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("animal_weight_measurements")
          .select(
            "id, animal_id, litter_weighing_session_id, measurement_kind, grams, measured_at, note, created_by, created_at",
          )
          .eq("organization_id", authorization.organizationId)
          .in("animal_id", animalIds)
          .in("measurement_kind", ["birth", "routine"])
          .order("animal_id", { ascending: true })
          .order("measured_at", { ascending: true })
          .order("created_at", { ascending: true }),
    sessionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("animal_weight_measurements")
          .select("litter_weighing_session_id, grams")
          .eq("organization_id", authorization.organizationId)
          .eq("measurement_kind", "routine")
          .in("litter_weighing_session_id", sessionIds),
  ]);

  if (measurements.error || sessionMeasurements.error) {
    return databaseFailure("litter_weight_history_relations_read_failed", {
      measurements: measurements.error,
      sessionMeasurements: sessionMeasurements.error,
    });
  }

  const measurementRows = measurements.data ?? [];
  const sessionIdSet = new Set(sessionIds);
  const inconsistentMeasurement = measurementRows.find(
    (measurement) =>
      (measurement.measurement_kind === "routine" &&
        (!measurement.litter_weighing_session_id ||
          !sessionIdSet.has(measurement.litter_weighing_session_id))) ||
      (measurement.measurement_kind === "birth" &&
        measurement.litter_weighing_session_id !== null),
  );
  if (inconsistentMeasurement) {
    return databaseFailure("litter_weight_history_inconsistent_session_link", {
      litterId: authorization.litterId,
      measurementId: inconsistentMeasurement.id,
      measurementKind: inconsistentMeasurement.measurement_kind,
      sessionId: inconsistentMeasurement.litter_weighing_session_id,
    });
  }

  const statisticsBySession = buildLitterWeighingSessionStatistics(
    (sessionMeasurements.data ?? []).flatMap((measurement) =>
      measurement.litter_weighing_session_id &&
      sessionIdSet.has(measurement.litter_weighing_session_id)
        ? [
            {
              sessionId: measurement.litter_weighing_session_id,
              grams: measurement.grams,
            },
          ]
        : [],
    ),
  );

  return {
    outcome: "success",
    role: authorization.role,
    animals: animalRows.map((animal) => ({
      id: animal.id,
      ownershipStatus: animal.ownership_status,
      birthOrder: animal.birth_order,
      sex: animal.sex,
      callName: animal.call_name,
      officialName: animal.official_name,
      initialCollarColor: animal.collar_color_initial,
      currentCollarColor: animal.collar_color_current,
      status: animal.status,
      birthDate: animal.birth_date,
      deathDate: animal.death_date,
      birthWeightGrams: animal.birth_weight_grams,
    })),
    sessions: (sessions.data ?? []).map((session) => {
      const statistics = statisticsBySession.get(session.id);
      return {
        id: session.id,
        measuredAt: session.measured_at,
        timezoneName: session.timezone_name,
        note: session.note,
        measurementCount: statistics?.measurementCount ?? 0,
        averageGrams: statistics?.averageGrams ?? null,
        minimumGrams: statistics?.minimumGrams ?? null,
        maximumGrams: statistics?.maximumGrams ?? null,
        createdBy: session.created_by,
        createdAt: session.created_at,
      };
    }),
    measurements: measurementRows.map((measurement) => ({
      id: measurement.id,
      animalId: measurement.animal_id,
      sessionId: measurement.litter_weighing_session_id,
      type: measurement.measurement_kind as "birth" | "routine",
      grams: measurement.grams,
      measuredAt: measurement.measured_at,
      note: measurement.note,
      createdBy: measurement.created_by,
      createdAt: measurement.created_at,
    })),
  };
}
