import type { SupabaseClient } from "@supabase/supabase-js";

import { buildDocumentGenerationSnapshot } from "./build-document-generation-snapshot";
import type { DocumentTemplateDefinition } from "./document-template-definitions";
import type {
  DocumentGenerationSnapshot,
  DocumentGenerationSnapshotType,
} from "./document-generation-snapshot-schemas";
import {
  isReservationDocumentTemplateCompatible,
  resolveEffectiveReservationDocumentTaxonomy,
} from "./reservation-document-template-compatibility";
import { readDepositSettingsForOrganization } from "@/features/payments/deposit-thresholds";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WRITABLE_ROLES = ["owner", "admin", "member"];

export type PrepareDocumentGenerationSnapshotInput = {
  reservationId: string;
  documentType: DocumentGenerationSnapshotType;
  templateId: string;
  capturedAt: string;
};

export type PrepareDocumentGenerationSnapshotErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "reservation_not_found"
  | "template_not_found"
  | "invalid_template"
  | "template_mismatch"
  | "incomplete_source_data"
  | "database_error";

export type PrepareDocumentGenerationSnapshotResult =
  | {
      outcome: "success";
      snapshot: DocumentGenerationSnapshot;
      templateDefinition: DocumentTemplateDefinition;
      templateContent: string;
      templateId: string;
      templateVersion: number;
    }
  | {
      outcome: "error";
      error: { code: PrepareDocumentGenerationSnapshotErrorCode };
    };

function fail(
  code: PrepareDocumentGenerationSnapshotErrorCode,
): PrepareDocumentGenerationSnapshotResult {
  return { outcome: "error", error: { code } };
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validInput(input: PrepareDocumentGenerationSnapshotInput) {
  return Boolean(
    normalizeUuid(input.reservationId) &&
      normalizeUuid(input.templateId) &&
      (input.documentType === "reservation_contract" ||
        input.documentType === "commitment_certificate") &&
      !Number.isNaN(Date.parse(input.capturedAt)) &&
      /(?:Z|[+-]\d{2}:\d{2})$/.test(input.capturedAt),
  );
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return fail("database_error");
}

export async function prepareDocumentGenerationSnapshotForReservationCore(
  input: PrepareDocumentGenerationSnapshotInput,
  supabase: Supabase,
): Promise<PrepareDocumentGenerationSnapshotResult> {
  if (!validInput(input)) return fail("invalid_input");

  const reservationId = normalizeUuid(input.reservationId)!;
  const templateId = normalizeUuid(input.templateId)!;

  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return fail("unauthenticated");

  const memberships = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", WRITABLE_ROLES);
  if (memberships.error) return databaseFailure("document_snapshot_memberships_read_failed", memberships.error);
  const organizationIds = (memberships.data ?? []).map((row) => row.organization_id);
  if (organizationIds.length === 0) return fail("forbidden");

  const reservationResult = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, application_id, litter_id, litter_group_id, animal_id, reserved_sex_preference, rank_active, status, price_cents, currency, adoption_planned_at, created_at")
    .eq("id", reservationId)
    .in("organization_id", organizationIds)
    .is("deleted_at", null)
    .maybeSingle();
  if (reservationResult.error) return databaseFailure("document_snapshot_reservation_read_failed", reservationResult.error);
  const reservation = reservationResult.data;
  if (!reservation) return fail("reservation_not_found");

  const overviewResult = await supabase
    .from("reservation_overview")
    .select("id, organization_id, paid_cents, refunded_cents")
    .eq("id", reservationId)
    .eq("organization_id", reservation.organization_id)
    .maybeSingle();
  if (overviewResult.error) return databaseFailure("document_snapshot_reservation_overview_read_failed", overviewResult.error);
  const reservationOverview = overviewResult.data;
  if (!reservationOverview) return fail("incomplete_source_data");

  const organizationId = reservation.organization_id;
  const contactId = reservation.contact_id;
  if (!organizationId || !contactId) return fail("incomplete_source_data");

  const [organizationResult, contactResult, applicationResult, litterResult, animalResult, signerResult, documentSettingsResult, templateResult] = await Promise.all([
    supabase.from("organizations").select("id, name, legal_name, legal_form, siret, email, phone, website_url, address_line1, address_line2, postal_code, city, country").eq("id", organizationId).is("deleted_at", null).maybeSingle(),
    supabase.from("contacts").select("id, display_name, first_name, last_name, email, phone, address_line1, address_line2, postal_code, city, country").eq("organization_id", organizationId).eq("id", contactId).is("deleted_at", null).maybeSingle(),
    reservation.application_id
      ? supabase.from("applications").select("id, species, breed, desired_sex_preference").eq("organization_id", organizationId).eq("id", reservation.application_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reservation.litter_id
      ? supabase.from("litters").select("id, name, species, breed, actual_birth_date, available_from, litter_group_id, mother_id, father_id").eq("organization_id", organizationId).eq("id", reservation.litter_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reservation.animal_id
      ? supabase.from("animals").select("id, official_name, call_name, species, breed, sex, birth_date, identification_number, lof_number").eq("organization_id", organizationId).eq("id", reservation.animal_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("organization_representatives").select("display_name, first_name, last_name, representative_role, email, phone").eq("organization_id", organizationId).eq("is_default_signatory", true).eq("is_active", true).is("deleted_at", null).maybeSingle(),
    supabase.from("organization_document_settings").select("mediator_name, mediator_contact, mediator_website_url, signature_city_default").eq("organization_id", organizationId).is("deleted_at", null).maybeSingle(),
    supabase.from("document_templates").select("id, document_type, species, breed, template_format, template_content, version, is_active, deleted_at").eq("organization_id", organizationId).eq("id", templateId).maybeSingle(),
  ]);

  const reads = [organizationResult, contactResult, applicationResult, litterResult, animalResult, signerResult, documentSettingsResult, templateResult];
  const readError = reads.find((result) => result.error)?.error;
  if (readError) return databaseFailure("document_snapshot_source_read_failed", readError);

  const organization = organizationResult.data;
  const contact = contactResult.data;
  const application = applicationResult.data;
  const litter = litterResult.data;
  const animal = animalResult.data;
  const template = templateResult.data;

  if (
    (reservation.application_id && !application) ||
    (reservation.litter_id && !litter) ||
    (reservation.animal_id && !animal)
  ) {
    return fail("incomplete_source_data");
  }

  const [motherResult, fatherResult] = await Promise.all([
    litter?.mother_id
      ? supabase
          .from("animals")
          .select("id, official_name, call_name, identification_number, lof_number")
          .eq("organization_id", organizationId)
          .eq("id", litter.mother_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    litter?.father_id
      ? supabase
          .from("animals")
          .select("id, official_name, call_name, identification_number, lof_number")
          .eq("organization_id", organizationId)
          .eq("id", litter.father_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (motherResult.error || fatherResult.error) {
    return databaseFailure(
      "document_snapshot_litter_parents_read_failed",
      motherResult.error ?? fatherResult.error,
    );
  }
  const mother = motherResult.data;
  const father = fatherResult.data;
  if (
    reservation.litter_group_id &&
    litter?.litter_group_id &&
    reservation.litter_group_id !== litter.litter_group_id
  ) {
    return fail("incomplete_source_data");
  }

  const effectiveLitterGroupId =
    reservation.litter_group_id ?? litter?.litter_group_id ?? null;
  const groupResult = effectiveLitterGroupId
    ? await supabase
        .from("litter_groups")
        .select("id, name, species")
        .eq("organization_id", organizationId)
        .eq("id", effectiveLitterGroupId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };
  if (groupResult.error) {
    return databaseFailure("document_snapshot_litter_group_read_failed", groupResult.error);
  }
  const litterGroup = groupResult.data;
  if (effectiveLitterGroupId && !litterGroup) {
    return fail("incomplete_source_data");
  }

  if (!template || !template.is_active || template.deleted_at !== null) return fail("template_not_found");

  const taxonomy = resolveEffectiveReservationDocumentTaxonomy({
    animal,
    litter,
    application,
  });
  if (!organization?.name?.trim() || !contact?.display_name?.trim() || !taxonomy) {
    return fail("incomplete_source_data");
  }
  const { species, breed } = taxonomy;
  if (
    !reservation.status ||
    !reservation.created_at ||
    (input.documentType === "reservation_contract" &&
      (!reservation.currency ||
        reservationOverview.paid_cents === null ||
        reservationOverview.refunded_cents === null))
  ) {
    return fail("incomplete_source_data");
  }
  if (
    !isReservationDocumentTemplateCompatible({
      template,
      documentType: input.documentType,
      taxonomy,
    })
  ) {
    return fail("template_mismatch");
  }

  let financials;
  if (input.documentType === "reservation_contract") {
    const [paymentsResult, depositSettings] = await Promise.all([
      supabase.from("payments").select("amount_cents").eq("organization_id", organizationId).eq("reservation_id", reservationId).eq("status", "paid").in("payment_type", ["pre_reservation_deposit_refundable", "arrhes"]).is("deleted_at", null),
      readDepositSettingsForOrganization({ supabase, organizationId }),
    ]);
    if (paymentsResult.error) return databaseFailure("document_snapshot_payments_read_failed", paymentsResult.error);
    financials = {
      currency: reservation.currency!,
      priceCents: reservation.price_cents,
      paidCents: reservationOverview.paid_cents!,
      refundedCents: reservationOverview.refunded_cents!,
      depositPaidCents: (paymentsResult.data ?? []).reduce((sum, payment) => sum + payment.amount_cents, 0),
      fullDepositTargetCents: depositSettings.completeDepositCents,
    };
  }

  const settings = documentSettingsResult.data;
  const signer = signerResult.data;
  const built = buildDocumentGenerationSnapshot({
    documentType: input.documentType,
    capturedAt: input.capturedAt,
    template: {
      id: template.id,
      version: template.version,
      format: template.template_format,
      documentType: template.document_type,
      content: template.template_content,
    },
    sources: {
      organizationId,
      reservationId,
      contactId,
      applicationId: application?.id,
      litterId: litter?.id,
      litterGroupId: litterGroup?.id,
      animalId: animal?.id,
    },
    seller: {
      tradeName: organization.name,
      legalName: organization.legal_name,
      legalForm: organization.legal_form,
      siret: organization.siret,
      email: organization.email,
      phone: organization.phone,
      website: organization.website_url,
      address: { line1: organization.address_line1, line2: organization.address_line2, postalCode: organization.postal_code, city: organization.city },
      country: organization.country,
    },
    signer: signer ? { displayName: signer.display_name, firstName: signer.first_name, lastName: signer.last_name, role: signer.representative_role, email: signer.email, phone: signer.phone } : null,
    adopter: {
      displayName: contact.display_name,
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      address: { line1: contact.address_line1, line2: contact.address_line2, postalCode: contact.postal_code, city: contact.city },
      country: contact.country,
    },
    adoptionProject: {
      species,
      breed,
      sexPreference: reservation.reserved_sex_preference ?? application?.desired_sex_preference,
      litter: litter ? {
        id: litter.id,
        name: litter.name,
        actualBirthDate: litter.actual_birth_date,
        availableFrom: litter.available_from,
        mother: mother ? { id: mother.id, officialName: mother.official_name, callName: mother.call_name, identification: mother.identification_number, lofNumber: mother.lof_number } : null,
        father: father ? { id: father.id, officialName: father.official_name, callName: father.call_name, identification: father.identification_number, lofNumber: father.lof_number } : null,
      } : null,
      litterGroup: litterGroup ? { id: litterGroup.id, name: litterGroup.name } : null,
      animal: animal ? { id: animal.id, officialName: animal.official_name, callName: animal.call_name, sex: animal.sex, birthDate: animal.birth_date, identification: animal.identification_number, lofNumber: animal.lof_number } : null,
    },
    reservation: {
      id: reservationId,
      status: reservation.status!,
      createdAt: reservation.created_at!,
      plannedAdoptionDate: reservation.adoption_planned_at?.slice(0, 10),
      choiceRank: reservation.rank_active,
    },
    signature: { defaultCity: settings?.signature_city_default },
    mediator: input.documentType === "reservation_contract" ? { name: settings?.mediator_name, contact: settings?.mediator_contact, website: settings?.mediator_website_url } : undefined,
    financials,
  });

  if (!built.success) {
    return fail(built.error === "invalid_template" ? "invalid_template" : built.error === "document_type_mismatch" ? "template_mismatch" : "incomplete_source_data");
  }

  return {
    outcome: "success",
    snapshot: built.snapshot,
    templateDefinition: built.templateDefinition,
    templateContent: template.template_content!,
    templateId: template.id,
    templateVersion: template.version,
  };
}
