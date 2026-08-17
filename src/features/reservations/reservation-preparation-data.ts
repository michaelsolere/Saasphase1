import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assessBirthDocumentsDepositDocumentRows } from "@/features/communications/birth-documents-deposit-attachments";
import { formatPreReservationContactFullName } from "@/features/communications/pre-reservation-email-core";
import { parseDocumentPdfPath } from "@/features/documents/document-pdf-storage-core";
import {
  addDaysAsIsoDate,
  readDepositSettingsForOrganization,
} from "@/features/payments/deposit-thresholds";
import { computePreReservationDepositProgress } from "@/features/payments/pre-reservation-deposit";
import { buildBirthDocumentsDepositVariables } from "@/features/reservations/birth-documents-deposit-variables";
import type {
  ReservationPreparationDocument,
  ReservationPreparationInput,
  ReservationPreparationRole,
} from "@/features/reservations/reservation-preparation-model";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Client = SupabaseClient<Database>;
const ACTIVE_COMPLEMENT_STATUSES = ["requested", "pending", "partially_paid"];

export async function loadReservationPreparation(
  reservationId: string,
  providedClient?: Client,
): Promise<ReservationPreparationInput | null> {
  const supabase = providedClient ?? await createClient();
  const loose = supabase as unknown as SupabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const reservationResult = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, application_id, litter_id, litter_group_id, status, updated_at")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();
  const reservation = reservationResult.data;
  if (reservationResult.error || !reservation) return null;

  const organizationId = reservation.organization_id;
  const [
    membershipResult,
    contactResult,
    litterResult,
    overviewResult,
    applicationResult,
    organizationResult,
    paymentsResult,
    documentsResult,
    templateResult,
    positionResult,
    attemptResult,
    settings,
  ] = await Promise.all([
    supabase.from("memberships").select("role")
      .eq("organization_id", organizationId).eq("profile_id", user.id)
      .eq("status", "active").is("deleted_at", null).maybeSingle(),
    supabase.from("contacts").select("id, first_name, last_name, display_name, email")
      .eq("organization_id", organizationId).eq("id", reservation.contact_id)
      .is("deleted_at", null).maybeSingle(),
    reservation.litter_id
      ? supabase.from("litters").select("id, name, actual_birth_date")
          .eq("organization_id", organizationId).eq("id", reservation.litter_id)
          .is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reservation.litter_id
      ? supabase.from("litter_overview").select("litter_group_name, mother_display_name, father_display_name")
          .eq("id", reservation.litter_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reservation.application_id
      ? supabase.from("applications").select("desired_sex_preference")
          .eq("organization_id", organizationId).eq("id", reservation.application_id)
          .is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("organizations").select("name, affix_name, dog_affix_name")
      .eq("id", organizationId).is("deleted_at", null).maybeSingle(),
    loose.from("payments").select("id, amount_cents, payment_type, status, due_date, notes, deleted_at")
      .eq("organization_id", organizationId).eq("reservation_id", reservationId),
    supabase.from("documents").select("*")
      .eq("organization_id", organizationId).eq("reservation_id", reservationId)
      .in("document_type", ["commitment_certificate", "reservation_contract"])
      .is("deleted_at", null).is("superseded_at", null),
    supabase.from("email_templates").select("id, title, brevo_template_id")
      .eq("organization_id", organizationId).eq("template_key", "birth_documents_deposit")
      .eq("is_active", true).is("deleted_at", null).maybeSingle(),
    loose.from("post_birth_positions").select("status, confirmed_at")
      .eq("organization_id", organizationId).eq("reservation_id", reservationId)
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("email_delivery_attempts").select("status, created_at")
      .eq("organization_id", organizationId).eq("reservation_id", reservationId)
      .eq("message_type", "birth_documents_deposit").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    readDepositSettingsForOrganization({ supabase, organizationId }),
  ]);

  const contact = contactResult.data;
  const roleValue = membershipResult.data?.role;
  const role: ReservationPreparationRole =
    roleValue === "owner" || roleValue === "admin" || roleValue === "member"
      ? roleValue
      : "viewer";
  const payments = (paymentsResult.data ?? []) as Array<{
    id: string;
    amount_cents: number;
    payment_type: string;
    status: string;
    due_date: string | null;
    notes: string | null;
    deleted_at: string | null;
  }>;
  const depositProgress = computePreReservationDepositProgress({
    payments: payments.filter((payment) => payment.deleted_at === null),
    depositSettings: settings,
    reservationStatus: reservation.status,
  });
  const paidDepositCents = depositProgress.eligibleReceivedCents;
  const complementCents = Math.max(0, settings.completeDepositCents - paidDepositCents);
  const activeComplement = payments.find((payment) =>
    payment.deleted_at === null &&
    payment.payment_type === "arrhes" &&
    ACTIVE_COMPLEMENT_STATUSES.includes(payment.status));

  const rawDocuments = documentsResult.data ?? [];
  const assessed = assessBirthDocumentsDepositDocumentRows({
    organizationId,
    reservationId,
    documents: rawDocuments,
  });
  const documents: ReservationPreparationDocument[] = rawDocuments.map((document) => {
    const parsed = document.file_path ? parseDocumentPdfPath(document.file_path) : null;
    return {
      id: document.id,
      type: document.document_type as ReservationPreparationDocument["type"],
      status: document.status,
      version: parsed?.version ?? document.source_template_version ?? 1,
      sendable: assessed.ok && assessed.documents.some(
        (candidate) => candidate.documentType === document.document_type && candidate.version === parsed?.version,
      ),
    };
  });

  const configuration = getBrevoConfigurationStatus();
  const registryTemplate = templateResult.data;
  const providerTemplate = registryTemplate?.brevo_template_id && configuration.isConfigured
    ? await getBrevoTransactionalTemplate(registryTemplate.brevo_template_id)
    : null;
  const provider = providerTemplate?.ok ? providerTemplate.template : null;
  const familyName = contact
    ? formatPreReservationContactFullName(contact) || contact.display_name || "Famille sans nom"
    : "Famille sans nom";
  const organizationName = organizationResult.data?.dog_affix_name
    ?? organizationResult.data?.affix_name
    ?? organizationResult.data?.name
    ?? null;
  const dueDate = complementCents > 0
    ? activeComplement?.due_date ?? addDaysAsIsoDate(settings.preReservationResponseDelayDays)
    : null;
  const variables = buildBirthDocumentsDepositVariables({
    firstName: contact?.first_name ?? null,
    lastName: contact?.last_name ?? null,
    fullName: familyName,
    litterName: litterResult.data?.name ?? null,
    litterGroupName: overviewResult.data?.litter_group_name ?? null,
    motherName: overviewResult.data?.mother_display_name ?? null,
    fatherName: overviewResult.data?.father_display_name ?? null,
    birthDate: litterResult.data?.actual_birth_date ?? null,
    desiredSexPreference: applicationResult.data?.desired_sex_preference ?? null,
    paidArrhesCents: paidDepositCents,
    complementAmountCents: complementCents,
    complementDueDate: dueDate,
    completeDepositCents: settings.completeDepositCents,
    organizationName,
  });

  return {
    reservationId,
    reservationUpdatedAt: reservation.updated_at,
    role,
    reservationStatus: reservation.status,
    familyName,
    recipientEmail: contact?.email ?? null,
    litterId: reservation.litter_id,
    litterName: litterResult.data?.name ?? null,
    positioningStatus: (positionResult.data as { status?: string } | null)?.status ?? null,
    paidDepositCents,
    preReservationDepositCents: settings.preReservationDepositCents,
    completeDepositCents: settings.completeDepositCents,
    complementDueDate: dueDate,
    activeComplementRequest: activeComplement
      ? { id: activeComplement.id, amountCents: activeComplement.amount_cents, dueDate: activeComplement.due_date }
      : null,
    documents,
    variables,
    template: registryTemplate?.brevo_template_id
      ? {
          registryTitle: registryTemplate.title,
          brevoTemplateId: registryTemplate.brevo_template_id,
          providerName: provider?.name ?? null,
          subject: provider?.subject ?? null,
          htmlContent: provider?.htmlContent ?? null,
          modifiedAt: provider?.modifiedAt ?? null,
          active: Boolean(provider?.isActive),
        }
      : null,
    brevoConfigured: configuration.isConfigured,
    previousDeliveryStatus: attemptResult.data?.status ?? null,
  };
}
