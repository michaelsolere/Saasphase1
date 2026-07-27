import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";

import { LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE } from "@/features/settings/litter-planning-model-labels";
import {
  duplicateLitterPlanningModelAction,
  importLitterPlanningModelLibraryModelsAction,
  setLitterPlanningModelActiveAction,
} from "@/features/settings/litter-planning-models-actions";
import {
  LitterPlanningModelsLibrary,
  LitterPlanningModelsLibraryUnavailable,
} from "@/features/settings/litter-planning-models-library";
import {
  LitterPlanningModelsManager,
  LitterPlanningModelsOrganizationUnavailable,
  type LitterPlanningModelWriteActions,
} from "@/features/settings/litter-planning-models-manager";
import { loadLitterPlanningModelsSettingsPage } from "@/features/settings/litter-planning-models-presentation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function PageHeader() {
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
        <Link
          href="/settings/organization"
          className="text-sm font-medium text-muted hover:text-foreground hover:underline"
        >
          Paramètres de l’organisation
        </Link>
        <Link
          href="/settings/litter-care-task-templates"
          className="text-sm font-medium text-muted hover:text-foreground hover:underline"
        >
          Jalons de suivi des portées
        </Link>
      </div>
      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paramètres · Modèles de planning
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Modèles de planning des portées
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Importez des modèles recommandés et choisissez les modèles disponibles
          pour les prochaines portées.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          {LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE}
        </p>
        <aside className="mt-5 max-w-3xl rounded-2xl border bg-surface px-4 py-4 text-sm leading-6 text-muted">
          <p>
            Les jalons de suivi sont les éléments réutilisables. Les modèles de
            planning assemblent plusieurs jalons, tâches, périodes et suivis.
          </p>
          <p className="mt-2">
            <Link
              href="/settings/litter-care-task-templates"
              className="font-medium text-accent hover:underline"
            >
              Ouvrir la bibliothèque des jalons de suivi
            </Link>
          </p>
        </aside>
      </header>
    </>
  );
}

function UnavailableState() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10 lg:px-12">
      <PageHeader />
      <section
        role="alert"
        className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
      >
        <h2 className="text-xl font-semibold">
          Les modèles de planning ne sont pas disponibles pour le moment.
        </h2>
        <p className="mt-2 text-sm">Réessayez dans quelques instants.</p>
      </section>
    </main>
  );
}

export default async function LitterPlanningModelsPage() {
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
    return <UnavailableState />;
  }

  const organizationId = membership.data.organization_id;

  const page = await loadLitterPlanningModelsSettingsPage(
    organizationId,
    supabase,
  );
  if (page.outcome === "error") return <UnavailableState />;

  const importAction =
    page.canManage && page.library.outcome === "success"
      ? importLitterPlanningModelLibraryModelsAction.bind(null, {
          organizationId,
          clientCommandId: randomUUID(),
        })
      : null;

  const modelActions: LitterPlanningModelWriteActions[] =
    page.canManage && page.organization.outcome === "success"
      ? page.organization.models.map((model) => ({
          model,
          activeAction: setLitterPlanningModelActiveAction.bind(null, {
            modelId: model.id,
            expectedRevision: model.revision,
            clientCommandId: randomUUID(),
            isActive: !model.isActive,
          }),
          duplicateAction: duplicateLitterPlanningModelAction.bind(null, {
            organizationId,
            sourceModelId: model.id,
            clientCommandId: randomUUID(),
          }),
        }))
      : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl min-w-0 px-6 py-10 sm:px-10 lg:px-12">
      <PageHeader />
      {page.library.outcome === "success" ? (
        <LitterPlanningModelsLibrary
          models={page.library.models}
          importAction={importAction}
        />
      ) : (
        <LitterPlanningModelsLibraryUnavailable />
      )}
      <section
        aria-labelledby="organization-planning-models-heading"
        className="mt-14"
      >
        <div className="border-b pb-5">
          <h2
            id="organization-planning-models-heading"
            className="text-2xl font-semibold"
          >
            Mes modèles
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Consultez les modèles de votre organisation, leur origine et leur
            disponibilité pour les prochaines portées.
          </p>
        </div>
        {page.organization.outcome === "success" ? (
          <LitterPlanningModelsManager
            models={page.organization.models}
            modelActions={modelActions}
            canManage={page.canManage}
          />
        ) : (
          <LitterPlanningModelsOrganizationUnavailable />
        )}
      </section>
    </main>
  );
}
