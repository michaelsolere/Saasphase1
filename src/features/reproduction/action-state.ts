export type ReproductionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReproductionActionState: ReproductionActionState = {
  status: "idle",
};
