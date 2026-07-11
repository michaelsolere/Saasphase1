import Link from "next/link";
import { redirect } from "next/navigation";

import { createManualAnimal } from "@/features/animals/actions";
import {
  AnimalFields,
  type AnimalParentOption,
} from "@/features/animals/animal-fields";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  name_required: "Renseignez au moins un nom complet ou un nom d’usage.",
  invalid:
    "Certaines valeurs sont incohérentes pour une création manuelle d’animal.",
  invalid_mother: "La mère sélectionnée est invalide ou inaccessible.",
  invalid_father: "Le père sélectionné est invalide ou inaccessible.",
  same_parents: "La mère et le père doivent être deux animaux différents.",
  error: "Impossible de créer l’animal pour le moment.",
};

export default async function NewAnimalPage({
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

  const { data: parentOptionsData } = await supabase
    .from("animals")
    .select("id, call_name, official_name, sex")
    .is("deleted_at", null)
    .order("official_name", { ascending: true, nullsFirst: false })
    .order("call_name", { ascending: true, nullsFirst: false });

  const parentOptions = (parentOptionsData ?? []) as AnimalParentOption[];
  const errorMessage = query.status ? errorMessages[query.status] : undefined;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:px-10 lg:px-12">
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
          href="/animals"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux animaux
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Animaux
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Nouvel animal
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez un animal individuel hors flux portée, sans réservation,
          paiement, document, adoption ou média automatique.
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

      <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-6 text-amber-950">
        Si l’animal est né d’une portée connue, créez-le depuis la fiche Portée :
        ce formulaire ne crée pas de chiot/chaton et ne rattache pas d’animal à
        une portée.
      </section>

      <form
        action={createManualAnimal}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <AnimalFields idPrefix="animal-new" parentOptions={parentOptions} />

        <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
          <Link
            href="/animals"
            className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer l’animal
          </button>
        </div>
      </form>
    </main>
  );
}
