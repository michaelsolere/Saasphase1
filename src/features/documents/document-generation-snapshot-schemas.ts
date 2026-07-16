import { z } from "zod";

export const DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION = 1 as const;
export const DOCUMENT_GENERATION_SNAPSHOT_VERSION = 2 as const;
export const DOCUMENT_GENERATION_SNAPSHOT_LOCALE = "fr-FR" as const;

const requiredTextSchema = z.string().trim().min(1).max(300);
const nullableTextSchema = requiredTextSchema.nullable();
const longNullableTextSchema = z.string().trim().min(1).max(1_000).nullable();
const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const nullableDateSchema = z.string().date().nullable();
const nonNegativeCentsSchema = z.number().int().nonnegative();
const nullableNonNegativeCentsSchema = nonNegativeCentsSchema.nullable();
const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const documentBrandingSchema = z
  .object({
    logo: z
      .object({
        assetId: uuidSchema,
        fileSha256: sha256Schema,
        fileSizeBytes: z.number().int().positive().max(512 * 1024),
        mimeType: z.enum(["image/png", "image/jpeg"]),
        widthPx: z.number().int().min(16).max(2000),
        heightPx: z.number().int().min(16).max(2000),
      })
      .strict()
      .nullable(),
  })
  .strict();

const addressSchema = z
  .object({
    line1: nullableTextSchema,
    line2: nullableTextSchema,
    postalCode: nullableTextSchema,
    city: nullableTextSchema,
    region: nullableTextSchema,
  })
  .strict();

const templateReferenceV1Schema = z
  .object({
    templateId: uuidSchema,
    templateVersion: z.number().int().positive(),
    templateContentSha256: sha256Schema,
  })
  .strict();

const commonTemplateReferenceV2Shape = {
  selectedTemplateId: uuidSchema,
  templateId: uuidSchema,
  templateVersion: z.number().int().positive(),
  templateContentSha256: sha256Schema,
};

const commonTemplateReferenceV2Schema = z
  .object({
    ...commonTemplateReferenceV2Shape,
    sourceKind: z.literal("common"),
    reservationDocumentVariantVersionId: z.null(),
    reservationDocumentVariantVersion: z.null(),
  })
  .strict();

const reservationVariantTemplateReferenceV2Schema = z
  .object({
    ...commonTemplateReferenceV2Shape,
    sourceKind: z.literal("reservation_variant"),
    reservationDocumentVariantVersionId: uuidSchema,
    reservationDocumentVariantVersion: z.number().int().positive(),
  })
  .strict();

const templateReferenceV2Schema = z.discriminatedUnion("sourceKind", [
  commonTemplateReferenceV2Schema,
  reservationVariantTemplateReferenceV2Schema,
]);

const businessSourcesSchema = z
  .object({
    organizationId: uuidSchema,
    reservationId: uuidSchema,
    contactId: uuidSchema,
    applicationId: nullableUuidSchema,
    litterId: nullableUuidSchema,
    litterGroupId: nullableUuidSchema,
    animalId: nullableUuidSchema,
  })
  .strict();

const sellerSchema = z
  .object({
    tradeName: requiredTextSchema,
    legalName: nullableTextSchema,
    legalForm: nullableTextSchema,
    siret: nullableTextSchema,
    email: z.string().trim().email().max(320).nullable(),
    phone: nullableTextSchema,
    website: z.string().trim().url().max(1_000).nullable(),
    address: addressSchema.nullable(),
    country: nullableTextSchema,
  })
  .strict();

const signerSchema = z
  .object({
    displayName: nullableTextSchema,
    firstName: nullableTextSchema,
    lastName: nullableTextSchema,
    role: nullableTextSchema,
    email: z.string().trim().email().max(320).nullable(),
    phone: nullableTextSchema,
  })
  .strict();

const adopterSchema = z
  .object({
    displayName: requiredTextSchema,
    firstName: nullableTextSchema,
    lastName: nullableTextSchema,
    email: z.string().trim().email().max(320).nullable(),
    phone: nullableTextSchema,
    address: addressSchema.nullable(),
    country: nullableTextSchema,
  })
  .strict();

const parentSchema = z
  .object({
    id: uuidSchema,
    officialName: nullableTextSchema,
    callName: nullableTextSchema,
    identification: nullableTextSchema,
    lofNumber: nullableTextSchema,
  })
  .strict();

const litterSchema = z
  .object({
    id: uuidSchema,
    name: nullableTextSchema,
    actualBirthDate: nullableDateSchema,
    availableFrom: nullableDateSchema.optional(),
    mother: parentSchema.nullable().optional(),
    father: parentSchema.nullable().optional(),
  })
  .strict();

const litterGroupSchema = z
  .object({
    id: uuidSchema,
    name: nullableTextSchema,
  })
  .strict();

const animalSchema = z
  .object({
    id: uuidSchema,
    officialName: nullableTextSchema,
    callName: nullableTextSchema,
    sex: nullableTextSchema,
    birthDate: nullableDateSchema,
    identification: nullableTextSchema,
    lofNumber: nullableTextSchema,
    color: nullableTextSchema.optional(),
  })
  .strict();

const adoptionProjectSchema = z
  .object({
    species: requiredTextSchema,
    breed: requiredTextSchema,
    sexPreference: nullableTextSchema,
    litter: litterSchema.nullable(),
    litterGroup: litterGroupSchema.nullable(),
    animal: animalSchema.nullable(),
  })
  .strict();

const reservationSchema = z
  .object({
    id: uuidSchema,
    status: requiredTextSchema,
    createdAt: isoDateTimeSchema,
    plannedAdoptionDate: nullableDateSchema,
    choiceRank: z.number().int().positive().nullable().optional(),
  })
  .strict();

const signatureDataSchema = z
  .object({
    defaultCity: nullableTextSchema,
  })
  .strict();

const mediatorSchema = z
  .object({
    name: nullableTextSchema,
    contact: longNullableTextSchema,
    website: z.string().trim().url().max(1_000).nullable(),
  })
  .strict();

const financialsSchema = z
  .object({
    currency: currencySchema,
    priceCents: nullableNonNegativeCentsSchema,
    paidCents: nonNegativeCentsSchema,
    refundedCents: nonNegativeCentsSchema,
    netPaidCents: nonNegativeCentsSchema,
    remainingCents: nullableNonNegativeCentsSchema,
    depositPaidCents: nonNegativeCentsSchema,
    fullDepositTargetCents: nonNegativeCentsSchema,
    depositTargetCents: nonNegativeCentsSchema.optional(),
    depositRemainingCents: nonNegativeCentsSchema.optional(),
    balanceAfterFullDepositCents: nullableNonNegativeCentsSchema.optional(),
  })
  .strict();

const commonSnapshotShape = <
  TVersion extends typeof DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION | typeof DOCUMENT_GENERATION_SNAPSHOT_VERSION,
  TTemplate extends z.ZodTypeAny,
>(snapshotVersion: TVersion, template: TTemplate) => ({
  snapshotVersion: z.literal(snapshotVersion),
  locale: z.literal(DOCUMENT_GENERATION_SNAPSHOT_LOCALE),
  capturedAt: isoDateTimeSchema,
  template,
  sources: businessSourcesSchema,
  seller: sellerSchema,
  signer: signerSchema.nullable(),
  adopter: adopterSchema,
  adoptionProject: adoptionProjectSchema,
  reservation: reservationSchema,
  signature: signatureDataSchema,
  branding: documentBrandingSchema.optional(),
});

type CommonSnapshotConsistencyData = {
  sources: z.infer<typeof businessSourcesSchema>;
  adoptionProject: z.infer<typeof adoptionProjectSchema>;
  reservation: z.infer<typeof reservationSchema>;
};

function validateNullableSnapshotReference(
  sourceId: string | null,
  photographedObject: { id: string } | null,
  sourcePath: string,
  objectPath: string,
  context: z.RefinementCtx,
) {
  if (
    (sourceId === null && photographedObject === null) ||
    (sourceId !== null && photographedObject?.id === sourceId)
  ) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `Inconsistent ${sourcePath} and ${objectPath}`,
    path: ["sources", sourcePath],
  });
}

function validateCommonSnapshotConsistency(
  snapshot: CommonSnapshotConsistencyData,
  context: z.RefinementCtx,
) {
  if (snapshot.sources.reservationId !== snapshot.reservation.id) {
    context.addIssue({
      code: "custom",
      message: "Inconsistent reservation identifiers",
      path: ["sources", "reservationId"],
    });
  }

  validateNullableSnapshotReference(
    snapshot.sources.litterId,
    snapshot.adoptionProject.litter,
    "litterId",
    "adoptionProject.litter.id",
    context,
  );
  validateNullableSnapshotReference(
    snapshot.sources.litterGroupId,
    snapshot.adoptionProject.litterGroup,
    "litterGroupId",
    "adoptionProject.litterGroup.id",
    context,
  );
  validateNullableSnapshotReference(
    snapshot.sources.animalId,
    snapshot.adoptionProject.animal,
    "animalId",
    "adoptionProject.animal.id",
    context,
  );
}

export const reservationContractGenerationSnapshotV1Schema = z
  .object({
    ...commonSnapshotShape(DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION, templateReferenceV1Schema),
    documentType: z.literal("reservation_contract"),
    mediator: mediatorSchema,
    financials: financialsSchema,
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const commitmentCertificateGenerationSnapshotV1Schema = z
  .object({
    ...commonSnapshotShape(DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION, templateReferenceV1Schema),
    documentType: z.literal("commitment_certificate"),
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const documentGenerationSnapshotV1Schema = z.discriminatedUnion(
  "documentType",
  [
    reservationContractGenerationSnapshotV1Schema,
    commitmentCertificateGenerationSnapshotV1Schema,
  ],
);

export const reservationContractGenerationSnapshotSchema = z
  .object({
    ...commonSnapshotShape(DOCUMENT_GENERATION_SNAPSHOT_VERSION, templateReferenceV2Schema),
    documentType: z.literal("reservation_contract"),
    mediator: mediatorSchema,
    financials: financialsSchema,
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const commitmentCertificateGenerationSnapshotSchema = z
  .object({
    ...commonSnapshotShape(DOCUMENT_GENERATION_SNAPSHOT_VERSION, templateReferenceV2Schema),
    documentType: z.literal("commitment_certificate"),
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const documentGenerationSnapshotV2Schema = z.discriminatedUnion(
  "documentType",
  [
    reservationContractGenerationSnapshotSchema,
    commitmentCertificateGenerationSnapshotSchema,
  ],
);

export const documentGenerationSnapshotSchema = z.union([
  documentGenerationSnapshotV1Schema,
  documentGenerationSnapshotV2Schema,
]);

export type DocumentGenerationSnapshot = z.infer<
  typeof documentGenerationSnapshotSchema
>;
export type DocumentGenerationSnapshotV1 = z.infer<
  typeof documentGenerationSnapshotV1Schema
>;
export type DocumentGenerationSnapshotV2 = z.infer<
  typeof documentGenerationSnapshotV2Schema
>;
export type ReservationContractGenerationSnapshot = Extract<
  DocumentGenerationSnapshot,
  { documentType: "reservation_contract" }
>;
export type CommitmentCertificateGenerationSnapshot = Extract<
  DocumentGenerationSnapshot,
  { documentType: "commitment_certificate" }
>;
export type DocumentGenerationSnapshotType =
  DocumentGenerationSnapshot["documentType"];
