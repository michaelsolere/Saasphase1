"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  actionTargets,
  transitions,
  type QualificationAction,
} from "./transitions";
import {
  deactivateActiveContactRoles,
  promoteContactJourneyRole,
} from "@/features/contacts/roles";
import { sendPreparedPreReservationProposal } from "@/features/applications/candidate-pre-reservation-proposal-send";
import { sendPreReservationEmailForApplication } from "@/features/communications/pre-reservation-email";
import { createClient } from "@/lib/supabase/server";

const desiredSexPreferences = new Set([
  "male_only",
  "female_only",
  "male_preferred_female_possible",
  "female_preferred_male_possible",
  "no_preference",
  "unknown",
]);

const desiredTimingModes = new Set([
  "unknown",
  "earliest",
  "season",
  "not_before",
  "no_preference",
]);

const desiredSeasons = new Set(["spring", "summer", "autumn", "winter"]);

function isQualificationAction(value: string): value is QualificationAction {
  return value in actionTargets;
}

function normalizeOptionalText(value: FormDataEntryValue | null, maxLength = 255) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

function detailUrl(applicationId: string, outcome: "success" | "error") {
  return `/candidatures/${applicationId}?action=${outcome}`;
}

function detailUrlWithNoteStatus(
  applicationId: string,
  noteOutcome: "success" | "error",
) {
  return `/candidatures/${applicationId}?action=success&note_status=${noteOutcome}`;
}

function normalizeApplicationReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "/candidatures" || value.startsWith("/candidatures?")) {
    return value;
  }

  return null;
}

function applicationStatusRedirectUrl({
  applicationId,
  noteOutcome,
  returnPath,
}: {
  applicationId: string;
  noteOutcome?: "success" | "error";
  returnPath: string | null;
}) {
  if (!returnPath) {
    return noteOutcome
      ? detailUrlWithNoteStatus(applicationId, noteOutcome)
      : detailUrl(applicationId, "success");
  }

  const separator = returnPath.includes("?") ? "&" : "?";
  const noteParam = noteOutcome ? `&note_status=${noteOutcome}` : "";

  return `${returnPath}${separator}action=success${noteParam}`;
}

function contactApplicationUrl(contactId: string, outcome: "error") {
  return `/contacts/${contactId}/applications/new?status=${outcome}`;
}

function applicationRoleUrl(applicationId: string) {
  return `/candidatures/${applicationId}?role_status=error`;
}

export async function createApplicationForContact(formData: FormData) {
  const contactId = formData.get("contact_id");

  if (typeof contactId !== "string" || !contactId) {
    redirect("/contacts?erreur=candidature");
  }

  const species = normalizeOptionalText(formData.get("species")) ?? "dog";
  const breed =
    normalizeOptionalText(formData.get("breed")) ?? "Golden Retriever";
  const desiredSexPreferenceValue =
    normalizeOptionalText(formData.get("desired_sex_preference")) ?? "unknown";
  const desiredSexPreference = desiredSexPreferences.has(
    desiredSexPreferenceValue,
  )
    ? desiredSexPreferenceValue
    : "unknown";
  const projectDescription = normalizeOptionalText(
    formData.get("project_description"),
    2_000,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contact, error: contactReadError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactReadError || !contact?.organization_id) {
    redirect(contactApplicationUrl(contactId, "error"));
  }

  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      organization_id: contact.organization_id,
      contact_id: contact.id,
      species,
      breed,
      desired_sex_preference: desiredSexPreference,
      project_description: projectDescription,
      status: "new",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !application?.id) {
    redirect(contactApplicationUrl(contactId, "error"));
  }

  const now = new Date().toISOString();
  const candidateRoleResult = await promoteContactJourneyRole({
    supabase,
    organizationId: contact.organization_id,
    contactId: contact.id,
    role: "candidate",
    userId: user.id,
    now,
  });

  if (candidateRoleResult.error || candidateRoleResult.deactivationError) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/candidatures");
    revalidatePath(`/candidatures/${application.id}`);
    redirect(applicationRoleUrl(application.id));
  }

  if (candidateRoleResult.wasAdded) {
    const { error: prospectDeactivateError } =
      await deactivateActiveContactRoles({
        supabase,
        organizationId: contact.organization_id,
        contactId: contact.id,
        roles: "prospect",
        userId: user.id,
        now,
      });

    if (prospectDeactivateError) {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${contactId}`);
      revalidatePath("/candidatures");
      revalidatePath(`/candidatures/${application.id}`);
      redirect(applicationRoleUrl(application.id));
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${application.id}`);
  redirect(`/candidatures/${application.id}`);
}

export async function updateApplicationStatus(formData: FormData) {
  const applicationId = formData.get("application_id");
  const requestedAction = formData.get("qualification_action");
  const statusReason = normalizeOptionalText(
    formData.get("status_reason"),
    500,
  );
  const returnPath = normalizeApplicationReturnPath(formData.get("return_path"));

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
    .select("id, organization_id, status")
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

  if (statusReason) {
    const { error: noteError } = await supabase.from("notes").insert({
      application_id: applicationId,
      organization_id: application.organization_id,
      body: `Changement de statut : ${application.status} → ${nextStatus}\nRaison : ${statusReason}`,
      note_type: "decision",
      visibility: "internal",
      created_by: user.id,
      updated_by: user.id,
    });

    if (noteError) {
      redirect(
        applicationStatusRedirectUrl({
          applicationId,
          noteOutcome: "error",
          returnPath,
        }),
      );
    }

    redirect(
      applicationStatusRedirectUrl({
        applicationId,
        noteOutcome: "success",
        returnPath,
      }),
    );
  }

  redirect(applicationStatusRedirectUrl({ applicationId, returnPath }));
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

// ---------------------------------------------------------------------------
// Rattachement portée / groupe de portées
// ---------------------------------------------------------------------------

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function desiredLitterUrl(
  applicationId: string,
  outcome: "success" | "error" | "conflict",
) {
  return `/candidatures/${applicationId}?litter_status=${outcome}#portee-souhaitee`;
}

/**
 * Met à jour les champs desired_litter_id et desired_litter_group_id
 * sur une candidature existante.
 *
 * - Accepte une valeur vide pour supprimer le lien.
 * - Ne touche pas aux réservations, paiements, rôles, animaux.
 * - Vérifie que la portée et le groupe appartiennent à la même organisation.
 */
export async function updateApplicationDesiredLitter(formData: FormData) {
  const applicationId = formData.get("application_id");

  if (typeof applicationId !== "string" || !applicationId) {
    redirect("/candidatures?erreur=portee");
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
      "id, organization_id, updated_at, positioning_revision, desired_timing_mode",
    )
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !application) {
    redirect(desiredLitterUrl(applicationId, "error"));
  }

  const rawLitterId = formData.get("desired_litter_id");
  const rawGroupId = formData.get("desired_litter_group_id");
  const desiredLitterId =
    typeof rawLitterId === "string" && isUuid(rawLitterId.trim())
      ? rawLitterId.trim()
      : null;
  const desiredLitterGroupId =
    typeof rawGroupId === "string" && isUuid(rawGroupId.trim())
      ? rawGroupId.trim()
      : null;
  const timingModeValue = normalizeOptionalText(formData.get("desired_timing_mode"));
  const desiredTimingMode =
    timingModeValue && desiredTimingModes.has(timingModeValue)
      ? timingModeValue
      : "unknown";
  const seasonValue = normalizeOptionalText(formData.get("desired_season"));
  const desiredSeason =
    seasonValue && desiredSeasons.has(seasonValue) ? seasonValue : null;
  const seasonYearValue = normalizeOptionalText(formData.get("desired_season_year"));
  const desiredSeasonYear = seasonYearValue ? Number.parseInt(seasonYearValue, 10) : null;
  const desiredNotBeforeDate = normalizeOptionalText(
    formData.get("desired_not_before_date"),
    10,
  );

  const applicationVersion = application as unknown as {
    updated_at: string;
    positioning_revision: number;
  };
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ outcome: string; reason: string | null }> | null;
    error: unknown;
  }>;
  const result = await rpc("update_candidate_positioning", {
    p_application_id: applicationId,
    p_expected_application_updated_at: applicationVersion.updated_at,
    p_expected_positioning_revision: applicationVersion.positioning_revision,
    p_desired_timing_mode: desiredTimingMode,
    p_desired_season: desiredSeason,
    p_desired_season_year: Number.isInteger(desiredSeasonYear)
      ? desiredSeasonYear
      : null,
    p_desired_not_before_date: desiredNotBeforeDate,
    p_target_litter_id: desiredLitterId,
    p_target_litter_group_id: desiredLitterGroupId,
    p_client_command_id: randomUUID(),
  });
  const outcome = result.data?.[0]?.outcome;

  if (result.error || (outcome !== "updated" && outcome !== "already_applied")) {
    const status = outcome === "conflict" ? "conflict" : "error";
    redirect(desiredLitterUrl(applicationId, status));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);

  if (desiredLitterId) {
    revalidatePath(`/litters/${desiredLitterId}`);
  }

  redirect(desiredLitterUrl(applicationId, "success"));
}

function proposalUrl(applicationId: string, outcome: string) {
  return `/candidatures/${applicationId}?proposal_status=${encodeURIComponent(outcome)}#proposition-pre-reservation`;
}

export async function prepareCandidatePreReservationProposal(formData: FormData) {
  const applicationId = formData.get("application_id");
  if (typeof applicationId !== "string" || !isUuid(applicationId)) {
    redirect("/candidatures?erreur=proposition");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: rawApplication, error: readError } = await supabase
    .from("applications")
    .select("id, updated_at")
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !rawApplication) {
    redirect(proposalUrl(applicationId, "error"));
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ outcome: string; reason: string | null }> | null;
    error: unknown;
  }>;
  const prepared = await rpc("prepare_pre_reservation_proposal", {
    p_application_id: applicationId,
    p_expected_application_updated_at: rawApplication.updated_at,
    p_client_command_id: randomUUID(),
  });
  const result = prepared.data?.[0];
  if (prepared.error || !result) {
    redirect(proposalUrl(applicationId, "error"));
  }
  if (!["created", "already_exists"].includes(result.outcome)) {
    redirect(proposalUrl(applicationId, result.reason ?? result.outcome));
  }

  revalidatePath(`/candidatures/${applicationId}`);
  redirect(proposalUrl(applicationId, "prepared"));
}

export async function sendCandidatePreReservationProposal(formData: FormData) {
  const proposalId = formData.get("proposal_id");
  const applicationId = formData.get("application_id");
  if (
    typeof proposalId !== "string" ||
    !isUuid(proposalId) ||
    typeof applicationId !== "string" ||
    !isUuid(applicationId)
  ) {
    redirect("/candidatures?erreur=proposition");
  }

  const supabase = await createClient();
  const result = await sendPreparedPreReservationProposal(
    { proposalId },
    {
      supabase,
      sendEmail: sendPreReservationEmailForApplication,
      commandId: randomUUID,
    },
  );

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(proposalUrl(applicationId, result.status));
}

export async function resolveUncertainCandidateProposalAsNotSent(
  formData: FormData,
) {
  const proposalId = formData.get("proposal_id");
  const applicationId = formData.get("application_id");
  const reason = normalizeOptionalText(formData.get("reason"), 500);
  if (
    typeof proposalId !== "string" ||
    !isUuid(proposalId) ||
    typeof applicationId !== "string" ||
    !isUuid(applicationId) ||
    !reason ||
    reason.length < 10
  ) {
    redirect("/candidatures?erreur=proposition");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ outcome: string; reason: string | null }> | null;
    error: unknown;
  }>;
  const resolved = await rpc("resolve_uncertain_pre_reservation_proposal_send", {
    p_proposal_id: proposalId,
    p_reason: reason,
    p_client_command_id: randomUUID(),
  });
  const result = resolved.data?.[0];
  if (
    resolved.error ||
    !result ||
    !["resolved", "already_resolved"].includes(result.outcome)
  ) {
    redirect(proposalUrl(applicationId, result?.reason ?? "resolution_error"));
  }

  revalidatePath(`/candidatures/${applicationId}`);
  redirect(proposalUrl(applicationId, "confirmed_not_sent"));
}

export async function createDirectCandidateReservationAfterBirth(
  formData: FormData,
) {
  const applicationId = formData.get("application_id");
  const reason = normalizeOptionalText(formData.get("reason"), 500);
  if (
    typeof applicationId !== "string" ||
    !isUuid(applicationId) ||
    !reason ||
    reason.length < 10
  ) {
    redirect("/candidatures?erreur=reservation_directe");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id, updated_at")
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !application) {
    redirect(proposalUrl(applicationId, "direct_error"));
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ outcome: string; reason: string | null }> | null;
    error: unknown;
  }>;
  const created = await rpc("create_direct_candidate_reservation_after_birth", {
    p_application_id: applicationId,
    p_expected_application_updated_at: application.updated_at,
    p_reason: reason,
    p_client_command_id: randomUUID(),
  });
  const result = created.data?.[0];
  if (
    created.error ||
    !result ||
    !["created", "already_created"].includes(result.outcome)
  ) {
    redirect(
      proposalUrl(applicationId, result?.reason ?? result?.outcome ?? "direct_error"),
    );
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  revalidatePath("/reservations");
  redirect(proposalUrl(applicationId, "direct_created"));
}

function parseEuroCents(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100);
}

function parseReceiptDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export async function recordCandidateJourneyPaymentReceipt(formData: FormData) {
  const applicationId = formData.get("application_id");
  const paymentId = formData.get("payment_id");
  const proposalIdValue = formData.get("proposal_id");
  const receivedAmountCents = parseEuroCents(formData.get("received_amount"));
  const receivedAt = parseReceiptDate(formData.get("received_date"));
  const paymentMethod = normalizeOptionalText(formData.get("payment_method"), 50);
  const reference = normalizeOptionalText(formData.get("reference"), 120);
  const exceptionReason = normalizeOptionalText(formData.get("exception_reason"), 500);
  const allowedMethods = new Set([
    "bank_transfer",
    "cash",
    "card",
    "cheque",
    "paypal",
    "stripe",
    "other",
    "unknown",
  ]);
  const proposalId =
    typeof proposalIdValue === "string" && isUuid(proposalIdValue)
      ? proposalIdValue
      : null;

  if (
    typeof applicationId !== "string" ||
    !isUuid(applicationId) ||
    typeof paymentId !== "string" ||
    !isUuid(paymentId) ||
    receivedAmountCents === null ||
    !receivedAt ||
    !paymentMethod ||
    !allowedMethods.has(paymentMethod) ||
    (!proposalId && (!exceptionReason || exceptionReason.length < 10))
  ) {
    redirect(
      typeof applicationId === "string" && isUuid(applicationId)
        ? proposalUrl(applicationId, "payment_invalid")
        : "/candidatures?erreur=paiement",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{
      outcome: string;
      reason: string | null;
      journey_opened: boolean;
    }> | null;
    error: unknown;
  }>;
  const recorded = await rpc("record_candidate_journey_payment_receipt", {
    p_proposal_id: proposalId,
    p_payment_id: paymentId,
    p_received_amount_cents: receivedAmountCents,
    p_received_at: receivedAt,
    p_payment_method: paymentMethod,
    p_reference: reference,
    p_exception_reason: exceptionReason,
    p_client_command_id: randomUUID(),
  });
  const result = recorded.data?.[0];
  if (
    recorded.error ||
    !result ||
    !["partial", "accepted", "already_recorded"].includes(result.outcome)
  ) {
    redirect(proposalUrl(applicationId, result?.reason ?? "payment_error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  revalidatePath("/reservations");
  revalidatePath("/payments");
  redirect(
    proposalUrl(
      applicationId,
      result.journey_opened ? "journey_opened" : "payment_partial",
    ),
  );
}

function litterAttachUrl(litterId: string, outcome: "success" | "error") {
  return `/litters/${litterId}?attach_status=${outcome}#candidatures-liees`;
}

function groupAttachUrl(groupId: string, outcome: "success" | "error") {
  return `/litter-groups/${groupId}?attach_status=${outcome}#candidatures-liees`;
}

/**
 * Rattache une candidature existante à une portée OU à un groupe de portées,
 * depuis la fiche Portée ou la fiche Groupe.
 *
 * - Le contexte (portée ou groupe) est déterminé par le champ présent
 *   (`litter_id` pour une portée, `litter_group_id` pour un groupe).
 * - Rattachement à une portée : desired_litter_id = litter.id,
 *   desired_litter_group_id = litter.litter_group_id (groupe réel de la portée,
 *   source de vérité — aucune valeur de groupe n'est acceptée depuis le client).
 * - Rattachement à un groupe : desired_litter_id = null,
 *   desired_litter_group_id = group.id.
 * - Ne touche pas au statut, ni aux réservations, paiements, animaux, documents.
 */
export async function attachApplicationToScope(formData: FormData) {
  const applicationIdRaw = formData.get("application_id");
  const litterIdRaw = formData.get("litter_id");
  const groupIdRaw = formData.get("litter_group_id");

  const litterId =
    typeof litterIdRaw === "string" &&
    litterIdRaw.trim() &&
    isUuid(litterIdRaw.trim())
      ? litterIdRaw.trim()
      : null;
  const groupId =
    typeof groupIdRaw === "string" &&
    groupIdRaw.trim() &&
    isUuid(groupIdRaw.trim())
      ? groupIdRaw.trim()
      : null;

  // URL de retour selon le contexte d'origine.
  const backUrl = (outcome: "success" | "error") => {
    if (litterId) {
      return litterAttachUrl(litterId, outcome);
    }
    if (groupId) {
      return groupAttachUrl(groupId, outcome);
    }
    return "/litters";
  };

  // Exactement une cible attendue (jamais les deux, jamais aucune).
  if ((litterId && groupId) || (!litterId && !groupId)) {
    redirect(backUrl("error"));
  }

  if (
    typeof applicationIdRaw !== "string" ||
    !applicationIdRaw.trim() ||
    !isUuid(applicationIdRaw.trim())
  ) {
    redirect(backUrl("error"));
  }

  const applicationId = (applicationIdRaw as string).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire la candidature (organisation, non supprimée).
  const { data: application, error: readError } = await supabase
    .from("applications")
    .select(
      "id, organization_id, updated_at, positioning_revision, desired_timing_mode, desired_season, desired_season_year, desired_not_before_date",
    )
    .eq("id", applicationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !application) {
    redirect(backUrl("error"));
  }
  const applicationOrganizationId = (
    application as unknown as { organization_id: string }
  ).organization_id;

  let desiredLitterId: string | null = null;
  let desiredLitterGroupId: string | null = null;

  if (litterId) {
    // Relire la portée (même organisation, non supprimée) ; son groupe fait foi.
    const { data: litter, error: litterError } = await supabase
      .from("litters")
      .select("id, litter_group_id")
      .eq("id", litterId)
      .eq("organization_id", applicationOrganizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (litterError || !litter) {
      redirect(backUrl("error"));
    }

    desiredLitterId = litter.id;
    desiredLitterGroupId = litter.litter_group_id ?? null;
  } else if (groupId) {
    // Relire le groupe (même organisation, non supprimé).
    const { data: group, error: groupError } = await supabase
      .from("litter_groups")
      .select("id")
      .eq("id", groupId)
      .eq("organization_id", applicationOrganizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (groupError || !group) {
      redirect(backUrl("error"));
    }

    desiredLitterId = null;
    desiredLitterGroupId = group.id;
  }

  const applicationPositioning = application as unknown as {
    updated_at: string;
    positioning_revision: number;
    desired_timing_mode: string;
    desired_season: string | null;
    desired_season_year: number | null;
    desired_not_before_date: string | null;
  };
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ outcome: string }> | null;
    error: unknown;
  }>;
  const positioningResult = await rpc("update_candidate_positioning", {
    p_application_id: applicationId,
    p_expected_application_updated_at: applicationPositioning.updated_at,
    p_expected_positioning_revision: applicationPositioning.positioning_revision,
    p_desired_timing_mode: applicationPositioning.desired_timing_mode,
    p_desired_season: applicationPositioning.desired_season,
    p_desired_season_year: applicationPositioning.desired_season_year,
    p_desired_not_before_date: applicationPositioning.desired_not_before_date,
    p_target_litter_id: desiredLitterId,
    p_target_litter_group_id: desiredLitterGroupId,
    p_client_command_id: randomUUID(),
  });
  const positioningOutcome = positioningResult.data?.[0]?.outcome;

  if (
    positioningResult.error ||
    (positioningOutcome !== "updated" && positioningOutcome !== "already_applied")
  ) {
    redirect(backUrl("error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  if (litterId) {
    revalidatePath(`/litters/${litterId}`);
  }
  if (groupId) {
    revalidatePath(`/litter-groups/${groupId}`);
  }

  redirect(backUrl("success"));
}
