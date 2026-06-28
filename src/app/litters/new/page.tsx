import Link from "next/link";
import { redirect } from "next/navigation";

import { createLitter } from "@/features/litters/actions";
import { formatLitterDate } from "@/features/litters/formatters";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type GroupOption = {
  id: string;
  name: string | null;
  species: string | null;
  status: string | null;
  expected_period_start: string | null;
  expected_period_end: string | null;
};

type AnimalOption = {
  id: string;
  display_name: string | null;
  sex: string | null;
  species: string | null;
  breed: string | null;
  status: string | null;
};

const statusOptions = [
  ["planned", "Planifiée"],
  ["mating_done", "Saillie effectuée"],
  ["pregnancy_unconfirmed", "Gestation à confirmer"],
  ["pregnancy_confirmed", "Gestation confirmée"],
  ["not_pregnant", "Non gestante"],
  ["pregnancy_lost", "Gestation interrompue"],
  ["birth_expected", "Naissance attendue"],
  ["birth_in_progress", "Naissance en cours"],
  ["born", "Née"],
  ["puppies_created", "Animaux créés"],
  ["choice_period", "Période de choix"],
  ["ready_to_leave", "Prête au départ"],
  ["closed", "Clôturée"],
  ["cancelled", "Annulée"],
  ["archived", "Archivée"],
] as const;

const speciesOptions = [
  ["dog", "Chien"],
  ["cat", "Chat"],
] as const;

const errorMessages: Record<string, string> = {
  name_required: "Le nom de la portée est obligatoire.",
  same_parents: "La mère et le père doivent être différents.",
  invalid_group: "Le groupe de portées sélectionné est invalide.",
  invalid_mother: "La mère sélectionnée est invalide.",
  invalid_father: "Le père sélectionné est invalide.",
  error: "Impossible de créer la portée pour le moment.",
};

function speciesLabel(value: string | null) {
  if (value === "dog") return "Chien";
  if (value === "cat") return "Chat";
  return value ?? "Espèce inconnue";
}

function sexLabel(value: string | null) {
  if (value === "male") return "Mâle";
  if (value === "female") return "Femelle";
  return "Sexe inconnu";
}

function groupOptionLabel(group: GroupOption) {
  const parts = [group.name ?? "Groupe sans nom", speciesLabel(group.species)];
  if (group.expected_period_start || group.expected_period_end) {
    const start = group.expected_period_start
      ? formatLitterDate(group.expected_period_start)
      : "?";
    const end = group.expected_period_end
      ? formatLitterDate(group.expected_period_end)
      : "?";
    parts.push(`${start} – ${end}`);
  }
  return parts.join(" · ");
}

function animalOptionLabel(animal: AnimalOption) {
  const parts = [animal.display_name ?? "Animal sans nom", sexLabel(animal.sex)];
  const speciesBreed = [speciesLabel(animal.species), animal.breed]
    .filter(Boolean)
    .join(" / ");
  if (speciesBreed) {
    parts.push(speciesBreed);
  }
  return parts.join(" · ");
}

export default async function NewLitterPage({
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

  const [groupsResult, animalsResult] = await Promise.all([
    supabase
      .from("litter_groups")
      .select("id, name, species, status, expected_period_start, expected_period_end")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("animals")
      .select("id, display_name, sex, species, breed, status")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
  ]);

  const groups = (groupsResult.data ?? []) as GroupOption[];
  const animals = (animalsResult.data ?? []) as AnimalOption[];

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
          Nouvelle portée
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez une portée, rattachée ou non à un groupe de portées. Aucun
          animal, réservation ou document n’est créé par cette action.
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
        action={createLitter}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="litter-name"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Nom de la portée <span className="text-accent">*</span>
            </label>
            <input
              id="litter-name"
              name="name"
              type="text"
              required
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-species"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Espèce
            </label>
            <select
              id="litter-species"
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
              htmlFor="litter-breed"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Race
            </label>
            <input
              id="litter-breed"
              name="breed"
              type="text"
              defaultValue="Golden Retriever"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-status"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Statut initial
            </label>
            <select
              id="litter-status"
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
              htmlFor="litter-group"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Groupe de portées
            </label>
            <select
              id="litter-group"
              name="litter_group_id"
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Aucun groupe</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {groupOptionLabel(group)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="litter-mother"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Mère
            </label>
            <select
              id="litter-mother"
              name="mother_id"
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Aucune mère</option>
              {animals.map((animal) => (
                <option key={animal.id} value={animal.id}>
                  {animalOptionLabel(animal)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="litter-father"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Père
            </label>
            <select
              id="litter-father"
              name="father_id"
              defaultValue=""
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Aucun père</option>
              {animals.map((animal) => (
                <option key={animal.id} value={animal.id}>
                  {animalOptionLabel(animal)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="litter-mating-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Date de saillie
            </label>
            <input
              id="litter-mating-date"
              name="mating_date"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-mating-date-2"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Deuxième date de saillie
            </label>
            <input
              id="litter-mating-date-2"
              name="mating_date_2"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-ovulation-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Date d’ovulation estimée
            </label>
            <input
              id="litter-ovulation-date"
              name="estimated_ovulation_date"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-expected-birth-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Naissance prévue
            </label>
            <input
              id="litter-expected-birth-date"
              name="expected_birth_date"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="litter-actual-birth-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Naissance réelle
            </label>
            <input
              id="litter-actual-birth-date"
              name="actual_birth_date"
              type="date"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="litter-notes"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Notes
            </label>
            <textarea
              id="litter-notes"
              name="notes"
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
            Créer la portée
          </button>
        </div>
      </form>
    </main>
  );
}
