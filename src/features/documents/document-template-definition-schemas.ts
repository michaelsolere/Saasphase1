import { z } from "zod";

export const DOCUMENT_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_TEMPLATE_LOCALE = "fr-FR" as const;

const MAX_TITLE_LENGTH = 200;
const MAX_LABEL_LENGTH = 120;
const MAX_PARAGRAPH_LENGTH = 2_000;
const MAX_PARAGRAPHS = 12;

const titleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const labelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);
const paragraphSchema = z.string().trim().min(1).max(MAX_PARAGRAPH_LENGTH);
const paragraphsSchema = z
  .array(paragraphSchema)
  .min(1)
  .max(MAX_PARAGRAPHS);

const definitionHeaderShape = {
  schemaVersion: z.literal(DOCUMENT_TEMPLATE_SCHEMA_VERSION),
  locale: z.literal(DOCUMENT_TEMPLATE_LOCALE),
};

export const commitmentCertificateTemplateDefinitionSchema = z
  .object({
    ...definitionHeaderShape,
    documentType: z.literal("commitment_certificate"),
    title: titleSchema,
    introduction: paragraphsSchema,
    sections: z
      .object({
        animalNeeds: paragraphsSchema,
        health: paragraphsSchema,
        educationAndBehavior: paragraphsSchema,
        costsAndConstraints: paragraphsSchema,
        holderObligations: paragraphsSchema,
      })
      .strict(),
    acknowledgmentText: paragraphsSchema,
    signatureLabels: z
      .object({
        holder: labelSchema,
        issuer: labelSchema,
      })
      .strict(),
  })
  .strict();

export const reservationContractTemplateDefinitionSchema = z
  .object({
    ...definitionHeaderShape,
    documentType: z.literal("reservation_contract"),
    title: titleSchema,
    preamble: paragraphsSchema,
    clauses: z
      .object({
        reservationPurpose: paragraphsSchema,
        priceAndPayments: paragraphsSchema,
        deposit: paragraphsSchema,
        cancellationAndRefund: paragraphsSchema,
        postponementAndCredit: paragraphsSchema,
        potentialWithholding: paragraphsSchema,
        finalConditions: paragraphsSchema,
      })
      .strict(),
    signatureLabels: z
      .object({
        breeder: labelSchema,
        reservingParty: labelSchema,
      })
      .strict(),
  })
  .strict();

export const documentTemplateDefinitionSchema = z.discriminatedUnion(
  "documentType",
  [
    commitmentCertificateTemplateDefinitionSchema,
    reservationContractTemplateDefinitionSchema,
  ],
);

export type CommitmentCertificateTemplateDefinition = z.infer<
  typeof commitmentCertificateTemplateDefinitionSchema
>;

export type ReservationContractTemplateDefinition = z.infer<
  typeof reservationContractTemplateDefinitionSchema
>;

export type DocumentTemplateDefinition = z.infer<
  typeof documentTemplateDefinitionSchema
>;

export type DocumentTemplateType = DocumentTemplateDefinition["documentType"];
