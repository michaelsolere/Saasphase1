import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runTransactionalCampaignDelivery, type TransactionalEmailTransport } from "@/features/communications/transactional-campaign-core";
import type { TransactionalEmailAttachment, TransactionalEmailAttachmentDocumentType } from "@/features/communications/transactional-email-attachments";
import { readDocumentSignedReturn } from "@/features/documents/document-signed-return-storage";
import { readDocumentPdf } from "@/features/documents/document-pdf-storage";
import { getBrevoConfigurationStatus, getBrevoTransactionalTemplate, sendBrevoTransactionalEmail } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

const CAMPAIGN_KEY = "departure_documents";
type Typed = SupabaseClient<Database>;
type Loose = SupabaseClient;
const allowedTypes = new Set<TransactionalEmailAttachmentDocumentType>(["sale_certificate","veterinary_certificate","birth_certificate","invoice"]);
const transport = (): TransactionalEmailTransport => ({ isConfigured: () => getBrevoConfigurationStatus().isConfigured, getTemplate: getBrevoTransactionalTemplate, sendEmail: sendBrevoTransactionalEmail });

export async function sendDepartureDocuments(reservationId: string, selectedDocumentIds: string[], options?: { supabase?: Typed; emailTransport?: TransactionalEmailTransport }) {
  const supabase = options?.supabase ?? await createClient(); const loose = supabase as unknown as Loose;
  const reservationResult = await loose.from("reservations").select("id,organization_id,contact_id,litter_id,animal_id,status").eq("id", reservationId).maybeSingle();
  const reservation = reservationResult.data as { id: string; organization_id: string; contact_id: string; litter_id: string; animal_id: string; status: string } | null;
  if (reservationResult.error || !reservation) return { outcome: "failed" as const, errorCode: "reservation_not_found" };
  const documentsResult = await loose.from("documents").select("id,animal_id,document_type,title,file_name,file_sha256,file_size_bytes,source_template_version,status,document_signed_returns(id,file_sha256,file_size_bytes)").eq("organization_id", reservation.organization_id).eq("reservation_id", reservation.id).in("id", selectedDocumentIds).is("deleted_at", null).is("superseded_at", null);
  if (documentsResult.error) return { outcome: "failed" as const, errorCode: "departure_documents_unavailable" };
  const documents = (documentsResult.data ?? []) as Array<{ id: string; animal_id: string | null; document_type: TransactionalEmailAttachmentDocumentType; title: string; file_name: string | null; file_sha256: string | null; file_size_bytes: number | null; source_template_version: number | null; status: string; document_signed_returns: Array<{ id: string; file_sha256: string; file_size_bytes: number }> }>;
  const sale = documents.find((document) => document.document_type === "sale_certificate" && document.status === "signed" && document.document_signed_returns?.length);
  if (!sale || sale.animal_id !== reservation.animal_id || documents.length !== new Set(selectedDocumentIds).size || documents.some((document) => !allowedTypes.has(document.document_type) || (document.document_type === "sale_certificate" && (document.animal_id !== reservation.animal_id || document.status !== "signed" || !document.document_signed_returns?.length)) || (["veterinary_certificate","birth_certificate"].includes(document.document_type) && document.animal_id !== reservation.animal_id) || (document.document_type === "invoice" && document.animal_id !== null && document.animal_id !== reservation.animal_id))) return { outcome: "failed" as const, errorCode: "signed_sale_certificate_required" };
  const attachments: TransactionalEmailAttachment[] = [];
  for (const document of documents.sort((left, right) => left.document_type === "sale_certificate" ? -1 : right.document_type === "sale_certificate" ? 1 : left.document_type.localeCompare(right.document_type))) {
    if (document.document_type === "sale_certificate") {
      const signed = document.document_signed_returns[0]!; const read = await readDocumentSignedReturn(reservation.organization_id, signed.id, supabase);
      if (read.outcome !== "success") return { outcome: "failed" as const, errorCode: "signed_sale_certificate_unavailable" };
      attachments.push({ name: "attestation-vente-signee.pdf", content: Buffer.from(read.bytes).toString("base64"), snapshot: { kind: "document_pdf", documentId: document.id, documentType: document.document_type, fileName: "attestation-vente-signee.pdf", fileSha256: signed.file_sha256, fileSizeBytes: signed.file_size_bytes, version: document.source_template_version ?? 1 } });
    } else {
      const read = await readDocumentPdf(reservation.organization_id, document.id, supabase); if (read.outcome !== "success") return { outcome: "failed" as const, errorCode: "optional_document_unavailable" };
      const fileName = `${document.document_type.replaceAll("_","-")}.pdf`;
      attachments.push({ name: fileName, content: Buffer.from(read.bytes).toString("base64"), snapshot: { kind: "document_pdf", documentId: document.id, documentType: document.document_type, fileName, fileSha256: read.document.file_sha256!, fileSizeBytes: read.document.file_size_bytes!, version: read.document.source_template_version ?? 1 } });
    }
  }
  const bundleVersion = createHash("sha256").update(attachments.map((attachment) => `${attachment.snapshot.documentId}:${attachment.snapshot.fileSha256}`).sort().join("|")).digest("hex");
  return runTransactionalCampaignDelivery({
    campaignKey: CAMPAIGN_KEY,
    operationVersion: `departure-documents:${reservation.id}:${sale.document_signed_returns[0]!.id}:${bundleVersion}:v2`,
    context: { organizationId: reservation.organization_id, roles: ["owner","admin"] },
    transport: options?.emailTransport ?? transport(),
    prepareOperation: async () => {
      const [contactResult,litterResult,animalResult] = await Promise.all([loose.from("contacts").select("email,display_name,first_name").eq("id",reservation.contact_id).maybeSingle(),loose.from("litters").select("name").eq("id",reservation.litter_id).maybeSingle(),loose.from("animals").select("call_name,official_name").eq("id",reservation.animal_id).maybeSingle()]);
      const contact = contactResult.data as { email: string | null; display_name: string | null; first_name: string | null } | null;
      const litter = litterResult.data as { name: string | null } | null;
      const animal = animalResult.data as { call_name: string | null; official_name: string | null } | null;
      if (!contact?.email) return { ok: false as const, errorCode: "recipient_email_missing" };
      const variables = { prenom: contact.first_name ?? contact.display_name ?? "", portee: litter?.name ?? "Portée", nom_chiot: animal?.call_name ?? animal?.official_name ?? "Votre chiot" };
      return { ok: true as const, operation: { dossierId: reservation.id, contactId: reservation.contact_id, reservationId: reservation.id, litterId: reservation.litter_id, recipientEmail: contact.email, recipientName: contact.display_name, variables, variablesSnapshot: variables } };
    },
    claimedPreparationPhase: "before_provider",
    prepareClaimedOperation: async ({ operation }) => ({ ok:true as const, claimed:{ operation,attachments } }),
  }, { supabase });
}
