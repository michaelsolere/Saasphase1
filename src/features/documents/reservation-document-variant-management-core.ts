import type { SupabaseClient } from "@supabase/supabase-js";

import { authorizeDocumentOrganization, type DocumentOrganizationRole } from "./document-management-authorization";
import {
  parseDocumentTemplateDefinition,
  type DocumentTemplateDefinition,
  type ParseDocumentTemplateDefinitionResult,
} from "./document-template-definitions";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = DocumentOrganizationRole;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WRITABLE_ROLES: readonly OrganizationRole[] = ["owner", "admin", "member"];
const PUBLISH_ROLES: readonly OrganizationRole[] = ["owner", "admin"];

export type ReservationDocumentVariantManagementErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "unsupported_document_type"
  | "reservation_not_found"
  | "template_family_not_found"
  | "source_publication_not_found"
  | "variant_not_found"
  | "draft_not_found"
  | "variant_origin_conflict"
  | "draft_already_exists"
  | "publication_required"
  | "invalid_template"
  | "stale_draft"
  | "not_publishable"
  | "incompatible_taxonomy"
  | "database_error";

export type ReservationDocumentVariantManagementError = {
  code: ReservationDocumentVariantManagementErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: ReservationDocumentVariantManagementError;
};

export type ReservationDocumentVariantVersionDto = {
  id: string;
  variantId: string;
  version: number;
  sourceTemplateId: string;
  sourceTemplateVersion: number;
  templateFormat: string;
  templateContent: string | null;
  lifecycleStatus: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ReservationDocumentVariantDto = {
  id: string;
  organizationId: string;
  reservationId: string;
  templateFamilyId: string;
  documentType: string;
  species: string;
  breed: string;
  updatedAt: string;
  draft: ReservationDocumentVariantVersionDto | null;
  publication: ReservationDocumentVariantVersionDto | null;
};

export type ListReservationDocumentVariantsInput = {
  organizationId: string;
  reservationId: string;
};

export type ListReservationDocumentVariantsResult =
  | { outcome: "success"; role: OrganizationRole; variants: ReservationDocumentVariantDto[] }
  | ErrorResult;

export type ListReservationDocumentVariantVersionsInput = {
  organizationId: string;
  variantId: string;
};

export type ListReservationDocumentVariantVersionsResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      variant: Omit<ReservationDocumentVariantDto, "draft" | "publication">;
      versions: ReservationDocumentVariantVersionDto[];
    }
  | ErrorResult;

export type CreateReservationDocumentVariantDraftInput = {
  organizationId: string;
  reservationId: string;
  templateFamilyId: string;
};

export type CreateReservationDocumentVariantDraftResult =
  | {
      outcome: "success";
      variantId: string;
      versionId: string;
      version: number;
      sourceTemplateId: string;
      sourceTemplateVersion: number;
    }
  | ErrorResult;

export type SaveReservationDocumentVariantDraftInput = {
  organizationId: string;
  variantId: string;
  versionId: string;
  templateContent: string;
  expectedUpdatedAt: string;
};

export type SaveReservationDocumentVariantDraftResult =
  | { outcome: "success"; versionId: string; updatedAt: string }
  | ErrorResult;

export type ValidateReservationDocumentVariantDraftInput = {
  organizationId: string;
  variantId: string;
  versionId: string;
};

export type ValidateReservationDocumentVariantDraftResult =
  | {
      outcome: "success";
      versionId: string;
      definition: DocumentTemplateDefinition;
      updatedAt: string;
    }
  | ErrorResult;

export type CreateNextReservationDocumentVariantVersionInput = {
  organizationId: string;
  variantId: string;
};

export type CreateNextReservationDocumentVariantVersionResult =
  | { outcome: "success"; versionId: string; version: number; updatedAt: string }
  | ErrorResult;

export type PublishReservationDocumentVariantVersionInput = {
  organizationId: string;
  variantId: string;
  versionId: string;
};

export type PublishReservationDocumentVariantVersionResult =
  | { outcome: "success"; versionId: string }
  | ErrorResult;

function failure(
  code: ReservationDocumentVariantManagementErrorCode,
  message: string,
): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return failure("database_error", "Une erreur technique empêche momentanément cette opération.");
}

function invalidInput(message = "Les informations transmises sont invalides.") {
  return failure("invalid_input", message);
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isSupportedDocumentType(documentType: string) {
  return (
    documentType === "reservation_contract" ||
    documentType === "commitment_certificate"
  );
}

async function authorize(
  supabase: Supabase,
  organizationId: string,
  allowedRoles?: readonly OrganizationRole[],
): Promise<{ outcome: "success"; role: OrganizationRole } | ErrorResult> {
  const authorization = await authorizeDocumentOrganization(
    supabase,
    organizationId,
    allowedRoles,
  );
  if (authorization.outcome === "unauthenticated") {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }
  if (authorization.outcome === "forbidden") {
    return failure("forbidden", "Vous n’avez pas les droits nécessaires pour cette opération.");
  }
  if (authorization.outcome === "database_error") {
    return databaseFailure("reservation_document_variant_membership_read_failed", authorization.details);
  }
  return { outcome: "success", role: authorization.role };
}

function mapVersion(
  version: Database["public"]["Tables"]["reservation_document_variant_versions"]["Row"],
): ReservationDocumentVariantVersionDto {
  return {
    id: version.id,
    variantId: version.variant_id,
    version: version.version,
    sourceTemplateId: version.source_template_id,
    sourceTemplateVersion: version.source_template_version,
    templateFormat: version.template_format,
    templateContent: version.template_content,
    lifecycleStatus: version.lifecycle_status,
    updatedAt: version.updated_at,
    publishedAt: version.published_at,
  };
}

function mapVariant(
  variant: Database["public"]["Tables"]["reservation_document_variants"]["Row"],
) {
  return {
    id: variant.id,
    organizationId: variant.organization_id,
    reservationId: variant.reservation_id,
    templateFamilyId: variant.template_family_id,
    documentType: variant.document_type,
    species: variant.species,
    breed: variant.breed,
    updatedAt: variant.updated_at,
  };
}

function validationMessage(
  parsed: Extract<ParseDocumentTemplateDefinitionResult, { success: false }>,
) {
  switch (parsed.error) {
    case "invalid_format":
      return "Le format du brouillon doit être JSON.";
    case "invalid_json":
      return "Le contenu du brouillon n’est pas un JSON valide.";
    case "unsupported_schema_version":
      return "La version du schéma documentaire n’est pas prise en charge.";
    case "document_type_mismatch":
      return "Le type de document du contenu ne correspond pas à la variante.";
    case "invalid_template_content":
      return "Le contenu du brouillon ne respecte pas le schéma documentaire attendu.";
    case "invalid_template_variables":
      return parsed.variableIssues?.length
        ? `Corrigez les variables du modèle : ${parsed.variableIssues.map((issue) => issue.message).join(" ")}`
        : "Les variables du modèle sont inconnues ou mal écrites.";
    case "invalid_template_formatting":
      return "Corrigez la mise en forme du modèle : une zone en gras est mal délimitée.";
  }
}

function invalidTemplate(
  parsed: Extract<ParseDocumentTemplateDefinitionResult, { success: false }>,
) {
  return failure("invalid_template", validationMessage(parsed));
}

async function readActiveVariant(supabase: Supabase, organizationId: string, variantId: string) {
  return supabase
    .from("reservation_document_variants")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", variantId)
    .is("deleted_at", null)
    .maybeSingle();
}

async function readDraft(
  supabase: Supabase,
  organizationId: string,
  variantId: string,
  versionId: string,
) {
  return supabase
    .from("reservation_document_variant_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("variant_id", variantId)
    .eq("id", versionId)
    .eq("lifecycle_status", "draft")
    .is("deleted_at", null)
    .maybeSingle();
}

export async function listReservationDocumentVariantsCore(
  input: ListReservationDocumentVariantsInput,
  supabase: Supabase,
): Promise<ListReservationDocumentVariantsResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const reservationId = normalizeUuid(input.reservationId);
  if (!organizationId || !reservationId) return invalidInput();

  const authorization = await authorize(supabase, organizationId);
  if (authorization.outcome === "error") return authorization;

  const reservation = await supabase
    .from("reservations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservation.error) {
    return databaseFailure("reservation_document_variant_reservation_list_read_failed", reservation.error);
  }
  if (!reservation.data) {
    return failure("reservation_not_found", "La réservation est introuvable.");
  }

  const variants = await supabase
    .from("reservation_document_variants")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (variants.error) {
    return databaseFailure("reservation_document_variants_list_failed", variants.error);
  }

  const variantIds = variants.data.map((variant) => variant.id);
  let currentVersions: Database["public"]["Tables"]["reservation_document_variant_versions"]["Row"][] = [];
  if (variantIds.length > 0) {
    const versions = await supabase
      .from("reservation_document_variant_versions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("variant_id", variantIds)
      .in("lifecycle_status", ["draft", "published"])
      .is("deleted_at", null);
    if (versions.error) {
      return databaseFailure("reservation_document_variant_current_versions_list_failed", versions.error);
    }
    currentVersions = versions.data;
  }

  return {
    outcome: "success",
    role: authorization.role,
    variants: variants.data.map((variant) => {
      const versions = currentVersions.filter((version) => version.variant_id === variant.id);
      const draft = versions.find((version) => version.lifecycle_status === "draft");
      const publication = versions.find((version) => version.lifecycle_status === "published");
      return {
        ...mapVariant(variant),
        draft: draft ? mapVersion(draft) : null,
        publication: publication ? mapVersion(publication) : null,
      };
    }),
  };
}

export async function listReservationDocumentVariantVersionsCore(
  input: ListReservationDocumentVariantVersionsInput,
  supabase: Supabase,
): Promise<ListReservationDocumentVariantVersionsResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const variantId = normalizeUuid(input.variantId);
  if (!organizationId || !variantId) return invalidInput();

  const authorization = await authorize(supabase, organizationId);
  if (authorization.outcome === "error") return authorization;
  const variant = await readActiveVariant(supabase, organizationId, variantId);
  if (variant.error) return databaseFailure("reservation_document_variant_read_failed", variant.error);
  if (!variant.data) return failure("variant_not_found", "La variante est introuvable.");

  const versions = await supabase
    .from("reservation_document_variant_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("variant_id", variantId)
    .is("deleted_at", null)
    .order("version", { ascending: true })
    .order("id", { ascending: true });
  if (versions.error) {
    return databaseFailure("reservation_document_variant_versions_list_failed", versions.error);
  }

  return {
    outcome: "success",
    role: authorization.role,
    variant: mapVariant(variant.data),
    versions: versions.data.map(mapVersion),
  };
}

export async function createReservationDocumentVariantDraftCore(
  input: CreateReservationDocumentVariantDraftInput,
  supabase: Supabase,
): Promise<CreateReservationDocumentVariantDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const reservationId = normalizeUuid(input.reservationId);
  const templateFamilyId = normalizeUuid(input.templateFamilyId);
  if (!organizationId || !reservationId || !templateFamilyId) return invalidInput();

  const authorization = await authorize(supabase, organizationId, WRITABLE_ROLES);
  if (authorization.outcome === "error") return authorization;

  const reservation = await supabase
    .from("reservations")
    .select("id, species, breed")
    .eq("organization_id", organizationId)
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservation.error) {
    return databaseFailure("reservation_document_variant_reservation_create_read_failed", reservation.error);
  }
  if (!reservation.data) return failure("reservation_not_found", "La réservation est introuvable.");

  const family = await supabase
    .from("document_template_families")
    .select("id, document_type, species, breed")
    .eq("organization_id", organizationId)
    .eq("id", templateFamilyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (family.error) {
    return databaseFailure("reservation_document_variant_family_create_read_failed", family.error);
  }
  if (!family.data) return failure("template_family_not_found", "La famille de modèles est introuvable.");
  if (
    family.data.species !== reservation.data.species ||
    family.data.breed !== reservation.data.breed
  ) {
    return failure("incompatible_taxonomy", "La taxonomie de la famille ne correspond pas à la réservation.");
  }
  if (!isSupportedDocumentType(family.data.document_type)) {
    return failure("unsupported_document_type", "Ce type de document n’est pas pris en charge.");
  }

  const existingVariant = await supabase
    .from("reservation_document_variants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservationId)
    .eq("template_family_id", templateFamilyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingVariant.error) {
    return databaseFailure("reservation_document_variant_existing_read_failed", existingVariant.error);
  }
  if (existingVariant.data) {
    const origin = await supabase
      .from("reservation_document_variant_versions")
      .select("id, version, source_template_id, source_template_version")
      .eq("organization_id", organizationId)
      .eq("variant_id", existingVariant.data.id)
      .eq("version", 1)
      .is("deleted_at", null)
      .maybeSingle();
    if (origin.error) {
      return databaseFailure("reservation_document_variant_origin_read_failed", origin.error);
    }
    if (!origin.data) {
      return failure("variant_origin_conflict", "L’origine exacte de cette variante est incohérente.");
    }
    return {
      outcome: "success",
      variantId: existingVariant.data.id,
      versionId: origin.data.id,
      version: origin.data.version,
      sourceTemplateId: origin.data.source_template_id,
      sourceTemplateVersion: origin.data.source_template_version,
    };
  }

  const publication = await supabase
    .from("document_templates")
    .select("id, version, template_format, template_content")
    .eq("organization_id", organizationId)
    .eq("family_id", templateFamilyId)
    .eq("document_type", family.data.document_type)
    .eq("species", family.data.species)
    .eq("breed", family.data.breed)
    .eq("lifecycle_status", "published")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (publication.error) {
    return databaseFailure("reservation_document_variant_source_publication_read_failed", publication.error);
  }
  if (!publication.data) {
    return failure("source_publication_not_found", "Aucune publication active compatible n’est disponible.");
  }

  const created = await supabase.rpc("create_reservation_document_variant_draft", {
    p_organization_id: organizationId,
    p_reservation_id: reservationId,
    p_template_family_id: templateFamilyId,
    p_source_template_id: publication.data.id,
    p_source_template_version: publication.data.version,
    p_document_type: family.data.document_type,
    p_species: family.data.species,
    p_breed: family.data.breed,
  });
  if (created.error) {
    if (created.error.code === "42501") return failure("forbidden", "Vous ne pouvez pas créer cette variante.");
    if (created.error.code === "P0002") return failure("reservation_not_found", "La réservation ou la famille est introuvable.");
    if (created.error.code === "23505") return failure("variant_origin_conflict", "Une variante existe avec une origine différente.");
    if (created.error.code === "23514") return failure("incompatible_taxonomy", "La réservation, la famille et la publication sont incompatibles.");
    return databaseFailure("reservation_document_variant_create_failed", created.error);
  }
  const row = created.data?.[0];
  if (!row) return databaseFailure("reservation_document_variant_create_empty_result", null);
  return {
    outcome: "success",
    variantId: row.variant_id,
    versionId: row.version_id,
    version: row.version,
    sourceTemplateId: publication.data.id,
    sourceTemplateVersion: publication.data.version,
  };
}

export async function saveReservationDocumentVariantDraftCore(
  input: SaveReservationDocumentVariantDraftInput,
  supabase: Supabase,
): Promise<SaveReservationDocumentVariantDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const variantId = normalizeUuid(input.variantId);
  const versionId = normalizeUuid(input.versionId);
  if (
    !organizationId ||
    !variantId ||
    !versionId ||
    typeof input.templateContent !== "string" ||
    !validTimestamp(input.expectedUpdatedAt)
  ) return invalidInput();

  const authorization = await authorize(supabase, organizationId, WRITABLE_ROLES);
  if (authorization.outcome === "error") return authorization;

  const updated = await supabase
    .from("reservation_document_variant_versions")
    .update({ template_content: input.templateContent })
    .eq("organization_id", organizationId)
    .eq("variant_id", variantId)
    .eq("id", versionId)
    .eq("lifecycle_status", "draft")
    .eq("updated_at", input.expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id, updated_at")
    .maybeSingle();
  if (updated.error) {
    return databaseFailure("reservation_document_variant_draft_save_failed", updated.error);
  }
  if (!updated.data) {
    return failure("stale_draft", "Ce brouillon a été modifié. Rechargez-le avant de réessayer.");
  }
  return { outcome: "success", versionId: updated.data.id, updatedAt: updated.data.updated_at };
}

export async function validateReservationDocumentVariantDraftCore(
  input: ValidateReservationDocumentVariantDraftInput,
  supabase: Supabase,
): Promise<ValidateReservationDocumentVariantDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const variantId = normalizeUuid(input.variantId);
  const versionId = normalizeUuid(input.versionId);
  if (!organizationId || !variantId || !versionId) return invalidInput();

  const authorization = await authorize(supabase, organizationId);
  if (authorization.outcome === "error") return authorization;
  const variant = await readActiveVariant(supabase, organizationId, variantId);
  if (variant.error) return databaseFailure("reservation_document_variant_validation_read_failed", variant.error);
  if (!variant.data) return failure("variant_not_found", "La variante est introuvable.");
  if (!isSupportedDocumentType(variant.data.document_type)) {
    return failure("unsupported_document_type", "Ce type de document n’est pas pris en charge.");
  }
  const draft = await readDraft(supabase, organizationId, variantId, versionId);
  if (draft.error) return databaseFailure("reservation_document_variant_draft_validation_read_failed", draft.error);
  if (!draft.data) return failure("draft_not_found", "Le brouillon est introuvable.");

  const parsed = parseDocumentTemplateDefinition({
    templateFormat: draft.data.template_format,
    documentType: variant.data.document_type,
    templateContent: draft.data.template_content,
  });
  if (!parsed.success) return invalidTemplate(parsed);
  return {
    outcome: "success",
    versionId: draft.data.id,
    definition: parsed.definition,
    updatedAt: draft.data.updated_at,
  };
}

export async function createNextReservationDocumentVariantVersionCore(
  input: CreateNextReservationDocumentVariantVersionInput,
  supabase: Supabase,
): Promise<CreateNextReservationDocumentVariantVersionResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const variantId = normalizeUuid(input.variantId);
  if (!organizationId || !variantId) return invalidInput();
  const authorization = await authorize(supabase, organizationId, WRITABLE_ROLES);
  if (authorization.outcome === "error") return authorization;
  const variant = await readActiveVariant(supabase, organizationId, variantId);
  if (variant.error) return databaseFailure("reservation_document_variant_next_read_failed", variant.error);
  if (!variant.data) return failure("variant_not_found", "La variante est introuvable.");

  const created = await supabase.rpc("create_reservation_document_variant_version", {
    p_organization_id: organizationId,
    p_variant_id: variantId,
  });
  if (created.error) {
    if (created.error.code === "42501") return failure("forbidden", "Vous ne pouvez pas créer cette version.");
    if (created.error.code === "P0002") return failure("variant_not_found", "La variante est introuvable.");
    if (created.error.code === "23505") return failure("draft_already_exists", "Un brouillon existe déjà pour cette variante.");
    if (created.error.code === "23514") return failure("publication_required", "Une publication courante est requise.");
    return databaseFailure("reservation_document_variant_next_create_failed", created.error);
  }
  const row = created.data?.[0];
  if (!row) return databaseFailure("reservation_document_variant_next_create_empty_result", null);
  const draft = await readDraft(supabase, organizationId, variantId, row.version_id);
  if (draft.error || !draft.data) {
    return databaseFailure("reservation_document_variant_next_created_read_failed", draft.error);
  }
  return { outcome: "success", versionId: row.version_id, version: row.version, updatedAt: draft.data.updated_at };
}

export async function publishReservationDocumentVariantVersionCore(
  input: PublishReservationDocumentVariantVersionInput,
  supabase: Supabase,
): Promise<PublishReservationDocumentVariantVersionResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const variantId = normalizeUuid(input.variantId);
  const versionId = normalizeUuid(input.versionId);
  if (!organizationId || !variantId || !versionId) return invalidInput();
  const authorization = await authorize(supabase, organizationId, PUBLISH_ROLES);
  if (authorization.outcome === "error") return authorization;

  const variant = await readActiveVariant(supabase, organizationId, variantId);
  if (variant.error) return databaseFailure("reservation_document_variant_publish_read_failed", variant.error);
  if (!variant.data) return failure("variant_not_found", "La variante est introuvable.");
  if (!isSupportedDocumentType(variant.data.document_type)) {
    return failure("unsupported_document_type", "Ce type de document n’est pas pris en charge.");
  }
  const draft = await readDraft(supabase, organizationId, variantId, versionId);
  if (draft.error) return databaseFailure("reservation_document_variant_draft_publish_read_failed", draft.error);
  if (!draft.data) return failure("draft_not_found", "Le brouillon est introuvable.");

  const parsed = parseDocumentTemplateDefinition({
    templateFormat: draft.data.template_format,
    documentType: variant.data.document_type,
    templateContent: draft.data.template_content,
  });
  if (!parsed.success) return invalidTemplate(parsed);

  const published = await supabase.rpc("publish_reservation_document_variant_version", {
    p_organization_id: organizationId,
    p_variant_id: variantId,
    p_version_id: versionId,
    p_expected_updated_at: draft.data.updated_at,
    p_expected_template_format: draft.data.template_format,
    p_expected_template_content: draft.data.template_content,
  });
  if (published.error) {
    if (published.error.code === "42501") return failure("forbidden", "Vous ne pouvez pas publier cette version.");
    if (published.error.code === "P0002") return failure("draft_not_found", "Le brouillon est introuvable.");
    if (published.error.code === "P0001") return failure("stale_draft", "Ce brouillon a été modifié. Validez-le de nouveau avant publication.");
    if (published.error.code === "23514") return failure("not_publishable", "Ce brouillon ne peut pas être publié.");
    return databaseFailure("reservation_document_variant_publish_failed", published.error);
  }
  if (published.data !== versionId) {
    return databaseFailure("reservation_document_variant_publish_invalid_result", published.data);
  }
  return { outcome: "success", versionId: published.data };
}
