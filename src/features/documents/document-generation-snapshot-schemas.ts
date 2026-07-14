import { z } from "zod";

export const DOCUMENT_GENERATION_SNAPSHOT_VERSION = 1 as const;
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

const addressSchema = z
  .object({
    line1: nullableTextSchema,
    line2: nullableTextSchema,
    postalCode: nullableTextSchema,
    city: nullableTextSchema,
    region: nullableTextSchema,
  })
  .strict();

const templateReferenceSchema = z
  .object({
    templateId: uuidSchema,
    templateVersion: z.number().int().positive(),
    templateContentSha256: sha256Schema,
  })
  .strict();

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

const commonSnapshotShape = {
  snapshotVersion: z.literal(DOCUMENT_GENERATION_SNAPSHOT_VERSION),
  locale: z.literal(DOCUMENT_GENERATION_SNAPSHOT_LOCALE),
  capturedAt: isoDateTimeSchema,
  template: templateReferenceSchema,
  sources: businessSourcesSchema,
  seller: sellerSchema,
  signer: signerSchema.nullable(),
  adopter: adopterSchema,
  adoptionProject: adoptionProjectSchema,
  reservation: reservationSchema,
  signature: signatureDataSchema,
};

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

export const reservationContractGenerationSnapshotSchema = z
  .object({
    ...commonSnapshotShape,
    documentType: z.literal("reservation_contract"),
    mediator: mediatorSchema,
    financials: financialsSchema,
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const commitmentCertificateGenerationSnapshotSchema = z
  .object({
    ...commonSnapshotShape,
    documentType: z.literal("commitment_certificate"),
  })
  .strict()
  .superRefine(validateCommonSnapshotConsistency);

export const documentGenerationSnapshotSchema = z.discriminatedUnion(
  "documentType",
  [
    reservationContractGenerationSnapshotSchema,
    commitmentCertificateGenerationSnapshotSchema,
  ],
);

export type ReservationContractGenerationSnapshot = z.infer<
  typeof reservationContractGenerationSnapshotSchema
>;
export type CommitmentCertificateGenerationSnapshot = z.infer<
  typeof commitmentCertificateGenerationSnapshotSchema
>;
export type DocumentGenerationSnapshot = z.infer<
  typeof documentGenerationSnapshotSchema
>;
export type DocumentGenerationSnapshotType =
  DocumentGenerationSnapshot["documentType"];
