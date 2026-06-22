import Link from "next/link";

import { ApplicationList } from "@/features/applications/application-list";
import type { ApplicationFilter } from "@/features/applications/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function AccessMessage() {
  return (
    <div className="rounded-2xl border bg-surface px-6 py-12 text-center">
      <p className="text-lg font-semibold">Connexion requise</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
        Cet aperçu privé nécessite une session Supabase active. Le parcours
        d’authentification complet sera ajouté dans une prochaine étape.
      </p>
    </div>
  );
}

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les candidatures</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const params = await searchParams;
  const filter: ApplicationFilter =
    params.filtre === "toutes" ? "all" : "to_review";
  const supabase = await createClient();

  // Protection provisoire : l’écran s’appuie sur la session Supabase et les
  // politiques RLS existantes. Le parcours de connexion complet fera l’objet
  // d’une PR dédiée avant toute mise en production.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  let applications = null;
  let hasLoadingError = Boolean(authError);

  if (user) {
    let query = supabase
      .from("application_overview")
      .select(
        "id, contact_display_name, contact_email, contact_phone, desired_sex_preference, project_description, status, public_form_name, public_form_slug, submitted_at, created_at",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filter === "to_review") {
      query = query.eq("status", "to_review");
    }

    const result = await query;
    applications = result.data;
    hasLoadingError = Boolean(result.error);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour à l’accueil
        </Link>
        <div className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Candidatures
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez les demandes reçues et repérez rapidement celles qui
              attendent une première relecture.
            </p>
          </div>
          {user ? (
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          ) : null}
        </div>
      </header>

      <section className="py-8">
        {!user ? (
          <AccessMessage />
        ) : hasLoadingError || !applications ? (
          <ErrorMessage />
        ) : (
          <>
            <nav
              aria-label="Filtrer les candidatures"
              className="mb-5 flex w-fit gap-1 rounded-xl border bg-surface p-1"
            >
              <Link
                href="/candidatures"
                aria-current={filter === "to_review" ? "page" : undefined}
                className={
                  filter === "to_review"
                    ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-background"
                }
              >
                À relire
              </Link>
              <Link
                href="/candidatures?filtre=toutes"
                aria-current={filter === "all" ? "page" : undefined}
                className={
                  filter === "all"
                    ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-background"
                }
              >
                Toutes
              </Link>
            </nav>
            <ApplicationList applications={applications} filter={filter} />
          </>
        )}
      </section>
    </main>
  );
}
