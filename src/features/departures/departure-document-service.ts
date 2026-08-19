import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildDocumentSignedReturnPath, deriveDocumentSignedReturnId, validateAndHashSignedReturnPdf } from "@/features/documents/document-signed-return-storage-core";
import { readDocumentPdf, storeDocumentPdf } from "@/features/documents/document-pdf-storage";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasVisibleDepartureSignature } from "@/features/departures/departure-signature-core";
import type { Database } from "@/types/database.types";

type Typed = SupabaseClient<Database>;
type Loose = SupabaseClient;
type ContactSnapshot = { display_name: string | null; first_name: string | null; last_name: string | null; address_line1: string | null; postal_code: string | null; city: string | null };
type AnimalSnapshot = { call_name: string | null; official_name: string | null; sex: string; birth_date: string | null; identification_number: string; breed: string | null };
type OrganizationSnapshot = { name: string; affix_name: string | null; dog_affix_name: string | null; address_line1: string | null; postal_code: string | null; city: string | null };

async function authorizeReservation(reservationId: string, supabase: Typed) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const reservation = await supabase.from("reservations").select("id,organization_id,contact_id,litter_id,animal_id,price_cents,currency,status").eq("id", reservationId).is("deleted_at", null).maybeSingle();
  if (reservation.error || !reservation.data?.animal_id) return null;
  const membership = await supabase.from("memberships").select("role").eq("organization_id", reservation.data.organization_id).eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (membership.error || !membership.data || !["owner", "admin"].includes(membership.data.role)) return null;
  return { user, role: membership.data.role, reservation: reservation.data };
}

function line(page: import("pdf-lib").PDFPage, text: string, y: number, bold: import("pdf-lib").PDFFont, regular: import("pdf-lib").PDFFont) {
  const [label, ...rest] = text.split(":");
  page.drawText(`${label}:`, { x: 55, y, size: 10, font: bold });
  page.drawText(rest.join(":").trim(), { x: 185, y, size: 10, font: regular });
}

export async function generateSaleCertificate(reservationId: string, provided?: Typed) {
  const supabase = provided ?? await createClient();
  const context = await authorizeReservation(reservationId, supabase);
  if (!context) return { outcome: "forbidden" as const };
  const loose = supabase as unknown as Loose;
  const existing = await loose.from("documents").select("id,status,file_sha256").eq("organization_id", context.reservation.organization_id).eq("reservation_id", reservationId).eq("animal_id", context.reservation.animal_id).eq("document_type", "sale_certificate").is("deleted_at", null).is("superseded_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.data && ["generated", "sent", "signed"].includes(existing.data.status)) return { outcome: "existing" as const, documentId: String(existing.data.id) };
  const [contactResult, animalResult, organizationResult, litterResult] = await Promise.all([
    loose.from("contacts").select("display_name,first_name,last_name,address_line1,postal_code,city").eq("id", context.reservation.contact_id).single(),
    loose.from("animals").select("call_name,official_name,sex,birth_date,identification_number,breed").eq("id", context.reservation.animal_id).single(),
    loose.from("organizations").select("name,affix_name,dog_affix_name,address_line1,postal_code,city").eq("id", context.reservation.organization_id).single(),
    context.reservation.litter_id ? loose.from("litters").select("name").eq("id", context.reservation.litter_id).single() : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactResult.error || animalResult.error || organizationResult.error || !animalResult.data?.identification_number) return { outcome: "not_ready" as const, reason: "identification_missing" };
  const contact = contactResult.data as ContactSnapshot; const animal = animalResult.data as AnimalSnapshot; const org = organizationResult.data as OrganizationSnapshot;
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("ATTESTATION DE VENTE", { x: 165, y: 780, size: 20, font: bold, color: rgb(0.12,0.12,0.12) });
  page.drawText("Cédant", { x: 55, y: 735, size: 13, font: bold });
  line(page, `Élevage: ${org.dog_affix_name ?? org.affix_name ?? org.name}`, 712, bold, regular);
  line(page, `Adresse: ${[org.address_line1, org.postal_code, org.city].filter(Boolean).join(" ")}`, 692, bold, regular);
  page.drawText("Acquéreur", { x: 55, y: 650, size: 13, font: bold });
  line(page, `Nom: ${contact.display_name ?? [contact.first_name, contact.last_name].filter(Boolean).join(" ")}`, 627, bold, regular);
  line(page, `Adresse: ${[contact.address_line1, contact.postal_code, contact.city].filter(Boolean).join(" ")}`, 607, bold, regular);
  page.drawText("Animal cédé", { x: 55, y: 565, size: 13, font: bold });
  line(page, `Nom: ${animal.official_name ?? animal.call_name ?? "Chiot"}`, 542, bold, regular);
  line(page, `Portée: ${(litterResult.data as { name: string | null } | null)?.name ?? ""}`, 522, bold, regular);
  line(page, `Sexe: ${animal.sex === "male" ? "Mâle" : "Femelle"}`, 502, bold, regular);
  line(page, `Date de naissance: ${animal.birth_date ?? ""}`, 482, bold, regular);
  line(page, `Identification: ${animal.identification_number}`, 462, bold, regular);
  line(page, `Race: ${animal.breed ?? "Golden Retriever"}`, 442, bold, regular);
  line(page, `Prix convenu: ${context.reservation.price_cents === null ? "Non renseigné" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: context.reservation.currency }).format(context.reservation.price_cents / 100)}`, 422, bold, regular);
  page.drawText("La famille reconnaît recevoir l’animal et les documents remis lors du départ.", { x: 55, y: 365, size: 10, font: regular });
  page.drawRectangle({ x: 55, y: 130, width: 485, height: 160, borderWidth: 1, borderColor: rgb(0.4,0.4,0.4) });
  page.drawText("Signature de l’acquéreur", { x: 70, y: 265, size: 10, font: bold });
  const bytes = await pdf.save();
  const documentId = randomUUID();
  const stored = await storeDocumentPdf({ organizationId: context.reservation.organization_id, documentId, contactId: context.reservation.contact_id, reservationId, litterId: context.reservation.litter_id, animalId: context.reservation.animal_id, bytes, documentType: "sale_certificate", title: "Attestation de vente", generatedFromTemplate: false, generatedAt: new Date().toISOString(), generationData: { schemaVersion: 1, identificationNumber: animal.identification_number, animalId: context.reservation.animal_id }, signatureRequired: true }, supabase);
  return stored.outcome === "error" ? { outcome: "error" as const, reason: stored.error.code } : { outcome: "created" as const, documentId };
}

export async function signSaleCertificate(input: { reservationId: string; documentId: string; signatureDataUrl: string; signerName: string; consentText: string; clientCommandId: string }, provided?: Typed) {
  const supabase = provided ?? await createClient();
  const context = await authorizeReservation(input.reservationId, supabase);
  if (!context) return { outcome: "forbidden" as const };
  const signatureMatch = input.signatureDataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!signatureMatch || input.signerName.trim().length < 2 || input.consentText.trim().length < 10) return { outcome: "invalid_input" as const };
  const signature = Buffer.from(signatureMatch[1]!, "base64");
  if (signature.byteLength < 100 || signature.byteLength > 500_000) return { outcome: "invalid_input" as const };
  if (!hasVisibleDepartureSignature(signature)) return { outcome: "signature_empty" as const };
  const original = await readDocumentPdf(context.reservation.organization_id, input.documentId, supabase);
  if (original.outcome !== "success" || original.document.reservation_id !== input.reservationId || original.document.animal_id !== context.reservation.animal_id || original.document.document_type !== "sale_certificate") return { outcome: "not_eligible" as const };
  const pdf = await PDFDocument.load(original.bytes); const png = await pdf.embedPng(signature); const page = pdf.getPages().at(-1)!; const scale = Math.min(280 / png.width, 95 / png.height, 1);
  page.drawImage(png, { x: 90, y: 155, width: png.width * scale, height: png.height * scale });
  page.drawText(`${input.signerName.trim()} · ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date())}`, { x: 90, y: 140, size: 8 });
  const signedBytes = await pdf.save(); const validated = validateAndHashSignedReturnPdf(signedBytes); if (!validated) return { outcome: "error" as const };
  const signedReturnId = deriveDocumentSignedReturnId(context.reservation.organization_id, input.documentId, validated.fileSha256)!;
  const filePath = buildDocumentSignedReturnPath(context.reservation.organization_id, input.documentId, signedReturnId, validated.fileSha256)!;
  const service = createServiceRoleClient() as unknown as Loose;
  const upload = await service.storage.from("documents").upload(filePath, validated.bytes, { contentType: "application/pdf", upsert: false });
  const uploadedByThisCall = !upload.error;
  const duplicateUpload = upload.error && (((upload.error as unknown as { statusCode?: number | string }).statusCode === 409) || String((upload.error as unknown as { statusCode?: number | string }).statusCode) === "409" || /duplicate|already exists|resource exists/i.test(upload.error.message));
  if (upload.error && !duplicateUpload) return { outcome: "storage_error" as const };
  const signatureSha256 = createHash("sha256").update(signature).digest("hex"); const consentSha256 = createHash("sha256").update(input.consentText.trim()).digest("hex");
  const archiveArgs = { p_actor_profile_id: context.user.id, p_document_id: input.documentId, p_signed_return_id: signedReturnId, p_file_path: filePath, p_file_sha256: validated.fileSha256, p_file_size_bytes: validated.fileSizeBytes, p_source_pdf_sha256: original.document.file_sha256, p_signature_sha256: signatureSha256, p_signer_name: input.signerName.trim(), p_consent_text: input.consentText.trim(), p_consent_sha256: consentSha256, p_client_command_id: input.clientCommandId };
  const archive = () => (service as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("archive_sale_certificate_signature_service", archiveArgs);
  let rpc = await archive();
  if (rpc.error && !rpc.data?.[0]) rpc = await archive();
  const result = rpc.data?.[0];
  if (rpc.error && !result) return { outcome: "uncertain" as const, reason: "archive_result_unknown", signedReturnId };
  if (!result || !["created", "existing"].includes(result.outcome)) { if (uploadedByThisCall) await service.storage.from("documents").remove([filePath]); return { outcome: "error" as const, reason: result?.reason ?? "archive_failed" }; }
  return { outcome: result.outcome as "created" | "existing", signedReturnId };
}
