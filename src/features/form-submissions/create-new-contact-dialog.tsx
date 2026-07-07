"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveSuspectFormSubmissionWithNewContact } from "@/features/form-submissions/actions";

type PreviewItem = {
  label: string;
  value: string | null;
};

function CreateNewContactSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Création..." : "Confirmer la création"}
    </Button>
  );
}

export function CreateNewContactDialog({
  submissionId,
  previewItems,
}: {
  submissionId: string;
  previewItems: PreviewItem[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          Créer un nouveau contact et une candidature
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Créer un nouveau contact et une candidature
          </DialogTitle>
        </DialogHeader>
        <form
          action={resolveSuspectFormSubmissionWithNewContact}
          className="space-y-5"
        >
          <input type="hidden" name="form_submission_id" value={submissionId} />
          <p className="text-sm leading-6 text-muted">
            Cette action crée un contact distinct à partir de la soumission,
            puis une candidature liée. Aucun contact existant ne sera modifié ou
            fusionné.
          </p>
          <dl className="grid gap-3 rounded-lg border bg-background p-4 text-sm sm:grid-cols-2">
            {previewItems.map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {item.label}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words leading-6">
                  {item.value || "Non renseigné"}
                </dd>
              </div>
            ))}
          </dl>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <CreateNewContactSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
