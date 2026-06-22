import Link from "next/link";
import { redirect } from "next/navigation";

import { formatApplicationDate } from "@/features/applications/formatters";
import { getContactRoleLabel } from "@/features/contacts/formatters";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Contact introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Contact introuvable ou inaccessible.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux candidatures
      </Link>
    </section>
  );
}

function ErrorMessage() {
  return (
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
      <Link
        href="/candidatures"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux candidatures
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

export default async function ContactDetailPage({
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

  // Fetch contact
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select(
      "id, display_name, first_name, last_name, email, phone, secondary_phone, address_line1, address_line2, postal_code, city, country, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  // Fetch active roles
  const { data: contactRoles } = contact
    ? await supabase
        .from("contact_roles")
        .select("role")
        .eq("contact_id", contact.id)
        .eq("is_active", true)
        .is("deleted_at", null)
    : { data: null };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href="/candidatures"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour aux candidatures
      </Link>

      <div className="mt-8">
        {contactError ? (
          <ErrorMessage />
        ) : !contact ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Contact · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {contact.display_name}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatApplicationDate(contact.created_at)}
                </p>
              </div>
            </header>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations personnelles
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem label="Prénom" value={contact.first_name} />
                    <DetailItem label="Nom" value={contact.last_name} />
                    <DetailItem label="Email" value={contact.email} />
                    <DetailItem
                      label="Téléphone principal"
                      value={contact.phone}
                    />
                    <DetailItem
                      label="Téléphone secondaire"
                      value={contact.secondary_phone}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Adresse postale</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Adresse (ligne 1)"
                      value={contact.address_line1}
                    />
                    <DetailItem
                      label="Adresse (ligne 2)"
                      value={contact.address_line2}
                    />
                    <DetailItem label="Code postal" value={contact.postal_code} />
                    <DetailItem label="Ville" value={contact.city} />
                    <DetailItem
                      label="Pays"
                      value={
                        contact.country === "FR" ? "France" : contact.country
                      }
                    />
                  </dl>
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6">
                <h2 className="text-lg font-semibold">Rôles du contact</h2>
                {contactRoles && contactRoles.length > 0 ? (
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {contactRoles.map((cr, idx) => (
                      <li
                        key={idx}
                        className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"
                      >
                        {getContactRoleLabel(cr.role)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 text-sm text-muted">Aucun rôle actif.</p>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
