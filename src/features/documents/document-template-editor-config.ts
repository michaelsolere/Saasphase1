import type { DocumentTemplateType } from "./document-template-definitions";

export const documentTemplateTypePresentations: Record<
  DocumentTemplateType,
  { label: string; description: string }
> = {
  commitment_certificate: {
    label: "Certificat d’engagement",
    description: "Informations, responsabilités et signatures du certificat.",
  },
  reservation_contract: {
    label: "Contrat de réservation",
    description: "Préambule, clauses contractuelles et signatures.",
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
