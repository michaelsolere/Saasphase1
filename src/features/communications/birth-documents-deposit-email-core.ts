import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadBirthDocumentsDepositAttachments } from "@/features/communications/birth-documents-deposit-attachments";
import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
} from "@/features/communications/transactional-campaign-core";
import { formatPreReservationContactFullName } from "@/features/communications/pre-reservation-email-core";
import {
  addDaysAsIsoDate,
  readDepositSettingsForOrganization,
} from "@/features/payments/deposit-thresholds";
import { buildBirthDocumentsDepositVariables } from "@/features/reservations/birth-documents-deposit-variables";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type Payment = Pick<Database["public"]["Tables"]["payments"]["Row"],
  "id" | "amount_cents" | "payment_type" | "status" | "due_date" | "notes" | "deleted_at"
>;

export type BirthDocumentsDepositEmailTransport = TransactionalEmailTransport;
export type BirthDocumentsDepositDeliveryState = "sent" | "not_sent" | "in_progress" | "uncertain";
export type SendBirthDocumentsDepositEmailResult = {
  status: "success" | "already_sent" | "in_progress" | "failed" | "not_eligible" | "missing_email" | "missing_payment" | "missing_template" | "brevo_not_configured" | "deposit_complete" | "pre_reservation_unpaid" | "incompatible_request" | "missing_documents" | "incoherent_documents" | "documents_not_sendable";
  deliveryState: BirthDocumentsDepositDeliveryState;
  attemptId?: string;
  errorCode?: string;
  paymentAction?: "created" | "reactivated" | "reused";
  compensated?: boolean;
};

const CAMPAIGN_KEY = "birth_documents_deposit";
const OPERATION_VERSION = "v1";
const PAYMENT_NOTE = "Demande 2/2 — complément d’arrhes [birth_documents_deposit:v1]";
const ACTIVE_STATUSES = ["requested", "pending", "partially_paid"] as const;
const PAID_DEPOSIT_TYPES = [
  "arrhes",
  "pre_reservation_deposit_refundable",
] as const;

function validEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function compatible(payment: Payment, amount: number) {
  return payment.deleted_at === null && payment.payment_type === "arrhes" &&
    ACTIVE_STATUSES.includes(payment.status as (typeof ACTIVE_STATUSES)[number]) &&
    payment.amount_cents === amount &&
    ((payment.notes ?? "").includes("[birth_documents_deposit:v1]") ||
      (payment.notes ?? "").includes("Demande 2/2"));
}

function ownedCompensated(payment: Payment, amount: number) {
  return payment.deleted_at !== null && payment.payment_type === "arrhes" &&
    payment.status === "requested" && payment.amount_cents === amount &&
    (payment.notes ?? "").includes("[birth_documents_deposit:v1]");
}

export function buildBirthDocumentsDepositPaymentId(input: {
  organizationId: string;
  reservationId: string;
  complementAmountCents: number;
}) {
  const chars = createHash("sha256").update(JSON.stringify([
    input.organizationId, input.reservationId, CAMPAIGN_KEY,
    input.complementAmountCents, OPERATION_VERSION,
  ])).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function mapResult(result: Awaited<ReturnType<typeof runTransactionalCampaignDelivery>>): SendBirthDocumentsDepositEmailResult {
  const base = { attemptId: result.attemptId, errorCode: result.errorCode, paymentAction: result.resourceAction, compensated: result.compensated ?? false };
  if (result.outcome === "success") return { status: "success", deliveryState: "sent", ...base };
  if (result.outcome === "already_sent") return { status: "already_sent", deliveryState: "sent", ...base };
  if (result.outcome === "in_progress") return { status: "in_progress", deliveryState: "in_progress", ...base };
  if (result.outcome === "uncertain") return { status: "failed", deliveryState: "uncertain", ...base };
  const mapped = new Set(["not_eligible", "missing_email", "missing_payment", "deposit_complete", "pre_reservation_unpaid", "incompatible_request", "missing_documents", "incoherent_documents", "documents_not_sendable"]);
  const status = mapped.has(result.errorCode ?? "") ? result.errorCode as SendBirthDocumentsDepositEmailResult["status"] :
    ["missing_template", "invalid_request", "template_not_found", "template_inactive"].includes(result.errorCode ?? "") ? "missing_template" :
    ["brevo_not_configured", "not_configured"].includes(result.errorCode ?? "") ? "brevo_not_configured" : "failed";
  return { status, deliveryState: "not_sent", ...base };
}

export async function sendBirthDocumentsDepositEmailForReservation(
  input: { reservationId: string; litterId: string },
  options: {
    supabase: Supabase;
    transport?: BirthDocumentsDepositEmailTransport;
    transitions?: Parameters<typeof runTransactionalCampaignDelivery>[1]["transitions"];
    documentDelivery?: (input: {
      organizationId: string;
      reservationId: string;
      commitmentDocumentId: string;
      contractDocumentId: string;
      sentAt: string;
    }) => Promise<{ ok: true } | { ok: false; errorCode: string }>;
  },
): Promise<SendBirthDocumentsDepositEmailResult> {
  let preparedData: {
    reservation: { id: string; contact_id: string; application_id: string; litter_id: string; litter_group_id: string | null; organization_id: string };
    contact: { id: string; first_name: string | null; last_name: string | null; display_name: string | null; email: string | null };
    litter: { id: string; name: string | null; actual_birth_date: string | null };
    overview: { litter_group_name: string | null; mother_display_name: string | null; father_display_name: string | null } | null;
    desiredSex: string | null;
    organizationName: string | null;
  } | null = null;

  const result = await runTransactionalCampaignDelivery({
    campaignKey: CAMPAIGN_KEY,
    operationVersion: OPERATION_VERSION,
    claimedPreparationPhase: "before_provider",
    transport: options.transport,
    prepareOperation: async ({ supabase, organizationId }) => {
      const { data: reservation } = await supabase.from("reservations")
        .select("id, organization_id, contact_id, application_id, litter_id, litter_group_id, status")
        .eq("organization_id", organizationId).eq("id", input.reservationId)
        .eq("litter_id", input.litterId).eq("status", "pre_reservation_paid")
        .is("deleted_at", null).maybeSingle();
      if (!reservation?.contact_id || !reservation.application_id || !reservation.litter_id) return { ok: false, errorCode: "not_eligible" };
      const [contactResult, litterResult, overviewResult, applicationResult, organizationResult, settings] = await Promise.all([
        supabase.from("contacts").select("id, first_name, last_name, display_name, email").eq("organization_id", organizationId).eq("id", reservation.contact_id).is("deleted_at", null).maybeSingle(),
        supabase.from("litters").select("id, name, actual_birth_date").eq("organization_id", organizationId).eq("id", input.litterId).is("deleted_at", null).maybeSingle(),
        supabase.from("litter_overview").select("litter_group_name, mother_display_name, father_display_name").eq("id", input.litterId).maybeSingle(),
        supabase.from("applications").select("desired_sex_preference").eq("organization_id", organizationId).eq("id", reservation.application_id).is("deleted_at", null).maybeSingle(),
        supabase.from("organizations").select("name, affix_name, dog_affix_name").eq("id", organizationId).is("deleted_at", null).maybeSingle(),
        readDepositSettingsForOrganization({ supabase, organizationId }),
      ]);
      const contact = contactResult.data;
      const litter = litterResult.data;
      if (!contact || !validEmail(contact.email)) return { ok: false, errorCode: "missing_email" };
      if (!litter) return { ok: false, errorCode: "not_eligible" };
      const { data: payments } = await supabase.from("payments").select("amount_cents, status, payment_type").eq("organization_id", organizationId).eq("reservation_id", reservation.id).eq("status", "paid").in("payment_type", PAID_DEPOSIT_TYPES).is("deleted_at", null);
      const paid = (payments ?? []).reduce((sum, payment) => sum + payment.amount_cents, 0);
      if (paid >= settings.completeDepositCents) return { ok: false, errorCode: "deposit_complete" };
      if (paid < settings.preReservationDepositCents) return { ok: false, errorCode: "pre_reservation_unpaid" };
      const fullName = formatPreReservationContactFullName(contact);
      const organizationName = organizationResult.data?.dog_affix_name ?? organizationResult.data?.affix_name ?? organizationResult.data?.name ?? null;
      preparedData = {
        reservation: {
          ...reservation,
          application_id: reservation.application_id,
          litter_id: reservation.litter_id,
        },
        contact,
        litter,
        overview: overviewResult.data,
        desiredSex: applicationResult.data?.desired_sex_preference ?? null,
        organizationName,
      };
      const variables = buildBirthDocumentsDepositVariables({ firstName: contact.first_name, lastName: contact.last_name, fullName, litterName: litter.name, litterGroupName: overviewResult.data?.litter_group_name ?? null, motherName: overviewResult.data?.mother_display_name ?? null, fatherName: overviewResult.data?.father_display_name ?? null, birthDate: litter.actual_birth_date, desiredSexPreference: preparedData.desiredSex, paidArrhesCents: paid, complementAmountCents: settings.completeDepositCents - paid, complementDueDate: addDaysAsIsoDate(settings.preReservationResponseDelayDays), completeDepositCents: settings.completeDepositCents, organizationName });
      return { ok: true, operation: { dossierId: reservation.id, contactId: contact.id, reservationId: reservation.id, recipientEmail: contact.email!.trim().toLowerCase(), recipientName: fullName || contact.display_name, litterId: litter.id, litterGroupId: reservation.litter_group_id, variables, variablesSnapshot: { ...variables, reservation_id: reservation.id } } };
    },
    prepareClaimedOperation: async ({ supabase, organizationId, userId, operation, attempt }) => {
      if (!preparedData) return { ok: false, errorCode: "not_eligible" };
      const loadedAttachments = await loadBirthDocumentsDepositAttachments({
        organizationId,
        reservationId: input.reservationId,
        attachmentsSnapshot: attempt.attachments_snapshot,
        supabase,
      });
      if (!loadedAttachments.ok) return loadedAttachments;
      const settings = await readDepositSettingsForOrganization({ supabase, organizationId });
      const { data: payments, error } = await supabase.from("payments").select("id, amount_cents, payment_type, status, due_date, notes, deleted_at").eq("organization_id", organizationId).eq("reservation_id", input.reservationId);
      if (error || !payments) return { ok: false, errorCode: "payment_read_failed" };
      const paid = payments
        .filter(
          (payment) =>
            payment.deleted_at === null &&
            payment.status === "paid" &&
            PAID_DEPOSIT_TYPES.includes(
              payment.payment_type as (typeof PAID_DEPOSIT_TYPES)[number],
            ),
        )
        .reduce((sum, payment) => sum + payment.amount_cents, 0);
      if (paid >= settings.completeDepositCents) return { ok: false, errorCode: "deposit_complete" };
      if (paid < settings.preReservationDepositCents) return { ok: false, errorCode: "pre_reservation_unpaid" };
      const amount = settings.completeDepositCents - paid;
      const active = payments.filter(p => p.deleted_at === null && p.payment_type === "arrhes" && ACTIVE_STATUSES.includes(p.status as (typeof ACTIVE_STATUSES)[number]));
      let payment = active.find(p => compatible(p, amount));
      if (active.length && !payment) return { ok: false, errorCode: "incompatible_request" };
      let action: "created" | "reactivated" | "reused" = "reused";
      const paymentId = buildBirthDocumentsDepositPaymentId({ organizationId, reservationId: input.reservationId, complementAmountCents: amount });
      if (!payment) {
        const dueDate = addDaysAsIsoDate(settings.preReservationResponseDelayDays);
        const { data: inserted, error: insertError } = await supabase.from("payments").insert({ id: paymentId, organization_id: organizationId, contact_id: preparedData.contact.id, reservation_id: input.reservationId, amount_cents: amount, currency: "EUR", payment_type: "arrhes", status: "requested", payment_method: "bank_transfer", requested_at: new Date().toISOString(), due_date: dueDate, notes: PAYMENT_NOTE, created_by: userId, updated_by: userId }).select("id, amount_cents, payment_type, status, due_date, notes, deleted_at").single();
        if (inserted && !insertError) { payment = inserted; action = "created"; }
        else if (insertError?.code === "23505") {
          const { data: conflict } = await supabase.from("payments").select("id, amount_cents, payment_type, status, due_date, notes, deleted_at").eq("id", paymentId).eq("organization_id", organizationId).eq("reservation_id", input.reservationId).maybeSingle();
          if (!conflict) return { ok: false, errorCode: "incompatible_request" };
          if (compatible(conflict, amount)) payment = conflict;
          else if (ownedCompensated(conflict, amount)) {
            const now = new Date().toISOString();
            const { data: reactivated } = await supabase.from("payments").update({ deleted_at: null, requested_at: now, due_date: dueDate, updated_at: now, updated_by: userId }).eq("id", conflict.id).eq("deleted_at", conflict.deleted_at!).select("id, amount_cents, payment_type, status, due_date, notes, deleted_at").maybeSingle();
            if (!reactivated) return { ok: false, errorCode: "payment_reactivation_conflict" };
            payment = reactivated; action = "reactivated";
          } else return { ok: false, errorCode: "incompatible_request" };
        } else return { ok: false, errorCode: "payment_create_failed" };
      }
      const data = preparedData;
      const fullName = formatPreReservationContactFullName(data.contact);
      const variables = { ...buildBirthDocumentsDepositVariables({ firstName: data.contact.first_name, lastName: data.contact.last_name, fullName, litterName: data.litter.name, litterGroupName: data.overview?.litter_group_name ?? null, motherName: data.overview?.mother_display_name ?? null, fatherName: data.overview?.father_display_name ?? null, birthDate: data.litter.actual_birth_date, desiredSexPreference: data.desiredSex, paidArrhesCents: paid, complementAmountCents: payment.amount_cents, complementDueDate: payment.due_date, completeDepositCents: settings.completeDepositCents, organizationName: data.organizationName }), payment_request_id: payment.id };
      const compensate = action === "reused" ? undefined : async () => {
        const deletedAt = new Date().toISOString();
        const { data: removed, error: removeError } = await supabase.from("payments").update({ deleted_at: deletedAt, updated_at: deletedAt, updated_by: userId }).eq("id", payment!.id).eq("organization_id", organizationId).eq("reservation_id", input.reservationId).eq("payment_type", "arrhes").eq("status", "requested").eq("amount_cents", amount).ilike("notes", "%[birth_documents_deposit:v1]%").is("deleted_at", null).select("id").maybeSingle();
        if (removeError || !removed) return { ok: false as const, errorCode: "payment_compensation_failed" };
        const { count, error: verifyError } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("id", payment!.id).is("deleted_at", null);
        return !verifyError && count === 0 ? { ok: true as const } : { ok: false as const, errorCode: "payment_compensation_verification_failed" };
      };
      const [commitment, contract] = loadedAttachments.manifest;
      const afterProviderSuccess = async () => {
        const sentAt = new Date().toISOString();
        if (options.documentDelivery) {
          return options.documentDelivery({
            organizationId,
            reservationId: input.reservationId,
            commitmentDocumentId: commitment.document_id,
            contractDocumentId: contract.document_id,
            sentAt,
          });
        }
        const { data, error: deliveryError } = await supabase.rpc(
          "mark_birth_documents_deposit_documents_sent",
          {
            p_organization_id: organizationId,
            p_reservation_id: input.reservationId,
            p_commitment_document_id: commitment.document_id,
            p_contract_document_id: contract.document_id,
            p_commitment_file_sha256: commitment.file_sha256,
            p_contract_file_sha256: contract.file_sha256,
            p_commitment_file_size_bytes: commitment.file_size_bytes,
            p_contract_file_size_bytes: contract.file_size_bytes,
            p_commitment_version: commitment.version,
            p_contract_version: contract.version,
            p_sent_at: sentAt,
          },
        );
        return !deliveryError && data === "sent"
          ? { ok: true as const }
          : { ok: false as const, errorCode: "document_delivery_failed" };
      };
      return {
        ok: true,
        claimed: {
          operation: { ...operation, variables, variablesSnapshot: { ...variables, reservation_id: input.reservationId } },
          attachments: loadedAttachments.attachments,
          resourceAction: action,
          compensate,
          afterProviderSuccess,
        },
      };
    },
  }, { supabase: options.supabase, transitions: options.transitions });
  return mapResult(result);
}
