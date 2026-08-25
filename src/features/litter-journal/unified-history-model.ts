// Historique unifié de la portée (onglet « Historique » du journal).
// Fusion pure des sources déjà chargées par la page : sessions de pesée,
// observations maternelles, jalons de soins, événements de mise-bas.
// Aucun accès base ici — la page fournit les entrées déjà projetées.

export type UnifiedHistoryKind =
  | "weighing_session"
  | "maternal_observation"
  | "care_task"
  | "whelping_event";

export type UnifiedHistoryInputEntry = {
  id: string;
  kind: UnifiedHistoryKind;
  label: string;
  detail: string | null;
  occurredAt: string;
};

export type UnifiedHistoryEntry = UnifiedHistoryInputEntry & {
  kindLabel: string;
};

const KIND_LABELS: Record<UnifiedHistoryKind, string> = {
  weighing_session: "Pesée",
  maternal_observation: "Observation",
  care_task: "Jalon de soins",
  whelping_event: "Mise-bas",
};

export const UNIFIED_HISTORY_DEFAULT_LIMIT = 50;

/**
 * Trie toutes les entrées par date décroissante (ISO 8601 comparable
 * lexicographiquement) puis limite le résultat. Le tri est stable :
 * à date égale, l'ordre d'entrée est conservé.
 */
export function buildUnifiedHistory(
  entries: readonly UnifiedHistoryInputEntry[],
  limit = UNIFIED_HISTORY_DEFAULT_LIMIT,
): UnifiedHistoryEntry[] {
  return entries
    .map((entry) => ({ ...entry, kindLabel: KIND_LABELS[entry.kind] }))
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt),
    )
    .slice(0, Math.max(0, limit));
}
