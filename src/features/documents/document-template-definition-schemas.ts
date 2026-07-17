import { z } from "zod";

export const DOCUMENT_TEMPLATE_SCHEMA_VERSION = 2 as const;
export const DOCUMENT_TEMPLATE_LOCALE = "fr-FR" as const;

const MAX_TITLE_LENGTH = 200;
export const MAX_FREE_DOCUMENT_TEMPLATE_BODY_LENGTH = 30_000;

/** @deprecated Use MAX_FREE_DOCUMENT_TEMPLATE_BODY_LENGTH */
export const MAX_FREE_RESERVATION_CONTRACT_BODY_LENGTH =
  MAX_FREE_DOCUMENT_TEMPLATE_BODY_LENGTH;

const titleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);

const freeDocumentTemplateShape = {
  schemaVersion: z.literal(DOCUMENT_TEMPLATE_SCHEMA_VERSION),
  locale: z.literal(DOCUMENT_TEMPLATE_LOCALE),
  title: titleSchema,
  body: z
    .string()
    .max(MAX_FREE_DOCUMENT_TEMPLATE_BODY_LENGTH)
    .refine((value) => value.trim().length > 0),
};

export const commitmentCertificateTemplateDefinitionSchema = z
  .object({
    ...freeDocumentTemplateShape,
    documentType: z.literal("commitment_certificate"),
  })
  .strict();

export const reservationContractTemplateDefinitionSchema = z
  .object({
    ...freeDocumentTemplateShape,
    documentType: z.literal("reservation_contract"),
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

/** Alias historique : le contrat libre est désormais le seul format contrat. */
export type FreeReservationContractTemplateDefinition =
  ReservationContractTemplateDefinition;

export type DocumentTemplateDefinition = z.infer<
  typeof documentTemplateDefinitionSchema
>;

export type DocumentTemplateType = DocumentTemplateDefinition["documentType"];
