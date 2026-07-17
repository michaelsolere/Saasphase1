export {
  DOCUMENT_TEMPLATE_LOCALE,
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  MAX_FREE_DOCUMENT_TEMPLATE_BODY_LENGTH,
  MAX_FREE_RESERVATION_CONTRACT_BODY_LENGTH,
  commitmentCertificateTemplateDefinitionSchema,
  documentTemplateDefinitionSchema,
  reservationContractTemplateDefinitionSchema,
  type CommitmentCertificateTemplateDefinition,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
  type ReservationContractTemplateDefinition,
  type FreeReservationContractTemplateDefinition,
} from "./document-template-definition-schemas";

export {
  parseDocumentTemplateDefinition,
  type ParseDocumentTemplateDefinitionResult,
} from "./parse-document-template-definition";
