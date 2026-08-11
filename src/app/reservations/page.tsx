import Link from "next/link";
import { redirect } from "next/navigation";

import { AdopterWorkbench } from "@/features/reservations/adopter-workbench";
import { loadAdopterWorkbench } from "@/features/reservations/adopter-workbench-data";
import type {
  AdopterActionState,
  AdopterMilestoneKey,
  AdopterQueue,
  AdopterWorkbenchSort,
  AdopterWorkbenchView,
} from "@/features/reservations/adopter-workbench-model";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  view?: string;
  q?: string;
  step?: string;
  action?: string;
  queue?: string;
  sort?: string;
  selected?: string;
  contact_status?: string;
};

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T) =>
  value && allowed.includes(value as T) ? (value as T) : fallback;

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const role = membership?.role === "owner" || membership?.role === "admin" || membership?.role === "member"
    ? membership.role
    : "viewer";

  let records = null;
  let loadingError = false;
  try {
    records = await loadAdopterWorkbench(supabase);
  } catch (error) {
    console.error("Unable to load adopter workbench", error);
    loadingError = true;
  }

  const initial = {
    view: oneOf<AdopterWorkbenchView>(params.view, ["current", "waiting", "finalized", "follow_up"], "current"),
    search: params.q?.slice(0, 200) ?? "",
    step: oneOf<AdopterMilestoneKey | "all">(params.step, ["all", "opening", "profile", "positioning", "reservation", "choice_assignment", "departure", "adoption"], "all"),
    actionState: oneOf<AdopterActionState | "all">(params.action, ["all", "blocked", "overdue", "due", "normal", "none"], "all"),
    queue: oneOf<AdopterQueue | "all">(params.queue, ["all", "incomplete", "flexible", "female", "male"], "all"),
    sort: oneOf<AdopterWorkbenchSort>(params.sort, ["scope_queue_rank", "urgency", "deadline", "name", "step", "choice_appointment", "departure_appointment"], "scope_queue_rank"),
    selectedId: params.selected && /^[0-9a-f-]{36}$/i.test(params.selected) ? params.selected : null,
  };

  return <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10">
    <header className="border-b pb-6">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-accent">Poste de travail</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Parcours adoptants</h1><p className="mt-3 max-w-3xl leading-7 text-muted">Suivez les familles dont le premier versement a été réellement reçu et accepté. Le statut technique seul ne suffit pas.</p></div>
        <Link href="/positionnements" className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold !text-white">Voir tous les positionnements</Link>
      </div>
      {params.contact_status === "conflict" ? <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">Le dossier a changé depuis son ouverture. Les données ont été rechargées : vérifiez-les avant de tracer à nouveau le contact.</p> : null}
      {params.contact_status === "success" ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Contact manuel enregistré et historisé.</p> : null}
      {params.contact_status === "error" ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">Le contact manuel n’a pas été enregistré. Aucune donnée n’a été modifiée.</p> : null}
    </header>
    <section className="py-7">{loadingError || !records ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"><p className="font-semibold">Impossible de charger le poste Parcours adoptants</p><p className="mt-2 text-sm">Réessayez après vérification de la migration. Aucune donnée n’a été modifiée.</p></div> : <AdopterWorkbench records={records} role={role} initial={initial} />}</section>
  </main>;
}
