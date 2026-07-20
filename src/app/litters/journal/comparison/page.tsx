import Link from "next/link";
import { redirect } from "next/navigation";

import { compareSelectedLittersFromSnapshot } from "@/features/litter-age-comparison/actions";
import type { LitterComparisonActionState } from "@/features/litter-age-comparison/types";
import { loadLitterComparisonCatalog } from "@/features/litter-age-comparison/catalog";
import { LitterComparisonPanel } from "@/features/litter-age-comparison/comparison-panel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function CatalogError() {
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950">
      <p className="font-semibold">Impossible de charger les portées disponibles.</p>
      <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
    </div>
  );
}

export default async function LitterComparisonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let catalog: Awaited<ReturnType<typeof loadLitterComparisonCatalog>> | null = null;
  try {
    catalog = await loadLitterComparisonCatalog(supabase);
  } catch {
    // The neutral error state is rendered below.
  }

  if (catalog) {
    const privateSnapshot = catalog.privateSnapshot;
    async function action(
      previousState: LitterComparisonActionState,
      formData: FormData,
    ) {
      "use server";
      return compareSelectedLittersFromSnapshot(
        privateSnapshot,
        previousState,
        formData,
      );
    }
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-10 sm:py-10 lg:px-12">
        <header className="border-b pb-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-accent">Espace privé · Suivi</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Comparer des portées</h1>
              <p className="mt-3 max-w-3xl leading-7 text-muted">
                Consultez les poids observés au même jour d’âge pour plusieurs portées compatibles, sans interpolation.
              </p>
            </div>
            <Link href="/litters/journal" className="text-sm font-semibold text-accent hover:underline">
              Retour au Journal
            </Link>
          </div>
        </header>

        <section className="py-8">
          <LitterComparisonPanel catalog={catalog.publicItems} action={action} />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-10 sm:py-10 lg:px-12">
      <header className="border-b pb-7">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Comparer des portées</h1>
        <Link href="/litters/journal" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
          Retour au Journal
        </Link>
      </header>
      <section className="py-8"><CatalogError /></section>
    </main>
  );
}
