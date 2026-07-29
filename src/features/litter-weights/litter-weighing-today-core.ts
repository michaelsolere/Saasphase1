import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTIVE_LITTER_JOURNAL_STATUSES } from "@/features/litter-journal/types";
import type { Database } from "@/types/database.types";

import { resolveAuthorizedLitterWeighingSchedulePolicyCore } from "./litter-weighing-policy-core";
import { buildLitterWeighingScheduleFromHistory } from "./litter-weighing-schedule-history-adapter";
import {
  projectLitterWeighingToday,
  type LitterWeighingTodayProjection,
} from "./litter-weighing-today";

type Supabase = SupabaseClient<Database>;

type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type ListOrganizationLitterWeighingTodayResult =
  | {
      outcome: "success";
      organizationId: string;
      role: OrganizationRole;
      projections: LitterWeighingTodayProjection[];
    }
  | {
      outcome: "error";
      error: {
        code:
          | "invalid_input"
          | "unauthenticated"
          | "not_found"
          | "database_error"
          | "inconsistent_data";
        message: string;
      };
    };

const PAGE_SIZE = 500;

function failure(
  code: Extract<
    ListOrganizationLitterWeighingTodayResult,
    { outcome: "error" }
  >["error"]["code"],
  message: string,
): ListOrganizationLitterWeighingTodayResult {
  return { outcome: "error", error: { code, message } };
}

function isRole(value: string): value is OrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

async function resolveActiveOrganizationMembership(supabase: Supabase) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return failure(
      "unauthenticated",
      "Vous devez être connecté pour continuer.",
    );
  }

  const membership = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership.error) {
    return failure(
      "database_error",
      "Une erreur technique empêche la lecture de l’organisation active.",
    );
  }
  if (
    !membership.data?.organization_id ||
    !isRole(membership.data.role)
  ) {
    return failure("not_found", "L’organisation active est introuvable.");
  }

  return {
    organizationId: membership.data.organization_id,
    role: membership.data.role,
  };
}

export async function listOrganizationLitterWeighingTodayCore(
  supabase: Supabase,
  input: { referenceDate: string },
): Promise<ListOrganizationLitterWeighingTodayResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) {
    return failure("invalid_input", "La date métier est invalide.");
  }

  const membership = await resolveActiveOrganizationMembership(supabase);
  if ("outcome" in membership) return membership;
  const { organizationId, role } = membership;

  const litters = await supabase
    .from("litters")
    .select(
      "id, name, actual_birth_date, litter_weighing_schedule_policy_snapshot",
    )
    .eq("organization_id", organizationId)
    .in("status", ACTIVE_LITTER_JOURNAL_STATUSES)
    .is("deleted_at", null)
    .order("id", { ascending: true });
  if (litters.error) {
    return failure(
      "database_error",
      "Une erreur technique empêche la lecture des portées suivies.",
    );
  }

  const candidates = (litters.data ?? []).filter(
    (
      litter,
    ): litter is typeof litter & {
      actual_birth_date: string;
    } => litter.actual_birth_date !== null,
  );
  if (candidates.length === 0) {
    return {
      outcome: "success",
      organizationId,
      role,
      projections: [],
    };
  }

  const litterIds = candidates.map((litter) => litter.id);
  const sessions = await supabase
    .from("litter_weighing_sessions")
    .select("id, litter_id, measured_at, timezone_name, created_at")
    .eq("organization_id", organizationId)
    .in("litter_id", litterIds)
    .is("cancelled_at", null)
    .order("id", { ascending: true });
  if (sessions.error) {
    return failure(
      "database_error",
      "Une erreur technique empêche la lecture des séances de pesée.",
    );
  }

  const measurementRows: Array<{
    id: string;
    animal_id: string;
    litter_weighing_session_id: string | null;
    measurement_kind: string;
    animal:
      | {
          litter_id: string | null;
          is_external: boolean;
          status: string;
          deleted_at: string | null;
        }
      | Array<{
          litter_id: string | null;
          is_external: boolean;
          status: string;
          deleted_at: string | null;
        }>;
  }> = [];
  let offset = 0;
  while (true) {
    const page = await supabase
      .from("animal_weight_measurements")
      .select(
        "id, animal_id, litter_weighing_session_id, measurement_kind, animal:animals!inner(litter_id, is_external, status, deleted_at)",
      )
      .eq("organization_id", organizationId)
      .in("measurement_kind", ["birth", "routine"])
      .is("cancelled_at", null)
      .in("animal.litter_id", litterIds)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (page.error) {
      return failure(
        "database_error",
        "Une erreur technique empêche le comptage des mesures actives.",
      );
    }

    const rows = (page.data ?? []) as typeof measurementRows;
    measurementRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const sessionCountById = new Map<string, number>();
  const hasBirthMeasurementByLitterId = new Set<string>();
  for (const measurement of measurementRows) {
    if (
      measurement.measurement_kind === "routine" &&
      measurement.litter_weighing_session_id
    ) {
      sessionCountById.set(
        measurement.litter_weighing_session_id,
        (sessionCountById.get(measurement.litter_weighing_session_id) ?? 0) + 1,
      );
      continue;
    }

    if (measurement.measurement_kind === "birth") {
      const animal = Array.isArray(measurement.animal)
        ? measurement.animal[0]
        : measurement.animal;
      if (
        animal?.litter_id &&
        animal.deleted_at === null &&
        !animal.is_external &&
        animal.status !== "stillborn"
      ) {
        hasBirthMeasurementByLitterId.add(animal.litter_id);
      }
    }
  }

  const sessionsByLitterId = new Map<
    string,
    Array<{
      internalId: string;
      measuredAt: string;
      timezoneName: string;
      createdAt: string;
      routineMeasurementCount: number;
    }>
  >();
  for (const session of sessions.data ?? []) {
    const litterSessions = sessionsByLitterId.get(session.litter_id) ?? [];
    litterSessions.push({
      internalId: session.id,
      measuredAt: session.measured_at,
      timezoneName: session.timezone_name,
      createdAt: session.created_at,
      routineMeasurementCount: sessionCountById.get(session.id) ?? 0,
    });
    sessionsByLitterId.set(session.litter_id, litterSessions);
  }

  const projections: LitterWeighingTodayProjection[] = [];
  for (const litter of candidates) {
    const policy = await resolveAuthorizedLitterWeighingSchedulePolicyCore(
      {
        organizationId,
        actualBirthDate: litter.actual_birth_date,
        litterWeighingSchedulePolicySnapshot:
          litter.litter_weighing_schedule_policy_snapshot,
      },
      supabase,
    );
    if (policy.outcome === "error") {
      return failure(
        policy.error.code === "database_error"
          ? "database_error"
          : "inconsistent_data",
        "La politique figée d’une portée est indisponible.",
      );
    }

    const litterSessions = sessionsByLitterId.get(litter.id) ?? [];
    const schedule = buildLitterWeighingScheduleFromHistory({
      actualBirthDate: litter.actual_birth_date,
      request: {
        todayDate: input.referenceDate,
        policy: policy.policy,
      },
      hasBirthMeasurement: hasBirthMeasurementByLitterId.has(litter.id),
      sessions: litterSessions,
    });
    if (schedule.outcome !== "success") {
      return failure(
        "inconsistent_data",
        "L’historique de pesée d’une portée est invalide.",
      );
    }

    projections.push(
      ...projectLitterWeighingToday({
        todayDate: input.referenceDate,
        litterId: litter.id,
        litterLabel: litter.name ?? "Portée sans nom",
        weighingSchedule: schedule.weighingSchedule,
        sessions: litterSessions.map((session) => ({
          measuredAt: session.measuredAt,
          timezoneName: session.timezoneName,
          activeRoutineMeasurementCount: session.routineMeasurementCount,
        })),
      }),
    );
  }

  return {
    outcome: "success",
    organizationId,
    role,
    projections,
  };
}
