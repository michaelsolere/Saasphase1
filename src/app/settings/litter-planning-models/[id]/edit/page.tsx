import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LitterPlanningModelEditor } from "@/features/settings/litter-planning-model-editor";
import { LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE } from "@/features/settings/litter-planning-model-labels";
import { replaceLitterPlanningModelAction } from "@/features/settings/litter-planning-models-actions";
import { loadLitterPlanningModelEditorPage } from "@/features/settings/litter-planning-models-presentation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLitterPlanningModelPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error || !membership.data?.organization_id) {
    notFound();
  }

  const page = await loadLitterPlanningModelEditorPage({
    organizationId: membership.data.organization_id,
    mode: "edit",
    modelId: id,
    supabase,
  });
  if (page.outcome === "error") {
    if (page.code === "unauthenticated") redirect("/login");
    if (page.code === "imported_model") {
      redirect(`/settings/litter-planning-models/${id}`);
    }
    if (page.code === "forbidden") {
      redirect(`/settings/litter-planning-models/${id}`);
    }
    if (page.code === "not_found") notFound();
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10 lg:px-12">
        <section
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
        >
          <h1 className="text-xl font-semibold">
            L’éditeur de modèles n’est pas disponible pour le moment.
          </h1>
        </section>
      </main>
    );
  }

  const saveAction = replaceLitterPlanningModelAction.bind(null, {
    organizationId: page.data.organizationId,
    modelId: id,
    expectedRevision: page.data.draft.expectedRevision ?? 1,
    clientCommandId: randomUUID(),
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl min-w-0 px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={`/settings/litter-planning-models/${id}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Fiche du modèle
        </Link>
        <Link
          href="/settings/litter-planning-models"
          className="text-sm font-medium text-muted hover:text-foreground hover:underline"
        >
          Modèles de planning
        </Link>
      </div>
      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paramètres · Modifier le modèle
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {page.data.draft.title || "Modifier le modèle"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          {LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE}
        </p>
      </header>
      <LitterPlanningModelEditor
        initialDraft={page.data.draft}
        templates={page.data.templates}
        saveAction={saveAction}
        mode="edit"
      />
    </main>
  );
}
