import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PostBirthPositioningWorkbench } from "@/features/reservations/post-birth-positioning-workbench";
import { loadPostBirthPositioning } from "@/features/reservations/post-birth-positioning-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PostBirthPositioningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let data;
  try {
    data = await loadPostBirthPositioning(supabase, id);
  } catch (error) {
    console.error("Unable to load post-birth positioning", error);
    return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8"><div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950"><h1 className="text-xl font-semibold">Positionnement après naissance indisponible</h1><p className="mt-2 text-sm">Vérifiez les migrations puis rechargez. Aucune donnée n’a été modifiée.</p></div></main>;
  }
  if (data.snapshot.outcome === "not_found") notFound();
  if (data.snapshot.outcome !== "ok") redirect("/litter-groups");

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10">
      <header className="border-b pb-7">
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-accent">
          <Link href={`/litter-groups/${id}`}>← Groupe de portées</Link>
          <span aria-hidden="true">·</span>
          <Link href="/reservations">Parcours adoptants</Link>
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Poste de travail</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Positionnement après naissance</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">Capacités réelles par sexe, rangs historiques, brouillon partagé et décisions explicites. Une place confirmée ne désigne pas encore un chiot.</p>
      </header>
      <section className="py-7"><PostBirthPositioningWorkbench {...data} /></section>
    </main>
  );
}
