import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listPostAdoptionResultsRows } from "@/features/post-adoption-questionnaire/internal-service";
import { buildPostAdoptionResultsOverview } from "@/features/post-adoption-questionnaire/results-model";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const stateLabels = {
  absent: "Jalon absent",
  available_not_submitted: "Disponible, non soumis",
  received: "Réponse reçue",
  incompatible: "Version non compatible",
  invalid: "Donnée invalide",
  linkage_issue: "Rattachement à vérifier",
} as const;

export default async function PostAdoptionLitterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await listPostAdoptionResultsRows(id, supabase).catch(() => null);
  if (rows === null) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          Impossible de charger les résultats de cette portée. Aucune donnée n’a été modifiée.
        </p>
      </main>
    );
  }
  const litter = buildPostAdoptionResultsOverview(rows).litters[0];
  if (!litter) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
      <header className="border-b pb-7">
        <Link href="/post-adoption" className="text-sm font-semibold text-accent hover:underline">
          Suivi post-adoption
        </Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-accent">
          Résultats par portée
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{litter.name}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          États T1 et T2 des chiots adoptés concernés. Les graphiques collectifs seront ajoutés dans une livraison séparée.
        </p>
      </header>

      <section className="py-8" aria-labelledby="adopted-puppies-heading">
        <h2 id="adopted-puppies-heading" className="text-xl font-semibold">Chiots adoptés concernés</h2>
        <ul className="mt-6 grid gap-4">
          {litter.animals.map((animal) => (
            <li key={animal.id} className="rounded-2xl border bg-surface p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{animal.name}</h3>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(["t1", "t2"] as const).map((milestone) => (
                      <div key={milestone} className="rounded-xl border bg-background px-4 py-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{milestone.toUpperCase()}</dt>
                        <dd className="mt-1 text-sm font-medium">{stateLabels[animal.milestones[milestone].state]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Link
                  href={`/post-adoption/animals/${animal.id}`}
                  className="w-fit rounded-xl border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft"
                >
                  Voir les résultats individuels
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
