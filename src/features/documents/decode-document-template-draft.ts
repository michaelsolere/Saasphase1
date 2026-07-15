import {
  DOCUMENT_TEMPLATE_LOCALE,
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  FREE_RESERVATION_CONTRACT_SCHEMA_VERSION,
  type CommitmentCertificateTemplateDefinition,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
  type ReservationContractTemplateDefinition,
  type FreeReservationContractTemplateDefinition,
} from "./document-template-definitions";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asParagraphs(value: unknown) {
  return Array.isArray(value)
    ? value.map((paragraph) => asString(paragraph))
    : [];
}

function parseStoredObject(templateContent: string | null) {
  if (!templateContent) return {};
  try {
    return asObject(JSON.parse(templateContent));
  } catch {
    return {};
  }
}

function decodeCommitmentCertificate(
  stored: JsonObject,
): CommitmentCertificateTemplateDefinition {
  const sections = asObject(stored.sections);
  const signatureLabels = asObject(stored.signatureLabels);

  return {
    schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "commitment_certificate",
    title: asString(stored.title),
    introduction: asParagraphs(stored.introduction),
    sections: {
      animalNeeds: asParagraphs(sections.animalNeeds),
      health: asParagraphs(sections.health),
      educationAndBehavior: asParagraphs(sections.educationAndBehavior),
      costsAndConstraints: asParagraphs(sections.costsAndConstraints),
      holderObligations: asParagraphs(sections.holderObligations),
    },
    acknowledgmentText: asParagraphs(stored.acknowledgmentText),
    signatureLabels: {
      holder: asString(signatureLabels.holder),
      issuer: asString(signatureLabels.issuer),
    },
  };
}

function decodeReservationContract(
  stored: JsonObject,
): ReservationContractTemplateDefinition {
  const clauses = asObject(stored.clauses);
  const signatureLabels = asObject(stored.signatureLabels);

  return {
    schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "reservation_contract",
    title: asString(stored.title),
    preamble: asParagraphs(stored.preamble),
    clauses: {
      reservationPurpose: asParagraphs(clauses.reservationPurpose),
      priceAndPayments: asParagraphs(clauses.priceAndPayments),
      deposit: asParagraphs(clauses.deposit),
      cancellationAndRefund: asParagraphs(clauses.cancellationAndRefund),
      postponementAndCredit: asParagraphs(clauses.postponementAndCredit),
      potentialWithholding: asParagraphs(clauses.potentialWithholding),
      finalConditions: asParagraphs(clauses.finalConditions),
    },
    signatureLabels: {
      breeder: asString(signatureLabels.breeder),
      reservingParty: asString(signatureLabels.reservingParty),
    },
  };
}

function decodeFreeReservationContract(
  stored: JsonObject,
): FreeReservationContractTemplateDefinition {
  return {
    schemaVersion: FREE_RESERVATION_CONTRACT_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType: "reservation_contract",
    title: asString(stored.title),
    body: asString(stored.body),
  };
}

export function decodeDocumentTemplateDraft({
  documentType,
  templateContent,
}: {
  documentType: DocumentTemplateType;
  templateContent: string | null;
}): DocumentTemplateDefinition {
  const stored = parseStoredObject(templateContent);

  return documentType === "commitment_certificate"
    ? decodeCommitmentCertificate(stored)
    : stored.schemaVersion === FREE_RESERVATION_CONTRACT_SCHEMA_VERSION
      ? decodeFreeReservationContract(stored)
      : decodeReservationContract(stored);
}
