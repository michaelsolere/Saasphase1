import "server-only";

import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function resolvePublicFormOrganization(
  supabase: SupabaseServerClient,
  profileId: string,
) {
  const { organizationSlug } = getSupabaseConfig();
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", organizationSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!organization) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", profileId)
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  return membership ? { ...membership, organization } : null;
}
