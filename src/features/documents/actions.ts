"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Utility to validate UUIDs
function isUuid(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
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
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  // 2. Validate status: must be pre_reservation_paid
  if (reservation.status !== "pre_reservation_paid") {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  // 3. Fetch existing expected documents for this reservation
  const { data: existingDocs, error: docsError } = await supabase
    .from("documents")
    .select("id, document_type")
    .eq("reservation_id", reservationId)
    .in("document_type", ["commitment_certificate", "reservation_contract"])
    .is("deleted_at", null);

  if (docsError || !existingDocs) {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  const hasCommitment = existingDocs.some(
    (d) => d.document_type === "commitment_certificate"
  );
  const hasContract = existingDocs.some(
    (d) => d.document_type === "reservation_contract"
  );

  let createdCount = 0;

  // 4. Create missing documents
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
      redirect(`/reservations/${reservationId}?document_action_status=error`);
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
      redirect(`/reservations/${reservationId}?document_action_status=error`);
    }
    createdCount++;
  }

  if (createdCount > 0) {
    revalidatePath(`/reservations/${reservationId}`);
    revalidatePath("/reservations");
  }

  redirect(`/reservations/${reservationId}?document_action_status=success`);
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

  // Fetch document
  const { data: document, error: readError } = await supabase
    .from("documents")
    .select("id, status")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !document) {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  // Update status to sent
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (updateError) {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");

  redirect(`/reservations/${reservationId}?document_action_status=success`);
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

  // Fetch document
  const { data: document, error: readError } = await supabase
    .from("documents")
    .select("id, status")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !document) {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  // Update status to signed
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (updateError) {
    redirect(`/reservations/${reservationId}?document_action_status=error`);
  }

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/reservations");

  redirect(`/reservations/${reservationId}?document_action_status=success`);
}
