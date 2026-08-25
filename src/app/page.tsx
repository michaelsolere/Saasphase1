import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { HomeTodayPanel } from "@/features/home-today/home-today-panel";
import { loadHomeTodaySections } from "@/features/home-today/home-today-data";
import { resolveLitterCareTaskAction } from "@/features/litter-journal/litter-care-tasks-actions";
import type { LitterCareTodayQuickActions } from "@/features/litter-journal/litter-care-today-quick-actions";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";
import { projectLitterCareToday } from "@/features/litter-journal/litter-care-today";

export const dynamic = "force-dynamic";

const quickLinks = [
  {
    href: "/candidature/golden-retriever-2026",
    title: "Formulaire public",
    description: "Le parcours de candidature à partager avec les adoptants.",
    status: "Public",
  },
  {
    href: "/contacts",
    title: "Contacts",
    description: "La fiche contact unique au centre du parcours adoptant.",
    status: "Privé",
  },
  {
    href: "/candidatures",
    title: "Candidatures",
    description: "La relecture des demandes envoyées depuis le formulaire.",
    status: "Privé",
  },
  {
    href: "/reservations",
    title: "Parcours adoptants",
    description: "Le cockpit des dossiers adoptants, paiements, documents, animal et suivi liés.",
    status: "Privé",
  },
  {
    href: "/payments",
    title: "Paiements",
    description: "La consultation des paiements, arrhes et remboursements.",
    status: "Privé",
  },
  {
    href: "/documents",
    title: "Documents",
    description: "Les documents reliés aux contacts, dossiers et paiements.",
    status: "Privé",
  },
  {
    href: "/litters",
    title: "Portées",
    description: "Les portées, animaux, parcours adoptants, notes et événements liés.",
    status: "Privé",
  },
  {
    href: "/animals",
    title: "Animaux",
    description: "Les animaux avec portée, réservation, documents, notes et événements.",
    status: "Privé",
  },
  {
    href: "/cheptel",
    title: "Cheptel",
    description: "Le cockpit synthétique des reproducteurs, chiots et statuts clés.",
    status: "Privé",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthenticated landing page view (unchanged)
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b pb-6">
          <div>
            <p className="text-sm font-medium tracking-wide text-accent">
              SaaS Élevage
            </p>
            <p className="mt-1 text-sm text-muted">
              Gestion d’élevage canin et félin
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Se connecter
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex rounded-full border bg-surface px-3 py-1 text-sm text-muted">
              Phase 1 · Navigation rapide
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              Une base saine pour suivre chaque parcours d’adoption.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              Les modules principaux sont accessibles pour consulter les
              contacts, candidatures, parcours adoptants, paiements, documents, portées
              et animaux. Connectez-vous à l’espace privé pour piloter l’élevage.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                className="group rounded-2xl border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-semibold">{area.title}</h2>
                  <span className="text-xs font-medium text-muted">
                    {area.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {area.description}
                </p>
                <p className="mt-6 text-sm font-medium text-accent">
                  {area.title === "Formulaire public"
                    ? "Ouvrir le formulaire"
                    : "Consulter"}
                  <span
                    aria-hidden="true"
                    className="ml-1 inline-block transition group-hover:translate-x-1"
                  >
                    →
                  </span>
                </p>
              </Link>
            ))}
          </div>
        </section>

        <footer className="border-t pt-6 text-sm text-muted">
          Phase 1 — consultation d’abord, écritures métier ajoutées par petites PRs ciblées.
        </footer>
      </main>
    );
  }

  // Authenticated view: the single today action queue across all modules.
  const sections = await loadHomeTodaySections();
  const quickActions = buildHomeTodayLitterCareQuickActions(sections);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-accent">
            Espace privé · Aujourd’hui
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Qu’est-ce qui demande mon attention ?
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            La file d’actions du jour, tous modules. Les sections sans action du
            jour sont masquées.
          </p>
        </div>
      </header>
      <div className="pt-4">
        <HomeTodayPanel sections={sections} quickActions={quickActions} />
      </div>
    </main>
  );
}

/**
 * One-click actions for the planned litter care tasks shown on the home page.
 * Same binding pattern as /calendar/today: each action gets its own command id
 * and resolves via resolveLitterCareTaskAction. Read-only for members without
 * write access (empty list).
 */
function buildHomeTodayLitterCareQuickActions(
  sections: Awaited<ReturnType<typeof loadHomeTodaySections>>,
): LitterCareTodayQuickActions[] {
  if (sections.breeding.failed) return [];
  const breeding = sections.breeding.data;
  if (!breeding.canWrite) return [];

  const todayDate = breeding.todayDate;
  const projection = projectLitterCareToday(breeding.tasks, {
    date: todayDate,
    localTime: "23:59",
  });
  const activeTasks = [
    ...projection.overdue,
    ...projection.dueToday,
    ...projection.openWindows,
  ];
  return activeTasks
    .filter((task): task is LitterCareTaskSummary & { status: "planned" } => task.status === "planned")
    .map((task) => ({
      taskId: task.id,
      doneAction: resolveLitterCareTaskAction.bind(null, {
        taskId: task.id,
        clientCommandId: crypto.randomUUID(),
      }),
      notApplicableAction: resolveLitterCareTaskAction.bind(null, {
        taskId: task.id,
        clientCommandId: crypto.randomUUID(),
      }),
    }));
}
