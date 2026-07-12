import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactEditForm } from "@/features/contacts/contact-edit-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Contact introuvable ou inaccessible
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Ce contact n’existe pas ou vous n’êtes pas autorisé à le modifier.
      </p>
      <Link
        href="/contacts"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux contacts
      </Link>
    </section>
  );
}

export default async function ContactEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const canEdit =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "member";

  const { data: contact, error: contactError } =
    membership?.organization_id && canEdit
      ? await supabase
          .from("contacts")
          .select(
            "id, organization_id, contact_type, first_name, last_name, family_or_structure_name, display_name, email, phone, secondary_phone, address_line1, address_line2, postal_code, city, country",
          )
          .eq("id", id)
          .eq("organization_id", membership.organization_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">
          |
        </span>
        <Link
          href={contact ? `/contacts/${contact.id}` : "/contacts"}
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour à la fiche contact
        </Link>
      </div>

      <div className="mt-8">
        {membershipError || contactError ? (
          <section
            role="alert"
            className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
          >
            <h1 className="text-xl font-semibold">
              Impossible de charger le contact
            </h1>
            <p className="mt-2 text-sm">
              Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
            </p>
          </section>
        ) : !contact ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="border-b pb-7">
              <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                Contact · Modification
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Modifier le contact
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Mettez à jour les coordonnées et le nom affiché sans modifier
                les rôles, candidatures, réservations, paiements ou documents
                liés.
              </p>
            </header>

            <ContactEditForm contact={contact} />
          </>
        )}
      </div>
    </main>
  );
}
