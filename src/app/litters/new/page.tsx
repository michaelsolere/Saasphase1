import Link from "next/link";
import { redirect } from "next/navigation";

import { createLitter } from "@/features/litters/actions";
import {
  LitterFields,
  type LitterAnimalOption,
  type LitterGroupOption,
} from "@/features/litters/litter-fields";
import { filterEligibleLitterParents } from "@/features/litters/parent-eligibility";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  name_required: "Le nom de la portée est obligatoire.",
  same_parents: "La mère et le père doivent être différents.",
  invalid_group: "Le groupe de portées sélectionné est invalide.",
  invalid_mother:
    "La mère sélectionnée est introuvable, inaccessible ou non éligible pour cette portée.",
  invalid_father:
    "Le père sélectionné est introuvable, inaccessible ou non éligible pour cette portée.",
  error: "Impossible de créer la portée pour le moment.",
};

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

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const organizationId = membership?.organization_id ?? null;

  const [groupsResult, animalsResult] = organizationId
    ? await Promise.all([
        supabase
          .from("litter_groups")
          .select("id, name, species, status, expected_period_start, expected_period_end")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("animals")
          .select(
            "id, call_name, official_name, sex, species, breed, status, ownership_status, is_breeder, is_external, is_retired, litter_id, deleted_at",
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("call_name", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const groups = (groupsResult.data ?? []) as LitterGroupOption[];
  const animals = (animalsResult.data ?? []) as LitterAnimalOption[];
  const motherOptions = filterEligibleLitterParents(animals, "mother", "dog");
  const fatherOptions = filterEligibleLitterParents(animals, "father", "dog");

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
        <LitterFields
          idPrefix="litter-new"
          groups={groups}
          motherOptions={motherOptions}
          fatherOptions={fatherOptions}
        />

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
