import Link from "next/link";
import { redirect } from "next/navigation";

import { createApplicationForContact } from "@/features/applications/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function TextField({
  id,
  label,
  name,
  defaultValue,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
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
        type="text"
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

export default async function NewContactApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, display_name, email, phone")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contact) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux contacts
        </Link>

        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
        >
          <h1 className="text-xl font-semibold">
            Impossible de charger le contact
          </h1>
          <p className="mt-2 text-sm">
            Contact introuvable ou inaccessible. Aucune donnée n’a été
            modifiée.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href={`/contacts/${contact.id}`}
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour au contact
      </Link>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Candidatures
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Créer une candidature
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez une candidature manuelle pour {contact.display_name}, sans
          formulaire public, réservation, document ou note automatique.
        </p>
        <div className="mt-4 rounded-xl border bg-surface px-4 py-3 text-sm text-muted">
          <p className="font-medium text-foreground">{contact.display_name}</p>
          <p>{contact.email ?? contact.phone ?? "Coordonnées non renseignées"}</p>
        </div>
      </header>

      {query.status === "error" ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
        >
          Impossible de créer la candidature. Vérifiez les informations saisies
          et réessayez. Aucune autre donnée n’a été modifiée.
        </section>
      ) : null}

      <form
        action={createApplicationForContact}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <input type="hidden" name="contact_id" value={contact.id} />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="application-species"
            label="Espèce"
            name="species"
            defaultValue="dog"
          />
          <TextField
            id="application-breed"
            label="Race"
            name="breed"
            defaultValue="Golden Retriever"
          />

          <div className="sm:col-span-2">
            <label
              htmlFor="application-desired-sex-preference"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Sexe souhaité
            </label>
            <select
              id="application-desired-sex-preference"
              name="desired_sex_preference"
              defaultValue="unknown"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="unknown">Non précisé</option>
              <option value="male_only">Mâle uniquement</option>
              <option value="female_only">Femelle uniquement</option>
              <option value="male_preferred_female_possible">
                Mâle préféré, femelle possible
              </option>
              <option value="female_preferred_male_possible">
                Femelle préférée, mâle possible
              </option>
              <option value="no_preference">Sans préférence</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="application-project-description"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Description du projet
            </label>
            <textarea
              id="application-project-description"
              name="project_description"
              rows={6}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
          <Link
            href={`/contacts/${contact.id}`}
            className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer la candidature
          </button>
        </div>
      </form>
    </main>
  );
}
