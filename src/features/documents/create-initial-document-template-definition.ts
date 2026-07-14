import {
  DOCUMENT_TEMPLATE_LOCALE,
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  type CommitmentCertificateTemplateDefinition,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
  type ReservationContractTemplateDefinition,
} from "./document-template-definitions";

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

function createReservationContractDefinition(): ReservationContractTemplateDefinition {
  return {
    schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "reservation_contract",
    title: "",
    preamble: [],
    clauses: { reservationPurpose: [], priceAndPayments: [], deposit: [], cancellationAndRefund: [], postponementAndCredit: [], potentialWithholding: [], finalConditions: [] },
    signatureLabels: { breeder: "", reservingParty: "" },
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
