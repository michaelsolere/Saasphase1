import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import {
  DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
  parseLitterWeighingSchedulePolicy,
  type LitterWeighingSchedulePolicy,
} from "./litter-weighing-schedule-model";

type Supabase = SupabaseClient<Database>;

export type ResolveLitterWeighingSchedulePolicySource =
  | "litter_snapshot"
  | "organization"
  | "recommended";

export type ResolveLitterWeighingSchedulePolicyResult =
  | {
      outcome: "success";
      policy: LitterWeighingSchedulePolicy;
      source: ResolveLitterWeighingSchedulePolicySource;
    }
  | {
      outcome: "error";
      error: {
        code:
          | "invalid_input"
          | "unauthenticated"
          | "not_found"
          | "inconsistent_data"
          | "database_error";
        message: string;
      };
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(
  code: Extract<ResolveLitterWeighingSchedulePolicyResult, { outcome: "error" }>["error"]["code"],
  message: string,
): ResolveLitterWeighingSchedulePolicyResult {
  return { outcome: "error", error: { code, message } };
}

function validatedPersistentPolicy(
  value: unknown,
): LitterWeighingSchedulePolicy | null {
  const parsed = parseLitterWeighingSchedulePolicy(value);
  return parsed.ok ? parsed.policy : null;
}

export async function resolveLitterWeighingSchedulePolicyForLitterCore(
  input: { litterId: string },
  supabase: Supabase,
): Promise<ResolveLitterWeighingSchedulePolicyResult> {
  const litterId = input.litterId.trim().toLowerCase();
  if (!UUID_PATTERN.test(litterId)) {
    return failure("invalid_input", "L’identifiant de la portée est invalide.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const { data: litter, error: litterError } = await supabase
    .from("litters")
    .select(
      "organization_id, actual_birth_date, litter_weighing_schedule_policy_snapshot",
    )
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (litterError) {
    return failure(
      "database_error",
      "Une erreur technique empêche la lecture de la politique de pesée.",
    );
  }
  if (!litter) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", litter.organization_id)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError) {
    return failure(
      "database_error",
      "Une erreur technique empêche la vérification de l’accès.",
    );
  }
  if (!membership) {
    return failure("not_found", "La portée demandée est introuvable.");
  }

  if (litter.actual_birth_date !== null) {
    const snapshot = validatedPersistentPolicy(
      litter.litter_weighing_schedule_policy_snapshot,
    );
    if (!snapshot) {
      return failure(
        "inconsistent_data",
        "Le snapshot de politique de pesée de la portée est invalide.",
      );
    }
    return { outcome: "success", policy: snapshot, source: "litter_snapshot" };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("organization_settings")
    .select("litter_weighing_schedule_policy")
    .eq("organization_id", litter.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (settingsError) {
    return failure(
      "database_error",
      "Une erreur technique empêche la lecture des paramètres de l’organisation.",
    );
  }

  if (settings && settings.litter_weighing_schedule_policy !== null) {
    const organizationPolicy = validatedPersistentPolicy(
      settings.litter_weighing_schedule_policy,
    );
    if (!organizationPolicy) {
      return failure(
        "inconsistent_data",
        "La politique de pesée de l’organisation est invalide.",
      );
    }
    return {
      outcome: "success",
      policy: organizationPolicy,
      source: "organization",
    };
  }

  const recommended = parseLitterWeighingSchedulePolicy(
    DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
  );
  if (!recommended.ok) {
    return failure(
      "inconsistent_data",
      "La politique de pesée recommandée est invalide.",
    );
  }

  return {
    outcome: "success",
    policy: recommended.policy,
    source: "recommended",
  };
}
