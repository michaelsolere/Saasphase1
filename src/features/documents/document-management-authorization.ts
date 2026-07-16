import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type DocumentOrganizationRole = "owner" | "admin" | "member" | "viewer";

type AuthorizationResult =
  | {
      outcome: "authorized";
      userId: string;
      role: DocumentOrganizationRole;
    }
  | { outcome: "unauthenticated" }
  | { outcome: "forbidden" }
  | { outcome: "database_error"; details: unknown };

function isOrganizationRole(value: string): value is DocumentOrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

export async function authorizeDocumentOrganization(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  allowedRoles?: readonly DocumentOrganizationRole[],
): Promise<AuthorizationResult> {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return { outcome: "unauthenticated" };

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membership.error) {
    return { outcome: "database_error", details: membership.error };
  }

  if (
    !membership.data ||
    !isOrganizationRole(membership.data.role) ||
    (allowedRoles && !allowedRoles.includes(membership.data.role))
  ) {
    return { outcome: "forbidden" };
  }

  return {
    outcome: "authorized",
    userId: auth.data.user.id,
    role: membership.data.role,
  };
}
