import type { AnimalListItem } from "./types";

const animalStatusLabels: Record<string, string> = {
  planned: "Planifié",
  born: "Né",
  active: "Actif",
  available: "Disponible",
  reserved: "Réservé",
  adopted: "Adopté",
  kept: "Gardé à l’élevage",
  breeding: "Reproducteur",
  retired: "Retraité",
  deceased: "Décédé",
  stillborn: "Mort-né",
  archived: "Archivé",
};

const sexLabels: Record<string, string> = {
  male: "Mâle",
  female: "Femelle",
  unknown: "Non renseigné",
};

const speciesLabels: Record<string, string> = {
  dog: "Chien",
  cat: "Chat",
};

const ownershipStatusLabels: Record<string, string> = {
  owned: "Maison / détenu",
  produced: "Produit à l’élevage",
  external_stud: "Étalon extérieur",
  external_female: "Femelle extérieure",
  co_owned: "Copropriété",
  sold: "Vendu",
  adopted_out: "Adopté hors élevage",
  unknown: "Historique / origine inconnue",
};

export type AnimalDisplayParts = {
  id: string;
  call_name: string | null;
  official_name: string | null;
  species?: string | null;
  litter_id?: string | null;
  birth_order?: number | null;
  collar_color_current?: string | null;
  collar_color_initial?: string | null;
  motherCallName?: string | null;
  fatherCallName?: string | null;
  mother_call_name?: string | null;
  father_call_name?: string | null;
};

function normalizeLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function getCalculatedYoungAnimalName(animal: AnimalDisplayParts) {
  if (!animal.litter_id) {
    return null;
  }

  const collarColor =
    normalizeLabel(animal.collar_color_current) ??
    normalizeLabel(animal.collar_color_initial);
  const baseLabel = collarColor
    ? `Collier ${collarColor}`
    : animal.birth_order
      ? `${animal.species === "cat" ? "Chaton" : "Chiot"} ${animal.birth_order}`
      : null;

  if (!baseLabel) {
    return null;
  }

  const parentNames = [
    normalizeLabel(animal.motherCallName ?? animal.mother_call_name),
    normalizeLabel(animal.fatherCallName ?? animal.father_call_name),
  ].filter((value): value is string => Boolean(value));

  return parentNames.length > 0
    ? `${baseLabel} — ${parentNames.join(" × ")}`
    : baseLabel;
}

export function getAnimalDisplayName(animal: AnimalDisplayParts) {
  return (
    normalizeLabel(animal.call_name) ??
    normalizeLabel(animal.official_name) ??
    getCalculatedYoungAnimalName(animal) ??
    `Animal ${animal.id.slice(0, 8)}`
  );
}

export function getAnimalSpeciesLabel(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return speciesLabels[value] ?? value.replaceAll("_", " ");
}

export function getAnimalSexLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return sexLabels[value] ?? value.replaceAll("_", " ");
}

export function getAnimalStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return animalStatusLabels[value] ?? value.replaceAll("_", " ");
}

export function getOwnershipStatusLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return ownershipStatusLabels[value] ?? value.replaceAll("_", " ");
}

export function getBornOffspringLabel(animal: {
  species: string | null;
  status: string | null;
  ownership_status: string | null;
  litter_id: string | null;
}) {
  if (
    animal.status !== "born" ||
    animal.ownership_status !== "produced" ||
    !animal.litter_id
  ) {
    return null;
  }

  const youngLabel = animal.species === "cat" ? "Chaton né" : "Chiot né";

  return `${youngLabel}, non encore disponible/réservé`;
}

export function formatAnimalDate(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function parsePostgresDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

function getTodayDateOnly() {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
    date: new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    ),
  };
}

function pluralizeAgeUnit(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatAnimalAge(
  birthDate: string | null,
  deathDate?: string | null,
) {
  const birth = parsePostgresDateOnly(birthDate);

  if (!birth) {
    return "Âge non renseigné";
  }

  const end = parsePostgresDateOnly(deathDate ?? null) ?? getTodayDateOnly();
  const diffDays = Math.max(
    0,
    Math.floor(
      (end.date.getTime() - birth.date.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  if (diffDays < 14) {
    return pluralizeAgeUnit(diffDays, "jour", "jours");
  }

  if (diffDays < 56) {
    return pluralizeAgeUnit(Math.floor(diffDays / 7), "semaine", "semaines");
  }

  let totalMonths =
    (end.year - birth.year) * 12 + (end.month - birth.month);

  if (end.day < birth.day) {
    totalMonths -= 1;
  }

  totalMonths = Math.max(0, totalMonths);

  if (totalMonths < 24) {
    return pluralizeAgeUnit(totalMonths, "mois", "mois");
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearLabel = pluralizeAgeUnit(years, "an", "ans");

  return months > 0
    ? `${yearLabel} et ${pluralizeAgeUnit(months, "mois", "mois")}`
    : yearLabel;
}

export function formatAnimalCoat(animal: Pick<AnimalListItem, "coat_color" | "color">) {
  return animal.coat_color || animal.color || "Non renseignée";
}
