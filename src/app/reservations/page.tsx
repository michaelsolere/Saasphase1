import Link from "next/link";
import { redirect } from "next/navigation";

import { ReservationList } from "@/features/reservations/reservation-list";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les réservations</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function ReservationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let reservations = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("reservation_overview")
    .select(
      "id, contact_id, contact_display_name, status, reserved_sex_preference, litter_name, litter_group_name, price_cents, paid_cents, refunded_cents, currency, animal_display_name, created_at"
    )
    .order("created_at", { ascending: false });

  reservations = result.data as ReservationOverview[] | null;
  hasLoadingError = hasLoadingError || Boolean(result.error);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour au tableau de bord
        </Link>
        <div className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Parcours adoptants
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez les dossiers adoptants en cours, du premier engagement au départ.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/reservations/new"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Nouvelle réservation
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !reservations ? (
          <ErrorMessage />
        ) : (
          <ReservationList reservations={reservations} />
        )}
      </section>
    </main>
  );
}
