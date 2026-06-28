import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/features/auth/actions";
import {
  formatLitterDate,
  getLitterGroupStatusLabel,
  getSpeciesLabel,
} from "@/features/litters/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type LitterGroupRow = Pick<
  Database["public"]["Tables"]["litter_groups"]["Row"],
  | "id"
  | "name"
  | "species"
  | "status"
  | "description"
  | "expected_period_start"
  | "expected_period_end"
  | "created_at"
>;

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">
        Impossible de charger les groupes de portées.
      </p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

function formatPeriod(start: string | null, end: string | null) {
  if (start && end) {
    return `${formatLitterDate(start)} – ${formatLitterDate(end)}`;
  }
  if (start) {
    return `À partir du ${formatLitterDate(start)}`;
  }
  if (end) {
    return `Jusqu’au ${formatLitterDate(end)}`;
  }
  return "Non renseignée";
}

function shortDescription(value: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}…`;
}

export default async function LitterGroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const groupsResult = await supabase
    .from("litter_groups")
    .select(
      "id, name, species, status, description, expected_period_start, expected_period_end, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const groups = groupsResult.data as LitterGroupRow[] | null;
  const hasLoadingError = Boolean(authError) || Boolean(groupsResult.error);

  // Compteurs calculés à partir des identifiants de groupe référencés
  // (une seule requête par type d'objet, comptage côté serveur en mémoire).
  const [littersResult, applicationsResult, reservationsResult] =
    await Promise.all([
      supabase
        .from("litters")
        .select("litter_group_id")
        .not("litter_group_id", "is", null)
        .is("deleted_at", null),
      supabase
        .from("applications")
        .select("desired_litter_group_id")
        .not("desired_litter_group_id", "is", null)
        .is("deleted_at", null),
      supabase
        .from("reservations")
        .select("litter_group_id")
        .not("litter_group_id", "is", null)
        .is("deleted_at", null),
    ]);

  const litterCounts = new Map<string, number>();
  (littersResult.data ?? []).forEach((row) => {
    const key = row.litter_group_id;
    if (key) {
      litterCounts.set(key, (litterCounts.get(key) ?? 0) + 1);
    }
  });

  const applicationCounts = new Map<string, number>();
  (applicationsResult.data ?? []).forEach((row) => {
    const key = row.desired_litter_group_id;
    if (key) {
      applicationCounts.set(key, (applicationCounts.get(key) ?? 0) + 1);
    }
  });

  const reservationCounts = new Map<string, number>();
  (reservationsResult.data ?? []).forEach((row) => {
    const key = row.litter_group_id;
    if (key) {
      reservationCounts.set(key, (reservationCounts.get(key) ?? 0) + 1);
    }
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
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
        <div className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Groupes de portées
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Retrouvez tous les groupes de portées (périodes / campagnes), leur
              statut, leur période prévue et leurs portées, candidatures et
              réservations liées.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/litter-groups/new"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Nouveau groupe de portées
            </Link>
            <Link
              href="/litters"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Portées
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-foreground hover:underline"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !groups ? (
          <ErrorMessage />
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
            <p className="text-sm text-muted">
              Aucun groupe de portées pour l’instant.
            </p>
            <Link
              href="/litter-groups/new"
              className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Créer un groupe de portées
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-surface">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-6 py-4">
                    Groupe
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Statut
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Période prévue
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Portées
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Candidatures
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Réservations
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Détail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((group) => {
                  const description = shortDescription(group.description);
                  return (
                    <tr
                      key={group.id}
                      className="transition-colors hover:bg-muted-soft/40"
                    >
                      <td className="min-w-72 px-6 py-4">
                        <p className="font-semibold text-foreground">
                          {group.name || `Groupe ${group.id.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {getSpeciesLabel(group.species)}
                        </p>
                        {description ? (
                          <p className="mt-1 text-xs text-muted">
                            {description}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                          {getLitterGroupStatusLabel(group.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted">
                        {formatPeriod(
                          group.expected_period_start,
                          group.expected_period_end,
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted">
                        {litterCounts.get(group.id) ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted">
                        {applicationCounts.get(group.id) ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted">
                        {reservationCounts.get(group.id) ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Link
                          href={`/litter-groups/${group.id}`}
                          className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                        >
                          Consulter
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
