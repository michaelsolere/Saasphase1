import { createClient } from "@/lib/supabase/server";

export const CONTACT_JOURNEY_ROLES = [
  "candidate",
  "pre_reservation_holder",
  "reservation_holder",
  "adopter",
  "former_adopter",
] as const;

export const CONTACT_COMPLEMENTARY_ROLES = [
  "stud_owner",
  "veterinarian",
  "partner_breeder",
  "mediation_organization",
  "supplier",
  "other",
] as const;

export const CONTACT_COMPATIBILITY_ROLES = ["prospect"] as const;

export const CONTACT_ROLES = [
  ...CONTACT_COMPATIBILITY_ROLES,
  ...CONTACT_JOURNEY_ROLES,
  ...CONTACT_COMPLEMENTARY_ROLES,
] as const;

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  prospect: "Non attribué",
  candidate: "Candidat",
  pre_reservation_holder: "Titulaire de pré-réservation",
  reservation_holder: "Titulaire de réservation",
  adopter: "Adoptant",
  former_adopter: "Ancien adoptant",
  stud_owner: "Propriétaire d'étalon",
  veterinarian: "Vétérinaire",
  partner_breeder: "Éleveur partenaire",
  mediation_organization: "Organisme de médiation",
  supplier: "Fournisseur",
  other: "Autre",
};

export type ContactJourneyRole = (typeof CONTACT_JOURNEY_ROLES)[number];
export type ContactComplementaryRole =
  (typeof CONTACT_COMPLEMENTARY_ROLES)[number];
export type ContactCompatibilityRole =
  (typeof CONTACT_COMPATIBILITY_ROLES)[number];
export type ContactRole = (typeof CONTACT_ROLES)[number];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const contactRoleSet = new Set<string>(CONTACT_ROLES);
const journeyRoleSet = new Set<string>(CONTACT_JOURNEY_ROLES);
const complementaryRoleSet = new Set<string>(CONTACT_COMPLEMENTARY_ROLES);

export function isContactRole(value: string | null): value is ContactRole {
  return Boolean(value && contactRoleSet.has(value));
}

export function isContactJourneyRole(
  value: string | null,
): value is ContactJourneyRole {
  return Boolean(value && journeyRoleSet.has(value));
}

export function isContactComplementaryRole(
  value: string | null,
): value is ContactComplementaryRole {
  return Boolean(value && complementaryRoleSet.has(value));
}

export const CONTACT_ROLE_FORM_OPTIONS = [
  ...CONTACT_JOURNEY_ROLES,
  ...CONTACT_COMPLEMENTARY_ROLES,
] as const;

export async function addActiveContactRoleIfAbsent({
  supabase,
  organizationId,
  contactId,
  role,
  userId,
  now = new Date().toISOString(),
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  contactId: string;
  role: ContactRole;
  userId: string;
  now?: string;
}) {
  const { data: existingRole, error: existingRoleError } = await supabase
    .from("contact_roles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("role", role)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingRoleError) {
    return {
      existingRole: null,
      wasAdded: false,
      duplicateConflict: false,
      error: existingRoleError,
    };
  }

  if (existingRole) {
    return {
      existingRole,
      wasAdded: false,
      duplicateConflict: false,
      error: null,
    };
  }

  const { error: roleInsertError } = await supabase
    .from("contact_roles")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      role,
      started_at: now.slice(0, 10),
      is_active: true,
      created_by: userId,
      updated_by: userId,
    });

  if (roleInsertError) {
    return {
      existingRole: null,
      wasAdded: false,
      duplicateConflict: roleInsertError.code === "23505",
      error: roleInsertError.code === "23505" ? null : roleInsertError,
    };
  }

  return {
    existingRole: null,
    wasAdded: true,
    duplicateConflict: false,
    error: null,
  };
}

export async function deactivateActiveContactRoles({
  supabase,
  organizationId,
  contactId,
  roles,
  userId,
  now = new Date().toISOString(),
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  contactId: string;
  roles: ContactRole | ContactRole[];
  userId: string;
  now?: string;
}) {
  const roleList = Array.isArray(roles) ? roles : [roles];

  for (const role of roleList) {
    const { error } = await supabase
      .from("contact_roles")
      .update({
        is_active: false,
        ended_at: now.slice(0, 10),
        updated_at: now,
        updated_by: userId,
      })
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("role", role)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (error) {
      return { error };
    }
  }

  return { error: null };
}

export function prepareContactJourneyRolePromotion(to: ContactJourneyRole) {
  const rolesToDeactivate = CONTACT_JOURNEY_ROLES.filter(
    (role) => role !== to,
  );

  return {
    roleToActivate: to,
    rolesToDeactivate,
  };
}

export async function promoteContactJourneyRole({
  supabase,
  organizationId,
  contactId,
  role,
  userId,
  now = new Date().toISOString(),
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  contactId: string;
  role: ContactJourneyRole;
  userId: string;
  now?: string;
}) {
  const promotion = prepareContactJourneyRolePromotion(role);
  const activationResult = await addActiveContactRoleIfAbsent({
    supabase,
    organizationId,
    contactId,
    role: promotion.roleToActivate,
    userId,
    now,
  });

  if (activationResult.error) {
    return {
      ...activationResult,
      deactivationError: null,
    };
  }

  const deactivationResult = await deactivateActiveContactRoles({
    supabase,
    organizationId,
    contactId,
    roles: promotion.rolesToDeactivate,
    userId,
    now,
  });

  return {
    ...activationResult,
    deactivationError: deactivationResult.error,
  };
}
