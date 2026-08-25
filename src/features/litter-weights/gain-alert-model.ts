// Modèle d'alerte « prise la plus faible » de la saisie des pesées.
// Signal descriptif uniquement : il met en évidence, il ne diagnostique pas.

export type GainAlertAnimalInput = {
  animalId: string;
  publicLabel: string;
  /** Δ en pourcentage entre la saisie du jour et la dernière mesure réelle. */
  deltaPercent: number | null;
};

/**
 * Retourne les identifiants des animaux à signaler, du Δ le plus faible
 * au plus élevé, jusqu'au nombre demandé. Les ex æquo au seuil sont conservés.
 * Les animaux sans mesure calculable sont ignorés.
 */
export function findLowestGainAnimals(
  animals: readonly GainAlertAnimalInput[],
  limit = 1,
): string[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }
  const measurable = animals.filter(
    (animal): animal is GainAlertAnimalInput & { deltaPercent: number } =>
      animal.deltaPercent !== null,
  );
  if (measurable.length < 2) {
    return [];
  }
  const ordered = [...measurable].sort(
    (left, right) => left.deltaPercent - right.deltaPercent,
  );
  const threshold = ordered[Math.min(limit, ordered.length) - 1]?.deltaPercent;
  if (threshold === undefined) return [];
  return ordered
    .filter((animal) => animal.deltaPercent <= threshold)
    .map((animal) => animal.animalId);
}
