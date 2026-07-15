"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrevoTransactionalTemplateConfig } from "@/features/settings/brevo-template-registry";
import {
  retireActiveOrganizationLogo,
  uploadOrganizationLogo,
} from "@/features/settings/organization-logo-service";
import { testBrevoConnection } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

const settingsPath = "/settings/organization";
const postgresIntegerMax = BigInt("2147483647");
const centsPerEuro = BigInt(100);
const legalForms = new Set(["individual", "earl", "company", "association", "other"]);
const brevoStatuses = new Set([
  "success",
  "not_configured",
  "unauthorized",
  "timeout",
  "error",
]);

function statusUrl(
  key: string,
  outcome: "success" | "error",
  anchor?: string,
) {
  return `${settingsPath}?${key}=${outcome}${anchor ? `#${anchor}` : ""}`;
}

function brandingStatusUrl(outcome: "success" | "removed" | "error") {
  return `${settingsPath}?branding_status=${outcome}#visual-identity`;
}

export async function uploadOrganizationLogoAction(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  const requestedAssetId = normalizeOptionalText(formData.get("asset_id"), 64);
  const assetId = requestedAssetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedAssetId)
    ? requestedAssetId.toLowerCase()
    : undefined;
  const file = formData.get("logo");
  if (!organizationId || !(file instanceof File)) {
    redirect(brandingStatusUrl("error"));
  }
  const result = await uploadOrganizationLogo({ organizationId, file, assetId });
  if (!result.ok) redirect(brandingStatusUrl("error"));
  revalidatePath(settingsPath);
  revalidatePath("/documents/modeles", "layout");
  redirect(brandingStatusUrl("success"));
}

export async function retireOrganizationLogoAction(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  if (!organizationId) redirect(brandingStatusUrl("error"));
  const result = await retireActiveOrganizationLogo(organizationId);
  if (!result.ok) redirect(brandingStatusUrl("error"));
  revalidatePath(settingsPath);
  revalidatePath("/documents/modeles", "layout");
  redirect(brandingStatusUrl("removed"));
}

function animalPricesStatusUrl(outcome: "success" | "error") {
  return statusUrl("animal_prices_status", outcome, "animal-prices");
}

function brevoStatusUrl(outcome: string) {
  return `${settingsPath}?brevo_status=${outcome}`;
}

function brevoTemplatesStatusUrl(outcome: "success" | "error") {
  return `${settingsPath}?brevo_templates_status=${outcome}#brevo-templates`;
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

function parseOptionalPositiveInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { ok: false as const };
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { ok: true as const, value: null };
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return { ok: false as const };
  }

  const numericValue = Number(trimmedValue);
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    return { ok: false as const };
  }

  return { ok: true as const, value: numericValue };
}

function parseOptionalEuroCents(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { ok: false as const };
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { ok: true as const, value: null };
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmedValue)) {
    return { ok: false as const };
  }

  const [euros, decimals = ""] = trimmedValue.replace(",", ".").split(".");
  const cents =
    BigInt(euros) * centsPerEuro + BigInt(decimals.padEnd(2, "0"));

  if (cents > postgresIntegerMax) {
    return { ok: false as const };
  }

  return { ok: true as const, value: Number(cents) };
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

async function requireAdminOrganization(
  organizationId: string,
  errorKey: string,
  errorAnchor?: string,
) {
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
    redirect(statusUrl(errorKey, "error", errorAnchor));
  }

  return { supabase, userId: user.id, organizationId: membership.organization_id };
}

export async function updateOrganizationAnimalPrices(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  const malePrice = parseOptionalEuroCents(formData.get("male_price"));
  const femalePrice = parseOptionalEuroCents(formData.get("female_price"));
  const genericPrice = parseOptionalEuroCents(formData.get("generic_price"));

  if (
    !organizationId ||
    !malePrice.ok ||
    !femalePrice.ok ||
    !genericPrice.ok
  ) {
    redirect(animalPricesStatusUrl("error"));
  }

  const { supabase, userId } = await requireAdminOrganization(
    organizationId,
    "animal_prices_status",
    "animal-prices",
  );

  const { data: updatedSettings, error } = await supabase
    .from("organization_settings")
    .update({
      default_male_puppy_price_cents: malePrice.value,
      default_female_puppy_price_cents: femalePrice.value,
      default_puppy_price_cents: genericPrice.value,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select("organization_id")
    .maybeSingle();

  if (error || !updatedSettings) {
    redirect(animalPricesStatusUrl("error"));
  }

  revalidatePath(settingsPath);
  redirect(animalPricesStatusUrl("success"));
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

export async function updateBrevoTransactionalTemplateId(formData: FormData) {
  const organizationId = normalizeOptionalText(formData.get("organization_id"), 64);
  const templateKey = normalizeOptionalText(formData.get("template_key"), 80);
  const templateConfig = getBrevoTransactionalTemplateConfig(templateKey);
  const brevoTemplateId = parseOptionalPositiveInteger(formData.get("brevo_template_id"));

  if (!organizationId || !templateConfig || !brevoTemplateId.ok) {
    redirect(brevoTemplatesStatusUrl("error"));
  }

  const { supabase, userId } = await requireAdminOrganization(
    organizationId,
    "brevo_templates_status",
  );

  const { error } = await supabase
    .from("email_templates")
    .upsert(
      {
        organization_id: organizationId,
        template_key: templateConfig.templateKey,
        title: templateConfig.title,
        category: templateConfig.category,
        subject: `Registre technique Brevo - ${templateConfig.templateKey}`,
        body: `Registre technique Brevo - ${templateConfig.templateKey}`,
        brevo_template_id: brevoTemplateId.value,
        is_active: true,
        deleted_at: null,
        created_by: userId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,template_key" },
    );

  if (error) {
    redirect(brevoTemplatesStatusUrl("error"));
  }

  revalidatePath(settingsPath);
  redirect(brevoTemplatesStatusUrl("success"));
}

export async function updatePreReservationBrevoTemplateId(formData: FormData) {
  const normalizedFormData = new FormData();
  normalizedFormData.set("organization_id", String(formData.get("organization_id") ?? ""));
  normalizedFormData.set("template_key", "pre_reservation");
  normalizedFormData.set(
    "brevo_template_id",
    String(formData.get("pre_reservation_brevo_template_id") ?? ""),
  );

  await updateBrevoTransactionalTemplateId(normalizedFormData);
}
