import { createHash } from "node:crypto";

import {
  parseDocumentTemplateDefinition,
  type DocumentTemplateDefinition,
} from "./document-template-definitions";
import {
  DOCUMENT_GENERATION_SNAPSHOT_LOCALE,
  DOCUMENT_GENERATION_SNAPSHOT_VERSION,
  documentGenerationSnapshotSchema,
  type DocumentGenerationSnapshot,
  type DocumentGenerationSnapshotType,
} from "./document-generation-snapshot-schemas";

type NullableInput<T> = T | null | undefined;

export type DocumentGenerationAddressInput = {
  line1?: NullableInput<string>;
  line2?: NullableInput<string>;
  postalCode?: NullableInput<string>;
  city?: NullableInput<string>;
  region?: NullableInput<string>;
};

type DocumentGenerationParentInput = {
  id: string;
  officialName?: NullableInput<string>;
  callName?: NullableInput<string>;
  identification?: NullableInput<string>;
  lofNumber?: NullableInput<string>;
};

export type BuildDocumentGenerationSnapshotInput = {
  documentType: string;
  capturedAt: string;
  template: {
    selectedId?: string;
    id: string;
    version: number;
    format: string;
    documentType: string;
    content: string | null;
    sourceKind?: "common" | "reservation_variant";
    reservationDocumentVariantVersionId?: string | null;
    reservationDocumentVariantVersion?: number | null;
  };
  sources: {
    organizationId: string;
    reservationId: string;
    contactId: string;
    applicationId?: NullableInput<string>;
    litterId?: NullableInput<string>;
    litterGroupId?: NullableInput<string>;
    animalId?: NullableInput<string>;
  };
  seller: {
    tradeName: string;
    legalName?: NullableInput<string>;
    legalForm?: NullableInput<string>;
    siret?: NullableInput<string>;
    email?: NullableInput<string>;
    phone?: NullableInput<string>;
    website?: NullableInput<string>;
    address?: NullableInput<DocumentGenerationAddressInput>;
    country?: NullableInput<string>;
  };
  signer?: NullableInput<{
    displayName?: NullableInput<string>;
    firstName?: NullableInput<string>;
    lastName?: NullableInput<string>;
    role?: NullableInput<string>;
    email?: NullableInput<string>;
    phone?: NullableInput<string>;
  }>;
  adopter: {
    displayName: string;
    firstName?: NullableInput<string>;
    lastName?: NullableInput<string>;
    email?: NullableInput<string>;
    phone?: NullableInput<string>;
    address?: NullableInput<DocumentGenerationAddressInput>;
    country?: NullableInput<string>;
  };
  adoptionProject: {
    species: string;
    breed: string;
    sexPreference?: NullableInput<string>;
    litter?: NullableInput<{
      id: string;
      name?: NullableInput<string>;
      actualBirthDate?: NullableInput<string>;
      availableFrom?: NullableInput<string>;
      mother?: NullableInput<DocumentGenerationParentInput>;
      father?: NullableInput<DocumentGenerationParentInput>;
    }>;
    litterGroup?: NullableInput<{
      id: string;
      name?: NullableInput<string>;
    }>;
    animal?: NullableInput<{
      id: string;
      officialName?: NullableInput<string>;
      callName?: NullableInput<string>;
      sex?: NullableInput<string>;
      birthDate?: NullableInput<string>;
      identification?: NullableInput<string>;
      lofNumber?: NullableInput<string>;
      color?: NullableInput<string>;
    }>;
  };
  reservation: {
    id: string;
    status: string;
    createdAt: string;
    plannedAdoptionDate?: NullableInput<string>;
    choiceRank?: NullableInput<number>;
  };
  signature?: {
    defaultCity?: NullableInput<string>;
  };
  branding?: {
    logo: {
      assetId: string;
      fileSha256: string;
      fileSizeBytes: number;
      mimeType: "image/png" | "image/jpeg";
      widthPx: number;
      heightPx: number;
    } | null;
  };
  mediator?: {
    name?: NullableInput<string>;
    contact?: NullableInput<string>;
    website?: NullableInput<string>;
  };
  financials?: {
    currency: string;
    priceCents?: NullableInput<number>;
    paidCents: number;
    refundedCents: number;
    depositPaidCents: number;
    fullDepositTargetCents: number;
  };
};

export type BuildDocumentGenerationSnapshotResult =
  | {
      success: true;
      snapshot: DocumentGenerationSnapshot;
      templateDefinition: DocumentTemplateDefinition;
    }
  | {
      success: false;
      error:
        | "invalid_template"
        | "invalid_template_formatting"
        | "document_type_mismatch"
        | "unsupported_document_type"
        | "invalid_source_data";
    };

function isSupportedDocumentType(
  value: unknown,
): value is DocumentGenerationSnapshotType {
  return value === "reservation_contract" || value === "commitment_certificate";
}

function normalizeRequiredText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeNullableText(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeCurrency(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function normalizeAddress(
  value: NullableInput<DocumentGenerationAddressInput>,
): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return {
    line1: normalizeNullableText(value.line1),
    line2: normalizeNullableText(value.line2),
    postalCode: normalizeNullableText(value.postalCode),
    city: normalizeNullableText(value.city),
    region: normalizeNullableText(value.region),
  };
}

export function buildDocumentGenerationSnapshot(
  input: BuildDocumentGenerationSnapshotInput,
): BuildDocumentGenerationSnapshotResult {
  try {
    if (!isSupportedDocumentType(input.documentType)) {
      return { success: false, error: "unsupported_document_type" };
    }

    const parsedTemplate = parseDocumentTemplateDefinition({
      templateFormat: input.template.format,
      documentType: input.template.documentType,
      templateContent: input.template.content,
    });
    if (!parsedTemplate.success) {
      return {
        success: false,
        error:
          parsedTemplate.error === "document_type_mismatch"
            ? "document_type_mismatch"
            : parsedTemplate.error === "invalid_template_formatting"
              ? "invalid_template_formatting"
            : "invalid_template",
      };
    }
    if (parsedTemplate.definition.documentType !== input.documentType) {
      return { success: false, error: "document_type_mismatch" };
    }

    const templateContent = input.template.content;
    if (templateContent === null) {
      return { success: false, error: "invalid_template" };
    }

    const commonSnapshot = {
      snapshotVersion: DOCUMENT_GENERATION_SNAPSHOT_VERSION,
      locale: DOCUMENT_GENERATION_SNAPSHOT_LOCALE,
      documentType: input.documentType,
      capturedAt: normalizeRequiredText(input.capturedAt),
      template: {
        selectedTemplateId: normalizeRequiredText(
          input.template.selectedId ?? input.template.id,
        ),
        templateId: normalizeRequiredText(input.template.id),
        templateVersion: input.template.version,
        templateContentSha256: createHash("sha256")
          .update(templateContent)
          .digest("hex"),
        sourceKind: input.template.sourceKind ?? "common",
        reservationDocumentVariantVersionId:
          input.template.reservationDocumentVariantVersionId ?? null,
        reservationDocumentVariantVersion:
          input.template.reservationDocumentVariantVersion ?? null,
      },
      sources: {
        organizationId: normalizeRequiredText(input.sources.organizationId),
        reservationId: normalizeRequiredText(input.sources.reservationId),
        contactId: normalizeRequiredText(input.sources.contactId),
        applicationId: normalizeNullableText(input.sources.applicationId),
        litterId: normalizeNullableText(input.sources.litterId),
        litterGroupId: normalizeNullableText(input.sources.litterGroupId),
        animalId: normalizeNullableText(input.sources.animalId),
      },
      seller: {
        tradeName: normalizeRequiredText(input.seller.tradeName),
        legalName: normalizeNullableText(input.seller.legalName),
        legalForm: normalizeNullableText(input.seller.legalForm),
        siret: normalizeNullableText(input.seller.siret),
        email: normalizeNullableText(input.seller.email),
        phone: normalizeNullableText(input.seller.phone),
        website: normalizeNullableText(input.seller.website),
        address: normalizeAddress(input.seller.address),
        country: normalizeNullableText(input.seller.country),
      },
      signer:
        input.signer === null || input.signer === undefined
          ? null
          : {
              displayName: normalizeNullableText(input.signer.displayName),
              firstName: normalizeNullableText(input.signer.firstName),
              lastName: normalizeNullableText(input.signer.lastName),
              role: normalizeNullableText(input.signer.role),
              email: normalizeNullableText(input.signer.email),
              phone: normalizeNullableText(input.signer.phone),
            },
      adopter: {
        displayName: normalizeRequiredText(input.adopter.displayName),
        firstName: normalizeNullableText(input.adopter.firstName),
        lastName: normalizeNullableText(input.adopter.lastName),
        email: normalizeNullableText(input.adopter.email),
        phone: normalizeNullableText(input.adopter.phone),
        address: normalizeAddress(input.adopter.address),
        country: normalizeNullableText(input.adopter.country),
      },
      adoptionProject: {
        species: normalizeRequiredText(input.adoptionProject.species),
        breed: normalizeRequiredText(input.adoptionProject.breed),
        sexPreference: normalizeNullableText(
          input.adoptionProject.sexPreference,
        ),
        litter:
          input.adoptionProject.litter === null ||
          input.adoptionProject.litter === undefined
            ? null
            : {
                id: normalizeRequiredText(input.adoptionProject.litter.id),
                name: normalizeNullableText(input.adoptionProject.litter.name),
                actualBirthDate: normalizeNullableText(
                  input.adoptionProject.litter.actualBirthDate,
                ),
                availableFrom: normalizeNullableText(
                  input.adoptionProject.litter.availableFrom,
                ),
                mother:
                  input.adoptionProject.litter.mother === null ||
                  input.adoptionProject.litter.mother === undefined
                    ? null
                    : {
                        id: normalizeRequiredText(
                          input.adoptionProject.litter.mother.id,
                        ),
                        officialName: normalizeNullableText(
                          input.adoptionProject.litter.mother.officialName,
                        ),
                        callName: normalizeNullableText(
                          input.adoptionProject.litter.mother.callName,
                        ),
                        identification: normalizeNullableText(
                          input.adoptionProject.litter.mother.identification,
                        ),
                        lofNumber: normalizeNullableText(
                          input.adoptionProject.litter.mother.lofNumber,
                        ),
                      },
                father:
                  input.adoptionProject.litter.father === null ||
                  input.adoptionProject.litter.father === undefined
                    ? null
                    : {
                        id: normalizeRequiredText(
                          input.adoptionProject.litter.father.id,
                        ),
                        officialName: normalizeNullableText(
                          input.adoptionProject.litter.father.officialName,
                        ),
                        callName: normalizeNullableText(
                          input.adoptionProject.litter.father.callName,
                        ),
                        identification: normalizeNullableText(
                          input.adoptionProject.litter.father.identification,
                        ),
                        lofNumber: normalizeNullableText(
                          input.adoptionProject.litter.father.lofNumber,
                        ),
                      },
              },
        litterGroup:
          input.adoptionProject.litterGroup === null ||
          input.adoptionProject.litterGroup === undefined
            ? null
            : {
                id: normalizeRequiredText(input.adoptionProject.litterGroup.id),
                name: normalizeNullableText(
                  input.adoptionProject.litterGroup.name,
                ),
              },
        animal:
          input.adoptionProject.animal === null ||
          input.adoptionProject.animal === undefined
            ? null
            : {
                id: normalizeRequiredText(input.adoptionProject.animal.id),
                officialName: normalizeNullableText(
                  input.adoptionProject.animal.officialName,
                ),
                callName: normalizeNullableText(
                  input.adoptionProject.animal.callName,
                ),
                sex: normalizeNullableText(input.adoptionProject.animal.sex),
                birthDate: normalizeNullableText(
                  input.adoptionProject.animal.birthDate,
                ),
                identification: normalizeNullableText(
                  input.adoptionProject.animal.identification,
                ),
                lofNumber: normalizeNullableText(
                  input.adoptionProject.animal.lofNumber,
                ),
                color: normalizeNullableText(input.adoptionProject.animal.color),
              },
      },
      reservation: {
        id: normalizeRequiredText(input.reservation.id),
        status: normalizeRequiredText(input.reservation.status),
        createdAt: normalizeRequiredText(input.reservation.createdAt),
        plannedAdoptionDate: normalizeNullableText(
          input.reservation.plannedAdoptionDate,
        ),
        choiceRank: input.reservation.choiceRank ?? null,
      },
      signature: {
        defaultCity: normalizeNullableText(input.signature?.defaultCity),
      },
      branding: {
        logo: input.branding?.logo ?? null,
      },
    };

    let snapshotCandidate: unknown = commonSnapshot;
    if (input.documentType === "reservation_contract") {
      const financials = input.financials;
      const paidCents = financials?.paidCents;
      const refundedCents = financials?.refundedCents;
      const priceCents = financials?.priceCents ?? null;
      const depositTargetCents = financials?.fullDepositTargetCents;
      const depositPaidCents = financials?.depositPaidCents;
      const netPaidCents =
        typeof paidCents === "number" && typeof refundedCents === "number"
          ? Math.max(0, paidCents - refundedCents)
          : Number.NaN;
      const remainingCents =
        priceCents === null
          ? null
          : typeof priceCents === "number"
            ? Math.max(0, priceCents - netPaidCents)
            : Number.NaN;

      snapshotCandidate = {
        ...commonSnapshot,
        mediator: {
          name: normalizeNullableText(input.mediator?.name),
          contact: normalizeNullableText(input.mediator?.contact),
          website: normalizeNullableText(input.mediator?.website),
        },
        financials: {
          currency: normalizeCurrency(financials?.currency),
          priceCents,
          paidCents,
          refundedCents,
          netPaidCents,
          remainingCents,
          depositPaidCents: financials?.depositPaidCents,
          fullDepositTargetCents: financials?.fullDepositTargetCents,
          depositTargetCents,
          depositRemainingCents:
            typeof depositTargetCents === "number" &&
            typeof depositPaidCents === "number"
              ? Math.max(0, depositTargetCents - depositPaidCents)
              : Number.NaN,
          balanceAfterFullDepositCents:
            priceCents === null
              ? null
              : typeof priceCents === "number" &&
                  typeof depositTargetCents === "number"
                ? Math.max(0, priceCents - depositTargetCents)
                : Number.NaN,
        },
      };
    }

    const parsedSnapshot = documentGenerationSnapshotSchema.safeParse(
      snapshotCandidate,
    );
    if (!parsedSnapshot.success) {
      return { success: false, error: "invalid_source_data" };
    }

    return {
      success: true,
      snapshot: parsedSnapshot.data,
      templateDefinition: parsedTemplate.definition,
    };
  } catch {
    return { success: false, error: "invalid_source_data" };
  }
}
