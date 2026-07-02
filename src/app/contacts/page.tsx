import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactList } from "@/features/contacts/contact-list";
import type { ContactOverview } from "@/features/contacts/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les contacts</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function ContactsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let contacts = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("contact_overview")
    .select("id, display_name, email, phone, active_roles, created_at")
    .order("created_at", { ascending: false });

  contacts = result.data as ContactOverview[] | null;
  hasLoadingError = hasLoadingError || Boolean(result.error);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Contacts
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez l’ensemble des contacts de votre élevage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/contacts/new"
              className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
            >
              Nouveau contact
            </Link>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !contacts ? (
          <ErrorMessage />
        ) : (
          <ContactList contacts={contacts} />
        )}
      </section>
    </main>
  );
}
