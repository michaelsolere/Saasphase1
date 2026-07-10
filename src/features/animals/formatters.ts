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

export function formatAnimalCoat(animal: Pick<AnimalListItem, "coat_color" | "color">) {
  return animal.coat_color || animal.color || "Non renseignée";
}
