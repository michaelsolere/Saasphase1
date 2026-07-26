/**
 * Typed gestation auto-apply outcomes and French success messages after mating.
 */

export type GestationPlanningOutcome =
  | "applied"
  | "already_applied"
  | "not_configured"
  | "default_model_unavailable"
  | "variant_conflict"
  | "not_applicable";

export const GESTATION_PLANNING_SETTINGS_PATH = "/settings/organization" as const;

export type MatingSuccessMessage =
  | {
      outcome: Exclude<GestationPlanningOutcome, "not_configured">;
      message: string;
    }
  | {
      outcome: "not_configured";
      message: string;
      settingsPath: typeof GESTATION_PLANNING_SETTINGS_PATH;
    };

/**
 * French success copy after a mating was recorded.
 * `modelTitle` is used only for `applied` (e.g. « Gestation »).
 */
export function matingSuccessMessage(
  outcome: GestationPlanningOutcome,
  modelTitle?: string | null,
): MatingSuccessMessage {
  switch (outcome) {
    case "applied": {
      const title = (modelTitle ?? "").trim() || "Gestation";
      return {
        outcome,
        message: `Première saillie enregistrée. Le planning « ${title} » a été appliqué à la portée.`,
      };
    }
    case "already_applied":
      return {
        outcome,
        message:
          "Première saillie enregistrée. Le planning de gestation était déjà présent sur cette portée.",
      };
    case "not_configured":
      return {
        outcome,
        message:
          "Première saillie enregistrée. Aucun planning de gestation automatique n’est configuré.",
        settingsPath: GESTATION_PLANNING_SETTINGS_PATH,
      };
    case "default_model_unavailable":
      return {
        outcome,
        message:
          "Première saillie enregistrée, mais le modèle de gestation configuré n’est plus disponible. Vérifiez les paramètres de l’organisation.",
      };
    case "variant_conflict":
      return {
        outcome,
        message:
          "Première saillie enregistrée, mais une autre variante du planning de gestation est déjà appliquée. Vérifiez le Journal de la portée.",
      };
    case "not_applicable":
      return {
        outcome,
        message: "La saillie a été enregistrée.",
      };
  }
}
