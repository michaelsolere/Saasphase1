import { redirect } from "next/navigation";

import {
  changePublicFormLifecycle,
  savePublicFormDraft,
} from "@/features/public-forms/actions";
import { getPublicFormCapabilities } from "@/features/public-forms/core";
import {
  PublicFormAdministration,
  type PublicFormAdministrationModel,
  type PublicFormHistoryRow,
} from "@/features/public-forms/public-form-administration";
import { resolvePublicFormOrganization } from "@/features/public-forms/server-context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const feedbackByStatus = {
  saved: { tone: "success", message: "Le brouillon a été enregistré." },
  published: { tone: "success", message: "Le formulaire public a été publié." },
  withdrawn: { tone: "success", message: "Le formulaire public a été retiré. Son adresse reste stable." },
  reactivated: { tone: "success", message: "Le formulaire public est de nouveau disponible." },
  stale: { tone: "warning", message: "Le formulaire a été modifié ailleurs. Rechargez la page avant de recommencer." },
  invalid: { tone: "error", message: "Certains champs sont incomplets ou invalides." },
  error: { tone: "error", message: "L’opération n’a pas abouti. Aucune modification n’a été enregistrée." },
} as const;

export default async function PublicFormSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const feedback = status && status in feedbackByStatus
    ? feedbackByStatus[status as keyof typeof feedbackByStatus]
    : undefined;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const membership = await resolvePublicFormOrganization(supabase, userData.user.id);
  if (!membership?.organization_id) redirect("/");
  const { data: formRow } = await supabase
    .from("public_forms")
    .select("id,name,slug,title,description,success_message,breed,lifecycle_status,draft_revision,published_version_id")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  const form = formRow as unknown as {
    id: string;
    name: string;
    slug: string;
    title: string | null;
    description: string | null;
    success_message: string | null;
    breed: string;
    lifecycle_status: "draft" | "published" | "withdrawn";
    draft_revision: number;
    published_version_id: string | null;
  } | null;

  let publishedVersionNo: number | null = null;
  let history: PublicFormHistoryRow[] = [];
  if (form) {
    const { data: versionRow } = form.published_version_id
      ? await supabase
          .from("public_form_versions" as never)
          .select("version_no" as never)
          .eq("id" as never, form.published_version_id)
          .maybeSingle()
      : { data: null };
    publishedVersionNo = (versionRow as unknown as { version_no: number } | null)?.version_no ?? null;

    const { data: historyRows } = (await supabase.rpc(
      "list_standard_public_form_history" as never,
      { p_public_form_id: form.id } as never,
    )) as unknown as { data: PublicFormHistoryRow[] | null };
    history = historyRows ?? [];
  }

  const role = membership?.role ?? "viewer";
  const capabilities = getPublicFormCapabilities(role);
  const model: PublicFormAdministrationModel | null = form
    ? {
        id: form.id,
        internalName: form.name,
        slug: form.slug,
        title: form.title ?? "",
        description: form.description ?? "",
        successMessage: form.success_message ?? "",
        breed: form.breed,
        lifecycleStatus: form.lifecycle_status,
        draftRevision: form.draft_revision,
        publishedVersionNo,
      }
    : null;

  return (
    <PublicFormAdministration
      canManage={capabilities.canEdit}
      canShare={capabilities.canShare}
      organizationSlug={membership.organization.slug}
      form={model}
      history={history}
      feedback={feedback}
      saveAction={savePublicFormDraft}
      lifecycleAction={changePublicFormLifecycle}
    />
  );
}
