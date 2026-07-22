import Link from "next/link";
import { redirect } from "next/navigation";

import { getLitterJournalStatusLabel } from "@/features/litter-journal/stage";
import { loadLitterJournalCatalog } from "@/features/litter-journal/loader";
import {
  WhelpingMobileSelectionBoundary,
  WhelpingMobileSelector,
} from "@/features/whelping/whelping-mobile-selector";
import { readWhelpingMobileSelection } from "@/features/whelping/whelping-mobile-selection-server";
import { parsePublicLitterIndex } from "@/features/whelping/whelping-mobile-selection";
import { WhelpingPanel } from "@/features/whelping/whelping-panel";
import { loadWhelpingWorkspace } from "@/features/whelping/whelping-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getMobileLitterLabel(name: string | null, index: number) {
  return name?.trim() || `Portée ${index + 1}`;
}

function MobileLoadError() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-amber-950"
    >
      <h2 className="font-semibold">Impossible de charger le mode mise-bas.</h2>
      <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
    </section>
  );
}

export default async function WhelpingMobilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fwhelping");
  }
  const queryKeys = Object.keys(query);
  const legacyLitterIndex = queryKeys.length === 1 && queryKeys[0] === "litter" && typeof query.litter === "string"
    ? parsePublicLitterIndex(query.litter)
    : null;
  if (legacyLitterIndex !== null) {
    redirect(`/whelping/selection?litter=${legacyLitterIndex}`);
  }
  if (queryKeys.length > 0) {
    redirect("/whelping");
  }

  let litters: Awaited<ReturnType<typeof loadLitterJournalCatalog>>;
  try {
    litters = await loadLitterJournalCatalog(supabase);
  } catch {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <MobileLoadError />
      </main>
    );
  }

  if (litters.length === 0) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="border-b pb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Espace privé</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Mise-bas mobile</h1>
        </header>
        <section className="mt-6 rounded-2xl border border-dashed bg-surface px-5 py-10 text-center">
          <h2 className="font-semibold">Aucune portée active</h2>
          <p className="mt-2 text-sm text-muted">Le mode mobile sera disponible dès qu’une portée entrera dans le suivi actif.</p>
          <Link href="/litters/journal" className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline">
            Ouvrir le Journal complet
          </Link>
        </section>
      </main>
    );
  }

  const mobileSelection = await readWhelpingMobileSelection();
  const selectedIndex = mobileSelection
    ? litters.findIndex((litter) => litter.id === mobileSelection.litterId)
    : -1;
  const selectedLitter = selectedIndex < 0 ? null : litters[selectedIndex];

  if (!selectedLitter?.id || !mobileSelection) {
    redirect("/whelping/selection");
  }

  const workspace = await loadWhelpingWorkspace(selectedLitter.id, supabase, {
    revision: mobileSelection.revision,
  });
  const options = litters.map((litter, index) => ({
    index,
    label: getMobileLitterLabel(litter.name, index),
  }));

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl overflow-x-hidden px-4 py-5 sm:px-6 sm:py-8">
      <WhelpingMobileSelectionBoundary key={selectedIndex}>
        <header className="border-b pb-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Espace privé</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Mise-bas mobile</h1>
            <h2 className="mt-3 break-words text-lg font-semibold">
              {getMobileLitterLabel(selectedLitter.name, selectedIndex)}
            </h2>
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-6">
              <div className="flex gap-2"><dt className="text-muted">Mère :</dt><dd>{selectedLitter.mother_display_name ?? "Non renseignée"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">Portée :</dt><dd>{getLitterJournalStatusLabel(selectedLitter.status)}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">Session :</dt><dd>{workspace.loadError ? "Indisponible" : workspace.session?.status === "open" ? "En cours" : workspace.session?.status === "closed" ? "Clôturée" : "Non démarrée"}</dd></div>
            </dl>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
            <WhelpingMobileSelector options={options} selectedIndex={selectedIndex} />
            <Link href="/litters/journal" className="text-sm font-semibold text-accent hover:underline">
              Ouvrir le Journal complet
            </Link>
          </div>
        </div>
        </header>

        <details className="my-5 rounded-xl border bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">Installer sur l’écran d’accueil</summary>
        <p className="mt-2 leading-6 text-muted">
          Ouvrez le menu de votre navigateur puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».
        </p>
        <p className="mt-2 leading-6 text-muted">Une connexion réseau est requise pour consulter ou enregistrer les données.</p>
        </details>

        <WhelpingPanel {...workspace} displayMode="mobile" />
      </WhelpingMobileSelectionBoundary>
    </main>
  );
}
