// Navigation par onglets du Journal des portées (/litters/journal).
// Même modèle que la fiche Parcours adoptant (adopter-journey-detail-model.ts) :
// un onglet = une valeur d'URL, le défaut est explicite, aucune valeur inconnue.

export const LITTER_JOURNAL_TABS = [
  "today",
  "planning",
  "birth",
  "weights",
  "mother",
  "history",
] as const;

export type LitterJournalTab = (typeof LITTER_JOURNAL_TABS)[number];

export const LITTER_JOURNAL_TAB_LABELS: Record<LitterJournalTab, string> = {
  today: "Aujourd’hui",
  planning: "Planning",
  birth: "Mise-bas",
  weights: "Poids & croissance",
  mother: "Mère",
  history: "Historique",
};

export const LITTER_JOURNAL_DEFAULT_TAB: LitterJournalTab = "today";

export function normalizeLitterJournalTab(
  value: string | null | undefined,
): LitterJournalTab {
  return LITTER_JOURNAL_TABS.includes(value as LitterJournalTab)
    ? (value as LitterJournalTab)
    : LITTER_JOURNAL_DEFAULT_TAB;
}

export function buildLitterJournalPath(
  litterId: string | null | undefined,
  tab: LitterJournalTab,
): string {
  const params = new URLSearchParams();
  if (litterId) {
    params.set("litter", litterId);
  }
  params.set("tab", tab);
  return `/litters/journal?${params.toString()}`;
}
