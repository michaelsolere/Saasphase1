"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const actionableReservationDocumentTypes = [
  "commitment_certificate",
  "reservation_contract",
  "sale_certificate",
];
const reservationBundleDocumentTypes = [
  "commitment_certificate",
  "reservation_contract",
];

// Utility to validate UUIDs
function isUuid(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function getDocumentActionRedirectPath(
  formData: FormData,
  documentId: string,
  reservationId: string,
  status: "success" | "error",
) {
  if (formData.get("return_to") === "document") {
    return `/documents/${documentId}?document_action_status=${status}`;
  }

  return `/reservations/${reservationId}?document_action_status=${status}#documents`;
}

function getReservationBundleRedirectPath(
  reservationId: string,
  status: "success" | "error" | "incomplete",
) {
  return `/reservations/${reservationId}?document_action_status=${status}#documents`;
}

async function readReservationForDocumentBundle(reservationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, organization_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect(getReservationBundleRedirectPath(reservationId, "error"));
  }

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, document_type")
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservationId)
    .in("document_type", reservationBundleDocumentTypes)
    .is("deleted_at", null);

  if (documentsError || !documents) {
    redirect(getReservationBundleRedirectPath(reservationId, "error"));
  }

  const hasCommitment = documents.some(
    (document) => document.document_type === "commitment_certificate",
  );
  const hasContract = documents.some(
    (document) => document.document_type === "reservation_contract",
  );

  if (!hasCommitment || !hasContract) {
    redirect(getReservationBundleRedirectPath(reservationId, "incomplete"));
  }

  return { supabase, user, reservation, documents };
}

export async function initializeReservationDocuments(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=init_documents");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch reservation details
  const { data: reservation, error: readError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, application_id, litter_id, status")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !reservation) {
    redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
  }

  // 2. Validate status: must be pre_reservation_paid
  if (reservation.status !== "pre_reservation_paid") {
    redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
  }

  // 3. Server-side validation of completed deposit (arrhes)
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, status")
    .eq("reservation_id", reservationId)
    .eq("payment_type", "arrhes")
    .eq("amount_cents", 25000)
    .is("deleted_at", null);

  if (paymentsError || !payments) {
    redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
  }

  const paidPayments = payments.filter((p) => p.status === "paid");
  if (paidPayments.length < 1) {
    redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
  }

  // 4. Fetch existing expected documents for this reservation
  const { data: existingDocs, error: docsError } = await supabase
    .from("documents")
    .select("id, document_type")
    .eq("reservation_id", reservationId)
    .in("document_type", ["commitment_certificate", "reservation_contract"])
    .is("deleted_at", null);

  if (docsError || !existingDocs) {
    redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
  }

  const hasCommitment = existingDocs.some(
    (d) => d.document_type === "commitment_certificate"
  );
  const hasContract = existingDocs.some(
    (d) => d.document_type === "reservation_contract"
  );

  let createdCount = 0;

  // 5. Create missing documents
  if (!hasCommitment) {
    const { error: insErr } = await supabase.from("documents").insert({
      organization_id: reservation.organization_id,
      reservation_id: reservation.id,
      contact_id: reservation.contact_id,
      application_id: reservation.application_id,
      litter_id: reservation.litter_id,
      document_type: "commitment_certificate",
      title: "Certificat d’engagement et de connaissance",
      status: "to_generate",
      signature_required: true,
      created_by: user.id,
      updated_by: user.id,
    });

    if (insErr) {
      console.error("Failed to create commitment_certificate:", insErr);
      redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
    }
    createdCount++;
  }

  if (!hasContract) {
    const { error: insErr } = await supabase.from("documents").insert({
      organization_id: reservation.organization_id,
      reservation_id: reservation.id,
      contact_id: reservation.contact_id,
      application_id: reservation.application_id,
      litter_id: reservation.litter_id,
      document_type: "reservation_contract",
      title: "Contrat de réservation",
      status: "to_generate",
      signature_required: true,
      created_by: user.id,
      updated_by: user.id,
    });

    if (insErr) {
      console.error("Failed to create reservation_contract:", insErr);
      redirect(`/reservations/${reservationId}?document_action_status=error#documents`);
    }
    createdCount++;
  }

  if (createdCount > 0) {
    revalidatePath(`/reservations/${reservationId}`);
    revalidatePath("/reservations");
  }

  redirect(`/reservations/${reservationId}?document_action_status=success#documents`);
}

export async function markDocumentAsSent(formData: FormData) {
  const documentId = formData.get("document_id");
  const reservationId = formData.get("reservation_id");

  if (
    typeof documentId !== "string" ||
    !isUuid(documentId) ||
    typeof reservationId !== "string" ||
    !isUuid(reservationId)
  ) {
    redirect("/reservations?erreur=document_action");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, organization_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 1. Relire le document avec id, status, reservation_id, document_type
  const { data: document, error: readError } = await supabase
    .from("documents")
    .select("id, organization_id, status, reservation_id, document_type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !document) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 2. Vérifications de garde
  if (
    document.reservation_id !== reservationId ||
    document.organization_id !== reservation.organization_id ||
    !actionableReservationDocumentTypes.includes(document.document_type) ||
    document.status !== "to_generate"
  ) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 3. Update status to sent avec clauses renforcées
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservationId)
    .eq("status", "to_generate")
    .in("document_type", actionableReservationDocumentTypes);

  if (updateError) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");

  redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "success"));
}

export async function markDocumentAsSigned(formData: FormData) {
  const documentId = formData.get("document_id");
  const reservationId = formData.get("reservation_id");

  if (
    typeof documentId !== "string" ||
    !isUuid(documentId) ||
    typeof reservationId !== "string" ||
    !isUuid(reservationId)
  ) {
    redirect("/reservations?erreur=document_action");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, organization_id")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 1. Relire le document avec id, status, reservation_id, document_type
  const { data: document, error: readError } = await supabase
    .from("documents")
    .select("id, organization_id, status, reservation_id, document_type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !document) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 2. Vérifications de garde
  if (
    document.reservation_id !== reservationId ||
    document.organization_id !== reservation.organization_id ||
    !actionableReservationDocumentTypes.includes(document.document_type) ||
    document.status !== "sent"
  ) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  // 3. Update status to signed avec clauses renforcées
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservationId)
    .eq("status", "sent")
    .in("document_type", actionableReservationDocumentTypes);

  if (updateError) {
    redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "error"));
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");

  redirect(getDocumentActionRedirectPath(formData, documentId, reservationId, "success"));
}

export async function markReservationDocumentsAsSent(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=document_action");
  }

  const { supabase, user, reservation } =
    await readReservationForDocumentBundle(reservationId);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "sent",
      sent_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservationId)
    .in("document_type", reservationBundleDocumentTypes)
    .neq("status", "signed");

  if (updateError) {
    redirect(getReservationBundleRedirectPath(reservationId, "error"));
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/documents");

  redirect(getReservationBundleRedirectPath(reservationId, "success"));
}

export async function markReservationDocumentsAsSigned(formData: FormData) {
  const reservationId = formData.get("reservation_id");

  if (typeof reservationId !== "string" || !isUuid(reservationId)) {
    redirect("/reservations?erreur=document_action");
  }

  const { supabase, user, reservation } =
    await readReservationForDocumentBundle(reservationId);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "signed",
      signed_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq("organization_id", reservation.organization_id)
    .eq("reservation_id", reservationId)
    .in("document_type", reservationBundleDocumentTypes);

  if (updateError) {
    redirect(getReservationBundleRedirectPath(reservationId, "error"));
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/documents");

  redirect(getReservationBundleRedirectPath(reservationId, "success"));
}
