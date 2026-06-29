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
