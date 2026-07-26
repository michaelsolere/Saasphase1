import type { SupabaseClient } from "@supabase/supabase-js";

import { gestationDefaultLibrarySelection } from "./gestation-default-planning";
import type { GestationDefaultChoice } from "./gestation-default-planning";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GestationDefaultPlanningServiceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "database_error";

export type GestationDefaultPlanningServiceError = {
  code: GestationDefaultPlanningServiceErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: GestationDefaultPlanningServiceError;
};

export type SetDefaultGestationPlanningModelInput = {
  organizationId: string;
  clientCommandId: string;
  choice: GestationDefaultChoice;
};

export type SetDefaultGestationPlanningModelResult =
  | { outcome: "success"; replayed: boolean }
  | ErrorResult;

function failure(
  code: GestationDefaultPlanningServiceErrorCode,
  message: string,
): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

function invalidInput() {
  return failure("invalid_input", "Les informations transmises sont invalides.");
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

function setDefaultFailure(reason: string | null): ErrorResult {
  switch (reason) {
    case "not_authenticated":
      return failure("unauthenticated", "Vous devez être connecté pour continuer.");
    case "membership_required":
      return failure(
        "forbidden",
        "Vous n’avez pas les droits nécessaires pour cette opération.",
      );
    case "organization_not_found":
      return failure("not_found", "L’organisation demandée est introuvable.");
    case "organization_settings_not_found":
      return failure(
        "not_found",
        "Les paramètres de l’organisation sont introuvables.",
      );
    case "selection_unavailable":
      return failure(
        "not_found",
        "Ce planning de gestation n’est plus disponible.",
      );
    case "client_command_conflict":
      return failure(
        "conflict",
        "Cette demande ne peut pas être rejouée. Rechargez la page avant de recommencer.",
      );
    default:
      return invalidInput();
  }
}

/**
 * Calls the dedicated RPC that sets or clears the organization default
 * gestation planning model. Never writes `organization_settings` directly:
 * the column is protected against client writes outside this command.
 */
export async function setDefaultGestationPlanningModelCore(
  input: SetDefaultGestationPlanningModelInput,
  supabase: Supabase,
): Promise<SetDefaultGestationPlanningModelResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const clientCommandId = normalizeUuid(input.clientCommandId);

  if (!organizationId || !clientCommandId) {
    return invalidInput();
  }

  const selection = gestationDefaultLibrarySelection(input.choice);

  const updated = await supabase.rpc("set_default_gestation_planning_model", {
    p_organization_id: organizationId,
    p_client_command_id: clientCommandId,
    p_library_model_code: selection.libraryModelCode ?? undefined,
    p_library_model_version: selection.libraryModelVersion ?? undefined,
  });

  if (updated.error) {
    return databaseFailure(
      "set_default_gestation_planning_model_failed",
      updated.error,
    );
  }

  const result = updated.data?.[0];
  if (!result || result.outcome !== "success") {
    return setDefaultFailure(result?.reason ?? null);
  }

  return { outcome: "success", replayed: result.replayed === true };
}
