"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const allowedLitterGroupStatuses = new Set([
  "planned",
  "open_for_applications",
  "pregnancy_pending",
  "births_in_progress",
  "born",
  "closed",
  "cancelled",
  "archived",
]);

const allowedSpecies = new Set(["dog", "cat"]);

function litterGroupErrorUrl(
  code: "name_required" | "invalid_dates" | "error",
) {
  return `/litter-groups/new?status=${code}`;
}

function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength = 2_000,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeOptionalDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  // Les inputs <input type="date"> produisent un format ISO YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Crée un groupe de portées (période) depuis l'interface Portées.
 *
 * Décisions (Lot 1) :
 *   - `name` obligatoire ; `status` validé ; `species` validé (défaut dog).
 *   - Période optionnelle : si début ET fin sont fournis, la fin ne peut pas
 *     précéder le début.
 *   - `organization_id` résolu via la membership active, jamais depuis le client.
 *   - Aucune portée, réservation, candidature, paiement ou document créés ici.
 */
export async function createLitterGroup(formData: FormData) {
  const name = normalizeOptionalText(formData.get("name"), 255);

  if (!name) {
    redirect(litterGroupErrorUrl("name_required"));
  }

  const rawStatus = formData.get("status");
  const status =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : "planned";

  if (!allowedLitterGroupStatuses.has(status)) {
    redirect(litterGroupErrorUrl("error"));
  }

  const rawSpecies = formData.get("species");
  const species =
    typeof rawSpecies === "string" && allowedSpecies.has(rawSpecies.trim())
      ? rawSpecies.trim()
      : "dog";

  const expectedPeriodStart = normalizeOptionalDate(
    formData.get("expected_period_start"),
  );
  const expectedPeriodEnd = normalizeOptionalDate(
    formData.get("expected_period_end"),
  );

  if (
    expectedPeriodStart &&
    expectedPeriodEnd &&
    expectedPeriodEnd < expectedPeriodStart
  ) {
    redirect(litterGroupErrorUrl("invalid_dates"));
  }

  const description = normalizeOptionalText(formData.get("description"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Résolution de l'organisation via la membership active de l'utilisateur.
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    redirect(litterGroupErrorUrl("error"));
  }

  const { error: insertError } = await supabase.from("litter_groups").insert({
    organization_id: membership.organization_id,
    name,
    status,
    species,
    expected_period_start: expectedPeriodStart,
    expected_period_end: expectedPeriodEnd,
    description,
    created_by: user.id,
    updated_by: user.id,
  });

  if (insertError) {
    redirect(litterGroupErrorUrl("error"));
  }

  revalidatePath("/litters");
  redirect("/litters?group_status=created");
}
