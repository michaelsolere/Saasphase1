/** The animal UI treats coat_color as the business coat value, then falls back to color. */
export function resolveAnimalSnapshotColor(
  coatColor: string | null | undefined,
  color: string | null | undefined,
) {
  return coatColor?.trim() || color?.trim() || null;
}
