// Couleurs CSS proches des vrais colliers utilisés à l'élevage.
// Les libellés sont comparés sans accents ni casse (ex. « Rose pâle » → "rose pale").
export const COLLAR_COLORS: Readonly<Record<string, string>> = {
  bleu: "#2563eb",
  "bleu ciel": "#38bdf8",
  rose: "#ec4899",
  "rose pale": "#f9a8d4",
  vert: "#16a34a",
  "vert clair": "#86efac",
  "vert fonce": "#166534",
  jaune: "#eab308",
  orange: "#f97316",
  violet: "#7c3aed",
  noir: "#111827",
  blanc: "#f8fafc",
  rouge: "#dc2626",
  turquoise: "#0d9488",
  marron: "#92400e",
  gris: "#6b7280",
  beige: "#d4b483",
};

const FALLBACK_SERIES_COLORS = [
  "#0f766e",
  "#b91c1c",
  "#1d4ed8",
  "#7e22ce",
  "#b45309",
  "#0369a1",
  "#4d7c0f",
  "#be185d",
] as const;

export function normalizeCollarColorLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function collarSeriesColor(
  collarColor: string | null | undefined,
  seriesIndex: number,
) {
  const normalized = normalizeCollarColorLabel(collarColor);
  if (normalized && COLLAR_COLORS[normalized]) {
    return { color: COLLAR_COLORS[normalized]!, source: "collar" as const };
  }
  return {
    color: FALLBACK_SERIES_COLORS[seriesIndex % FALLBACK_SERIES_COLORS.length],
    source: "fallback" as const,
  };
}
