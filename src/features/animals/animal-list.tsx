import Link from "next/link";

import {
  formatAnimalCoat,
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalSpeciesLabel,
  getAnimalStatusLabel,
  getBornOffspringLabel,
  getOwnershipStatusLabel,
} from "./formatters";
import type { AnimalListItem } from "./types";

function OptionalValue({ value }: { value: string | null }) {
  return <span className="text-muted">{value || "Non renseigné"}</span>;
}

export function AnimalList({ animals }: { animals: AnimalListItem[] }) {
  if (animals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-sm text-muted">Aucun animal trouvé.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface">
      <table className="w-full border-collapse text-left text-sm text-foreground">
        <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-6 py-4">
              Animal
            </th>
            <th scope="col" className="px-6 py-4">
              Statut
            </th>
            <th scope="col" className="px-6 py-4">
              Naissance
            </th>
            <th scope="col" className="px-6 py-4">
              Portée
            </th>
            <th scope="col" className="px-6 py-4">
              Parents
            </th>
            <th scope="col" className="px-6 py-4">
              Identification
            </th>
            <th scope="col" className="px-6 py-4">
              Couleur / robe
            </th>
            <th scope="col" className="px-6 py-4">
              Création
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {animals.map((animal) => (
            <tr key={animal.id} className="transition-colors hover:bg-muted-soft/40">
              <td className="min-w-72 px-6 py-4">
                <div className="flex flex-col items-start gap-1.5">
                  <p className="font-semibold text-foreground">
                    {getAnimalDisplayName(animal)}
                  </p>
                  <Link
                    href={`/animals/${animal.id}`}
                    className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                  >
                    Fiche
                  </Link>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {getAnimalSpeciesLabel(animal.species)} · {animal.breed || "Race non renseignée"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Sexe : {getAnimalSexLabel(animal.sex)}
                </p>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                  {getAnimalStatusLabel(animal.status)}
                </span>
                {getBornOffspringLabel(animal) ? (
                  <p className="mt-2 max-w-44 text-xs leading-5 text-muted">
                    {getBornOffspringLabel(animal)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Origine : {getOwnershipStatusLabel(animal.ownership_status)}
                </p>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatAnimalDate(animal.birth_date)}
              </td>
              <td className="min-w-56 px-6 py-4 text-xs leading-6">
                <p>
                  Portée :{" "}
                  {animal.litter_id ? (
                    <Link
                      href={`/litters/${animal.litter_id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {animal.litterName || "Portée"}
                    </Link>
                  ) : (
                    <OptionalValue value={animal.litterName} />
                  )}
                </p>
                <p>
                  Groupe : <OptionalValue value={animal.litterGroupName} />
                </p>
              </td>
              <td className="min-w-56 px-6 py-4 text-xs leading-6">
                <p>
                  Mère : <OptionalValue value={animal.motherCallName} />
                </p>
                <p>
                  Père : <OptionalValue value={animal.fatherCallName} />
                </p>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {animal.identification_number || "Non renseignée"}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatAnimalCoat(animal)}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">
                {formatAnimalDate(animal.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
