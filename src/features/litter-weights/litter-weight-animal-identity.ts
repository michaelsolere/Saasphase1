import type { LitterWeightHistoryAnimal } from "./litter-weights-core";

const sexLabels: Record<string, string> = {
  female: "Femelle",
  male: "Mâle",
  unknown: "Sexe inconnu",
};

export function litterWeightAnimalName(
  animal: LitterWeightHistoryAnimal,
  sexOrdinal?: number | null,
) {
  if (animal.callName) return animal.callName;
  if (animal.officialName) return animal.officialName;

  const sexLabel = animal.sex ? sexLabels[animal.sex] : undefined;
  const orderPart =
    typeof animal.birthOrder === "number" && Number.isInteger(animal.birthOrder)
      ? `${sexLabel ?? "Chiot"} ${
          typeof sexOrdinal === "number" && Number.isInteger(sexOrdinal)
            ? sexOrdinal
            : animal.birthOrder
        }`
      : null;

  return orderPart ?? "Animal de la portée";
}

export function litterWeightAnimalCollarColor(
  animal: Pick<LitterWeightHistoryAnimal, "currentCollarColor" | "initialCollarColor">,
) {
  return (animal.currentCollarColor || animal.initialCollarColor || "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function litterWeightAnimalDetails(animal: LitterWeightHistoryAnimal) {
  const values = [
    animal.birthOrder ? `Ordre de naissance : ${animal.birthOrder}` : null,
    sexLabels[animal.sex] ?? animal.sex,
  ];

  return values.filter(Boolean).join(" · ");
}
