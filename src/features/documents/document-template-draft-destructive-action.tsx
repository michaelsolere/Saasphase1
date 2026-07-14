"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { discardDocumentTemplateDraftAction } from "@/features/documents/document-template-management-actions";

export function DocumentTemplateDraftDestructiveAction({
  familyId,
  familyName,
  templateId,
  expectedUpdatedAt,
  hasPublication,
  disabled = false,
}: {
  familyId: string;
  familyName: string;
  templateId: string;
  expectedUpdatedAt: string;
  hasPublication: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submissionInFlight = useRef(false);
  const label = hasPublication
    ? "Abandonner le brouillon"
    : "Supprimer ce modèle de référence";
  const familyNameMatches = confirmation === familyName;

  function submit() {
    if (submissionInFlight.current || (!hasPublication && !familyNameMatches)) return;
    submissionInFlight.current = true;
    setError(null);
    startTransition(async () => {
      const result = await discardDocumentTemplateDraftAction({
        familyId,
        templateId,
        expectedUpdatedAt,
      });
      if (result.outcome === "error") {
        submissionInFlight.current = false;
        setError(result.message);
        return;
      }
      setOpen(false);
      if (result.result === "family_deleted") {
        router.push("/documents/modeles?status=deleted");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
      <p className="text-sm font-semibold">Action destructive</p>
      <AlertDialog open={open} onOpenChange={(nextOpen) => {
        if (isPending) return;
        setOpen(nextOpen);
        setError(null);
        if (!nextOpen) setConfirmation("");
      }}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="mt-3" disabled={disabled || isPending}>
            {isPending ? "Traitement…" : label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasPublication
                ? "Toutes les modifications de ce brouillon seront perdues. La version publiée restera inchangée."
                : "Ce modèle n’a jamais été publié. Sa famille et son brouillon seront retirés de la liste."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!hasPublication ? (
            <div className="space-y-2">
              <label htmlFor="document-template-family-confirmation" className="text-sm font-medium">
                Saisissez le nom exact « {familyName} » pour confirmer.
              </label>
              <Input
                id="document-template-family-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || (!hasPublication && !familyNameMatches)}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {isPending ? "Traitement…" : label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
