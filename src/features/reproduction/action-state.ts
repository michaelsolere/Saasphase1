export type ReproductionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Optional link shown alongside `message`, e.g. to the organization settings page. */
  settingsHref?: string;
};

export const initialReproductionActionState: ReproductionActionState = {
  status: "idle",
};
