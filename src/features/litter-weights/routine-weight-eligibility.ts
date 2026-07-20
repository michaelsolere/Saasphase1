export type RoutineWeightEligibilityReason =
  | "current_ownership_not_produced"
  | "missing_birth_date"
  | "stillborn";

export type RoutineWeightEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reasons: RoutineWeightEligibilityReason[];
    };

export type RoutineWeightEligibilityAnimal = {
  ownershipStatus: string;
  birthDate: string | null;
  status: string;
};

export function getRoutineWeightEligibility(
  animal: RoutineWeightEligibilityAnimal,
): RoutineWeightEligibility {
  const reasons: RoutineWeightEligibilityReason[] = [];

  if (animal.ownershipStatus !== "produced") {
    reasons.push("current_ownership_not_produced");
  }
  if (animal.birthDate === null) {
    reasons.push("missing_birth_date");
  }
  if (animal.status === "stillborn") {
    reasons.push("stillborn");
  }

  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}
