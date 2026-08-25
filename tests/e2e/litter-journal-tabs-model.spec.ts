import { expect, test } from "@playwright/test";

import {
  LITTER_JOURNAL_TABS,
  buildLitterJournalPath,
  normalizeLitterJournalTab,
} from "../../src/features/litter-journal/journal-tabs-model";

test("conserve l'ordre des onglets du prototype hybride", () => {
  expect(LITTER_JOURNAL_TABS).toEqual([
    "today",
    "planning",
    "birth",
    "weights",
    "mother",
    "history",
  ]);
});

test("normalise l'onglet du journal et revient à Aujourd'hui pour une valeur inconnue", () => {
  expect(normalizeLitterJournalTab(undefined)).toBe("today");
  expect(normalizeLitterJournalTab(null)).toBe("today");
  expect(normalizeLitterJournalTab("")).toBe("today");
  expect(normalizeLitterJournalTab("inconnu")).toBe("today");
  expect(normalizeLitterJournalTab("today")).toBe("today");
  expect(normalizeLitterJournalTab("planning")).toBe("planning");
  expect(normalizeLitterJournalTab("birth")).toBe("birth");
  expect(normalizeLitterJournalTab("weights")).toBe("weights");
  expect(normalizeLitterJournalTab("mother")).toBe("mother");
  expect(normalizeLitterJournalTab("history")).toBe("history");
});

test("construit un chemin qui préserve la portée sélectionnée", () => {
  const withLitter = buildLitterJournalPath(
    "0f1a2b3c-0000-4000-8000-000000000001",
    "weights",
  );
  const url = new URL(withLitter, "http://localhost");
  expect(url.pathname).toBe("/litters/journal");
  expect(url.searchParams.get("litter")).toBe(
    "0f1a2b3c-0000-4000-8000-000000000001",
  );
  expect(url.searchParams.get("tab")).toBe("weights");
});

test("construit un chemin sans portée avec seulement l'onglet", () => {
  const withoutLitter = buildLitterJournalPath(null, "history");
  const url = new URL(withoutLitter, "http://localhost");
  expect(url.pathname).toBe("/litters/journal");
  expect(url.searchParams.has("litter")).toBe(false);
  expect(url.searchParams.get("tab")).toBe("history");
});
