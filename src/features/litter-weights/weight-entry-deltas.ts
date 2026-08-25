// Calculs de variation de la saisie des pesées (prototype 004-journal-hybride).
// Pur et testable : pourcentage signé formaté en fr-FR, référence absente → null.

export function computeEntryDeltaPercent(
  referenceGrams: number | null | undefined,
  currentGrams: number | null | undefined,
): number | null {
  if (
    referenceGrams === null ||
    referenceGrams === undefined ||
    referenceGrams <= 0 ||
    currentGrams === null ||
    currentGrams === undefined
  ) {
    return null;
  }
  return ((currentGrams - referenceGrams) / referenceGrams) * 100;
}

export function formatSignedPercent(value: number): string {
  const formatted = value
    .toFixed(1)
    .replace(".", ",");
  return `${value >= 0 ? "+" : ""}${formatted} %`;
}
