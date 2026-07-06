export const actionTargets = {
  archive: "archived",
  mark_unsuccessful: "withdrawn",
  qualify: "qualified",
  reactivate: "to_review",
  reject: "rejected",
  to_call: "to_call",
} as const;

export type QualificationAction = keyof typeof actionTargets;

export const transitions: Record<string, QualificationAction[]> = {
  new: ["to_call", "qualify", "reject", "archive"],
  to_review: ["to_call", "qualify", "reject", "archive"],
  to_call: ["qualify", "reject", "archive"],
  qualified: ["mark_unsuccessful", "reject", "archive"],
  waiting_litter: ["mark_unsuccessful", "reject", "archive"],
  rejected: ["reactivate", "archive"],
  withdrawn: ["reactivate", "archive"],
  archived: ["reactivate"],
};
