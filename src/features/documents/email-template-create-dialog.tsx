"use client";

import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createEmailTemplate } from "@/features/documents/email-template-actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Création..." : "Créer le modèle"}
    </Button>
  );
}

export function EmailTemplateCreateDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Créer un modèle d’email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer un modèle d’email</DialogTitle>
          <DialogDescription>
            Ajoutez un texte réutilisable à copier manuellement depuis la page.
          </DialogDescription>
        </DialogHeader>

        <form action={createEmailTemplate} className="space-y-4">
          <div>
            <label htmlFor="template-title" className="text-sm font-semibold">
              Nom du modèle
            </label>
            <input
              id="template-title"
              name="title"
              type="text"
              maxLength={120}
              required
              className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="template-category" className="text-sm font-semibold">
              Catégorie
            </label>
            <select
              id="template-category"
              name="category"
              required
              defaultValue="adopter_journey"
              className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="candidate_journey">Parcours candidat</option>
              <option value="adopter_journey">Parcours adoptant</option>
              <option value="post_adoption">Suivi post-adoption</option>
            </select>
          </div>

          <div>
            <label htmlFor="template-subject" className="text-sm font-semibold">
              Sujet
            </label>
            <input
              id="template-subject"
              name="subject"
              type="text"
              maxLength={255}
              required
              className="mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="template-body" className="text-sm font-semibold">
              Corps
            </label>
            <textarea
              id="template-body"
              name="body"
              required
              rows={10}
              className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2 font-sans text-sm leading-6 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
