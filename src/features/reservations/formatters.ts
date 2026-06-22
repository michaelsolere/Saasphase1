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
