const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  pending_positioning: "Positionnement en cours",
  pre_reservation_requested: "Pré-réservation demandée",
  pre_reservation_paid: "Pré-réservation payée",
  active: "Active",
  confirmed_after_birth: "Confirmée après naissance",
  waiting_for_available_sex: "En attente de sexe",
  postponed: "Reportée",
  animal_assigned: "Chiot attribué",
  adoption_ready: "Prêt au départ",
  adopted: "Adopté",
  withdrawn: "Désistement",
  expired: "Expirée",
  cancelled: "Annulée",
  archived: "Archivée",
};

export function getReservationStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export type PreReservationDepositState = "absent" | "requested" | "paid";

export function getPreReservationDepositStateFromStatus(
  reservationStatus: string | null,
): PreReservationDepositState {
  if (reservationStatus === "pre_reservation_paid") {
    return "paid";
  }

  if (reservationStatus === "pre_reservation_requested") {
    return "requested";
  }

  return "absent";
}

export function getPreReservationDepositLabel(
  state: PreReservationDepositState,
) {
  if (state === "paid") {
    return "Pré-réservation payée";
  }

  if (state === "requested") {
    return "Demande 1/2 — 250 € demandée";
  }

  return "Demande 1/2 — 250 € absente";
}

export function getPreReservationDepositBadgeClassName(
  state: PreReservationDepositState,
) {
  if (state === "paid") {
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  }

  if (state === "requested") {
    return "text-amber-700 bg-amber-50 border-amber-200";
  }

  return "text-muted bg-muted-soft border-border";
}

export function formatPrice(priceCents: number | null, currency: string | null) {
  if (priceCents === null || priceCents === undefined) {
    return "Non renseigné";
  }

  const amount = priceCents / 100;
  const currencyCode = currency || "EUR";

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}
