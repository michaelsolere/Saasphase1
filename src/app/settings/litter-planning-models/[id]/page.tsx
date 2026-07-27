import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE } from "@/features/settings/litter-planning-model-labels";
import { LitterPlanningModelDetailView } from "@/features/settings/litter-planning-model-detail";
import {
  duplicateLitterPlanningModelAction,
  setLitterPlanningModelActiveAction,
} from "@/features/settings/litter-planning-models-actions";
import { loadLitterPlanningModelDetail } from "@/features/settings/litter-planning-models-presentation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LitterPlanningModelDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const result = await loadLitterPlanningModelDetail(id, supabase);
  if (result.outcome === "error") {
    if (result.code === "unauthenticated") redirect("/login");
    if (result.code === "not_found") notFound();
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10 lg:px-12">
        <section
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
        >
          <h1 className="text-xl font-semibold">
            Les modèles de planning ne sont pas disponibles pour le moment.
          </h1>
        </section>
      </main>
    );
  }

  const membership = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const writeActions =
    result.canManage && membership.data?.organization_id
      ? {
          model: {
            id: result.model.id,
            title: result.model.title,
            description: result.model.description,
            isActive: result.model.isActive,
            statusLabel: result.model.statusLabel,
            speciesLabel: result.model.speciesLabel,
            breedLabel: result.model.breedLabel,
            revision: result.model.revision,
            itemCount: result.model.items.length,
            originLabel: result.model.originLabel,
            libraryOriginDetail: result.model.libraryOriginDetail,
            isLibraryImport: result.model.isLibraryImport,
            canEditDirectly: result.model.canEditDirectly,
          },
          activeAction: setLitterPlanningModelActiveAction.bind(null, {
            modelId: result.model.id,
            expectedRevision: result.model.revision,
            clientCommandId: randomUUID(),
            isActive: !result.model.isActive,
          }),
          duplicateAction: duplicateLitterPlanningModelAction.bind(null, {
            organizationId: membership.data.organization_id,
            sourceModelId: result.model.id,
            clientCommandId: randomUUID(),
          }),
        }
      : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl min-w-0 px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/settings/litter-planning-models"
          className="text-sm font-medium text-accent hover:underline"
        >
          Modèles de planning
        </Link>
        <Link
          href="/settings/organization"
          className="text-sm font-medium text-muted hover:text-foreground hover:underline"
        >
          Paramètres de l’organisation
        </Link>
      </div>
      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paramètres · Fiche modèle
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {result.model.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          {LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE}
        </p>
      </header>
      <LitterPlanningModelDetailView
        model={result.model}
        writeActions={writeActions}
      />
    </main>
  );
}
