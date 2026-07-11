"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { testBrevoConnection } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

const settingsPath = "/settings/organization";
const legalForms = new Set(["individual", "earl", "company", "association", "other"]);
const brevoStatuses = new Set([
  "success",
  "not_configured",
  "unauthorized",
  "timeout",
  "error",
]);

function statusUrl(key: string, outcome: "success" | "error") {
  return `${settingsPath}?${key}=${outcome}`;
}

function brevoStatusUrl(outcome: string) {
  return `${settingsPath}?brevo_status=${outcome}`;
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

function normalizeOptionalEmail(value: FormDataEntryValue | null) {
  const email = normalizeOptionalText(value, 320)?.toLowerCase() ?? null;
  if (!email) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function normalizeOptionalUrl(value: FormDataEntryValue | null) {
  const url = normalizeOptionalText(value, 500);
  if (!url) {
    return null;
  }

  return /^https?:\/\/[^\s]+$/i.test(url) ? url : undefined;
}

function buildDisplayName({
  requestedDisplayName,
  firstName,
  lastName,
}: {
  requestedDisplayName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return requestedDisplayName || fullName || null;
}

async function requireAdminOrganization(organizationId: string, errorKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (
    error ||
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    redirect(statusUrl(errorKey, "error"));
  }

  return { supabase, userId: user.id, organizationId: membership.organization_id };
}

async function requireCurrentAdminOrganization(errorOutcome: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (
    error ||
    !membership?.organization_id ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    redirect(brevoStatusUrl(errorOutcome));
  }

  return { supabase, userId: user.id, organizationId: membership.organization_id };
}

function normalizeBrevoStatus(value: string) {
  return brevoStatuses.has(value) ? value : "error";
}

export async function updateOrganizationIdentity(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) {
    redirect(statusUrl("identity_status", "error"));
  }

  const name = normalizeOptionalText(formData.get("name"));
  const legalName = normalizeOptionalText(formData.get("legal_name"));
  const legalFormValue = normalizeOptionalText(formData.get("legal_form"), 32);
  const legalForm =
    legalFormValue && legalForms.has(legalFormValue) ? legalFormValue : null;
  const email = normalizeOptionalEmail(formData.get("email"));
  const phone = normalizeOptionalText(formData.get("phone"));
  const websiteUrl = normalizeOptionalUrl(formData.get("website_url"));
  const addressLine1 = normalizeOptionalText(formData.get("address_line1"));
  const addressLine2 = normalizeOptionalText(formData.get("address_line2"));
  const postalCode = normalizeOptionalText(formData.get("postal_code"), 32);
  const city = normalizeOptionalText(formData.get("city"));
  const country = normalizeOptionalText(formData.get("country"), 2) ?? "FR";
  const siret = normalizeOptionalText(formData.get("siret"), 32);
  const affixName = normalizeOptionalText(formData.get("affix_name"));
  const dogAffixName = normalizeOptionalText(formData.get("dog_affix_name"));
  const catAffixName = normalizeOptionalText(formData.get("cat_affix_name"));

  if (!name || email === undefined || websiteUrl === undefined) {
    redirect(statusUrl("identity_status", "error"));
  }

  if (legalFormValue && !legalForm) {
    redirect(statusUrl("identity_status", "error"));
  }

  const { supabase, userId } = await requireAdminOrganization(
    organizationId,
    "identity_status",
  );

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      legal_name: legalName,
      legal_form: legalForm,
      email,
      phone,
      website_url: websiteUrl,
      address_line1: addressLine1,
      address_line2: addressLine2,
      postal_code: postalCode,
      city,
      country,
      siret,
      affix_name: affixName,
      dog_affix_name: dogAffixName,
      cat_affix_name: catAffixName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .is("deleted_at", null);

  if (error) {
    redirect(statusUrl("identity_status", "error"));
  }

  void userId;
  revalidatePath(settingsPath);
  redirect(statusUrl("identity_status", "success"));
}

export async function upsertDefaultRepresentative(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) {
    redirect(statusUrl("representative_status", "error"));
  }

  const firstName = normalizeOptionalText(formData.get("first_name"));
  const lastName = normalizeOptionalText(formData.get("last_name"));
  const requestedDisplayName = normalizeOptionalText(formData.get("display_name"));
  const displayName = buildDisplayName({
    requestedDisplayName,
    firstName,
    lastName,
  });
  const representativeRole = normalizeOptionalText(
    formData.get("representative_role"),
  );
  const email = normalizeOptionalEmail(formData.get("representative_email"));
  const phone = normalizeOptionalText(formData.get("representative_phone"));

  if (!displayName || email === undefined) {
    redirect(statusUrl("representative_status", "error"));
  }

  const { supabase, userId } = await requireAdminOrganization(
    organizationId,
    "representative_status",
  );

  const { data: existingRepresentative, error: readError } = await supabase
    .from("organization_representatives")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default_signatory", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) {
    redirect(statusUrl("representative_status", "error"));
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    representative_role: representativeRole,
    email,
    phone,
    is_default_signatory: true,
    is_active: true,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (existingRepresentative?.id) {
    const { error } = await supabase
      .from("organization_representatives")
      .update(payload)
      .eq("id", existingRepresentative.id)
      .eq("organization_id", organizationId);

    if (error) {
      redirect(statusUrl("representative_status", "error"));
    }
  } else {
    const { error } = await supabase.from("organization_representatives").insert({
      organization_id: organizationId,
      ...payload,
      created_by: userId,
    });

    if (error) {
      redirect(statusUrl("representative_status", "error"));
    }
  }

  revalidatePath(settingsPath);
  redirect(statusUrl("representative_status", "success"));
}

export async function updateOrganizationDocumentSettings(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) {
    redirect(statusUrl("document_settings_status", "error"));
  }

  const mediatorWebsiteUrl = normalizeOptionalUrl(
    formData.get("mediator_website_url"),
  );

  if (mediatorWebsiteUrl === undefined) {
    redirect(statusUrl("document_settings_status", "error"));
  }

  const { supabase, userId } = await requireAdminOrganization(
    organizationId,
    "document_settings_status",
  );

  const { error } = await supabase
    .from("organization_document_settings")
    .upsert(
      {
        organization_id: organizationId,
        mediator_name: normalizeOptionalText(formData.get("mediator_name")),
        mediator_contact: normalizeOptionalText(formData.get("mediator_contact"), 1_000),
        mediator_website_url: mediatorWebsiteUrl,
        deposit_terms: normalizeOptionalText(formData.get("deposit_terms"), 4_000),
        refund_terms: normalizeOptionalText(formData.get("refund_terms"), 4_000),
        postponement_terms: normalizeOptionalText(
          formData.get("postponement_terms"),
          4_000,
        ),
        credit_terms: normalizeOptionalText(formData.get("credit_terms"), 4_000),
        withholding_terms: normalizeOptionalText(
          formData.get("withholding_terms"),
          4_000,
        ),
        reservation_contract_terms: normalizeOptionalText(
          formData.get("reservation_contract_terms"),
          6_000,
        ),
        commitment_certificate_text: normalizeOptionalText(
          formData.get("commitment_certificate_text"),
          6_000,
        ),
        legal_mentions: normalizeOptionalText(formData.get("legal_mentions"), 6_000),
        signature_city_default: normalizeOptionalText(
          formData.get("signature_city_default"),
        ),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );

  if (error) {
    redirect(statusUrl("document_settings_status", "error"));
  }

  revalidatePath(settingsPath);
  redirect(statusUrl("document_settings_status", "success"));
}

export async function testOrganizationBrevoConnection() {
  const { userId, organizationId } = await requireCurrentAdminOrganization("error");
  const result = await testBrevoConnection();

  void userId;
  void organizationId;

  if (result.ok) {
    revalidatePath(settingsPath);
    redirect(brevoStatusUrl("success"));
  }

  revalidatePath(settingsPath);
  redirect(
    brevoStatusUrl(
      normalizeBrevoStatus(result.reason === "api_error" ? "error" : result.reason),
    ),
  );
}
