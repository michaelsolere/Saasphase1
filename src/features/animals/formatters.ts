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

export function getAnimalDisplayName(animal: Pick<AnimalListItem, "display_name" | "call_name" | "official_name" | "temporary_name" | "id">) {
  return (
    animal.display_name ||
    animal.call_name ||
    animal.official_name ||
    animal.temporary_name ||
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
