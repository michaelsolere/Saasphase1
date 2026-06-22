export const actionTargets = {
  archive: "archived",
  qualify: "qualified",
  reject: "rejected",
  to_call: "to_call",
} as const;

export type QualificationAction = keyof typeof actionTargets;

export const transitions: Record<string, QualificationAction[]> = {
  new: ["to_call", "qualify", "reject", "archive"],
  to_review: ["to_call", "qualify", "reject", "archive"],
  to_call: ["qualify", "reject", "archive"],
  qualified: ["archive"],
  waiting_litter: ["archive"],
  rejected: ["archive"],
  withdrawn: ["archive"],
  archived: [],
};
