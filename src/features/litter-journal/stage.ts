import type { LitterJournalDetails, LitterJournalListItem } from "./types";
import { getLitterJournalCalendarDaysElapsed } from "./date";

const journalStatusLabels: Record<string, string> = {
  mating_done: "Saillie réalisée",
  pregnancy_unconfirmed: "Gestation à confirmer",
  pregnancy_confirmed: "Gestation confirmée",
  birth_expected: "Mise-bas attendue",
  birth_in_progress: "Mise-bas en cours",
  born: "Chiots nés",
  puppies_created: "Chiots enregistrés",
  choice_period: "Période de choix",
  ready_to_leave: "Prêts au départ",
};

export function getLitterJournalStatusLabel(status: string | null) {
  if (!status) {
    return "Statut inconnu";
  }

  return journalStatusLabels[status] ?? status.replaceAll("_", " ");
}

export function getLitterJournalContextualAge(
  litter: LitterJournalListItem,
  details: LitterJournalDetails | null,
  now?: Date,
) {
  if (litter.actual_birth_date) {
    return `J+${getLitterJournalCalendarDaysElapsed(litter.actual_birth_date, now ?? new Date())} depuis la naissance`;
  }

  if (details?.estimated_ovulation_date) {
    return `J+${getLitterJournalCalendarDaysElapsed(details.estimated_ovulation_date, now ?? new Date())} depuis l’ovulation estimée`;
  }

  if (details?.mating_date) {
    return `J+${getLitterJournalCalendarDaysElapsed(details.mating_date, now ?? new Date())} depuis la première saillie`;
  }

  return null;
}
