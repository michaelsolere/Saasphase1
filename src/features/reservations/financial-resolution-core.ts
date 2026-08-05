export type FinancialResolution =
  | "none"
  | "pending"
  | "full_refund"
  | "partial_refund"
  | "no_refund"
  | "credit_issued"
  | "transfer_to_future_reservation"
  | "withholding_applied"
  | "other";

export type FinancialResolutionTone =
  | "neutral"
  | "warning"
  | "success"
  | "attention";

const FINANCIAL_RESOLUTION_LABELS: Record<FinancialResolution, string> = {
  none: "Aucune résolution nécessaire",
  pending: "Résolution financière à traiter",
  full_refund: "Remboursement total",
  partial_refund: "Remboursement partiel — solde conservé",
  no_refund: "Aucun remboursement — somme conservée",
  credit_issued: "Avoir émis — état historique",
  transfer_to_future_reservation: "Report vers un futur parcours — état historique",
  withholding_applied: "Retenue appliquée — état historique",
  other: "Autre résolution — état historique",
};

export function getFinancialResolutionLabel(value: string | null | undefined) {
  if (value && value in FINANCIAL_RESOLUTION_LABELS) {
    return FINANCIAL_RESOLUTION_LABELS[value as FinancialResolution];
  }

  return "Résolution financière non reconnue";
}

export function getFinancialResolutionTone(
  value: string | null | undefined,
): FinancialResolutionTone {
  if (value === "pending") return "warning";
  if (value === "full_refund") return "success";
  if (
    value === "partial_refund" ||
    value === "no_refund" ||
    value === "credit_issued" ||
    value === "transfer_to_future_reservation" ||
    value === "withholding_applied" ||
    value === "other"
  ) {
    return "attention";
  }
  return "neutral";
}

export function parseEuroAmountToCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [euros, decimals = ""] = normalized.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) {
    return null;
  }

  return cents;
}
