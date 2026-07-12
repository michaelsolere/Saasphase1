"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  normalizePhoneForComparison,
  normalizeOptionalText,
  readContactEditableValues,
  type ContactEditableValues,
} from "@/features/contacts/contact-form-core";
import { createClient } from "@/lib/supabase/server";
import {
  addActiveContactRoleIfAbsent,
  isContactComplementaryRole,
  isContactRole,
} from "@/features/contacts/roles";

const contactCreateErrorUrl = "/contacts/new?status=error";

export async function createContact(formData: FormData) {
  const validatedContact = readContactEditableValues(formData);
  const initialRole = normalizeOptionalText(formData.get("initial_role"));

  if (!validatedContact.ok) {
    redirect(contactCreateErrorUrl);
  }

  if (initialRole && !isContactComplementaryRole(initialRole)) {
    redirect(contactCreateErrorUrl);
  }

  const { values, displayName } = validatedContact;

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
      contact_type: values.contactType,
      display_name: displayName,
      first_name: values.firstName,
      last_name: values.lastName,
      family_or_structure_name: values.familyOrStructureName,
      email: values.email,
      phone: values.phone,
      secondary_phone: values.secondaryPhone,
      address_line1: values.addressLine1,
      address_line2: values.addressLine2,
      postal_code: values.postalCode,
      city: values.city,
      country: values.country,
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
    .is("deleted_at", null)
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
  const normalizedFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    normalizedFormData.append(key, value);
  }
  normalizedFormData.set("contact_type", "person");

  const validatedContact = readContactEditableValues(normalizedFormData);

  if (!validatedContact.ok) {
    redirect(quickContactErrorUrl);
  }

  const { values, displayName } = validatedContact;

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
      contact_type: values.contactType,
      display_name: displayName,
      first_name: values.firstName,
      last_name: values.lastName,
      family_or_structure_name: values.familyOrStructureName,
      email: values.email,
      phone: values.phone,
      secondary_phone: values.secondaryPhone,
      address_line1: values.addressLine1,
      address_line2: values.addressLine2,
      postal_code: values.postalCode,
      city: values.city,
      country: values.country,
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

type DuplicateContactWarning = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  reasons: ("email" | "phone")[];
};

export type ContactEditActionState = {
  status: "idle" | "error" | "duplicate_warning";
  message?: string;
  fields?: Record<string, string>;
  duplicateContacts?: DuplicateContactWarning[];
};

const writableMembershipRoles = ["owner", "admin", "member"];

function contactEditFieldsFromValues(values: ContactEditableValues) {
  return {
    contact_type: values.contactType,
    first_name: values.firstName ?? "",
    last_name: values.lastName ?? "",
    family_or_structure_name: values.familyOrStructureName ?? "",
    display_name: values.requestedDisplayName ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    secondary_phone: values.secondaryPhone ?? "",
    address_line1: values.addressLine1 ?? "",
    address_line2: values.addressLine2 ?? "",
    postal_code: values.postalCode ?? "",
    city: values.city ?? "",
    country: values.country,
  };
}

function contactEditError(
  message: string,
  fields?: Record<string, string>,
): ContactEditActionState {
  return { status: "error", message, fields };
}

export async function updateContact(
  _previousState: ContactEditActionState,
  formData: FormData,
): Promise<ContactEditActionState> {
  const contactId = normalizeOptionalText(formData.get("contact_id"));
  const validatedContact = readContactEditableValues(formData);

  if (!contactId || !validatedContact.ok) {
    const fields = validatedContact.ok
      ? contactEditFieldsFromValues(validatedContact.values)
      : undefined;
    const message =
      !validatedContact.ok && validatedContact.code === "invalid_email"
        ? "L’adresse e-mail est invalide."
        : !validatedContact.ok && validatedContact.code === "invalid_phone"
          ? "Un numéro de téléphone est manifestement invalide."
          : !validatedContact.ok && validatedContact.code === "empty_contact"
            ? "Le contact doit conserver au moins une information utile."
            : "Impossible d’enregistrer le contact. Vérifiez les informations saisies.";

    return contactEditError(message, fields);
  }

  const { values, displayName } = validatedContact;
  const fields = contactEditFieldsFromValues(values);
  const duplicateOverride = formData.get("confirm_duplicates") === "1";
  const emailChangeConfirmed = formData.get("confirm_email_change") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", writableMembershipRoles)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    return contactEditError("Vous n’êtes pas autorisé à modifier ce contact.", fields);
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, organization_id, email")
    .eq("id", contactId)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contact) {
    return contactEditError("Contact introuvable ou inaccessible.", fields);
  }

  if ((contact.email ?? null) !== values.email && !emailChangeConfirmed) {
    return contactEditError(
      "Le changement ou retrait d’e-mail doit être confirmé explicitement.",
      fields,
    );
  }

  if (!duplicateOverride) {
    const requestedPhones = [
      normalizePhoneForComparison(values.phone),
      normalizePhoneForComparison(values.secondaryPhone),
    ].filter(Boolean);
    const { data: possibleDuplicates, error: duplicateError } = await supabase
      .from("contacts")
      .select("id, display_name, email, phone, secondary_phone")
      .eq("organization_id", contact.organization_id)
      .neq("id", contact.id)
      .is("deleted_at", null);

    if (duplicateError) {
      return contactEditError(
        "Impossible de vérifier les doublons pour le moment.",
        fields,
      );
    }

    const duplicates = (possibleDuplicates ?? [])
      .map((candidate) => {
        const candidatePhones = [
          normalizePhoneForComparison(candidate.phone),
          normalizePhoneForComparison(candidate.secondary_phone),
        ].filter(Boolean);
        const reasons: ("email" | "phone")[] = [];

        if (values.email && candidate.email?.toLowerCase() === values.email) {
          reasons.push("email");
        }

        if (
          requestedPhones.length > 0 &&
          candidatePhones.some((phone) => requestedPhones.includes(phone))
        ) {
          reasons.push("phone");
        }

        return reasons.length
          ? {
              id: candidate.id,
              displayName: candidate.display_name,
              email: candidate.email,
              phone: candidate.phone,
              secondaryPhone: candidate.secondary_phone,
              reasons,
            }
          : null;
      })
      .filter(Boolean) as DuplicateContactWarning[];

    if (duplicates.length > 0) {
      return {
        status: "duplicate_warning",
        message:
          "Un ou plusieurs contacts semblent déjà utiliser cet e-mail ou ce téléphone.",
        fields,
        duplicateContacts: duplicates,
      };
    }
  }

  const { error: updateError } = await supabase
    .from("contacts")
    .update({
      contact_type: values.contactType,
      first_name: values.firstName,
      last_name: values.lastName,
      family_or_structure_name: values.familyOrStructureName,
      display_name: displayName,
      email: values.email,
      phone: values.phone,
      secondary_phone: values.secondaryPhone,
      address_line1: values.addressLine1,
      address_line2: values.addressLine2,
      postal_code: values.postalCode,
      city: values.city,
      country: values.country,
      updated_by: user.id,
    })
    .eq("id", contact.id)
    .eq("organization_id", contact.organization_id)
    .is("deleted_at", null);

  if (updateError) {
    return contactEditError("Impossible d’enregistrer le contact pour le moment.", fields);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contact.id}`);
  redirect(`/contacts/${contact.id}?contact_status=updated`);
}
