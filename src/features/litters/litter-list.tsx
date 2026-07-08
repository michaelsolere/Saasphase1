import Link from "next/link";

import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getLitterStatusLabel,
  getSpeciesLabel,
} from "./formatters";
import type { LitterOverview } from "./types";

function OptionalValue({ value }: { value: string | null }) {
  return <span className="text-muted">{value || "Non renseigné"}</span>;
}

function BirthDate({ litter }: { litter: LitterOverview }) {
  const date = litter.actual_birth_date || litter.expected_birth_date;
  const label = litter.actual_birth_date ? "Réelle" : "Prévue";

  if (!date) {
    return <span className="text-muted">Non renseignée</span>;
  }

  return (
    <span>
      {label} : <span className="text-muted">{formatLitterDate(date)}</span>
    </span>
  );
}

export function LitterList({ litters }: { litters: LitterOverview[] }) {
  if (litters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-sm text-muted">Aucune portée pour l’instant.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/litters/new"
            className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer une portée
          </Link>
          <Link
            href="/litter-groups/new"
            className="inline-flex rounded-xl border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft"
          >
            Créer un groupe
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface">
      <table className="w-full border-collapse text-left text-sm text-foreground">
        <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-6 py-4">
              Portée
            </th>
            <th scope="col" className="px-6 py-4">
              Groupe
            </th>
            <th scope="col" className="px-6 py-4">
              Statut
            </th>
            <th scope="col" className="px-6 py-4">
              Naissance
            </th>
            <th scope="col" className="px-6 py-4">
              Parents
            </th>
            <th scope="col" className="px-6 py-4">
              Animaux
            </th>
            <th scope="col" className="px-6 py-4">
              Réservations
            </th>
            <th scope="col" className="px-6 py-4">
              Création
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {litters.map((litter, index) => (
            <tr
              key={litter.id || `litter-${index}`}
              className="transition-colors hover:bg-muted-soft/40"
            >
              <td className="min-w-72 px-6 py-4">
                <div className="flex flex-col items-start gap-1.5">
                  <p className="font-semibold text-foreground">
                    {getLitterDisplayName(litter.name, litter.id)}
                  </p>
                  {litter.id ? (
                    <Link
                      href={`/litters/${litter.id}`}
                      className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                    >
                      Fiche
                    </Link>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {getSpeciesLabel(litter.species)} ·{" "}
                  {litter.breed || "Race non renseignée"}
                </p>
              </td>
              <td className="min-w-48 px-6 py-4 text-sm">
                {litter.litter_group_id ? (
                  <Link
                    href={`/litter-groups/${litter.litter_group_id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {litter.litter_group_name || "Groupe de portées"}
                  </Link>
                ) : (
                  <span className="text-muted">Aucun groupe</span>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                  {getLitterStatusLabel(litter.status)}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <BirthDate litter={litter} />
              </td>
              <td className="min-w-56 px-6 py-4 text-xs leading-6">
                <p>
                  Mère : <OptionalValue value={litter.mother_display_name} />
                </p>
                <p>
                  Père : <OptionalValue value={litter.father_display_name} />
                </p>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatLitterCount(litter.animal_count)}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatLitterCount(litter.reservation_count)}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatLitterDate(litter.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
