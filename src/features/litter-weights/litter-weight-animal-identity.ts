import type { LitterWeightHistoryAnimal } from "./litter-weights-core";

const sexLabels: Record<string, string> = {
  female: "Femelle",
  male: "Mâle",
  unknown: "Sexe inconnu",
};

export function litterWeightAnimalName(animal: LitterWeightHistoryAnimal) {
  return (
    animal.callName ||
    animal.officialName ||
    (animal.birthOrder
      ? `Chiot n° ${animal.birthOrder}`
      : "Animal de la portée")
  );
}

export function litterWeightAnimalDetails(animal: LitterWeightHistoryAnimal) {
  const values = [
    animal.birthOrder ? `Ordre de naissance : ${animal.birthOrder}` : null,
    sexLabels[animal.sex] ?? animal.sex,
    animal.currentCollarColor || animal.initialCollarColor
      ? `Collier : ${animal.currentCollarColor || animal.initialCollarColor}`
      : null,
  ];

  return values.filter(Boolean).join(" · ");
}
