"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { createContactNote } from "@/features/contacts/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Ajout en cours…" : "Ajouter la note"}
    </button>
  );
}

export function NoteForm({
  contactId,
}: {
  contactId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await createContactNote(formData);
        formRef.current?.reset();
      }}
      className="mt-6 space-y-4"
    >
      <input type="hidden" name="contact_id" value={contactId} />

      <div>
        <label htmlFor="note-body" className="sr-only">
          Contenu de la note interne
        </label>
        <textarea
          id="note-body"
          name="body"
          required
          rows={3}
          placeholder="Écrire une note interne..."
          className="w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
