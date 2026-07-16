import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isReservationDocumentTemplateCompatible,
  type ReservationDocumentType,
} from "./reservation-document-template-compatibility";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type ReservationDocumentGenerationSourceKind =
  | "common"
  | "reservation_variant";

export type ResolveReservationDocumentGenerationSourceInput = {
  organizationId: string;
  reservationId: string;
  documentType: ReservationDocumentType;
  selectedTemplateId: string;
  taxonomy: { species: string; breed: string };
  supabase: Supabase;
};

export type ResolveReservationDocumentGenerationSourceResult =
  | {
      outcome: "success";
      selectedTemplateId: string;
      templateFamilyId: string;
      effectiveTemplateId: string;
      effectiveTemplateVersion: number;
      templateFormat: string;
      templateContent: string | null;
      reservationDocumentVariantId: string | null;
      reservationDocumentVariantVersionId: string | null;
      reservationDocumentVariantVersion: number | null;
      sourceKind: ReservationDocumentGenerationSourceKind;
    }
  | {
      outcome: "error";
      error: {
        code:
          | "template_not_found"
          | "template_mismatch"
          | "invalid_template"
          | "database_error";
      };
    };

function fail(
  code: Extract<ResolveReservationDocumentGenerationSourceResult, { outcome: "error" }>["error"]["code"],
): ResolveReservationDocumentGenerationSourceResult {
  return { outcome: "error", error: { code } };
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return fail("database_error");
}

export async function resolveReservationDocumentGenerationSourceCore({
  organizationId,
  reservationId,
  documentType,
  selectedTemplateId,
  taxonomy,
  supabase,
}: ResolveReservationDocumentGenerationSourceInput): Promise<ResolveReservationDocumentGenerationSourceResult> {
  const selectedResult = await supabase
    .from("document_templates")
    .select(
      "id, family_id, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, deleted_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", selectedTemplateId)
    .maybeSingle();
  if (selectedResult.error) {
    return databaseFailure(
      "reservation_document_generation_selected_template_read_failed",
      selectedResult.error,
    );
  }
  const selected = selectedResult.data;
  if (
    !selected ||
    selected.lifecycle_status !== "published" ||
    !selected.is_active ||
    selected.deleted_at !== null
  ) {
    return fail("template_not_found");
  }
  if (
    !selected.family_id ||
    !isReservationDocumentTemplateCompatible({
      template: selected,
      documentType,
      taxonomy,
    })
  ) {
    return fail("template_mismatch");
  }

  const variantResult = await supabase
    .from("reservation_document_variants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservationId)
    .eq("template_family_id", selected.family_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (variantResult.error) {
    return databaseFailure(
      "reservation_document_generation_variant_read_failed",
      variantResult.error,
    );
  }

  if (!variantResult.data) {
    return {
      outcome: "success",
      selectedTemplateId: selected.id,
      templateFamilyId: selected.family_id,
      effectiveTemplateId: selected.id,
      effectiveTemplateVersion: selected.version,
      templateFormat: selected.template_format,
      templateContent: selected.template_content,
      reservationDocumentVariantId: null,
      reservationDocumentVariantVersionId: null,
      reservationDocumentVariantVersion: null,
      sourceKind: "common",
    };
  }

  const publicationResult = await supabase
    .from("reservation_document_variant_versions")
    .select(
      "id, version, source_template_id, source_template_version, template_format, template_content",
    )
    .eq("organization_id", organizationId)
    .eq("variant_id", variantResult.data.id)
    .eq("lifecycle_status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (publicationResult.error) {
    return databaseFailure(
      "reservation_document_generation_variant_publication_read_failed",
      publicationResult.error,
    );
  }
  const publication = publicationResult.data;
  if (!publication) {
    return {
      outcome: "success",
      selectedTemplateId: selected.id,
      templateFamilyId: selected.family_id,
      effectiveTemplateId: selected.id,
      effectiveTemplateVersion: selected.version,
      templateFormat: selected.template_format,
      templateContent: selected.template_content,
      reservationDocumentVariantId: null,
      reservationDocumentVariantVersionId: null,
      reservationDocumentVariantVersion: null,
      sourceKind: "common",
    };
  }

  const originResult = await supabase
    .from("document_templates")
    .select("id, family_id, version, document_type, species, breed, deleted_at")
    .eq("organization_id", organizationId)
    .eq("id", publication.source_template_id)
    .eq("version", publication.source_template_version)
    .maybeSingle();
  if (originResult.error) {
    return databaseFailure(
      "reservation_document_generation_variant_origin_read_failed",
      originResult.error,
    );
  }
  const origin = originResult.data;
  if (
    !origin ||
    origin.deleted_at !== null ||
    origin.family_id !== selected.family_id ||
    origin.document_type !== documentType ||
    origin.species !== selected.species ||
    origin.breed !== selected.breed ||
    publication.template_format !== "json" ||
    publication.template_content === null
  ) {
    return fail("invalid_template");
  }

  return {
    outcome: "success",
    selectedTemplateId: selected.id,
    templateFamilyId: selected.family_id,
    effectiveTemplateId: publication.source_template_id,
    effectiveTemplateVersion: publication.source_template_version,
    templateFormat: publication.template_format,
    templateContent: publication.template_content,
    reservationDocumentVariantId: variantResult.data.id,
    reservationDocumentVariantVersionId: publication.id,
    reservationDocumentVariantVersion: publication.version,
    sourceKind: "reservation_variant",
  };
}
