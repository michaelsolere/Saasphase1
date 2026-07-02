import { redirect } from "next/navigation";

import { DocumentList, type DocumentWithContact } from "@/features/documents/document-list";
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

  let documents: DocumentWithContact[] | null = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("documents")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rawDocuments = result.data || [];
  hasLoadingError = hasLoadingError || Boolean(result.error);

  const contactsMap = new Map<string, { first_name: string | null; last_name: string | null; display_name: string | null; email: string | null }>();

  if (rawDocuments.length > 0) {
    const contactIds = Array.from(new Set(rawDocuments.map((d) => d.contact_id).filter(Boolean))) as string[];
    if (contactIds.length > 0) {
      const { data: contactsData, error: contactsError } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, display_name, email")
        .in("id", contactIds)
        .is("deleted_at", null);

      if (contactsError) {
        hasLoadingError = true;
      } else if (contactsData) {
        contactsData.forEach((c) => {
          contactsMap.set(c.id, {
            first_name: c.first_name,
            last_name: c.last_name,
            display_name: c.display_name,
            email: c.email,
          });
        });
      }
    }
  }

  documents = rawDocuments.map((d) => ({
    ...d,
    contacts: d.contact_id ? contactsMap.get(d.contact_id) || null : null,
  }));

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
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
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
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
