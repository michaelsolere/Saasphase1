import {
  DOCUMENT_TEMPLATE_LOCALE,
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  FREE_RESERVATION_CONTRACT_SCHEMA_VERSION,
  type CommitmentCertificateTemplateDefinition,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
  type FreeReservationContractTemplateDefinition,
} from "./document-template-definitions";

export const INITIAL_FREE_RESERVATION_CONTRACT_BODY = `Il a été convenu ce qui suit entre les parties :

Le vendeur :
[[vendeur.identite_complete]]
[[vendeur.adresse_complete]]

L’acquéreur : [[adoptant.nom_complet]]
Adresse : [[adoptant.adresse_complete]]
Téléphone : [[adoptant.telephone]]
Email : [[adoptant.email]]

La réservation d’un chiot de race [[projet.race]] aux caractéristiques suivantes :

Né le : [[projet.date_naissance]]
Sexe : [[projet.sexe]]
Rang du choix : [[reservation.rang_choix]]

Mère : [[portee.mere.nom]]
ID : [[portee.mere.identification]]
Numéro LOF : [[portee.mere.numero_lof]]

Père : [[portee.pere.nom]]
ID : [[portee.pere.identification]]
Numéro LOF : [[portee.pere.numero_lof]]

Le prix du chiot a été fixé à [[reservation.prix_en_lettres]] ([[reservation.prix_formate]]).

Somme versée à titre d’arrhes : [[reservation.arrhes_versees_formatees]] par virement.

Les arrhes valident la réservation et sont encaissables immédiatement. Si l’acquéreur renonce à l’achat, il abandonne ses arrhes au vendeur (article 1590 du Code civil). Le reste du règlement devra être versé au départ du chiot.

Le chiot reste la propriété de l’éleveur jusqu’au paiement intégral de son prix. Le chiot pourra quitter l’élevage à sa huitième semaine révolue, après la primovaccination.

Le chiot est vendu non stérilisé pour compagnie. Si l’acheteur décidait de changer la destination finale de l’animal — exposition ou reproduction — le vendeur ne pourrait être tenu pour responsable si l’animal ne pouvait remplir les fonctions induites par ce changement de destination.

Le prix comprend la primovaccination, l’inscription au LOF, l’identification par puce électronique et le certificat vétérinaire.

Les chiots de cette portée seront disponibles à partir du [[portee.date_disponibilite]].

Fait en double exemplaire à [[document.lieu_signature]] le [[document.date_generation]].

Le vendeur :
Lu et approuvé, signature :

L’acquéreur :
Lu et approuvé, signature :`;

function createCommitmentCertificateDefinition(): CommitmentCertificateTemplateDefinition {
  return {
    schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "commitment_certificate",
    title: "",
    introduction: [],
    sections: { animalNeeds: [], health: [], educationAndBehavior: [], costsAndConstraints: [], holderObligations: [] },
    acknowledgmentText: [],
    signatureLabels: { holder: "", issuer: "" },
  };
}

function createReservationContractDefinition(): FreeReservationContractTemplateDefinition {
  return {
    schemaVersion: FREE_RESERVATION_CONTRACT_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "reservation_contract",
    title: "Contrat de réservation",
    body: INITIAL_FREE_RESERVATION_CONTRACT_BODY,
  };
}

/** Builds an intentionally incomplete editor-ready draft; Zod remains authoritative. */
export function createInitialDocumentTemplateDefinition(
  documentType: DocumentTemplateType,
): DocumentTemplateDefinition {
  switch (documentType) {
    case "commitment_certificate": return createCommitmentCertificateDefinition();
    case "reservation_contract": return createReservationContractDefinition();
  }
}
