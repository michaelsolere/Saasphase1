import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getLitterStatusLabel,
  getSpeciesLabel,
} from "@/features/litters/formatters";
import type { LitterOverview } from "@/features/litters/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type DBLitter = Database["public"]["Tables"]["litters"]["Row"];
type LitterSummary = Pick<
  LitterOverview,
  | "id"
  | "litter_group_name"
  | "mother_display_name"
  | "father_display_name"
  | "animal_count"
  | "reservation_count"
>;

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Portée introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cette portée n’existe pas ou vous n’êtes pas autorisé à la consulter.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux portées
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
        Impossible de charger la portée
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux portées
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

function CountItem({ label, value }: { label: string; value: number | null }) {
  return <DetailItem label={label} value={formatLitterCount(value)} />;
}

export default async function LitterDetailPage({
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

  const { data: rawLitter, error: readError } = await supabase
    .from("litters")
    .select(
      "id, name, species, breed, status, litter_group_id, mother_id, father_id, mating_date, mating_date_2, estimated_ovulation_date, expected_birth_date, actual_birth_date, pregnancy_confirmed_at, pregnancy_confirmation_method, expected_puppy_count, born_total_count, born_male_count, born_female_count, alive_count, notes, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const litter = rawLitter as DBLitter | null;

  const { data: rawSummary, error: summaryError } = litter
    ? await supabase
        .from("litter_overview")
        .select(
          "id, litter_group_name, mother_display_name, father_display_name, animal_count, reservation_count",
        )
        .eq("id", id)
        .maybeSingle()
    : { data: null, error: null };

  const summary = rawSummary as LitterSummary | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href="/litters"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour aux portées
      </Link>

      <div className="mt-8">
        {readError || summaryError ? (
          <ErrorMessage />
        ) : !litter ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Portée · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {getLitterDisplayName(litter.name, litter.id)}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatLitterDate(litter.created_at)}
                </p>
              </div>
              <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted">
                Lecture seule
              </span>
            </header>

            <div className="space-y-6 py-8">
              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Informations</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Nom"
                    value={getLitterDisplayName(litter.name, litter.id)}
                  />
                  <DetailItem
                    label="Groupe de portée"
                    value={summary?.litter_group_name ?? null}
                  />
                  <DetailItem
                    label="Espèce"
                    value={getSpeciesLabel(litter.species)}
                  />
                  <DetailItem label="Race" value={litter.breed} />
                  <DetailItem
                    label="Statut"
                    value={getLitterStatusLabel(litter.status)}
                  />
                  <DetailItem
                    label="Mère"
                    value={summary?.mother_display_name ?? null}
                  />
                  <DetailItem
                    label="Père"
                    value={summary?.father_display_name ?? null}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Reproduction et gestation
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Date de saillie principale"
                    value={formatLitterDate(litter.mating_date)}
                  />
                  <DetailItem
                    label="Deuxième date de saillie"
                    value={formatLitterDate(litter.mating_date_2)}
                  />
                  <DetailItem
                    label="Ovulation estimée"
                    value={formatLitterDate(litter.estimated_ovulation_date)}
                  />
                  <DetailItem
                    label="Confirmation de gestation"
                    value={formatLitterDate(litter.pregnancy_confirmed_at)}
                  />
                  <DetailItem
                    label="Méthode de confirmation"
                    value={litter.pregnancy_confirmation_method}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Naissance et compteurs
                </h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Naissance prévue"
                    value={formatLitterDate(litter.expected_birth_date)}
                  />
                  <DetailItem
                    label="Naissance réelle"
                    value={formatLitterDate(litter.actual_birth_date)}
                  />
                  <CountItem
                    label="Nombre attendu"
                    value={litter.expected_puppy_count}
                  />
                  <CountItem
                    label="Nombre né total"
                    value={litter.born_total_count}
                  />
                  <CountItem label="Mâles" value={litter.born_male_count} />
                  <CountItem label="Femelles" value={litter.born_female_count} />
                  <CountItem label="Vivants" value={litter.alive_count} />
                  <CountItem
                    label="Nombre d’animaux"
                    value={summary?.animal_count ?? null}
                  />
                  <CountItem
                    label="Nombre de réservations"
                    value={summary?.reservation_count ?? null}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Notes</h2>
                <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                  {litter.notes || "Aucune note renseignée."}
                </p>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Dates techniques</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Création"
                    value={formatLitterDate(litter.created_at)}
                  />
                  <DetailItem
                    label="Mise à jour"
                    value={formatLitterDate(litter.updated_at)}
                  />
                </dl>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
