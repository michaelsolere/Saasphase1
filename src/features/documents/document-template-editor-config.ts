import type { DocumentTemplateType } from "./document-template-definitions";

export const documentTemplateTypePresentations: Record<
  DocumentTemplateType,
  {
    label: string;
    description: string;
    automaticContent: readonly string[];
  }
> = {
  commitment_certificate: {
    label: "Certificat d’engagement",
    description: "Informations, responsabilités et signatures du certificat.",
    automaticContent: [
      "vendeur et élevage",
      "acquéreur et coordonnées",
      "projet d’adoption, portée, sexe et rang de choix",
      "parentage et identifiants disponibles",
      "date de disponibilité fixée sur la portée",
      "ville et date de préparation",
    ],
  },
  reservation_contract: {
    label: "Contrat de réservation",
    description: "Préambule, clauses contractuelles et signatures.",
    automaticContent: [
      "vendeur et élevage",
      "acquéreur et coordonnées",
      "projet d’adoption, portée, sexe et rang de choix",
      "parentage et identifiants disponibles",
      "date de disponibilité fixée sur la portée",
      "prix, arrhes convenues, arrhes reçues, complément et solde",
      "ville et date de préparation",
      "médiateur lorsqu’il est configuré",
    ],
  },
};

export const creatableStructuredDocumentTemplateTypes = [
  "commitment_certificate",
  "reservation_contract",
] as const satisfies readonly DocumentTemplateType[];

export function hasStructuredDocumentTemplateEditor(
  documentType: string,
): documentType is DocumentTemplateType {
  return Object.hasOwn(documentTemplateTypePresentations, documentType);
}
