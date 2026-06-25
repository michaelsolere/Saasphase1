"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const contactCreateErrorUrl = "/contacts/new?status=error";

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

function buildDisplayName({
  requestedDisplayName,
  firstName,
  lastName,
  email,
  phone,
  secondaryPhone,
  addressLine1,
  postalCode,
  city,
}: {
  requestedDisplayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const addressLabel = [addressLine1, postalCode, city]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    requestedDisplayName ||
    fullName ||
    email ||
    phone ||
    secondaryPhone ||
    addressLabel ||
    "Contact manuel"
  );
}

export async function createContact(formData: FormData) {
  const firstName = normalizeOptionalText(formData.get("first_name"));
  const lastName = normalizeOptionalText(formData.get("last_name"));
  const requestedDisplayName = normalizeOptionalText(
    formData.get("display_name"),
  );
  const email = normalizeOptionalText(formData.get("email"))?.toLowerCase() ?? null;
  const phone = normalizeOptionalText(formData.get("phone"));
  const secondaryPhone = normalizeOptionalText(formData.get("secondary_phone"));
  const addressLine1 = normalizeOptionalText(formData.get("address_line1"));
  const addressLine2 = normalizeOptionalText(formData.get("address_line2"));
  const postalCode = normalizeOptionalText(formData.get("postal_code"));
  const city = normalizeOptionalText(formData.get("city"));
  const country = normalizeOptionalText(formData.get("country"), 2) ?? "FR";
  const hasUsefulContactInformation = Boolean(
    requestedDisplayName ||
      firstName ||
      lastName ||
      email ||
      phone ||
      secondaryPhone ||
      addressLine1 ||
      postalCode ||
      city,
  );

  if (!hasUsefulContactInformation) {
    redirect(contactCreateErrorUrl);
  }

  const displayName = buildDisplayName({
    requestedDisplayName,
    firstName,
    lastName,
    email,
    phone,
    secondaryPhone,
    addressLine1,
    postalCode,
    city,
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
    redirect(contactCreateErrorUrl);
  }

  const { data: contact, error: insertError } = await supabase
    .from("contacts")
    .insert({
      organization_id: membership.organization_id,
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      secondary_phone: secondaryPhone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      postal_code: postalCode,
      city,
      country,
      origin_channel: "manual",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !contact?.id) {
    redirect(contactCreateErrorUrl);
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function createContactNote(formData: FormData) {
  const contactId = formData.get("contact_id");
  const body = formData.get("body");

  if (
    typeof contactId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    if (typeof contactId === "string") {
      redirect(`/contacts/${contactId}?note_status=error`);
    } else {
      redirect("/contacts?erreur=note");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire le contact côté serveur pour récupérer l'organization_id
  const { data: contact, error: readError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .maybeSingle();

  if (readError || !contact || !contact.organization_id) {
    redirect(`/contacts/${contactId}?note_status=error`);
  }

  const { error: insertError } = await supabase
    .from("notes")
    .insert({
      contact_id: contact.id,
      organization_id: contact.organization_id,
      body: body.trim(),
      note_type: "internal",
      visibility: "internal",
      created_by: user.id,
    });

  if (insertError) {
    redirect(`/contacts/${contactId}?note_status=error`);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}?note_status=success`);
}
