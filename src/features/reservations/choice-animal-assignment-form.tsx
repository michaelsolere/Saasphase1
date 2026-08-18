"use client";

import { useMemo, useState } from "react";

import { assignChoiceAnimal } from "@/features/reservations/choice-appointment-actions";

type AssignmentAnimal = {
  id: string;
  name: string;
  photos: Array<{ id: string; isPrimary: boolean }>;
};

export function ChoiceAnimalAssignmentForm({
  litterId,
  slotId,
  animals,
  isChange,
}: {
  litterId: string;
  slotId: string;
  animals: AssignmentAnimal[];
  isChange: boolean;
}) {
  const [animalId, setAnimalId] = useState("");
  const photos = useMemo(
    () => animals.find((animal) => animal.id === animalId)?.photos ?? [],
    [animalId, animals],
  );

  return (
    <form action={assignChoiceAnimal} className="space-y-3 rounded-xl border bg-background p-4">
      <input type="hidden" name="litter_id" value={litterId} />
      <input type="hidden" name="slot_id" value={slotId} />
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        {isChange ? "Changer le chiot attribué" : "Attribuer le chiot"}
        <select
          required
          name="animal_id"
          value={animalId}
          onChange={(event) => setAnimalId(event.target.value)}
          className="mt-2 block w-full rounded-lg border bg-white px-3 py-2 text-sm"
        >
          <option value="">Choisir</option>
          {animals.map((animal) => (
            <option key={animal.id} value={animal.id}>{animal.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        Photo de confirmation
        <select
          name="presentation_media_id"
          disabled={!animalId || photos.length === 0}
          className="mt-2 block w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-muted-soft"
        >
          <option value="">Sans photo</option>
          {photos.map((photo, index) => (
            <option key={photo.id} value={photo.id}>
              Photo {index + 1}{photo.isPrimary ? " · présentation" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        Motif si changement
        <input name="reason" className="mt-2 block w-full rounded-lg border bg-white px-3 py-2 text-sm" />
      </label>
      <button disabled={!animalId} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {isChange ? "Changer et historiser" : "Attribuer et finaliser"}
      </button>
    </form>
  );
}
