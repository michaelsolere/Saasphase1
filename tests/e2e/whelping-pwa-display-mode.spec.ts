import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { getWhelpingAppDisplayMode } from "../../src/features/whelping/whelping-pwa-display-mode";

test("reconnaît le mode standalone standard", () => {
  expect(
    getWhelpingAppDisplayMode({
      matchMedia: () => ({ matches: true }),
      navigator: { standalone: false },
    }),
  ).toBe("standalone");
});

test("reconnaît le signal Apple historique", () => {
  expect(
    getWhelpingAppDisplayMode({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    }),
  ).toBe("standalone");
});

test("reste en mode navigateur lorsque les signaux sont faux ou absents", () => {
  expect(
    getWhelpingAppDisplayMode({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false },
    }),
  ).toBe("browser");
  expect(getWhelpingAppDisplayMode({})).toBe("browser");
  expect(getWhelpingAppDisplayMode(undefined)).toBe("browser");
});

test("ne dépend ni de l’agent utilisateur ni d’un stockage navigateur", async () => {
  const source = await readFile(
    resolve(process.cwd(), "src/features/whelping/whelping-pwa-display-mode.ts"),
    "utf8",
  );

  expect(source).not.toMatch(/userAgent/i);
  expect(source).not.toMatch(/localStorage|sessionStorage/i);
});
