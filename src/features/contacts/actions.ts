"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addActiveContactRoleIfAbsent,
  isContactComplementaryRole,
  isContactRole,
} from "@/features/contacts/roles";

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
  const initialRole = normalizeOptionalText(formData.get("initial_role"));
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

  if (initialRole && !isContactComplementaryRole(initialRole)) {
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

  if (initialRole && isContactComplementaryRole(initialRole)) {
    const roleResult = await addActiveContactRoleIfAbsent({
      supabase,
      organizationId: membership.organization_id,
      contactId: contact.id,
      role: initialRole,
      userId: user.id,
    });

    if (roleResult.error) {
      revalidatePath("/contacts");
      revalidatePath(`/contacts/${contact.id}`);
      redirect(`/contacts/${contact.id}?role_status=error`);
    }
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contact.id}`);
  redirect(`/contacts/${contact.id}`);
}

export async function addContactRole(formData: FormData) {
  const contactId = normalizeOptionalText(formData.get("contact_id"));
  const role = normalizeOptionalText(formData.get("role"));
  const errorUrl = contactId
    ? `/contacts/${contactId}?role_status=error`
    : "/contacts?erreur=role";

  if (!contactId || !isContactRole(role) || !isContactComplementaryRole(role)) {
    redirect(errorUrl);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contact?.organization_id) {
    redirect(errorUrl);
  }

  const roleResult = await addActiveContactRoleIfAbsent({
    supabase,
    organizationId: contact.organization_id,
    contactId: contact.id,
    role,
    userId: user.id,
  });

  if (roleResult.error) {
    redirect(errorUrl);
  }

  if (roleResult.existingRole || roleResult.duplicateConflict) {
    redirect(`/contacts/${contact.id}?role_status=already_exists`);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contact.id}`);
  redirect(`/contacts/${contact.id}?role_status=created`);
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

// ---------------------------------------------------------------------------
// Création rapide de contact depuis le flux /reservations/new
// ---------------------------------------------------------------------------

const quickContactErrorUrl = "/reservations/new?quick_contact_status=error";

/**
 * Crée un contact rapide directement depuis `/reservations/new`, puis renvoie
 * sur la même page avec le nouveau contact pré-sélectionné.
 *
 * Réutilise la même logique de validation que `createContact` :
 *   - au moins une information utile est requise ;
 *   - `organization_id` résolu via la membership active (jamais depuis le client) ;
 *   - `origin_channel = "manual"`.
 *
 * Volontairement plus léger que `createContact` :
 *   - pas de rôle initial (aucune sélection de rôle dans le formulaire rapide) ;
 *   - aucune candidature, réservation, note, paiement ou document automatique ;
 *   - aucun contact existant n'est modifié ; aucune fusion.
 */
export async function createContactQuickForReservation(formData: FormData) {
  const firstName = normalizeOptionalText(formData.get("first_name"));
  const lastName = normalizeOptionalText(formData.get("last_name"));
  const requestedDisplayName = normalizeOptionalText(
    formData.get("display_name"),
  );
  const email =
    normalizeOptionalText(formData.get("email"))?.toLowerCase() ?? null;
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
    redirect(quickContactErrorUrl);
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
    redirect(quickContactErrorUrl);
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
    redirect(quickContactErrorUrl);
  }

  revalidatePath("/contacts");
  revalidatePath("/reservations/new");
  redirect(`/reservations/new?contact_id=${contact.id}&contact_created=1`);
}
