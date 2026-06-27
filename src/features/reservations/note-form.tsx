"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { createReservationNote } from "@/features/reservations/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Ajout en cours…" : "Ajouter une note interne"}
    </button>
  );
}

export function ReservationNoteForm({
  reservationId,
}: {
  reservationId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await createReservationNote(formData);
        formRef.current?.reset();
      }}
      className="mt-6 space-y-4"
    >
      <input type="hidden" name="reservation_id" value={reservationId} />

      <div>
        <label htmlFor="reservation-note-body" className="sr-only">
          Contenu de la note interne
        </label>
        <textarea
          id="reservation-note-body"
          name="body"
          required
          maxLength={2000}
          rows={3}
          placeholder="Ajouter une note interne au dossier..."
          className="w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-accent"
        />
        <p className="mt-2 text-xs leading-5 text-muted">
          Note interne uniquement, non envoyée à l’adoptant.
        </p>
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
