import Link from "next/link";
import { redirect } from "next/navigation";

import { ApplicationList } from "@/features/applications/application-list";
import type { ApplicationFilter } from "@/features/applications/types";
import { logout } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{
    connexion?: string;
    erreur?: string;
    filtre?: string;
  }>;
}) {
  const params = await searchParams;
  const filter: ApplicationFilter =
    params.filtre === "toutes" ? "all" : "to_review";
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let applications = null;
  let hasLoadingError = Boolean(authError);

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
  hasLoadingError = hasLoadingError || Boolean(result.error);

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
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/contacts"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Contacts
            </Link>
            <Link
              href="/reservations"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Réservations
            </Link>
            <Link
              href="/payments"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Paiements
            </Link>
            <Link
              href="/documents"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Documents
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-foreground hover:underline"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="py-8">
        {params.connexion === "success" ? (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          >
            Connexion réussie.
          </p>
        ) : null}

        {params.erreur === "logout" ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            La déconnexion n’a pas abouti. Réessayez.
          </p>
        ) : null}

        {hasLoadingError || !applications ? (
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
