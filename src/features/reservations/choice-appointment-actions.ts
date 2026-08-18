"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { processAnimalPrimaryPhotoFile } from "@/features/animals/photo-processor";
import { sendChoiceAssignmentConfirmation } from "@/features/communications/choice-assignment-confirmation-email";
import { sendChoiceAppointmentInvitation } from "@/features/communications/choice-appointment-email";
import { buildChoiceAppointmentDraft } from "@/features/reservations/choice-appointment-planning-core";
import { loadChoicePlanningSnapshot } from "@/features/reservations/choice-appointment-planning-data";
import { createClient } from "@/lib/supabase/server";

function validUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function returnUrl(litterId: string, status: string) {
  return `/litters/${litterId}/choice-appointments?status=${encodeURIComponent(status)}`;
}

export async function createChoiceAppointmentPlan(formData: FormData) {
  const litterId = formData.get("litter_id");
  const startsAtInput = formData.get("starts_at");
  const durationInput = formData.get("duration_minutes");
  if (!validUuid(litterId) || typeof startsAtInput !== "string" || typeof durationInput !== "string") {
    redirect("/litters?choice_plan_status=invalid_input");
  }
  const startsAt = new Date(startsAtInput);
  const durationMinutes = Number(durationInput);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isInteger(durationMinutes)) {
    redirect(returnUrl(litterId, "invalid_input"));
  }
  const supabase = await createClient();
  const snapshot = await loadChoicePlanningSnapshot(litterId, supabase);
  if (!snapshot?.canMutate || snapshot.plan) redirect(returnUrl(litterId, "not_eligible"));
  const eligible = snapshot.candidates.filter((candidate) => candidate.eligible);
  const slots = buildChoiceAppointmentDraft({
    startsAt: startsAt.toISOString(),
    durationMinutes,
    male: eligible.filter((candidate) => candidate.sex === "male"),
    female: eligible.filter((candidate) => candidate.sex === "female"),
  });
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: { message: string } | null }> }).rpc("create_choice_appointment_plan", {
    p_litter_id: litterId,
    p_starts_at: startsAt.toISOString(),
    p_duration_minutes: durationMinutes,
    p_slots: slots,
    p_client_command_id: randomUUID(),
  });
  if (error || data?.[0]?.outcome !== "created") redirect(returnUrl(litterId, data?.[0]?.reason ?? "error"));
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, "created"));
}

export async function updateChoiceAppointmentSlot(formData: FormData) {
  const litterId = formData.get("litter_id");
  const slotId = formData.get("slot_id");
  const plannedAtValue = formData.get("planned_at");
  const version = Number(formData.get("plan_version"));
  if (
    !validUuid(litterId) ||
    !validUuid(slotId) ||
    typeof plannedAtValue !== "string" ||
    !Number.isInteger(version)
  ) redirect("/litters");
  const plannedAt = new Date(plannedAtValue);
  if (!Number.isFinite(plannedAt.getTime())) redirect(returnUrl(litterId, "invalid_input"));
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("update_choice_appointment_slot", {
    p_slot_id: slotId,
    p_planned_at: plannedAt.toISOString(),
    p_expected_plan_version: version,
    p_client_command_id: randomUUID(),
  });
  const outcome = error ? "error" : data?.[0]?.outcome ?? "error";
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, outcome));
}

export async function validateChoiceAppointmentPlan(formData: FormData) {
  const litterId = formData.get("litter_id");
  const planId = formData.get("plan_id");
  const version = Number(formData.get("version"));
  if (!validUuid(litterId) || !validUuid(planId) || !Number.isInteger(version)) redirect("/litters");
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("validate_choice_appointment_plan", {
    p_plan_id: planId,
    p_expected_version: version,
    p_client_command_id: randomUUID(),
  });
  const outcome = error ? "error" : data?.[0]?.outcome ?? "error";
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, outcome));
}

export async function sendChoiceAppointmentPlanInvitations(formData: FormData) {
  const litterId = formData.get("litter_id");
  const planId = formData.get("plan_id");
  if (!validUuid(litterId) || !validUuid(planId)) redirect("/litters");
  const supabase = await createClient();
  const { data: slots, error } = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => Promise<{
            data: Array<{ id: string }> | null;
            error: unknown;
          }>;
        };
      };
    }
  )
    .from("choice_appointment_slots")
    .select("id")
    .eq("plan_id", planId);
  if (error || !slots?.length) redirect(returnUrl(litterId, "no_slots"));
  const results = [];
  for (const slot of slots) {
    results.push(await sendChoiceAppointmentInvitation(slot.id, { supabase }));
  }
  const failed = results.filter(
    (result) => !["success", "already_sent"].includes(result.outcome),
  );
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(
    returnUrl(
      litterId,
      failed.length === 0
        ? "invitations_sent"
        : `invitation_errors_${failed.length}`,
    ),
  );
}

export async function saveChoiceRankedPreferences(formData: FormData) {
  const litterId = formData.get("litter_id");
  const slotId = formData.get("slot_id");
  const animalIds = formData.getAll("animal_ids[]").filter((value): value is string => validUuid(value));
  if (!validUuid(litterId) || !validUuid(slotId) || animalIds.length === 0) redirect("/litters");
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("save_choice_appointment_ranked_preferences", {
    p_slot_id: slotId,
    p_animal_ids: animalIds,
    p_client_command_id: randomUUID(),
  });
  const outcome = error ? "error" : data?.[0]?.outcome ?? "error";
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, outcome));
}

export async function assignChoiceAnimal(formData: FormData) {
  const litterId = formData.get("litter_id");
  const slotId = formData.get("slot_id");
  const animalId = formData.get("animal_id");
  const mediaIdValue = formData.get("presentation_media_id");
  const mediaId = validUuid(mediaIdValue) ? mediaIdValue : null;
  const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : null;
  if (!validUuid(litterId) || !validUuid(slotId) || !validUuid(animalId)) redirect("/litters");
  const commandId = randomUUID();
  const payloadHash = createHash("sha256").update(JSON.stringify({ slotId, animalId, mediaId, reason })).digest("hex");
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null; assignment_event_id: string | null }> | null; error: unknown }> }).rpc("assign_choice_appointment_animal", {
    p_slot_id: slotId,
    p_animal_id: animalId,
    p_presentation_media_id: mediaId,
    p_reason: reason,
    p_payload_hash: payloadHash,
    p_client_command_id: commandId,
  });
  let outcome = error ? "error" : data?.[0]?.outcome ?? "error";
  if (outcome === "assigned" && data?.[0]?.assignment_event_id) {
    const confirmation = await sendChoiceAssignmentConfirmation(
      data[0].assignment_event_id,
      { supabase },
    );
    if (!["success", "already_sent"].includes(confirmation.outcome)) {
      outcome = "assigned_confirmation_pending";
    }
  }
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  revalidatePath("/reservations");
  revalidatePath("/animals");
  redirect(returnUrl(litterId, outcome));
}

export async function reportChoiceAppointment(formData: FormData) {
  const litterId = formData.get("litter_id");
  const slotId = formData.get("slot_id");
  const reason = formData.get("reason");
  if (!validUuid(litterId) || !validUuid(slotId) || typeof reason !== "string") redirect("/litters");
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("report_choice_appointment_slot", {
    p_slot_id: slotId,
    p_reason: reason,
    p_client_command_id: randomUUID(),
  });
  const outcome = error ? "error" : data?.[0]?.outcome ?? "error";
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, outcome));
}

export async function retryChoiceAssignmentConfirmation(formData: FormData) {
  const litterId = formData.get("litter_id");
  const assignmentEventId = formData.get("assignment_event_id");
  if (!validUuid(litterId) || !validUuid(assignmentEventId)) redirect("/litters");
  const supabase = await createClient();
  const confirmation = await sendChoiceAssignmentConfirmation(assignmentEventId, {
    supabase,
  });
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(
    returnUrl(
      litterId,
      ["success", "already_sent"].includes(confirmation.outcome)
        ? "confirmation_sent"
        : "confirmation_pending",
    ),
  );
}

export async function uploadChoiceGalleryPhoto(formData: FormData) {
  const litterId = formData.get("litter_id");
  const animalId = formData.get("animal_id");
  const file = formData.get("photo");
  if (!validUuid(litterId) || !validUuid(animalId) || !(file instanceof File) || !file.size || file.size > 1.5 * 1024 * 1024) redirect("/litters");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: animal } = await supabase.from("animals").select("id,organization_id").eq("id", animalId).eq("litter_id", litterId).is("deleted_at", null).maybeSingle();
  if (!animal) redirect(returnUrl(litterId, "photo_not_eligible"));
  const processed = await processAnimalPrimaryPhotoFile(file);
  if (!processed.ok) redirect(returnUrl(litterId, processed.code));
  const mediaId = randomUUID();
  const path = `organizations/${animal.organization_id}/animals/${animal.id}/photos/${mediaId}.webp`;
  const upload = await supabase.storage.from("animal-media").upload(path, processed.buffer, { contentType: processed.mimeType, upsert: false });
  if (upload.error) redirect(returnUrl(litterId, "photo_error"));
  const { count } = await supabase.from("media").select("id", { count: "exact", head: true }).eq("animal_id", animal.id).eq("media_type", "photo").is("deleted_at", null);
  const insert = await supabase.from("media").insert({
    id: mediaId,
    organization_id: animal.organization_id,
    litter_id: litterId,
    animal_id: animal.id,
    media_type: "photo",
    source: "manual_upload",
    visibility: "internal",
    is_primary: (count ?? 0) === 0,
    file_path: path,
    file_name: `${mediaId}.webp`,
    mime_type: processed.mimeType,
    file_size_bytes: processed.fileSizeBytes,
    width_px: processed.widthPx,
    height_px: processed.heightPx,
    created_by: user.id,
    updated_by: user.id,
  });
  if (insert.error) {
    const removal = await supabase.storage.from("animal-media").remove([path]);
    if (removal.error) {
      console.error("choice gallery upload compensation failed", {
        organizationId: animal.organization_id,
        animalId: animal.id,
        mediaId,
        path,
        errorCode: removal.error.name,
      });
      redirect(returnUrl(litterId, "photo_cleanup_required"));
    }
    redirect(returnUrl(litterId, "photo_error"));
  }
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, "photo_added"));
}

export async function selectChoiceGalleryPhoto(formData: FormData) {
  const litterId = formData.get("litter_id");
  const animalId = formData.get("animal_id");
  const mediaId = formData.get("media_id");
  if (!validUuid(litterId) || !validUuid(animalId) || !validUuid(mediaId)) {
    redirect("/litters");
  }
  const supabase = await createClient();
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: string | null; error: unknown }>;
    }
  ).rpc("select_animal_presentation_photo", {
    p_animal_id: animalId,
    p_media_id: mediaId,
  });
  revalidatePath(`/litters/${litterId}/choice-appointments`);
  redirect(returnUrl(litterId, !error && data === "selected" ? "photo_selected" : "photo_error"));
}
