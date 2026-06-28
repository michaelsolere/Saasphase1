const litterStatusLabels: Record<string, string> = {
  planned: "Planifiée",
  mating_done: "Saillie effectuée",
  pregnancy_unconfirmed: "Gestation à confirmer",
  pregnancy_confirmed: "Gestation confirmée",
  not_pregnant: "Non gestante",
  pregnancy_lost: "Gestation interrompue",
  birth_expected: "Naissance attendue",
  birth_in_progress: "Naissance en cours",
  born: "Née",
  puppies_created: "Animaux créés",
  choice_period: "Période de choix",
  ready_to_leave: "Prête au départ",
  closed: "Clôturée",
  cancelled: "Annulée",
  archived: "Archivée",
};

const litterGroupStatusLabels: Record<string, string> = {
  planned: "Planifié",
  open_for_applications: "Ouvert aux candidatures",
  pregnancy_pending: "Gestation en attente",
  births_in_progress: "Naissances en cours",
  born: "Nés",
  closed: "Clôturé",
  cancelled: "Annulé",
  archived: "Archivé",
};

const speciesLabels: Record<string, string> = {
  dog: "Chien",
  cat: "Chat",
};

export function getLitterStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return litterStatusLabels[value] ?? value.replaceAll("_", " ");
}

export function getLitterGroupStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return litterGroupStatusLabels[value] ?? value.replaceAll("_", " ");
}

export function getSpeciesLabel(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return speciesLabels[value] ?? value.replaceAll("_", " ");
}

export function formatLitterDate(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function formatLitterCount(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

export function getLitterDisplayName(name: string | null, id: string | null) {
  if (name) {
    return name;
  }

  if (id) {
    return `Portée ${id.slice(0, 8)}`;
  }

  return "Portée sans identifiant";
}
