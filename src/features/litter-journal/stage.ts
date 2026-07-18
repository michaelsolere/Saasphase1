import type { LitterJournalDetails, LitterJournalListItem } from "./types";

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

function daysSince(date: string, now = new Date()) {
  const [year, month, day] = date.split("-").map(Number);
  const reference = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.floor((today - reference) / 86_400_000);
}

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
    return `J+${daysSince(litter.actual_birth_date, now)} depuis la naissance`;
  }

  if (details?.estimated_ovulation_date) {
    return `J+${daysSince(details.estimated_ovulation_date, now)} depuis l’ovulation estimée`;
  }

  if (details?.mating_date) {
    return `J+${daysSince(details.mating_date, now)} depuis la première saillie`;
  }

  return null;
}
