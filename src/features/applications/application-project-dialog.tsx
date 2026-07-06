"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ApplicationProjectDialog({
  candidateName,
  projectDescription,
}: {
  candidateName: string;
  projectDescription: string | null;
}) {
  if (!projectDescription) {
    return <span className="text-xs text-muted">Non renseigné</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent-soft"
        >
          Lire
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Projet d’adoption</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">{candidateName}</p>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
            {projectDescription}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
