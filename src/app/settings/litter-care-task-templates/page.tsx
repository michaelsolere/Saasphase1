import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listLitterCareTaskLibrary,
  listLitterCareTaskTemplatesForOrganization,
} from "@/features/litter-journal/litter-care-tasks";
import {
  createLitterCareTaskTemplateAction,
  importLitterCareTaskLibraryTemplatesAction,
  setLitterCareTaskTemplateActiveAction,
  updateLitterCareTaskTemplateAction,
} from "@/features/settings/litter-care-task-templates-actions";
import {
  LitterCareTaskLibrary,
  LitterCareTaskLibraryUnavailable,
} from "@/features/settings/litter-care-task-library";
import {
  LitterCareTaskTemplatesManager,
  type LitterCareTaskTemplateWriteActions,
} from "@/features/settings/litter-care-task-templates-manager";
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
      </div>
      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paramètres · Jalons de portée
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Jalons de suivi des portées
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Créez vos propres jalons ou importez des modèles recommandés, puis
          choisissez explicitement ceux à générer depuis le Journal des portées.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Importer, activer ou modifier un modèle ne crée et ne modifie aucune
          tâche existante.
        </p>
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
          Les modèles de jalons ne sont pas disponibles pour le moment.
        </h2>
        <p className="mt-2 text-sm">Réessayez dans quelques instants.</p>
      </section>
    </main>
  );
}

export default async function LitterCareTaskTemplatesPage() {
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

  const [result, libraryResult] = await Promise.all([
    listLitterCareTaskTemplatesForOrganization({
      organizationId: membership.data.organization_id,
    }),
    listLitterCareTaskLibrary({
      organizationId: membership.data.organization_id,
    }),
  ]);
  if (result.outcome === "error") return <UnavailableState />;

  const canEdit = result.role === "owner" || result.role === "admin";
  const createAction = canEdit
    ? createLitterCareTaskTemplateAction.bind(null, {
        organizationId: membership.data.organization_id,
        clientCommandId: randomUUID(),
      })
    : null;
  const importAction =
    canEdit && libraryResult.outcome === "success"
      ? importLitterCareTaskLibraryTemplatesAction.bind(null, {
          organizationId: membership.data.organization_id,
          clientCommandId: randomUUID(),
        })
      : null;
  const templateActions: LitterCareTaskTemplateWriteActions[] = canEdit
    ? result.templates.map((template) => ({
        template,
        updateAction: updateLitterCareTaskTemplateAction.bind(null, {
          templateId: template.id,
          expectedRevision: template.revision,
          clientCommandId: randomUUID(),
        }),
        activeAction: setLitterCareTaskTemplateActiveAction.bind(null, {
          templateId: template.id,
          expectedRevision: template.revision,
          clientCommandId: randomUUID(),
          isActive: !template.isActive,
        }),
      }))
    : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl min-w-0 px-6 py-10 sm:px-10 lg:px-12">
      <PageHeader />
      {libraryResult.outcome === "success" ? (
        <LitterCareTaskLibrary
          packs={libraryResult.packs}
          templates={libraryResult.templates}
          importAction={importAction}
        />
      ) : (
        <LitterCareTaskLibraryUnavailable />
      )}
      <section aria-labelledby="organization-templates-heading" className="mt-14">
        <div className="border-b pb-5">
          <h2 id="organization-templates-heading" className="text-2xl font-semibold">
            Mes modèles
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Créez, adaptez et activez les jalons propres à votre organisation.
          </p>
        </div>
        <LitterCareTaskTemplatesManager
          templates={result.templates}
          createAction={createAction}
          templateActions={templateActions}
        />
      </section>
    </main>
  );
}
