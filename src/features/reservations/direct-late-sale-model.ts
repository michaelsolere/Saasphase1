export type DirectLateSaleAnimalFacts = {
  litterId: string | null;
  targetLitterId: string;
  status: string | null;
  ownershipStatus: string | null;
  isBreeder: boolean;
  isExternal: boolean;
  isRetired: boolean;
  alreadyAssigned: boolean;
  activeHold: boolean;
  priorityResolved: boolean;
  ordinaryWaveResolved: boolean;
};

export function isDirectLateSaleAnimalEligible(
  facts: DirectLateSaleAnimalFacts,
): { eligible: boolean; reason: string | null } {
  if (!facts.priorityResolved || !facts.ordinaryWaveResolved) {
    return { eligible: false, reason: "priority_families_unresolved" };
  }
  if (facts.litterId !== facts.targetLitterId) {
    return { eligible: false, reason: "litter_mismatch" };
  }
  if (
    facts.status !== "available" ||
    facts.ownershipStatus !== "produced" ||
    facts.isBreeder ||
    facts.isExternal ||
    facts.isRetired ||
    facts.alreadyAssigned ||
    facts.activeHold
  ) {
    return { eligible: false, reason: "animal_unavailable" };
  }
  return { eligible: true, reason: null };
}

export function deriveDirectLateSaleProofState({
  contractSigned,
  certificateSigned,
  paidCents,
  requiredCents,
  deadline,
  now,
  holdStatus,
}: {
  contractSigned: boolean;
  certificateSigned: boolean;
  paidCents: number;
  requiredCents: number;
  deadline: string;
  now: string;
  holdStatus: string;
}) {
  const paymentComplete = requiredCents > 0 && paidCents >= requiredCents;
  return {
    contract: contractSigned ? "complete" : "missing",
    certificate: certificateSigned ? "complete" : "missing",
    payment: paymentComplete ? "complete" : "missing",
    overdue: new Date(now).getTime() > new Date(deadline).getTime(),
    holdStatus,
    assignable:
      holdStatus === "active" && contractSigned && certificateSigned && paymentComplete,
  };
}
