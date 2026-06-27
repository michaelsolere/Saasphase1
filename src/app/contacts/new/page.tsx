import Link from "next/link";
import { redirect } from "next/navigation";

import { createContact } from "@/features/contacts/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Field({
  id,
  label,
  name,
  autoComplete,
  defaultValue,
  type = "text",
}: {
  id: string;
  label: string;
  name: string;
  autoComplete?: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

const initialRoleOptions = [
  ["prospect", "Prospect"],
  ["candidate", "Candidat"],
  ["pre_reservation_holder", "Titulaire de pré-réservation"],
  ["reservation_holder", "Titulaire de réservation"],
  ["adopter", "Adoptant"],
  ["former_adopter", "Ancien adoptant"],
  ["stud_owner", "Propriétaire d'étalon"],
  ["veterinarian", "Vétérinaire"],
  ["partner_breeder", "Éleveur partenaire"],
  ["mediation_organization", "Organisme de médiation"],
  ["supplier", "Fournisseur"],
  ["other", "Autre"],
] as const;

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux contacts
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Contacts
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Nouveau contact
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez une fiche contact manuelle sans candidature, réservation,
          document ou note automatique.
        </p>
      </header>

      {query.status === "error" ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
        >
          Impossible de créer le contact. Vérifiez les informations saisies et
          réessayez. Aucune autre donnée n’a été modifiée.
        </section>
      ) : null}

      <form
        action={createContact}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="contact-first-name"
            label="Prénom"
            name="first_name"
            autoComplete="given-name"
          />
          <Field
            id="contact-last-name"
            label="Nom"
            name="last_name"
            autoComplete="family-name"
          />
          <Field
            id="contact-display-name"
            label="Nom affichable"
            name="display_name"
            autoComplete="name"
          />
          <Field
            id="contact-email"
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
          />
          <Field
            id="contact-phone"
            label="Téléphone"
            name="phone"
            type="tel"
            autoComplete="tel"
          />
          <Field
            id="contact-secondary-phone"
            label="Téléphone secondaire"
            name="secondary_phone"
            type="tel"
          />
          <Field
            id="contact-address-line1"
            label="Adresse ligne 1"
            name="address_line1"
            autoComplete="address-line1"
          />
          <Field
            id="contact-address-line2"
            label="Adresse ligne 2"
            name="address_line2"
            autoComplete="address-line2"
          />
          <Field
            id="contact-postal-code"
            label="Code postal"
            name="postal_code"
            autoComplete="postal-code"
          />
          <Field
            id="contact-city"
            label="Ville"
            name="city"
            autoComplete="address-level2"
          />
          <Field
            id="contact-country"
            label="Pays"
            name="country"
            defaultValue="FR"
            autoComplete="country"
          />
          <div className="sm:col-span-2">
            <label
              htmlFor="contact-initial-role"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Rôle initial
            </label>
            <select
              id="contact-initial-role"
              name="initial_role"
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Aucun rôle initial</option>
              {initialRoleOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
          <Link
            href="/contacts"
            className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer le contact
          </button>
        </div>
      </form>
    </main>
  );
}
