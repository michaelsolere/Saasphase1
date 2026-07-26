/**
 * Pure helpers for the organization default gestation planning choice.
 * Public choice types expose only library code/version or `none` — never model UUIDs.
 */

export const GESTATION_LIBRARY_STANDARD_CODE = "dog-gestation-standard" as const;
export const GESTATION_LIBRARY_HERPESVIROSE_CODE =
  "dog-gestation-herpesvirose" as const;
export const GESTATION_LIBRARY_VERSION = 1 as const;

export type GestationDefaultChoice = "none" | "standard" | "herpesvirose";

export type GestationLibraryVariant =
  | {
      choice: "none";
    }
  | {
      choice: "standard";
      libraryModelCode: typeof GESTATION_LIBRARY_STANDARD_CODE;
      libraryModelVersion: typeof GESTATION_LIBRARY_VERSION;
      title: "Gestation";
    }
  | {
      choice: "herpesvirose";
      libraryModelCode: typeof GESTATION_LIBRARY_HERPESVIROSE_CODE;
      libraryModelVersion: typeof GESTATION_LIBRARY_VERSION;
      title: "Gestation + herpèsvirose";
    };

export const GESTATION_LIBRARY_VARIANTS = {
  none: { choice: "none" },
  standard: {
    choice: "standard",
    libraryModelCode: GESTATION_LIBRARY_STANDARD_CODE,
    libraryModelVersion: GESTATION_LIBRARY_VERSION,
    title: "Gestation",
  },
  herpesvirose: {
    choice: "herpesvirose",
    libraryModelCode: GESTATION_LIBRARY_HERPESVIROSE_CODE,
    libraryModelVersion: GESTATION_LIBRARY_VERSION,
    title: "Gestation + herpèsvirose",
  },
} as const satisfies Record<GestationDefaultChoice, GestationLibraryVariant>;

export function gestationDefaultTitle(
  choice: Exclude<GestationDefaultChoice, "none">,
): string {
  return GESTATION_LIBRARY_VARIANTS[choice].title;
}

/**
 * Parse a form radio/select value into a public gestation default choice.
 * Accepts the choice keys and the public library codes for the known v1 variants.
 */
export function parseGestationDefaultChoice(
  value: unknown,
): GestationDefaultChoice | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed === "none") return "none";
  if (
    trimmed === "standard" ||
    trimmed === GESTATION_LIBRARY_STANDARD_CODE
  ) {
    return "standard";
  }
  if (
    trimmed === "herpesvirose" ||
    trimmed === GESTATION_LIBRARY_HERPESVIROSE_CODE
  ) {
    return "herpesvirose";
  }
  return null;
}

/**
 * Map an imported library origin (code + version) to a public choice.
 * Unknown codes/versions yield `null` (not coerced to `none`).
 */
export function gestationDefaultChoiceFromLibrary(
  code: string | null | undefined,
  version: number | null | undefined,
): GestationDefaultChoice | null {
  if (code == null && version == null) return "none";
  if (code == null || version == null) return null;
  if (
    code === GESTATION_LIBRARY_STANDARD_CODE &&
    version === GESTATION_LIBRARY_VERSION
  ) {
    return "standard";
  }
  if (
    code === GESTATION_LIBRARY_HERPESVIROSE_CODE &&
    version === GESTATION_LIBRARY_VERSION
  ) {
    return "herpesvirose";
  }
  return null;
}

/** Library selection to send to the settings RPC, or both null to clear. */
export function gestationDefaultLibrarySelection(
  choice: GestationDefaultChoice,
): {
  libraryModelCode: string | null;
  libraryModelVersion: number | null;
} {
  if (choice === "none") {
    return { libraryModelCode: null, libraryModelVersion: null };
  }
  const variant = GESTATION_LIBRARY_VARIANTS[choice];
  return {
    libraryModelCode: variant.libraryModelCode,
    libraryModelVersion: variant.libraryModelVersion,
  };
}
