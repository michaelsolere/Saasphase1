import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/features/auth/actions";
import { DocumentList } from "@/features/documents/document-list";
import type { DBDocument } from "@/features/documents/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les documents</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let documents = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("documents")
    .select(
      "id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, expires_at, signature_required, file_name, contact_id, application_id, reservation_id, payment_id, litter_id, animal_id",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  documents = result.data as DBDocument[] | null;
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
              Documents
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez les documents générés ou importés liés aux contacts, candidatures, réservations et paiements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/candidatures"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Candidatures
            </Link>
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
        {hasLoadingError || !documents ? (
          <ErrorMessage />
        ) : (
          <DocumentList documents={documents} />
        )}
      </section>
    </main>
  );
}
