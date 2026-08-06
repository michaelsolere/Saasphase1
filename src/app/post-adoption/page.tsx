import Link from "next/link";
import { redirect } from "next/navigation";

import { readPostAdoptionAutomationDashboard } from "@/features/post-adoption-questionnaire/automated-delivery-admin";
import { PostAdoptionAutomatedDeliveryDashboard } from "@/features/post-adoption-questionnaire/automated-delivery-dashboard";
import { listPostAdoptionResultsRows } from "@/features/post-adoption-questionnaire/internal-service";
import { buildPostAdoptionResultsOverview } from "@/features/post-adoption-questionnaire/results-model";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function coverageLabel(milestone: "T1" | "T2", received: number, concerned: number) {
  return `${milestone} : ${received} questionnaire${received > 1 ? "s" : ""} reçu${received > 1 ? "s" : ""} pour ${concerned} chiot${concerned > 1 ? "s" : ""} concerné${concerned > 1 ? "s" : ""}`;
}

export default async function PostAdoptionPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; automation?: string; exception?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const automationDashboard = await readPostAdoptionAutomationDashboard(
    params.organization ?? null,
    supabase,
  ).catch(() => null);
  const rows = automationDashboard?.organizationId
    ? await listPostAdoptionResultsRows(automationDashboard.organizationId, null, supabase).catch(() => null)
    : null;
  const overview = rows ? buildPostAdoptionResultsOverview(rows) : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Résultats
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Suivi post-adoption
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Retrouvez les questionnaires reçus pour les chiots adoptés, portée par portée.
        </p>
      </header>

      {automationDashboard ? (
        <PostAdoptionAutomatedDeliveryDashboard
          dashboard={automationDashboard}
          automationStatus={params.automation}
          exceptionStatus={params.exception}
        />
      ) : (
        <p role="alert" className="border-b py-6 text-sm text-amber-900">
          Le pilotage des invitations automatiques ne peut pas être chargé. Les résultats restent consultables ci-dessous.
        </p>
      )}

      {automationDashboard?.organizationId ? (
      <section className="py-8" aria-labelledby="post-adoption-litters-heading">
        <h2 id="post-adoption-litters-heading" className="text-xl font-semibold">
          Portées avec des chiots adoptés
        </h2>
        {!overview ? (
          <p role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            Impossible de charger le suivi post-adoption. Aucune donnée n’a été modifiée.
          </p>
        ) : overview.litters.length === 0 ? (
          <p className="mt-6 rounded-2xl border bg-surface p-6 text-muted">
            Aucun chiot adopté n’est encore concerné.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {overview.litters.map((litter) => (
              <li key={litter.id}>
                <Link
                  href={`/post-adoption/litters/${litter.id}`}
                  className="block rounded-2xl border bg-surface p-5 transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{litter.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {litter.coverage.concernedAnimals} chiot{litter.coverage.concernedAnimals > 1 ? "s" : ""} concerné{litter.coverage.concernedAnimals > 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-accent">Ouvrir la portée</span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <p>{coverageLabel("T1", litter.coverage.t1Received, litter.coverage.concernedAnimals)}</p>
                    <p>{coverageLabel("T2", litter.coverage.t2Received, litter.coverage.concernedAnimals)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </main>
  );
}
