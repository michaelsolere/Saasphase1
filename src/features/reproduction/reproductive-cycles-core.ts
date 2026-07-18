import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export const REPRODUCTIVE_CYCLE_STATUSES = [
  "planned",
  "in_progress",
  "mated",
  "closed",
  "cancelled",
] as const;
export type ReproductiveCycleStatus =
  (typeof REPRODUCTIVE_CYCLE_STATUSES)[number];

export const PROGESTERONE_UNITS = ["ng_ml", "nmol_l"] as const;
export type ProgesteroneUnit = (typeof PROGESTERONE_UNITS)[number];

export type ReproductionServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_mother"
  | "conflict"
  | "database_error";

export type ReproductionServiceError = {
  code: ReproductionServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: ReproductionServiceError;
};

export type ReproductiveCycleSummary = {
  id: string;
  motherId: string;
  species: string;
  breed: string;
  status: ReproductiveCycleStatus;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgesteroneMeasurementSummary = {
  id: string;
  cycleId: string;
  measuredAt: string;
  resultedAt: string | null;
  value: number;
  unit: ProgesteroneUnit;
  laboratoryName: string | null;
  sampleReference: string | null;
  method: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListReproductiveCyclesInput = {
  motherId: string;
};

export type ListReproductiveCyclesResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      cycles: ReproductiveCycleSummary[];
    }
  | ErrorResult;

export type CreateReproductiveCycleInput = {
  motherId: string;
  status?: ReproductiveCycleStatus;
  startedOn: string;
  endedOn?: string | null;
  notes?: string | null;
};

export type CreateReproductiveCycleResult =
  | {
      outcome: "success";
      cycle: ReproductiveCycleSummary;
    }
  | ErrorResult;

export type ListProgesteroneMeasurementsInput = {
  cycleId: string;
};

export type ListProgesteroneMeasurementsResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      measurements: ProgesteroneMeasurementSummary[];
    }
  | ErrorResult;

export type AddProgesteroneMeasurementInput = {
  cycleId: string;
  measuredAt: string;
  resultedAt?: string | null;
  value: number;
  unit: ProgesteroneUnit;
  laboratoryName?: string | null;
  sampleReference?: string | null;
  method?: string | null;
  note?: string | null;
};

export type AddProgesteroneMeasurementResult =
  | {
      outcome: "success";
      measurement: ProgesteroneMeasurementSummary;
    }
  | ErrorResult;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WRITABLE_ROLES: readonly OrganizationRole[] = [
  "owner",
  "admin",
  "member",
];

type MotherRecord = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  "id" | "organization_id" | "species" | "breed" | "sex"
>;
type CycleRow =
  Database["public"]["Tables"]["reproductive_cycles"]["Row"];
type MeasurementRow =
  Database["public"]["Tables"]["progesterone_measurements"]["Row"];

function failure(
  code: ReproductionServiceErrorCode,
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

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function normalizeDateOnly(value: unknown) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
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

function isOrganizationRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

function isCycleStatus(value: unknown): value is ReproductiveCycleStatus {
  return (
    typeof value === "string" &&
    REPRODUCTIVE_CYCLE_STATUSES.includes(value as ReproductiveCycleStatus)
  );
}

function isProgesteroneUnit(value: unknown): value is ProgesteroneUnit {
  return (
    typeof value === "string" &&
    PROGESTERONE_UNITS.includes(value as ProgesteroneUnit)
  );
}

function mapCycle(row: CycleRow): ReproductiveCycleSummary {
  return {
    id: row.id,
    motherId: row.mother_id,
    species: row.species,
    breed: row.breed,
    status: row.status as ReproductiveCycleStatus,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMeasurement(row: MeasurementRow): ProgesteroneMeasurementSummary {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    measuredAt: row.measured_at,
    resultedAt: row.resulted_at,
    value: row.value,
    unit: row.unit as ProgesteroneUnit,
    laboratoryName: row.laboratory_name,
    sampleReference: row.sample_reference,
    method: row.method,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function authenticatedUserId(supabase: Supabase) {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return null;
  return auth.data.user.id;
}

async function readMother(supabase: Supabase, motherId: string) {
  return supabase
    .from("animals")
    .select("id, organization_id, species, breed, sex")
    .eq("id", motherId)
    .is("deleted_at", null)
    .maybeSingle();
}

async function readCycle(supabase: Supabase, cycleId: string) {
  return supabase
    .from("reproductive_cycles")
    .select("*")
    .eq("id", cycleId)
    .is("deleted_at", null)
    .maybeSingle();
}

async function authorizeOrganization(
  supabase: Supabase,
  userId: string,
  organizationId: string,
  write: boolean,
) {
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
      "reproduction_membership_read_failed",
      membership.error,
    );
  }
  if (
    !membership.data ||
    !isOrganizationRole(membership.data.role) ||
    (write && !WRITABLE_ROLES.includes(membership.data.role))
  ) {
    return failure(
      "forbidden",
      "Vous n’avez pas les droits nécessaires pour cette opération.",
    );
  }

  return { userId, role: membership.data.role };
}

async function authorizeMother(
  supabase: Supabase,
  rawMotherId: unknown,
  write: boolean,
): Promise<
  | { userId: string; role: OrganizationRole; mother: MotherRecord }
  | ErrorResult
> {
  const motherId = normalizeUuid(rawMotherId);
  if (!motherId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const mother = await readMother(supabase, motherId);
  if (mother.error) {
    return databaseFailure("reproduction_mother_read_failed", mother.error);
  }
  if (!mother.data) {
    return failure("not_found", "La reproductrice demandée est introuvable.");
  }

  const authorization = await authorizeOrganization(
    supabase,
    userId,
    mother.data.organization_id,
    write,
  );
  if ("outcome" in authorization) return authorization;

  return { ...authorization, mother: mother.data };
}

async function authorizeCycle(
  supabase: Supabase,
  rawCycleId: unknown,
  write: boolean,
): Promise<
  | { userId: string; role: OrganizationRole; cycle: CycleRow }
  | ErrorResult
> {
  const cycleId = normalizeUuid(rawCycleId);
  if (!cycleId) return invalidInput();

  const userId = await authenticatedUserId(supabase);
  if (!userId) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const cycle = await readCycle(supabase, cycleId);
  if (cycle.error) {
    return databaseFailure("reproduction_cycle_read_failed", cycle.error);
  }
  if (!cycle.data) {
    return failure("not_found", "Le cycle reproductif demandé est introuvable.");
  }

  const authorization = await authorizeOrganization(
    supabase,
    userId,
    cycle.data.organization_id,
    write,
  );
  if ("outcome" in authorization) return authorization;

  return { ...authorization, cycle: cycle.data };
}

export async function listReproductiveCyclesForMotherCore(
  input: ListReproductiveCyclesInput,
  supabase: Supabase,
): Promise<ListReproductiveCyclesResult> {
  const authorization = await authorizeMother(
    supabase,
    input.motherId,
    false,
  );
  if ("outcome" in authorization) return authorization;

  const cycles = await supabase
    .from("reproductive_cycles")
    .select("*")
    .eq("organization_id", authorization.mother.organization_id)
    .eq("mother_id", authorization.mother.id)
    .is("deleted_at", null)
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (cycles.error) {
    return databaseFailure("reproduction_cycles_list_failed", cycles.error);
  }

  return {
    outcome: "success",
    role: authorization.role,
    cycles: (cycles.data ?? []).map(mapCycle),
  };
}

export async function createReproductiveCycleCore(
  input: CreateReproductiveCycleInput,
  supabase: Supabase,
): Promise<CreateReproductiveCycleResult> {
  const status = input.status ?? "planned";
  const startedOn = normalizeDateOnly(input.startedOn);
  const endedOn =
    input.endedOn === undefined || input.endedOn === null
      ? null
      : normalizeDateOnly(input.endedOn);
  const notes = normalizeOptionalText(input.notes, 5_000);

  if (
    !isCycleStatus(status) ||
    !startedOn ||
    (input.endedOn !== undefined && input.endedOn !== null && !endedOn) ||
    (endedOn !== null && endedOn < startedOn) ||
    notes === undefined
  ) {
    return invalidInput();
  }

  const authorization = await authorizeMother(
    supabase,
    input.motherId,
    true,
  );
  if ("outcome" in authorization) return authorization;
  if (authorization.mother.sex !== "female") {
    return failure(
      "invalid_mother",
      "L’animal sélectionné ne peut pas être utilisé comme reproductrice.",
    );
  }

  const inserted = await supabase
    .from("reproductive_cycles")
    .insert({
      organization_id: authorization.mother.organization_id,
      mother_id: authorization.mother.id,
      species: authorization.mother.species,
      breed: authorization.mother.breed,
      status,
      started_on: startedOn,
      ended_on: endedOn,
      notes,
      created_by: authorization.userId,
      updated_by: authorization.userId,
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return failure(
        "conflict",
        "Un cycle actif existe déjà pour cette reproductrice.",
      );
    }
    if (inserted.error.code === "23514") {
      return failure(
        "invalid_mother",
        "L’animal sélectionné ne peut pas être utilisé comme reproductrice.",
      );
    }
    return databaseFailure("reproduction_cycle_create_failed", inserted.error);
  }

  return { outcome: "success", cycle: mapCycle(inserted.data) };
}

export async function listProgesteroneMeasurementsForCycleCore(
  input: ListProgesteroneMeasurementsInput,
  supabase: Supabase,
): Promise<ListProgesteroneMeasurementsResult> {
  const authorization = await authorizeCycle(supabase, input.cycleId, false);
  if ("outcome" in authorization) return authorization;

  const measurements = await supabase
    .from("progesterone_measurements")
    .select("*")
    .eq("organization_id", authorization.cycle.organization_id)
    .eq("cycle_id", authorization.cycle.id)
    .is("deleted_at", null)
    .order("measured_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (measurements.error) {
    return databaseFailure(
      "progesterone_measurements_list_failed",
      measurements.error,
    );
  }

  return {
    outcome: "success",
    role: authorization.role,
    measurements: (measurements.data ?? []).map(mapMeasurement),
  };
}

export async function addProgesteroneMeasurementCore(
  input: AddProgesteroneMeasurementInput,
  supabase: Supabase,
): Promise<AddProgesteroneMeasurementResult> {
  const measuredAt = normalizeTimestamp(input.measuredAt);
  const resultedAt =
    input.resultedAt === undefined || input.resultedAt === null
      ? null
      : normalizeTimestamp(input.resultedAt);
  const laboratoryName = normalizeOptionalText(input.laboratoryName, 255);
  const sampleReference = normalizeOptionalText(input.sampleReference, 255);
  const method = normalizeOptionalText(input.method, 255);
  const note = normalizeOptionalText(input.note, 5_000);

  if (
    !measuredAt ||
    (input.resultedAt !== undefined && input.resultedAt !== null && !resultedAt) ||
    typeof input.value !== "number" ||
    !Number.isFinite(input.value) ||
    input.value <= 0 ||
    !isProgesteroneUnit(input.unit) ||
    laboratoryName === undefined ||
    sampleReference === undefined ||
    method === undefined ||
    note === undefined
  ) {
    return invalidInput();
  }

  const authorization = await authorizeCycle(supabase, input.cycleId, true);
  if ("outcome" in authorization) return authorization;

  const inserted = await supabase
    .from("progesterone_measurements")
    .insert({
      organization_id: authorization.cycle.organization_id,
      cycle_id: authorization.cycle.id,
      measured_at: measuredAt,
      resulted_at: resultedAt,
      value: input.value,
      unit: input.unit,
      laboratory_name: laboratoryName,
      sample_reference: sampleReference,
      method,
      note,
      created_by: authorization.userId,
      updated_by: authorization.userId,
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23514") return invalidInput();
    return databaseFailure(
      "progesterone_measurement_create_failed",
      inserted.error,
    );
  }

  return {
    outcome: "success",
    measurement: mapMeasurement(inserted.data),
  };
}
