"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  actionTargets,
  transitions,
  type QualificationAction,
} from "./transitions";
import { createClient } from "@/lib/supabase/server";

function isQualificationAction(value: string): value is QualificationAction {
  return value in actionTargets;
}

function detailUrl(applicationId: string, outcome: "success" | "error") {
  return `/candidatures/${applicationId}?action=${outcome}`;
}

function reservationUrl(
  applicationId: string,
  outcome: "created" | "already_exists" | "not_qualified" | "error",
) {
  return `/candidatures/${applicationId}?reservation_status=${outcome}`;
}

export async function updateApplicationStatus(formData: FormData) {
  const applicationId = formData.get("application_id");
  const requestedAction = formData.get("qualification_action");

  if (
    typeof applicationId !== "string" ||
    typeof requestedAction !== "string" ||
    !isQualificationAction(requestedAction)
  ) {
    redirect("/candidatures?erreur=action");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError || !application) {
    redirect(detailUrl(applicationId, "error"));
  }

  const allowedActions = transitions[application.status] ?? [];

  if (!allowedActions.includes(requestedAction)) {
    redirect(detailUrl(applicationId, "error"));
  }

  const nextStatus = actionTargets[requestedAction];
  const now = new Date().toISOString();
  const isFirstReview =
    (application.status === "to_review" || application.status === "new") &&
    nextStatus !== "archived";

  const reviewFields = isFirstReview
    ? {
        reviewed_at: now,
        reviewed_by: user.id,
      }
    : {};

  const { data: updatedApplication, error: updateError } = await supabase
    .from("applications")
    .update({
      status: nextStatus,
      updated_at: now,
      updated_by: user.id,
      ...reviewFields,
    })
    .eq("id", applicationId)
    .eq("status", application.status)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedApplication) {
    redirect(detailUrl(applicationId, "error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(detailUrl(applicationId, "success"));
}

export async function createReservationFromApplication(formData: FormData) {
  const applicationId = formData.get("application_id");

  if (typeof applicationId !== "string" || !applicationId) {
    redirect("/candidatures?erreur=reservation");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select(
      "id, organization_id, contact_id, species, breed, desired_litter_group_id, desired_litter_id, desired_sex_preference, status",
    )
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !application) {
    redirect(reservationUrl(applicationId, "error"));
  }

  if (application.status !== "qualified") {
    redirect(reservationUrl(applicationId, "not_qualified"));
  }

  const { data: existingReservation, error: reservationReadError } =
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

  if (reservationReadError) {
    redirect(reservationUrl(applicationId, "error"));
  }

  if (existingReservation) {
    redirect(reservationUrl(applicationId, "already_exists"));
  }

  const { error: insertError } = await supabase.from("reservations").insert({
    organization_id: application.organization_id,
    contact_id: application.contact_id,
    application_id: application.id,
    species: application.species,
    breed: application.breed,
    litter_group_id: application.desired_litter_group_id,
    litter_id: application.desired_litter_id,
    reserved_sex_preference: application.desired_sex_preference,
    status: "draft",
    created_by: user.id,
    updated_by: user.id,
  });

  if (insertError) {
    redirect(reservationUrl(applicationId, "error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  revalidatePath("/reservations");
  redirect(reservationUrl(applicationId, "created"));
}

export async function createApplicationNote(formData: FormData) {
  const applicationId = formData.get("application_id");
  const organizationId = formData.get("organization_id");
  const body = formData.get("body");

  if (
    typeof applicationId !== "string" ||
    typeof organizationId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    if (typeof applicationId === "string") {
      redirect(`/candidatures/${applicationId}?note_status=error`);
    } else {
      redirect("/candidatures?erreur=note");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: insertError } = await supabase
    .from("notes")
    .insert({
      application_id: applicationId,
      organization_id: organizationId,
      body: body.trim(),
      note_type: "internal",
      visibility: "internal",
      created_by: user.id,
    });

  if (insertError) {
    redirect(`/candidatures/${applicationId}?note_status=error`);
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(`/candidatures/${applicationId}?note_status=success`);
}
