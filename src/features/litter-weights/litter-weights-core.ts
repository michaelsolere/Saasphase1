import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

import {
  buildLitterAgeComparisonModel,
  type LitterAgeComparisonPoint,
} from "./litter-age-comparison-model";
import {
  buildLitterWeightLatestSessionComparison,
  type LitterWeightLatestSessionComparison,
} from "./litter-weighing-session-comparison";
import { buildLitterWeighingSessionStatistics } from "./litter-weighing-session-statistics";
import {
  buildLitterWeighingScheduleFromHistory,
} from "./litter-weighing-schedule-history-adapter";
import {
  resolveAuthorizedLitterWeighingSchedulePolicyCore,
  type ResolveLitterWeighingSchedulePolicySource,
} from "./litter-weighing-policy-core";
import type {
  LitterWeighingSchedulePolicy,
  LitterWeighingScheduleResult,
} from "./litter-weighing-schedule-model";

type Supabase = SupabaseClient<Database>;
export type LitterWeightOrganizationRole =
  | "owner"
  | "admin"
  | "member"
  | "viewer";

export type LitterWeightServiceErrorCode =
  | "invalid_input"
  | "too_many_litters"
  | "incompatible_litters"
  | "comparison_too_large"
  | "too_many_animals"
  | "duplicate_animal"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "animal_ineligible"
  | "measured_before_birth"
  | "measured_after_death"
  | "measurement_already_recorded"
  | "measurement_not_found"
  | "session_not_found"
  | "measurement_cancelled"
  | "session_cancelled"
  | "stale_revision"
  | "no_change"
  | "last_measurement_requires_session_cancellation"
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

export type CorrectLitterRoutineWeightInput = {
  measurementId: string;
  clientCommandId: string;
  expectedRevisionNo: number;
  grams: number;
  note?: string | null;
  reason: string;
};

export type CorrectLitterRoutineWeightResult =
  | {
      outcome: "success";
      measurementId: string;
      sessionId: string;
      revisionNo: number;
      replayed: boolean;
    }
  | ErrorResult;

export type CancelLitterRoutineWeightInput = {
  measurementId: string;
  clientCommandId: string;
  expectedRevisionNo: number;
  cancelledAt: string;
  reason: string;
};

export type CancelLitterRoutineWeightResult = CorrectLitterRoutineWeightResult;

export type CancelLitterWeighingSessionInput = {
  sessionId: string;
  clientCommandId: string;
  expectedRevisionNo: number;
  cancelledAt: string;
  reason: string;
};

export type CancelLitterWeighingSessionResult =
  | {
      outcome: "success";
      sessionId: string;
      revisionNo: number;
      affectedMeasurementCount: number;
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
  revisionNo: number;
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
  revisionNo: number;
  animalId: string;
  sessionId: string | null;
  type: "birth" | "routine";
  grams: number;
  measuredAt: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

export type LitterWeightAdjustmentHistoryEntry = {
  commandType: "correct_measurement" | "cancel_measurement" | "cancel_session";
  createdAt: string;
  reason: string;
  sessionMeasuredAt: string;
  sessionTimezoneName: string;
  animalLabel: string | null;
  beforeGrams: number | null;
  afterGrams: number | null;
  beforeNote: string | null;
  afterNote: string | null;
  affectedMeasurementCount: number;
};

export type ListLitterWeightAdjustmentHistoryInput = {
  litterId: string;
  limit?: number;
};

export type ListLitterWeightAdjustmentHistoryResult =
  | { outcome: "success"; entries: LitterWeightAdjustmentHistoryEntry[] }
  | ErrorResult;

export type ListLitterWeightHistoryScheduleRequest = {
  todayDate: string;
};

export type LitterWeighingSchedulePolicyMetadata = {
  source: ResolveLitterWeighingSchedulePolicySource;
  phases: LitterWeighingSchedulePolicy["phases"];
};

export type ListLitterWeightHistoryInput = {
  litterId: string;
  schedule?: ListLitterWeightHistoryScheduleRequest;
};

export type ListLitterAgeComparisonInput = {
  litterIds: string[];
};

export type ListLitterAgeComparisonResult =
  | {
      outcome: "success";
      role: LitterWeightOrganizationRole;
      species: string;
      breed: string;
      model: {
        series: Array<{
          publicLabel: string;
          birthDate: string | null;
          seriesIndex: number;
          totalAnimalCount: number;
          eligibleAnimalCount: number;
          excludedAnimalCount: number;
          status: "available" | "no_eligible_animals";
          points: LitterAgeComparisonPoint[];
        }>;
      };
    }
  | ErrorResult;

export type ListLitterWeightHistoryResult =
  | {
      outcome: "success";
      role: LitterWeightOrganizationRole;
      animals: LitterWeightHistoryAnimal[];
      sessions: LitterWeightHistorySession[];
      measurements: LitterWeightHistoryMeasurement[];
      latestSessionComparison: LitterWeightLatestSessionComparison;
      weighingSchedule: LitterWeighingScheduleResult | null;
      weighingSchedulePolicy: LitterWeighingSchedulePolicyMetadata | null;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LITTER_WEIGHT_HISTORY_MAX_HISTORICAL_ANIMALS = 500;
const LITTER_COMPARISON_MIN_LITTERS = 2;
const LITTER_COMPARISON_MAX_LITTERS = 5;
const LITTER_COMPARISON_MAX_ANIMALS = 150;
const LITTER_COMPARISON_MAX_MEASUREMENTS = 25_000;
const LITTER_COMPARISON_PAGE_SIZE = 500;

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
    case "measurement_not_found":
      return failure("measurement_not_found", "La mesure demandée est introuvable.");
    case "session_not_found":
      return failure("session_not_found", "La séance demandée est introuvable.");
    case "measurement_cancelled":
      return failure("measurement_cancelled", "Cette mesure est annulée.");
    case "session_cancelled":
      return failure("session_cancelled", "Cette séance est annulée.");
    case "stale_revision":
      return failure("stale_revision", "Cette donnée a été modifiée depuis son affichage.");
    case "no_change":
      return failure("no_change", "La correction ne contient aucun changement.");
    case "last_measurement_requires_session_cancellation":
      return failure(
        "last_measurement_requires_session_cancellation",
        "La dernière mesure active doit être annulée avec la séance entière.",
      );
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
      actualBirthDate: string | null;
      litterWeighingSchedulePolicySnapshot: Json | null;
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
    .select(
      "id, organization_id, actual_birth_date, litter_weighing_schedule_policy_snapshot",
    )
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
    actualBirthDate: litter.data.actual_birth_date,
    litterWeighingSchedulePolicySnapshot:
      litter.data.litter_weighing_schedule_policy_snapshot,
  };
}

type LitterComparisonLitter = {
  id: string;
  organization_id: string;
  name: string;
  species: string;
  breed: string;
  actual_birth_date: string | null;
};

type LitterComparisonAuthorization = {
  litterIds: string[];
  litters: LitterComparisonLitter[];
  organizationId: string;
  role: LitterWeightOrganizationRole;
  species: string;
  breed: string;
};

function normalizeComparisonLitterIds(input: unknown): string[] | ErrorResult {
  if (!Array.isArray(input) || input.length < LITTER_COMPARISON_MIN_LITTERS) {
    return invalidInput("Sélectionnez entre deux et cinq portées.");
  }
  if (input.length > LITTER_COMPARISON_MAX_LITTERS) {
    return failure(
      "too_many_litters",
      "La comparaison est limitée à cinq portées.",
    );
  }

  const litterIds: string[] = [];
  const uniqueLitterIds = new Set<string>();
  for (const value of input) {
    const litterId = normalizeUuid(value);
    if (!litterId || uniqueLitterIds.has(litterId)) {
      return invalidInput("La sélection de portées est invalide.");
    }
    uniqueLitterIds.add(litterId);
    litterIds.push(litterId);
  }

  return litterIds;
}

async function authorizeLitterComparisonRead(
  rawLitterIds: unknown,
  supabase: Supabase,
): Promise<LitterComparisonAuthorization | ErrorResult> {
  const litterIds = normalizeComparisonLitterIds(rawLitterIds);
  if (!Array.isArray(litterIds)) return litterIds;

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const litterResult = await supabase
    .from("litters")
    .select("id, organization_id, name, species, breed, actual_birth_date")
    .in("id", litterIds)
    .is("deleted_at", null);

  if (litterResult.error) {
    return databaseFailure(
      "litter_age_comparison_litters_read_failed",
      litterResult.error,
    );
  }

  const litterRows = litterResult.data ?? [];
  if (litterRows.length !== litterIds.length) {
    return failure("not_found", "La sélection de portées est introuvable.");
  }

  const litterById = new Map(litterRows.map((litter) => [litter.id, litter]));
  const orderedLitters = litterIds.flatMap((litterId) => {
    const litter = litterById.get(litterId);
    return litter ? [litter] : [];
  });
  if (orderedLitters.length !== litterIds.length) {
    return failure("not_found", "La sélection de portées est introuvable.");
  }

  const organizationId = orderedLitters[0].organization_id;
  if (
    orderedLitters.some(
      (litter) => litter.organization_id !== organizationId,
    )
  ) {
    return failure("not_found", "La sélection de portées est introuvable.");
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membership.error) {
    return databaseFailure(
      "litter_age_comparison_membership_read_failed",
      membership.error,
    );
  }
  if (!membership.data || !isOrganizationRole(membership.data.role)) {
    return failure("not_found", "La sélection de portées est introuvable.");
  }

  const species = orderedLitters[0].species.trim();
  const normalizedSpecies = species.toLocaleLowerCase("fr-FR");
  const breed = orderedLitters[0].breed.trim();
  const normalizedBreed = breed.toLocaleLowerCase("fr-FR");
  if (
    !species ||
    !breed ||
    orderedLitters.some(
      (litter) =>
        !litter.species.trim() ||
        litter.species.trim().toLocaleLowerCase("fr-FR") !==
          normalizedSpecies ||
        !litter.breed.trim() ||
        litter.breed.trim().toLocaleLowerCase("fr-FR") !== normalizedBreed,
    )
  ) {
    return failure(
      "incompatible_litters",
      "Les portées sélectionnées ne sont pas compatibles.",
    );
  }

  return {
    litterIds,
    litters: orderedLitters,
    organizationId,
    role: membership.data.role,
    species,
    breed,
  };
}

type LitterComparisonSessionRow = {
  id: string;
  litter_id: string;
};

async function listComparisonSessions(
  authorization: LitterComparisonAuthorization,
  supabase: Supabase,
): Promise<LitterComparisonSessionRow[] | ErrorResult> {
  const rows: LitterComparisonSessionRow[] = [];

  for (let offset = 0; ; offset += LITTER_COMPARISON_PAGE_SIZE) {
    const page = await supabase
      .from("litter_weighing_sessions")
      .select("id, litter_id")
      .eq("organization_id", authorization.organizationId)
      .in("litter_id", authorization.litterIds)
      .is("cancelled_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + LITTER_COMPARISON_PAGE_SIZE - 1);

    if (page.error) {
      return databaseFailure(
        "litter_age_comparison_sessions_read_failed",
        page.error,
      );
    }

    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < LITTER_COMPARISON_PAGE_SIZE) return rows;
  }
}

type LitterComparisonMeasurementRow = {
  id: string;
  animal_id: string;
  litter_weighing_session_id: string | null;
  measurement_kind: string;
  grams: number;
  measured_at: string;
  created_at: string;
};

export function areLitterAgeComparisonRelationsConsistent(
  animalLitterById: ReadonlyMap<string, string>,
  sessionLitterById: ReadonlyMap<string, string>,
  measurements: readonly Pick<
    LitterComparisonMeasurementRow,
    | "animal_id"
    | "litter_weighing_session_id"
    | "measurement_kind"
  >[],
) {
  return measurements.every((measurement) => {
    const animalLitterId = animalLitterById.get(measurement.animal_id);
    if (!animalLitterId) return false;

    if (measurement.measurement_kind === "birth") {
      return measurement.litter_weighing_session_id === null;
    }
    if (
      measurement.measurement_kind !== "routine" ||
      !measurement.litter_weighing_session_id
    ) {
      return false;
    }

    return (
      sessionLitterById.get(measurement.litter_weighing_session_id) ===
      animalLitterId
    );
  });
}

async function listComparisonMeasurements(
  animalIds: string[],
  organizationId: string,
  supabase: Supabase,
): Promise<LitterComparisonMeasurementRow[] | ErrorResult> {
  if (animalIds.length === 0) return [];

  const rows: LitterComparisonMeasurementRow[] = [];
  let offset = 0;
  while (offset <= LITTER_COMPARISON_MAX_MEASUREMENTS) {
    const remainingWithOverflowRow =
      LITTER_COMPARISON_MAX_MEASUREMENTS + 1 - offset;
    const pageSize = Math.min(
      LITTER_COMPARISON_PAGE_SIZE,
      remainingWithOverflowRow,
    );
    const page = await supabase
      .from("animal_weight_measurements")
      .select(
        "id, animal_id, litter_weighing_session_id, measurement_kind, grams, measured_at, created_at",
      )
      .eq("organization_id", organizationId)
      .in("animal_id", animalIds)
      .in("measurement_kind", ["birth", "routine"])
      .is("cancelled_at", null)
      .order("animal_id", { ascending: true })
      .order("measured_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (page.error) {
      return databaseFailure(
        "litter_age_comparison_measurements_read_failed",
        page.error,
      );
    }

    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (rows.length > LITTER_COMPARISON_MAX_MEASUREMENTS) {
      return failure(
        "comparison_too_large",
        "La comparaison demandée dépasse la limite autorisée.",
      );
    }
    if (pageRows.length < pageSize) return rows;
    offset += pageRows.length;
  }

  return failure(
    "comparison_too_large",
    "La comparaison demandée dépasse la limite autorisée.",
  );
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

export async function correctLitterRoutineWeightCore(
  input: CorrectLitterRoutineWeightInput,
  supabase: Supabase,
): Promise<CorrectLitterRoutineWeightResult> {
  const measurementId = normalizeUuid(input.measurementId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const note = normalizeOptionalText(input.note, 5_000);
  const reason = normalizeOptionalText(input.reason, 500);
  if (
    !measurementId ||
    !clientCommandId ||
    !Number.isInteger(input.expectedRevisionNo) ||
    input.expectedRevisionNo < 0 ||
    !Number.isInteger(input.grams) ||
    input.grams < 1 ||
    input.grams > 100_000 ||
    note === undefined ||
    !reason
  ) {
    return invalidInput();
  }

  const adjusted = await supabase.rpc("correct_litter_routine_weight", {
    p_measurement_id: measurementId,
    p_client_command_id: clientCommandId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_grams: input.grams,
    p_note: note,
    p_reason: reason,
  });
  if (adjusted.error) {
    return databaseFailure("litter_routine_weight_correction_failed", adjusted.error);
  }
  const result = adjusted.data?.[0];
  if (!result || result.outcome !== "success" || !result.measurement_id ||
    !result.litter_weighing_session_id || result.revision_no === null) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    measurementId: result.measurement_id,
    sessionId: result.litter_weighing_session_id,
    revisionNo: result.revision_no,
    replayed: result.replayed === true,
  };
}

export async function cancelLitterRoutineWeightCore(
  input: CancelLitterRoutineWeightInput,
  supabase: Supabase,
): Promise<CancelLitterRoutineWeightResult> {
  const measurementId = normalizeUuid(input.measurementId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const cancelledAt = normalizeTimestamp(input.cancelledAt);
  const reason = normalizeOptionalText(input.reason, 500);
  if (!measurementId || !clientCommandId || !cancelledAt || !reason ||
    !Number.isInteger(input.expectedRevisionNo) || input.expectedRevisionNo < 0) {
    return invalidInput();
  }
  const adjusted = await supabase.rpc("cancel_litter_routine_weight", {
    p_measurement_id: measurementId,
    p_client_command_id: clientCommandId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_cancelled_at: cancelledAt,
    p_reason: reason,
  });
  if (adjusted.error) {
    return databaseFailure("litter_routine_weight_cancellation_failed", adjusted.error);
  }
  const result = adjusted.data?.[0];
  if (!result || result.outcome !== "success" || !result.measurement_id ||
    !result.litter_weighing_session_id || result.revision_no === null) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    measurementId: result.measurement_id,
    sessionId: result.litter_weighing_session_id,
    revisionNo: result.revision_no,
    replayed: result.replayed === true,
  };
}

export async function cancelLitterWeighingSessionCore(
  input: CancelLitterWeighingSessionInput,
  supabase: Supabase,
): Promise<CancelLitterWeighingSessionResult> {
  const sessionId = normalizeUuid(input.sessionId);
  const clientCommandId = normalizeUuid(input.clientCommandId);
  const cancelledAt = normalizeTimestamp(input.cancelledAt);
  const reason = normalizeOptionalText(input.reason, 500);
  if (!sessionId || !clientCommandId || !cancelledAt || !reason ||
    !Number.isInteger(input.expectedRevisionNo) || input.expectedRevisionNo < 0) {
    return invalidInput();
  }
  const adjusted = await supabase.rpc("cancel_litter_weighing_session", {
    p_session_id: sessionId,
    p_client_command_id: clientCommandId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_cancelled_at: cancelledAt,
    p_reason: reason,
  });
  if (adjusted.error) {
    return databaseFailure("litter_weighing_session_cancellation_failed", adjusted.error);
  }
  const result = adjusted.data?.[0];
  if (!result || result.outcome !== "success" || !result.litter_weighing_session_id ||
    result.revision_no === null || result.affected_measurement_count === null) {
    return commandFailure(result?.reason ?? null);
  }
  return {
    outcome: "success",
    sessionId: result.litter_weighing_session_id,
    revisionNo: result.revision_no,
    affectedMeasurementCount: result.affected_measurement_count,
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
    .select("id, revision_no, measured_at, timezone_name, note, created_by, created_at")
    .eq("organization_id", authorization.organizationId)
    .eq("litter_id", authorization.litterId)
    .is("cancelled_at", null)
    .order("measured_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (sessions.error) {
    return databaseFailure("litter_weight_history_relations_read_failed", {
      sessions: sessions.error,
    });
  }

  const sessionIds = (sessions.data ?? []).map((session) => session.id);
  const historicalAnimals = input.schedule
    ? await supabase
        .from("animals")
        .select("id")
        .eq("organization_id", authorization.organizationId)
        .eq("litter_id", authorization.litterId)
        .is("deleted_at", null)
        .eq("is_external", false)
        .neq("status", "stillborn")
        .order("id", { ascending: true })
        .range(0, LITTER_WEIGHT_HISTORY_MAX_HISTORICAL_ANIMALS)
    : { data: [], error: null };

  if (historicalAnimals.error) {
    return databaseFailure(
      "litter_weight_history_historical_animals_read_failed",
      historicalAnimals.error,
    );
  }
  const historicalAnimalRows = historicalAnimals.data ?? [];
  if (
    historicalAnimalRows.length > LITTER_WEIGHT_HISTORY_MAX_HISTORICAL_ANIMALS
  ) {
    return databaseFailure("litter_weight_history_historical_animals_too_large", {
      litterId: authorization.litterId,
      maximum: LITTER_WEIGHT_HISTORY_MAX_HISTORICAL_ANIMALS,
    });
  }
  const historicalAnimalIds = historicalAnimalRows.map((animal) => animal.id);

  const [measurements, sessionMeasurements, historicalBirthMeasurements] =
    await Promise.all([
    animalIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("animal_weight_measurements")
          .select(
            "id, revision_no, animal_id, litter_weighing_session_id, measurement_kind, grams, measured_at, note, created_by, created_at",
          )
          .eq("organization_id", authorization.organizationId)
          .in("animal_id", animalIds)
          .in("measurement_kind", ["birth", "routine"])
          .is("cancelled_at", null)
          .order("animal_id", { ascending: true })
          .order("measured_at", { ascending: true })
          .order("created_at", { ascending: true }),
    sessionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("animal_weight_measurements")
          .select("litter_weighing_session_id, animal_id, grams")
          .eq("organization_id", authorization.organizationId)
          .eq("measurement_kind", "routine")
          .is("cancelled_at", null)
          .in("litter_weighing_session_id", sessionIds),
    !input.schedule || historicalAnimalIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("animal_weight_measurements")
          .select("id")
          .eq("organization_id", authorization.organizationId)
          .eq("measurement_kind", "birth")
          .is("cancelled_at", null)
          .in("animal_id", historicalAnimalIds)
          .range(0, 0),
  ]);

  if (
    measurements.error ||
    sessionMeasurements.error ||
    historicalBirthMeasurements.error
  ) {
    return databaseFailure("litter_weight_history_relations_read_failed", {
      measurements: measurements.error,
      sessionMeasurements: sessionMeasurements.error,
      historicalBirthMeasurements: historicalBirthMeasurements.error,
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
  const latestSessionComparison = buildLitterWeightLatestSessionComparison(
    (sessions.data ?? []).map((session) => ({
      sessionId: session.id,
      measuredAt: session.measured_at,
      timezoneName: session.timezone_name,
      createdAt: session.created_at,
    })),
    (sessionMeasurements.data ?? []).flatMap((measurement) =>
      measurement.litter_weighing_session_id &&
      sessionIdSet.has(measurement.litter_weighing_session_id)
        ? [
            {
              sessionId: measurement.litter_weighing_session_id,
              animalId: measurement.animal_id,
              grams: measurement.grams,
            },
          ]
        : [],
    ),
  );

  let weighingSchedule: LitterWeighingScheduleResult | null = null;
  let weighingSchedulePolicy: LitterWeighingSchedulePolicyMetadata | null = null;
  if (input.schedule) {
    const policyResolution =
      await resolveAuthorizedLitterWeighingSchedulePolicyCore(
        {
          organizationId: authorization.organizationId,
          actualBirthDate: authorization.actualBirthDate,
          litterWeighingSchedulePolicySnapshot:
            authorization.litterWeighingSchedulePolicySnapshot,
        },
        supabase,
      );
    if (policyResolution.outcome === "error") {
      return databaseFailure("litter_weight_history_policy_resolution_failed", {
        code: policyResolution.error.code,
      });
    }
    weighingSchedulePolicy = {
      source: policyResolution.source,
      phases: policyResolution.policy.phases.map((phase) => ({ ...phase })),
    };
    const scheduleResult = buildLitterWeighingScheduleFromHistory({
      actualBirthDate: authorization.actualBirthDate,
      request: {
        todayDate: input.schedule.todayDate,
        policy: policyResolution.policy,
      },
      hasBirthMeasurement: (historicalBirthMeasurements.data ?? []).length > 0,
      sessions: (sessions.data ?? []).map((session) => ({
        internalId: session.id,
        measuredAt: session.measured_at,
        timezoneName: session.timezone_name,
        createdAt: session.created_at,
        routineMeasurementCount:
          statisticsBySession.get(session.id)?.measurementCount ?? 0,
      })),
    });
    if (scheduleResult.outcome === "invalid_persisted_history") {
      return databaseFailure("litter_weight_history_schedule_invalid_history", {
        litterId: authorization.litterId,
      });
    }
    weighingSchedule = scheduleResult.weighingSchedule;
    if (
      UUID_IN_TEXT_PATTERN.test(
        JSON.stringify({ weighingSchedule, weighingSchedulePolicy }),
      )
    ) {
      return databaseFailure("litter_weight_history_schedule_identifier_leak", {
        litterId: authorization.litterId,
      });
    }
  }

  return {
    outcome: "success",
    role: authorization.role,
    latestSessionComparison,
    weighingSchedule,
    weighingSchedulePolicy,
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
        revisionNo: session.revision_no,
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
      revisionNo: measurement.revision_no,
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

export async function listLitterWeightAdjustmentHistoryCore(
  input: ListLitterWeightAdjustmentHistoryInput,
  supabase: Supabase,
): Promise<ListLitterWeightAdjustmentHistoryResult> {
  const limit = input?.limit ?? 100;
  if (!UUID_PATTERN.test(input?.litterId ?? "") || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return invalidInput();
  }

  const response = await supabase.rpc("list_litter_weight_adjustment_history", {
    p_litter_id: input.litterId.trim().toLowerCase(),
    p_limit: limit,
  });
  if (response.error) {
    return databaseFailure("litter_weight_adjustment_history_read_failed", response.error);
  }

  return {
    outcome: "success",
    entries: (response.data ?? []).map((entry) => ({
      commandType: entry.command_type as LitterWeightAdjustmentHistoryEntry["commandType"],
      createdAt: entry.created_at,
      reason: entry.reason,
      sessionMeasuredAt: entry.session_measured_at,
      sessionTimezoneName: entry.session_timezone_name,
      animalLabel: entry.animal_label,
      beforeGrams: entry.before_grams,
      afterGrams: entry.after_grams,
      beforeNote: entry.before_note,
      afterNote: entry.after_note,
      affectedMeasurementCount: entry.affected_measurement_count,
    })),
  };
}

export async function listLitterAgeComparisonCore(
  input: ListLitterAgeComparisonInput,
  supabase: Supabase,
): Promise<ListLitterAgeComparisonResult> {
  const authorization = await authorizeLitterComparisonRead(
    input?.litterIds,
    supabase,
  );
  if ("outcome" in authorization) return authorization;

  const animals = await supabase
    .from("animals")
    .select("id, litter_id")
    .eq("organization_id", authorization.organizationId)
    .in("litter_id", authorization.litterIds)
    .is("deleted_at", null)
    .eq("is_external", false)
    .neq("status", "stillborn")
    .order("litter_id", { ascending: true })
    .order("id", { ascending: true })
    .range(0, LITTER_COMPARISON_MAX_ANIMALS);

  if (animals.error) {
    return databaseFailure(
      "litter_age_comparison_animals_read_failed",
      animals.error,
    );
  }

  const animalRows = animals.data ?? [];
  if (animalRows.length > LITTER_COMPARISON_MAX_ANIMALS) {
    return failure(
      "comparison_too_large",
      "La comparaison demandée dépasse la limite autorisée.",
    );
  }

  const litterIdSet = new Set(authorization.litterIds);
  if (
    animalRows.some(
      (animal) => !animal.litter_id || !litterIdSet.has(animal.litter_id),
    )
  ) {
    return databaseFailure("litter_age_comparison_inconsistent_animal", null);
  }

  const [sessions, measurements] = await Promise.all([
    listComparisonSessions(authorization, supabase),
    listComparisonMeasurements(
      animalRows.map((animal) => animal.id),
      authorization.organizationId,
      supabase,
    ),
  ]);
  if (!Array.isArray(sessions)) return sessions;
  if (!Array.isArray(measurements)) return measurements;

  const animalLitterById = new Map(
    animalRows.map((animal) => [animal.id, animal.litter_id as string]),
  );
  const sessionLitterById = new Map(
    sessions.map((session) => [session.id, session.litter_id]),
  );
  const measurementsByAnimalId = new Map<
    string,
    LitterComparisonMeasurementRow[]
  >();

  if (
    !areLitterAgeComparisonRelationsConsistent(
      animalLitterById,
      sessionLitterById,
      measurements,
    )
  ) {
    return databaseFailure(
      "litter_age_comparison_inconsistent_relations",
      null,
    );
  }

  for (const measurement of measurements) {
    const animalMeasurements =
      measurementsByAnimalId.get(measurement.animal_id) ?? [];
    animalMeasurements.push(measurement);
    measurementsByAnimalId.set(measurement.animal_id, animalMeasurements);
  }

  const internalModel = buildLitterAgeComparisonModel(
    authorization.litters.map((litter, seriesIndex) => ({
      internalId: litter.id,
      publicLabel:
        litter.name.trim() || `Portée sélectionnée ${seriesIndex + 1}`,
      seriesIndex,
      animals: animalRows
        .filter((animal) => animal.litter_id === litter.id)
        .map((animal) => ({
          internalId: animal.id,
          measurements: (measurementsByAnimalId.get(animal.id) ?? []).map(
            (measurement) => ({
              internalId: measurement.id,
              measuredAt: measurement.measured_at,
              grams: measurement.grams,
              type: measurement.measurement_kind as "birth" | "routine",
            }),
          ),
        })),
    })),
  );

  return {
    outcome: "success",
    role: authorization.role,
    species: authorization.species,
    breed: authorization.breed,
    model: {
      series: internalModel.series.map((series) => ({
        publicLabel: series.publicLabel,
        birthDate:
          authorization.litters[series.seriesIndex]?.actual_birth_date ?? null,
        seriesIndex: series.seriesIndex,
        totalAnimalCount: series.totalAnimalCount,
        eligibleAnimalCount: series.eligibleAnimalCount,
        excludedAnimalCount: series.excludedAnimalCount,
        status: series.status,
        points: series.points,
      })),
    },
  };
}
