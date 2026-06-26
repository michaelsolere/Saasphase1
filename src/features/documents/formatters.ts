const typeLabels: Record<string, string> = {
  phone_call_summary: "Compte rendu d'appel",
  plaud_transcript: "Transcription Plaud",
  application_form: "Formulaire de candidature",
  reservation_contract: "Contrat de réservation",
  commitment_certificate: "Certificat d'engagement",
  payment_receipt: "Reçu de paiement",
  invoice: "Facture",
  sale_certificate: "Certificat de vente",
  welcome_booklet: "Livret d'accueil",
  photo_use_authorization: "Autorisation photo",
  other: "Autre",
};

const statusLabels: Record<string, string> = {
  to_generate: "À générer",
  generated: "Généré",
  uploaded: "Importé",
  sent: "Envoyé",
  signed: "Signé",
  received: "Reçu",
  archived: "Archivé",
  missing: "Manquant",
  expired: "Expiré",
  cancelled: "Annulé",
  not_applicable: "Non applicable",
};

export function getDocumentTypeLabel(value: string | null) {
  if (!value) return "Type inconnu";
  return typeLabels[value] ?? value.replaceAll("_", " ");
}

export function getDocumentStatusLabel(value: string | null, documentType?: string | null) {
  if (!value) return "Statut inconnu";
  if (value === "signed" && (documentType === "reservation_contract" || documentType === "commitment_certificate")) {
    return "Reçu signé";
  }
  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export function getSignatureRequiredLabel(value: boolean | null) {
  return value ? "Oui" : "Non";
}
