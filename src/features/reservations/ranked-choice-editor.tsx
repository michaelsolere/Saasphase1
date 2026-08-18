"use client";

import { useMemo, useState } from "react";

import { saveChoiceRankedPreferences } from "@/features/reservations/choice-appointment-actions";

type Animal = { id: string; name: string };

export function RankedChoiceEditor({
  litterId,
  slotId,
  animals,
}: {
  litterId: string;
  slotId: string;
  animals: Animal[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = useMemo(
    () => selectedIds.flatMap((id) => {
      const animal = animals.find((candidate) => candidate.id === id);
      return animal ? [animal] : [];
    }),
    [animals, selectedIds],
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    setSelectedIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <form action={saveChoiceRankedPreferences} className="space-y-3 rounded-xl border bg-background p-4">
      <input type="hidden" name="litter_id" value={litterId} />
      <input type="hidden" name="slot_id" value={slotId} />
      {selectedIds.map((id) => <input key={id} type="hidden" name="animal_ids[]" value={id} />)}
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor={`ranking-${slotId}`}>
        Pré-choix classé
      </label>
      <select
        id={`ranking-${slotId}`}
        multiple
        value={selectedIds}
        onChange={(event) => setSelectedIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
        className="min-h-28 w-full rounded-lg border bg-white p-2 text-sm"
      >
        {animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.name}</option>)}
      </select>
      <p className="text-xs text-muted">Sélectionnez les chiots, puis ajustez leur ordre ci-dessous.</p>
      {selected.length > 0 ? (
        <ol className="space-y-2">
          {selected.map((animal, index) => (
            <li key={animal.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span><strong>#{index + 1}</strong> · {animal.name}</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded border px-2 py-1 disabled:opacity-30" aria-label={`Monter ${animal.name}`}>↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} className="rounded border px-2 py-1 disabled:opacity-30" aria-label={`Descendre ${animal.name}`}>↓</button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <button type="submit" disabled={selected.length === 0} className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent disabled:opacity-40">
        Enregistrer ce classement
      </button>
    </form>
  );
}
