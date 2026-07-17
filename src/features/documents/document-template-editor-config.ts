import type { DocumentTemplateType } from "./document-template-definitions";

export const documentTemplateTypePresentations: Record<
  DocumentTemplateType,
  {
    label: string;
    description: string;
    editorHeading: string;
    editorDescription: string;
    bodyLabel: string;
  }
> = {
  commitment_certificate: {
    label: "Certificat d’engagement",
    description: "Titre libre, corps libre et variables du certificat.",
    editorHeading: "Certificat libre",
    editorDescription:
      "Composez librement le certificat et insérez les données à l’endroit souhaité.",
    bodyLabel: "Contenu du certificat",
  },
  reservation_contract: {
    label: "Contrat de réservation",
    description: "Titre libre, corps libre et variables du contrat.",
    editorHeading: "Contrat libre",
    editorDescription:
      "Composez librement le contrat et insérez les données à l’endroit souhaité.",
    bodyLabel: "Contenu du contrat",
  },
};

export const creatableDocumentTemplateTypes = [
  "commitment_certificate",
  "reservation_contract",
] as const satisfies readonly DocumentTemplateType[];

/** @deprecated Use creatableDocumentTemplateTypes */
export const creatableStructuredDocumentTemplateTypes =
  creatableDocumentTemplateTypes;

export function hasDocumentTemplateEditor(
  documentType: string,
): documentType is DocumentTemplateType {
  return Object.hasOwn(documentTemplateTypePresentations, documentType);
}

/** @deprecated Use hasDocumentTemplateEditor */
export const hasStructuredDocumentTemplateEditor = hasDocumentTemplateEditor;
