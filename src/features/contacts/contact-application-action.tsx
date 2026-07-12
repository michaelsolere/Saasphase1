"use client";

import Link from "next/link";

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

const actionClassName =
  "inline-flex w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft";

export function ContactApplicationAction({
  href,
  hasApplications,
  hasOpenApplication,
}: {
  href: string;
  hasApplications: boolean;
  hasOpenApplication: boolean;
}) {
  const label = hasApplications
    ? "+ Nouvelle candidature"
    : "Créer une candidature";

  if (!hasOpenApplication) {
    return (
      <Link href={href} className={actionClassName}>
        {label}
      </Link>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" className={actionClassName}>
          {label}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Créer une nouvelle candidature ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ce contact possède déjà une candidature en cours. Créer une
            nouvelle candidature distincte ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Link href={href}>Créer une candidature distincte</Link>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
