import { expect, test } from "@playwright/test";

import { validateLoginReturnPath } from "../../src/features/auth/login-return";
import type { LitterJournalListItem } from "../../src/features/litter-journal/types";
import { config as proxyConfig } from "../../src/proxy";
import {
  parsePublicLitterIndex,
  resolveMobileLitterIndex,
  selectDefaultMobileLitterIndex,
} from "../../src/features/whelping/whelping-mobile-selection";
import type { WhelpingSessionSummary } from "../../src/features/whelping/whelping-core";

function litter(index: number): LitterJournalListItem {
  return { id: `litter-${index}`, name: `Portée ${index}` } as LitterJournalListItem;
}

function session(
  status: "open" | "closed",
  startedAt: string,
): WhelpingSessionSummary {
  return { status, startedAt } as WhelpingSessionSummary;
}

test("parse uniquement un index public décimal non négatif", () => {
  expect(parsePublicLitterIndex(undefined)).toBeNull();
  expect(parsePublicLitterIndex("0")).toBe(0);
  expect(parsePublicLitterIndex("12")).toBe(12);
  expect(parsePublicLitterIndex("-1")).toBeNull();
  expect(parsePublicLitterIndex("1.5")).toBeNull();
  expect(parsePublicLitterIndex("01")).toBeNull();
  expect(parsePublicLitterIndex("d3c90001-0000-4000-8000-000000000001")).toBeNull();
  expect(parsePublicLitterIndex("9007199254740992")).toBeNull();
});

test("retombe sur la sélection par défaut pour une valeur absente, invalide ou hors limites", () => {
  expect(resolveMobileLitterIndex(undefined, 2, 1)).toBe(1);
  expect(resolveMobileLitterIndex("uuid", 2, 1)).toBe(1);
  expect(resolveMobileLitterIndex("2", 2, 1)).toBe(1);
  expect(resolveMobileLitterIndex("0", 2, 1)).toBe(0);
  expect(resolveMobileLitterIndex("0", 0, null)).toBeNull();
});

test("sélectionne la première portée sans session ouverte", () => {
  expect(
    selectDefaultMobileLitterIndex(
      [litter(0), litter(1)],
      [[session("closed", "2026-07-22T08:00:00Z")], []],
    ),
  ).toBe(0);
  expect(selectDefaultMobileLitterIndex([], [])).toBeNull();
});

test("donne la priorité à la session ouverte la plus récemment démarrée", () => {
  expect(
    selectDefaultMobileLitterIndex(
      [litter(0), litter(1), litter(2)],
      [
        [session("open", "2026-07-22T08:00:00Z")],
        [session("closed", "2026-07-22T11:00:00Z")],
        [session("open", "2026-07-22T10:00:00Z")],
      ],
    ),
  ).toBe(2);
});

test("autorise uniquement les retours de connexion vers le mode mise-bas", () => {
  expect(validateLoginReturnPath("/whelping")).toBe("/whelping");
  expect(validateLoginReturnPath("/whelping?litter=0")).toBe("/whelping?litter=0");
  expect(validateLoginReturnPath("/whelping?litter=42")).toBe("/whelping?litter=42");

  for (const rejected of [
    "https://autre-site.example",
    "//autre-site.example",
    "/\\autre-site",
    "javascript:alert(1)",
    "data:text/html,test",
    "/whelping?litter=d3c90001-0000-4000-8000-000000000001",
    "/whelping?autre=1",
    "/whelping?litter=-1",
    "/whelping?litter=1.5",
    "/whelping?litter=01",
    "/whelping#fragment",
  ]) {
    expect(validateLoginReturnPath(rejected), rejected).toBeNull();
  }
  expect(validateLoginReturnPath(undefined)).toBeNull();
});

test("rafraîchit la session Supabase sur la route mobile installée", () => {
  expect(proxyConfig.matcher).toContain("/whelping/:path*");
  expect(proxyConfig.matcher).toEqual(
    expect.arrayContaining(["/candidatures/:path*", "/login"]),
  );
});
