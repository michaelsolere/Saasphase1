export type WhelpingAppDisplayMode = "browser" | "standalone";

type WhelpingDisplayEnvironment = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: object;
};

export function getWhelpingAppDisplayMode(
  environment: WhelpingDisplayEnvironment | undefined =
    typeof window === "undefined" ? undefined : window,
): WhelpingAppDisplayMode {
  if (!environment) return "browser";

  const matchesStandaloneDisplay =
    environment.matchMedia?.("(display-mode: standalone)").matches === true;
  const usesLegacyAppleStandalone =
    (environment.navigator as { standalone?: boolean } | undefined)?.standalone ===
    true;

  return matchesStandaloneDisplay || usesLegacyAppleStandalone
    ? "standalone"
    : "browser";
}
