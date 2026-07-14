import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CurrentDocumentTemplateOrganization = {
  organizationId: string;
};

export async function resolveCurrentDocumentTemplateOrganization(): Promise<
  CurrentDocumentTemplateOrganization | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    return null;
  }

  return { organizationId: membership.organization_id };
}
