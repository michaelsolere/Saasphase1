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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { archiveSuspectFormSubmissionWithoutApplication } from "@/features/form-submissions/actions";

function ArchiveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} variant="destructive">
      {pending ? "Archivage..." : "Confirmer l’archivage"}
    </Button>
  );
}

export function ArchiveSubmissionDialog({
  submissionId,
}: {
  submissionId: string;
}) {
  const commentId = `${submissionId}-archive-comment`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Archiver sans candidature
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archiver sans candidature</DialogTitle>
        </DialogHeader>
        <form
          action={archiveSuspectFormSubmissionWithoutApplication}
          className="space-y-5"
        >
          <input type="hidden" name="form_submission_id" value={submissionId} />
          <p className="text-sm leading-6 text-muted">
            Cette action classe la soumission comme archivée sans créer de
            contact, de candidature ni de rôle. Elle ne pourra plus être résolue
            depuis cet écran.
          </p>
          <div>
            <Label htmlFor={commentId}>Commentaire interne facultatif</Label>
            <Textarea
              id={commentId}
              name="internal_comment"
              rows={4}
              maxLength={500}
              placeholder="Raison de l’archivage..."
              className="mt-2 min-h-28 resize-y"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <ArchiveSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
