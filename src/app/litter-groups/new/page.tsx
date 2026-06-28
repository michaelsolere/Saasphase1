import Link from "next/link";
import { redirect } from "next/navigation";

import { createLitterGroup } from "@/features/litters/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const statusOptions = [
  ["planned", "Planifié"],
  ["open_for_applications", "Ouvert aux candidatures"],
  ["pregnancy_pending", "Gestation en attente"],
  ["births_in_progress", "Naissances en cours"],
  ["born", "Né"],
  ["closed", "Clôturé"],
  ["cancelled", "Annulé"],
  ["archived", "Archivé"],
] as const;

const speciesOptions = [
  ["dog", "Chien"],
  ["cat", "Chat"],
] as const;

const errorMessages: Record<string, string> = {
  name_required: "Le nom du groupe est obligatoire.",
  invalid_dates: "La date de fin ne peut pas être antérieure à la date de début.",
  error: "Impossible de créer le groupe pour le moment.",
};

export default async function NewLitterGroupPage({
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

  const errorMessage = query.status ? errorMessages[query.status] : undefined;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10 sm:px-10 lg:px-12">
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
          href="/litters"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux portées
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Portées
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Nouveau groupe de portées
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez un groupe de portées (période) pour y rattacher des portées plus
          tard. Aucune portée n’est créée par cette action.
        </p>
      </header>

      {errorMessage ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
        >
          {errorMessage}
        </section>
      ) : null}

      <form
        action={createLitterGroup}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="group-name"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Nom du groupe <span className="text-accent">*</span>
            </label>
            <input
              id="group-name"
              name="name"
              type="text"
              required
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="group-status"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Statut
            </label>
            <select
              id="group-status"
              name="status"
              defaultValue="planned"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="group-species"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Espèce
            </label>
            <select
              id="group-species"
              name="species"
              defaultValue="dog"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {speciesOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="group-period-start"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Période prévisionnelle — début
            </label>
            <input
              id="group-period-start"
              name="expected_period_start"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="group-period-end"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Période prévisionnelle — fin
            </label>
            <input
              id="group-period-end"
              name="expected_period_end"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="group-description"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Description
            </label>
            <textarea
              id="group-description"
              name="description"
              rows={4}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
          <Link
            href="/litters"
            className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer le groupe
          </button>
        </div>
      </form>
    </main>
  );
}
