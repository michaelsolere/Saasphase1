const statusLabels: Record<string, string> = {
  new: "À valider",
  to_review: "À valider",
  to_call: "À appeler",
  qualified: "Validée",
  waiting_litter: "En attente de portée",
  rejected: "Refusée",
  withdrawn: "Non aboutie",
  archived: "Archivée",
};

const sexPreferenceLabels: Record<string, string> = {
  male_only: "Mâle uniquement",
  female_only: "Femelle uniquement",
  male_preferred_female_possible: "Mâle préféré, femelle possible",
  female_preferred_male_possible: "Femelle préférée, mâle possible",
  no_preference: "Sans préférence",
  unknown: "Non précisé",
};

export function formatApplicationDate(value: string | null) {
  if (!value) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getApplicationStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export function getSexPreferenceLabel(value: string | null) {
  if (!value) {
    return "Non précisé";
  }

  return sexPreferenceLabels[value] ?? value.replaceAll("_", " ");
}
