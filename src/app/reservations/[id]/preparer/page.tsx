import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReservationPreparationView } from "@/features/reservations/reservation-preparation-view";
import {
  buildReservationPreparationReturnPath,
} from "@/features/reservations/reservation-preparation-model";
import { loadReservationPreparation } from "@/features/reservations/reservation-preparation-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PrepareReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return_to?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const input = await loadReservationPreparation(id, supabase);
  if (!input) notFound();
  const returnPath = buildReservationPreparationReturnPath(query.return_to ?? null);

  return <main className="mx-auto min-h-screen w-full max-w-[1320px] px-4 py-8 sm:px-8 lg:px-10">
    <header className="border-b pb-6"><Link href={returnPath} className="text-sm font-semibold text-accent hover:underline">← Retour au poste Parcours adoptants</Link><p className="mt-6 text-sm font-semibold uppercase tracking-wide text-accent">Opération guidée</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Préparer la réservation</h1><p className="mt-3 max-w-3xl leading-7 text-muted">{input.familyName} · {input.litterName ?? "portée à compléter"}. Les états financier, documentaire et contractuel restent contrôlés séparément jusqu’à la validation finale.</p></header>
    <nav aria-label="Étapes de préparation" className="sticky top-0 z-10 -mx-4 mt-5 flex gap-2 overflow-x-auto border-y bg-background/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"><a href="#documents" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Documents</a><a href="#arrhes" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Arrhes</a><a href="#brevo" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Brevo</a><a href="#controles" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Contrôles</a><a href="#apercu" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Aperçu</a><a href="#recapitulatif" className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold">Validation</a></nav>
    <section className="py-7"><ReservationPreparationView input={input} returnPath={returnPath} /></section>
  </main>;
}
