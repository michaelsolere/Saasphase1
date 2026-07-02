import Link from "next/link";
import { redirect } from "next/navigation";

import { LitterList } from "@/features/litters/litter-list";
import type { LitterOverview } from "@/features/litters/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les portées.</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function LittersPage({
  searchParams,
}: {
  searchParams: Promise<{ group_status?: string; litter_status?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let litters = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("litter_overview")
    .select(
      "id, name, litter_group_id, litter_group_name, species, breed, status, expected_birth_date, actual_birth_date, mother_display_name, father_display_name, animal_count, reservation_count, created_at",
    )
    .order("expected_birth_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  litters = result.data as LitterOverview[] | null;
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
              Portées
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Suivez les portées, leurs groupes, leurs dates, leurs parents,
              leurs réservations et leurs animaux liés.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/litters/new"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Nouvelle portée
            </Link>
            <Link
              href="/litter-groups/new"
              className="rounded-xl border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft"
            >
              Nouveau groupe de portées
            </Link>
            <Link
              href="/litter-groups"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Groupes de portées
            </Link>
          </div>
        </div>
      </header>

      {query.group_status === "created" ? (
        <p
          role="status"
          className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-950"
        >
          Le groupe de portées a été créé.
        </p>
      ) : null}

      {query.litter_status === "created" ? (
        <p
          role="status"
          className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-950"
        >
          La portée a été créée.
        </p>
      ) : null}

      <section className="py-8">
        {hasLoadingError || !litters ? (
          <ErrorMessage />
        ) : (
          <LitterList litters={litters} />
        )}
      </section>
    </main>
  );
}
