"use server";

import { revalidatePath } from "next/cache";

import {
  createNextReservationDocumentVariantVersion,
  createReservationDocumentVariantDraft,
  publishReservationDocumentVariantVersion,
  saveReservationDocumentVariantDraft,
  validateReservationDocumentVariantDraft,
  type ReservationDocumentVariantManagementErrorCode,
} from "@/features/documents/reservation-document-variant-management";
import { createClient } from "@/lib/supabase/server";

export type ReservationDocumentVariantActionResult =
  | {
      outcome: "success";
      message: string;
      variantId?: string;
      versionId?: string;
      updatedAt?: string;
    }
  | {
      outcome: "error";
      code: ReservationDocumentVariantManagementErrorCode;
      message: string;
    };

function errorResult(
  code: ReservationDocumentVariantManagementErrorCode,
  message = "Cette opération est impossible pour le moment. Aucune donnée n’a été modifiée.",
): ReservationDocumentVariantActionResult {
  return { outcome: "error", code, message };
}

function serviceError(error: {
  code: ReservationDocumentVariantManagementErrorCode;
  message: string;
}): ReservationDocumentVariantActionResult {
  if (error.code === "stale_draft") {
    return errorResult(
      error.code,
      "Le brouillon a été modifié entre-temps. Rechargez la page avant de réessayer.",
    );
  }
  if (error.code === "invalid_template") return errorResult(error.code, error.message);
  if (error.code === "forbidden") {
    return errorResult(error.code, "Votre rôle ne permet pas cette opération.");
  }
  return errorResult(error.code);
}

async function resolveReservationContext(reservationId: string) {
  const supabase = await createClient();
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) {
    return { outcome: "error" as const, result: errorResult("unauthenticated") };
  }

  const reservation = await supabase
    .from("reservations")
    .select("id, organization_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservation.error || !reservation.data) {
    return { outcome: "error" as const, result: errorResult("reservation_not_found") };
  }
  return {
    outcome: "success" as const,
    supabase,
    reservationId: reservation.data.id,
    organizationId: reservation.data.organization_id,
  };
}

async function resolveVariantContext(input: {
  reservationId: string;
  variantId: string;
}) {
  const context = await resolveReservationContext(input.reservationId);
  if (context.outcome === "error") return context;
  const variant = await context.supabase
    .from("reservation_document_variants")
    .select("id")
    .eq("id", input.variantId)
    .eq("reservation_id", context.reservationId)
    .eq("organization_id", context.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (variant.error || !variant.data) {
    return { outcome: "error" as const, result: errorResult("variant_not_found") };
  }
  return context;
}

function revalidateVariantRoutes(reservationId: string, variantId?: string) {
  revalidatePath(`/reservations/${reservationId}`);
  if (variantId) {
    revalidatePath(`/reservations/${reservationId}/documents/variantes/${variantId}`);
  }
}

export async function createReservationDocumentVariantDraftAction(input: {
  reservationId: string;
  templateFamilyId: string;
}): Promise<ReservationDocumentVariantActionResult> {
  const context = await resolveReservationContext(input.reservationId);
  if (context.outcome === "error") return context.result;
  const result = await createReservationDocumentVariantDraft({
    organizationId: context.organizationId,
    reservationId: context.reservationId,
    templateFamilyId: input.templateFamilyId,
  }, context.supabase);
  if (result.outcome === "error") return serviceError(result.error);
  revalidateVariantRoutes(context.reservationId, result.variantId);
  return {
    outcome: "success",
    message: "La variante personnalisée a été créée.",
    variantId: result.variantId,
    versionId: result.versionId,
  };
}

export async function saveReservationDocumentVariantDraftAction(input: {
  reservationId: string;
  variantId: string;
  versionId: string;
  templateContent: string;
  expectedUpdatedAt: string;
}): Promise<ReservationDocumentVariantActionResult> {
  const context = await resolveVariantContext(input);
  if (context.outcome === "error") return context.result;
  const result = await saveReservationDocumentVariantDraft({
    organizationId: context.organizationId,
    variantId: input.variantId,
    versionId: input.versionId,
    templateContent: input.templateContent,
    expectedUpdatedAt: input.expectedUpdatedAt,
  }, context.supabase);
  if (result.outcome === "error") return serviceError(result.error);
  revalidateVariantRoutes(context.reservationId, input.variantId);
  return {
    outcome: "success",
    message: "Le brouillon a été enregistré.",
    versionId: result.versionId,
    updatedAt: result.updatedAt,
  };
}

export async function validateReservationDocumentVariantDraftAction(input: {
  reservationId: string;
  variantId: string;
  versionId: string;
}): Promise<ReservationDocumentVariantActionResult> {
  const context = await resolveVariantContext(input);
  if (context.outcome === "error") return context.result;
  const result = await validateReservationDocumentVariantDraft({
    organizationId: context.organizationId,
    variantId: input.variantId,
    versionId: input.versionId,
  }, context.supabase);
  if (result.outcome === "error") return serviceError(result.error);
  revalidateVariantRoutes(context.reservationId, input.variantId);
  return {
    outcome: "success",
    message: "Le brouillon respecte le schéma documentaire.",
    versionId: result.versionId,
    updatedAt: result.updatedAt,
  };
}

export async function createNextReservationDocumentVariantVersionAction(input: {
  reservationId: string;
  variantId: string;
}): Promise<ReservationDocumentVariantActionResult> {
  const context = await resolveVariantContext(input);
  if (context.outcome === "error") return context.result;
  const result = await createNextReservationDocumentVariantVersion({
    organizationId: context.organizationId,
    variantId: input.variantId,
  }, context.supabase);
  if (result.outcome === "error") return serviceError(result.error);
  revalidateVariantRoutes(context.reservationId, input.variantId);
  return {
    outcome: "success",
    message: `Le brouillon version ${result.version} a été créé.`,
    versionId: result.versionId,
    updatedAt: result.updatedAt,
  };
}

export async function publishReservationDocumentVariantVersionAction(input: {
  reservationId: string;
  variantId: string;
  versionId: string;
  expectedUpdatedAt: string;
}): Promise<ReservationDocumentVariantActionResult> {
  const context = await resolveVariantContext(input);
  if (context.outcome === "error") return context.result;
  const version = await context.supabase
    .from("reservation_document_variant_versions")
    .select("updated_at")
    .eq("id", input.versionId)
    .eq("variant_id", input.variantId)
    .eq("organization_id", context.organizationId)
    .eq("lifecycle_status", "draft")
    .is("deleted_at", null)
    .maybeSingle();
  if (version.error || !version.data) return errorResult("draft_not_found");
  if (version.data.updated_at !== input.expectedUpdatedAt) {
    return serviceError({ code: "stale_draft", message: "" });
  }
  const result = await publishReservationDocumentVariantVersion({
    organizationId: context.organizationId,
    variantId: input.variantId,
    versionId: input.versionId,
  }, context.supabase);
  if (result.outcome === "error") return serviceError(result.error);
  revalidateVariantRoutes(context.reservationId, input.variantId);
  return {
    outcome: "success",
    message: "Le brouillon a été publié.",
    versionId: result.versionId,
  };
}
