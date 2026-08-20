"use client";

import { useState } from "react";

import { formatAnimalDate } from "@/features/animals/formatters";

import {
  ANIMAL_HISTORY_PAGE_SIZE,
  type AnimalHistoryEntry,
} from "./animal-history-model";

const animalHistoryKindLabels: Record<AnimalHistoryEntry["kind"], string> = {
  health: "Sant\u00e9",
  event: "\u00c9v\u00e9nement",
  note: "Note",
  document: "Document",
};

const animalHistoryKindTones: Record<AnimalHistoryEntry["kind"], string> = {
  health: "bg-emerald-100 text-emerald-900",
  event: "bg-blue-100 text-blue-900",
  note: "bg-amber-100 text-amber-900",
  document: "bg-purple-100 text-purple-900",
};

export function AnimalHistorySection({
  entries,
  hasError,
}: {
  entries: AnimalHistoryEntry[];
  hasError: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(ANIMAL_HISTORY_PAGE_SIZE);

  return (
    <section
      id="historique"
      className="rounded-2xl border bg-surface p-6 sm:p-8"
      data-testid="animal-history-section"
    >
      <h2 className="text-xl font-semibold">Historique</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger l\u2019historique.
        </p>
      ) : entries.length === 0 ? (
        <p
          className="mt-5 text-sm text-muted"
          data-testid="animal-history-empty"
        >
          Aucun \u00e9v\u00e9nement.
        </p>
      ) : (
        <div className="mt-6">
          <ol
            className="divide-y divide-border"
            data-testid="animal-history-list"
          >
            {entries.slice(0, visibleCount).map((entry) => (
              <li key={entry.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${animalHistoryKindTones[entry.kind]}`}
                  >
                    {animalHistoryKindLabels[entry.kind]}
                  </span>
                  <p className="text-sm font-semibold">{entry.label}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatAnimalDate(entry.occurredAt)}
                </p>
                {entry.detail ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {entry.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {entries.length > visibleCount ? (
            <button
              type="button"
              data-testid="animal-history-show-more"
              onClick={() =>
                setVisibleCount((count) => count + ANIMAL_HISTORY_PAGE_SIZE)
              }
              className="mt-4 w-full rounded-lg border px-3 py-2 text-sm font-semibold text-accent"
            >
              Afficher plus ({entries.length - visibleCount})
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
