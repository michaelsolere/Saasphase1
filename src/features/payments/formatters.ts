const typeLabels: Record<string, string> = {
  pre_reservation_deposit_refundable: "Acompte remboursable",
  arrhes: "Versement de réservation",
  balance: "Solde",
  refund: "Remboursement",
  partial_refund: "Remboursement partiel",
  credit_use: "Avoir",
  withholding: "Retenue",
  transfer_to_future_reservation: "Report de réservation",
  other: "Autre",
};

const statusLabels: Record<string, string> = {
  requested: "Demandé",
  pending: "En attente",
  partially_paid: "Partiellement payé",
  paid: "Payé",
  partially_refunded: "Partiellement remboursé",
  refunded: "Remboursé",
  converted_to_credit: "Converti en avoir",
  transferred: "Transféré",
  cancelled: "Annulé",
  failed: "Échoué",
  disputed: "Contesté",
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Virement",
  cash: "Espèces",
  card: "Carte bancaire",
  cheque: "Chèque",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Autre",
  unknown: "Inconnu",
};

export function getPaymentTypeLabel(value: string | null) {
  if (!value) return "Type inconnu";
  return typeLabels[value] ?? value.replaceAll("_", " ");
}

export function getPaymentStatusLabel(value: string | null) {
  if (!value) return "Statut inconnu";
  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export function getPaymentMethodLabel(value: string | null) {
  if (!value) return "Inconnue";
  return methodLabels[value] ?? value.replaceAll("_", " ");
}
