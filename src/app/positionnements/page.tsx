import Link from "next/link";
import { redirect } from "next/navigation";

import { loadPositioningOverview } from "@/features/reservations/positioning-overview-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export default async function PositioningOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/positionnements");

  let groups = null;
  try {
    groups = await loadPositioningOverview(supabase);
  } catch (error) {
    console.error("Unable to load positioning overview", error);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1400px] px-4 py-8 sm:px-8 lg:px-10">
      <header className="border-b pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Portées</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Positionnements</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Retrouvez en un seul endroit les groupes à positionner, les capacités manquantes,
          les vagues en cours et les incidents à traiter.
        </p>
      </header>

      <section className="py-7">
        {!groups ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950">
            <p className="font-semibold">Impossible de charger les positionnements</p>
            <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
            <p className="font-semibold">Aucun groupe de portées</p>
            <p className="mt-2 text-sm text-muted">Créez d’abord un groupe de portées pour préparer les positionnements.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group) => (
              <article key={group.groupId} className="rounded-2xl border bg-surface p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Groupe de portées</p>
                    <h2 className="mt-1 text-xl font-semibold">{group.groupName}</h2>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${group.needsAttention ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                    {group.needsAttention ? "Action requise" : "À jour"}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Summary value={group.bornLitterCount} label={group.bornLitterCount === 1 ? "portée née" : "portées nées"} />
                  <Summary value={group.missingCapacityCount} label={group.missingCapacityCount === 1 ? "capacité à renseigner" : "capacités à renseigner"} attention={group.missingCapacityCount > 0} />
                  <Summary value={group.openWaveCount} label={group.openWaveCount === 1 ? "vague ouverte" : "vagues ouvertes"} attention={group.openWaveCount > 0} />
                  <Summary value={group.openIncidentCount} label={group.openIncidentCount === 1 ? "incident ouvert" : "incidents ouverts"} attention={group.openIncidentCount > 0} />
                </dl>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted">
                    {plural(group.confirmedPlaceCount, "place confirmée", "places confirmées")} · {plural(group.litterCount, "portée")}
                  </p>
                  <Link href={`/litter-groups/${group.groupId}/positioning`} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold !text-white">
                    Ouvrir le positionnement
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ value, label, attention = false }: { value: number; label: string; attention?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${attention ? "border-amber-200 bg-amber-50" : "bg-background"}`}>
      <dt className="text-xs leading-4 text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
