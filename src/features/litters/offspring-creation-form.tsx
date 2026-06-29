"use client";

import { useState } from "react";

import { createLitterOffspring } from "@/features/litters/actions";

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-accent focus:outline-none";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";
const maxRows = 12;

export function OffspringCreationForm({
  litterId,
  species,
  birthDate,
}: {
  litterId: string;
  species: string | null;
  birthDate: string | null;
}) {
  const [rowCount, setRowCount] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const offspringLabel = species === "cat" ? "chatons" : "chiots";

  return (
    <details className="mt-6 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-accent">
        Ajouter des {offspringLabel}
      </summary>

      <form
        action={createLitterOffspring}
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `Créer les ${offspringLabel} renseignés dans cette portée ? Cette action ne modifie aucune réservation.`,
          );

          if (!confirmed) {
            event.preventDefault();
            return;
          }

          setIsSubmitting(true);
        }}
      >
        <input type="hidden" name="litter_id" value={litterId} />
        <input type="hidden" name="row_count" value={rowCount} />
        <input type="hidden" name="confirm_offspring_creation" value="yes" />

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
          Les animaux créés seront rattachés à cette portée avec le statut
          initial « né ». Aucune réservation, attribution, paiement, document,
          email ou adoption ne sera modifié.
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
          <p className="text-sm text-muted">
            Date de naissance héritée :{" "}
            <span className="font-medium text-foreground">
              {birthDate || "non renseignée"}
            </span>
          </p>
          <div>
            <label htmlFor="offspring-row-count" className={labelClass}>
              Lignes
            </label>
            <input
              id="offspring-row-count"
              type="number"
              min={1}
              max={maxRows}
              value={rowCount}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue)) {
                  setRowCount(Math.min(Math.max(nextValue, 1), maxRows));
                }
              }}
              className={inputClass}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  #
                </th>
                <th scope="col" className="min-w-32 px-3 py-3">
                  Sexe
                </th>
                <th scope="col" className="min-w-48 px-3 py-3">
                  Nom provisoire
                </th>
                <th scope="col" className="min-w-44 px-3 py-3">
                  Collier / couleur
                </th>
                <th scope="col" className="min-w-32 px-3 py-3">
                  Ordre
                </th>
                <th scope="col" className="min-w-36 px-3 py-3">
                  Poids (g)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: rowCount }, (_, index) => (
                <tr key={index}>
                  <td className="px-3 py-3 text-xs font-semibold text-muted">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      name={`offspring_${index}_sex`}
                      defaultValue="unknown"
                      className={inputClass}
                    >
                      <option value="unknown">Non renseigné</option>
                      <option value="female">Femelle</option>
                      <option value="male">Mâle</option>
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      name={`offspring_${index}_temporary_name`}
                      type="text"
                      maxLength={255}
                      placeholder={species === "cat" ? "Chaton 1" : "Chiot 1"}
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      name={`offspring_${index}_collar_color`}
                      type="text"
                      maxLength={255}
                      placeholder="Bleu, rose, vert..."
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      name={`offspring_${index}_birth_order`}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      name={`offspring_${index}_birth_weight_grams`}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 border-t pt-5">
          <p className="text-xs text-muted">
            Les lignes entièrement vides seront ignorées.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Création en cours..." : `Créer les ${offspringLabel}`}
          </button>
        </div>
      </form>
    </details>
  );
}
