import { expect, test } from "@playwright/test";

import {
  COLLAR_COLORS,
  collarSeriesColor,
  normalizeCollarColorLabel,
} from "../../src/features/litter-weights/litter-collar-colors";

test.describe("normalizeCollarColorLabel", () => {
  test("normalise casse, espaces et accents", () => {
    expect(normalizeCollarColorLabel(" Rose Pâle ")).toBe("rose pale");
    expect(normalizeCollarColorLabel("VERT CLAIR")).toBe("vert clair");
    expect(normalizeCollarColorLabel("Bleu ciel")).toBe("bleu ciel");
  });

  test("retourne une chaîne vide pour null ou blancs", () => {
    expect(normalizeCollarColorLabel(null)).toBe("");
    expect(normalizeCollarColorLabel(undefined)).toBe("");
    expect(normalizeCollarColorLabel("   ")).toBe("");
  });
});

test.describe("collarSeriesColor", () => {
  test("utilise la teinte du collier quand elle est connue", () => {
    const result = collarSeriesColor("noir", 0);
    expect(result.source).toBe("collar");
    expect(result.color).toBe(COLLAR_COLORS.noir);
  });

  test("gère les accents et la casse du collier saisi", () => {
    const result = collarSeriesColor("Rose pâle", 3);
    expect(result.source).toBe("collar");
    expect(result.color).toBe(COLLAR_COLORS["rose pale"]);
  });

  test("replie sur la palette de série sans collier", () => {
    const first = collarSeriesColor(null, 0);
    const second = collarSeriesColor(undefined, 1);
    expect(first.source).toBe("fallback");
    expect(second.source).toBe("fallback");
    expect(first.color).not.toBe(second.color);
  });

  test("replie pour un libellé de collier inconnu", () => {
    const result = collarSeriesColor("doré pailleté", 2);
    expect(result.source).toBe("fallback");
    expect(result.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

test.describe("buildAgeDayTicks (via litter-growth-chart-model)", () => {
  test("gradue en jours entiers alignés sur l'origine", async () => {
    const { buildAgeDayTicks } = await import(
      "../../src/features/litter-weights/litter-growth-chart-model"
    );
    const DAY_MS = 24 * 60 * 60 * 1_000;
    // Naissance à 13h, fenêtre de ~20 jours.
    const origin = Date.UTC(2026, 7, 3, 13);
    const domain = {
      minTimestamp: origin,
      maxTimestamp: origin + Math.round(19.81 * DAY_MS),
    };

    const ticks = buildAgeDayTicks(domain, origin);

    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      const ageDays = (tick - origin) / DAY_MS;
      expect(Number.isInteger(ageDays)).toBe(true);
      expect(ageDays).toBeGreaterThanOrEqual(0);
    }
    const steps = ticks.slice(1).map((tick, index) =>
      Math.round((tick - ticks[index]!) / DAY_MS),
    );
    expect(new Set(steps).size).toBe(1);
  });

  test("retourne un tableau vide pour une fenêtre nulle", async () => {
    const { buildAgeDayTicks } = await import(
      "../../src/features/litter-weights/litter-growth-chart-model"
    );
    const at = Date.UTC(2026, 7, 3, 13);
    expect(buildAgeDayTicks({ minTimestamp: at, maxTimestamp: at }, at)).toEqual(
      [],
    );
  });
});
