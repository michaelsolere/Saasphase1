import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EmptyLitterJournal,
  LitterJournalDashboard,
} from "@/features/litter-journal/litter-journal-dashboard";
import { recordMaternalObservationAction } from "@/features/litter-journal/maternal-observations-actions";
import { listMaternalObservationsForLitter } from "@/features/litter-journal/maternal-observations";
import {
  createLitterCareTaskAction,
  resolveLitterCareTaskAction,
} from "@/features/litter-journal/litter-care-tasks-actions";
import { listLitterCareTasksForLitter } from "@/features/litter-journal/litter-care-tasks";
import { loadLitterJournal } from "@/features/litter-journal/loader";
import type { LitterJournalSelection } from "@/features/litter-journal/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger le journal des portées.</p>
      <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
    </div>
  );
}

export default async function LitterJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ litter?: string }>;
}) {
  const { litter: requestedLitterId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let journal: LitterJournalSelection | null = null;
  let hasLoadingError = false;
  let maternalObservations: Awaited<ReturnType<typeof listMaternalObservationsForLitter>> | null = null;
  let litterCareTasks: Awaited<
    ReturnType<typeof listLitterCareTasksForLitter>
  > | null = null;

  try {
    journal = await loadLitterJournal(supabase, requestedLitterId);
  } catch {
    hasLoadingError = true;
  }

  if (journal?.selectedLitter?.id) {
    const litterId = journal.selectedLitter.id;
    const [maternalResult, tasksResult] = await Promise.allSettled([
      listMaternalObservationsForLitter({ litterId }),
      listLitterCareTasksForLitter({ litterId }),
    ]);

    maternalObservations =
      maternalResult.status === "fulfilled" ? maternalResult.value : null;
    litterCareTasks =
      tasksResult.status === "fulfilled" ? tasksResult.value : null;
  }

  const maternalObservationsLoaded =
    maternalObservations?.outcome === "success" ? maternalObservations : null;
  const clientCommandId = crypto.randomUUID();
  const maternalObservationAction =
    journal?.selectedLitter?.id && maternalObservationsLoaded
      ? recordMaternalObservationAction.bind(null, {
          litterId: journal.selectedLitter.id,
          clientCommandId,
        })
      : null;
  const litterCareTasksLoaded =
    litterCareTasks?.outcome === "success" ? litterCareTasks : null;
  const litterCareTaskCanWrite =
    litterCareTasksLoaded?.role === "owner" ||
    litterCareTasksLoaded?.role === "admin" ||
    litterCareTasksLoaded?.role === "member";
  const createTaskClientCommandId = crypto.randomUUID();
  const createTaskAction =
    journal?.selectedLitter?.id && litterCareTaskCanWrite
      ? createLitterCareTaskAction.bind(null, {
          litterId: journal.selectedLitter.id,
          clientCommandId: createTaskClientCommandId,
        })
      : null;
  const resolutionActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map((task) => {
          const resolutionClientCommandId = crypto.randomUUID();
          return {
            taskId: task.id,
            clientCommandId: resolutionClientCommandId,
            action: resolveLitterCareTaskAction.bind(null, {
              taskId: task.id,
              clientCommandId: resolutionClientCommandId,
            }),
          };
        })
    : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Espace privé · Suivi</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Journal des portées</h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">Suivez le contexte, les observations et les tâches de chaque portée active.</p>
          </div>
          <Link href="/litters" className="text-sm font-semibold text-accent hover:underline">
            Retour aux portées
          </Link>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !journal ? <ErrorMessage /> : journal.selectedLitter ? (
          <LitterJournalDashboard
            litters={journal.litters}
            litter={journal.selectedLitter}
            details={journal.selectedDetails}
            maternalObservations={
              maternalObservationsLoaded?.observations ?? []
            }
            maternalObservationRole={
              maternalObservationsLoaded?.role ?? null
            }
            maternalObservationAction={maternalObservationAction}
            maternalObservationClientCommandId={clientCommandId}
            maternalObservationsLoadError={maternalObservationsLoaded === null}
            litterCareTasks={litterCareTasksLoaded?.tasks ?? []}
            litterCareTaskRole={litterCareTasksLoaded?.role ?? null}
            createLitterCareTaskAction={createTaskAction}
            createLitterCareTaskClientCommandId={createTaskClientCommandId}
            litterCareTaskResolutionActions={resolutionActions}
            litterCareTasksLoadError={litterCareTasksLoaded === null}
          />
        ) : (
          <EmptyLitterJournal />
        )}
      </section>
    </main>
  );
}
