"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendDepartureDocuments } from "@/features/communications/departure-documents-email";
import { generateSaleCertificate, signSaleCertificate } from "@/features/departures/departure-document-service";
import { DEPARTURE_SIGNATURE_CONSENT_TEXT } from "@/features/departures/departure-signature-consent";
import { createClient } from "@/lib/supabase/server";

const valid = (value: FormDataEntryValue | null): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
const withReturn = (url: string, formData: FormData) => {
  const returnTo = formData.get("return_to");
  return typeof returnTo === "string" && returnTo.startsWith("/reservations?") && !returnTo.includes("//")
    ? `${url}${url.includes("?") ? "&" : "?"}return_to=${encodeURIComponent(returnTo)}`
    : url;
};

export async function generateSaleCertificateAction(formData: FormData) {
  const reservationId = formData.get("reservation_id"); if (!valid(reservationId)) redirect("/reservations");
  const result = await generateSaleCertificate(reservationId);
  revalidatePath(`/reservations/${reservationId}/depart`);
  redirect(withReturn(`/reservations/${reservationId}/depart?document_status=${result.outcome}`, formData));
}

export async function signSaleCertificateAction(formData: FormData) {
  const reservationId = formData.get("reservation_id"); const documentId = formData.get("document_id"); const signatureDataUrl = formData.get("signature_data_url"); const signerName = formData.get("signer_name"); const commandId = formData.get("client_command_id");
  if (!valid(reservationId) || !valid(documentId) || !valid(commandId) || typeof signatureDataUrl !== "string" || typeof signerName !== "string" || formData.get("consent_confirmed") !== "yes") redirect("/reservations");
  const result = await signSaleCertificate({ reservationId, documentId, signatureDataUrl, signerName, consentText: DEPARTURE_SIGNATURE_CONSENT_TEXT, clientCommandId: commandId });
  revalidatePath(`/reservations/${reservationId}/depart`);
  redirect(withReturn(`/reservations/${reservationId}/depart?signature_status=${result.outcome}`, formData));
}

export async function recordDepartureBalanceAction(formData: FormData) {
  const reservationId = formData.get("reservation_id"); const method = formData.get("payment_method"); const reference = String(formData.get("reference") ?? "").trim(); const commandId = formData.get("client_command_id"); const expectedUpdatedAt = formData.get("expected_reservation_updated_at");
  if (!valid(reservationId) || !valid(commandId) || typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt)) || typeof method !== "string" || !["bank_transfer","cash","card","cheque","other"].includes(method)) redirect("/reservations");
  const supabase = await createClient();
  const inserted = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("record_departure_final_balance", { p_reservation_id: reservationId, p_payment_method: method, p_reference: reference || null, p_expected_reservation_updated_at: expectedUpdatedAt, p_client_command_id: commandId });
  revalidatePath(`/reservations/${reservationId}/depart`); revalidatePath(`/reservations/${reservationId}`); revalidatePath("/reservations");
  redirect(withReturn(`/reservations/${reservationId}/depart?payment_status=${inserted.error ? "error" : inserted.data?.[0]?.outcome ?? "error"}`, formData));
}

export async function sendDepartureDocumentsAction(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const selected = formData.getAll("document_ids").filter(valid);
  if (!valid(reservationId) || !selected.length) redirect("/reservations");
  const result = await sendDepartureDocuments(reservationId, selected);
  revalidatePath(`/reservations/${reservationId}/depart`);
  redirect(withReturn(`/reservations/${reservationId}/depart?documents_email_status=${result.outcome}`, formData));
}

export async function markDepartureStatusAction(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const slotId = formData.get("slot_id");
  const status = formData.get("status");
  const commandId = formData.get("client_command_id");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!valid(reservationId) || !valid(slotId) || !valid(commandId) || typeof status !== "string" || !["booked","to_review","late","no_show","cancelled"].includes(status)) redirect("/reservations");
  const supabase = await createClient();
  const result = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("mark_departure_appointment_status", { p_slot_id: slotId, p_status: status, p_reason: reason || null, p_client_command_id: commandId });
  revalidatePath(`/reservations/${reservationId}/depart`); revalidatePath("/departs");
  redirect(withReturn(`/reservations/${reservationId}/depart?appointment_status=${result.error ? "error" : result.data?.[0]?.outcome ?? "error"}`, formData));
}
