import { expect, test } from "@playwright/test";

import {
  GESTATION_LIBRARY_HERPESVIROSE_CODE,
  GESTATION_LIBRARY_STANDARD_CODE,
  GESTATION_LIBRARY_VARIANTS,
  GESTATION_LIBRARY_VERSION,
  gestationDefaultChoiceFromLibrary,
  gestationDefaultLibrarySelection,
  gestationDefaultTitle,
  parseGestationDefaultChoice,
  type GestationDefaultChoice,
} from "../../src/features/settings/gestation-default-planning";

const NON_NONE_CHOICES: ReadonlyArray<Exclude<GestationDefaultChoice, "none">> = [
  "standard",
  "herpesvirose",
];

test("parse les clés de choix publiques", () => {
  expect(parseGestationDefaultChoice("none")).toBe("none");
  expect(parseGestationDefaultChoice("standard")).toBe("standard");
  expect(parseGestationDefaultChoice("herpesvirose")).toBe("herpesvirose");
});

test("parse aussi les codes bibliothèque publics comme alias", () => {
  expect(parseGestationDefaultChoice(GESTATION_LIBRARY_STANDARD_CODE)).toBe(
    "standard",
  );
  expect(parseGestationDefaultChoice(GESTATION_LIBRARY_HERPESVIROSE_CODE)).toBe(
    "herpesvirose",
  );
});

test("ignore les espaces superflus mais reste sensible à la casse", () => {
  expect(parseGestationDefaultChoice("  standard  ")).toBe("standard");
  expect(parseGestationDefaultChoice("STANDARD")).toBeNull();
  expect(parseGestationDefaultChoice("None")).toBeNull();
});

test("rejette les valeurs vides, inconnues ou du mauvais type", () => {
  expect(parseGestationDefaultChoice("")).toBeNull();
  expect(parseGestationDefaultChoice("   ")).toBeNull();
  expect(parseGestationDefaultChoice("unknown-choice")).toBeNull();
  expect(parseGestationDefaultChoice(null)).toBeNull();
  expect(parseGestationDefaultChoice(undefined)).toBeNull();
  expect(parseGestationDefaultChoice(42)).toBeNull();
  expect(parseGestationDefaultChoice({})).toBeNull();
});

test("ne reconnaît jamais un UUID comme choix valide", () => {
  expect(
    parseGestationDefaultChoice("123e4567-e89b-12d3-a456-426614174000"),
  ).toBeNull();
});

test("mappe l’absence de modèle bibliothèque sur « none »", () => {
  expect(gestationDefaultChoiceFromLibrary(null, null)).toBe("none");
  expect(gestationDefaultChoiceFromLibrary(undefined, undefined)).toBe("none");
});

test("mappe les couples code/version connus sur leur choix", () => {
  expect(
    gestationDefaultChoiceFromLibrary(
      GESTATION_LIBRARY_STANDARD_CODE,
      GESTATION_LIBRARY_VERSION,
    ),
  ).toBe("standard");
  expect(
    gestationDefaultChoiceFromLibrary(
      GESTATION_LIBRARY_HERPESVIROSE_CODE,
      GESTATION_LIBRARY_VERSION,
    ),
  ).toBe("herpesvirose");
});

test("refuse un couple code/version incomplet plutôt que de le forcer sur « none »", () => {
  expect(
    gestationDefaultChoiceFromLibrary(GESTATION_LIBRARY_STANDARD_CODE, null),
  ).toBeNull();
  expect(
    gestationDefaultChoiceFromLibrary(null, GESTATION_LIBRARY_VERSION),
  ).toBeNull();
});

test("refuse un code ou une version inconnus", () => {
  expect(
    gestationDefaultChoiceFromLibrary("dog-gestation-unknown", GESTATION_LIBRARY_VERSION),
  ).toBeNull();
  expect(
    gestationDefaultChoiceFromLibrary(
      GESTATION_LIBRARY_STANDARD_CODE,
      GESTATION_LIBRARY_VERSION + 1,
    ),
  ).toBeNull();
});

test("construit la sélection bibliothèque à envoyer au RPC", () => {
  expect(gestationDefaultLibrarySelection("none")).toEqual({
    libraryModelCode: null,
    libraryModelVersion: null,
  });
  expect(gestationDefaultLibrarySelection("standard")).toEqual({
    libraryModelCode: GESTATION_LIBRARY_STANDARD_CODE,
    libraryModelVersion: GESTATION_LIBRARY_VERSION,
  });
  expect(gestationDefaultLibrarySelection("herpesvirose")).toEqual({
    libraryModelCode: GESTATION_LIBRARY_HERPESVIROSE_CODE,
    libraryModelVersion: GESTATION_LIBRARY_VERSION,
  });
});

test("expose un titre humain pour chaque variante non « none »", () => {
  expect(gestationDefaultTitle("standard")).toBe("Gestation");
  expect(gestationDefaultTitle("herpesvirose")).toBe(
    "Gestation + herpèsvirose",
  );
});

test("fait l’aller-retour choix -> sélection -> choix pour chaque variante importable", () => {
  for (const choice of NON_NONE_CHOICES) {
    const selection = gestationDefaultLibrarySelection(choice);
    expect(
      gestationDefaultChoiceFromLibrary(
        selection.libraryModelCode,
        selection.libraryModelVersion,
      ),
    ).toBe(choice);
  }

  const noneSelection = gestationDefaultLibrarySelection("none");
  expect(
    gestationDefaultChoiceFromLibrary(
      noneSelection.libraryModelCode,
      noneSelection.libraryModelVersion,
    ),
  ).toBe("none");
});

test("les codes bibliothèque publics ne ressemblent jamais à un UUID", () => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const choice of NON_NONE_CHOICES) {
    const variant = GESTATION_LIBRARY_VARIANTS[choice];
    expect(variant.libraryModelCode).not.toMatch(uuidPattern);
  }
});
