"use client";

import Image from "next/image";
import { useRef } from "react";

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
import {
  retireOrganizationLogoAction,
  uploadOrganizationLogoAction,
} from "@/features/settings/actions";

export function OrganizationLogoSettings({
  organizationId,
  canEdit,
  logo,
}: {
  organizationId: string;
  canEdit: boolean;
  logo: {
    id: string;
    createdAt: string;
    widthPx: number;
    heightPx: number;
  } | null;
}) {
  const retirementFormRef = useRef<HTMLFormElement>(null);

  return (
    <section
      id="visual-identity"
      className="mt-8 scroll-mt-6 rounded-2xl border bg-surface p-6 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Identité visuelle</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Le logo actif est utilisé dans les aperçus et les prochains contrats et
        certificats. Les PDF déjà générés ne changent jamais.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] md:items-start">
        <div className="flex min-h-40 items-center justify-center rounded-xl border bg-white p-5">
          {logo ? (
            <Image
              src={`/api/organization-logo/${logo.id}`}
              alt="Logo actif de l’organisation"
              width={Math.min(480, logo.widthPx)}
              height={Math.max(
                1,
                Math.round(Math.min(480, logo.widthPx) * logo.heightPx / logo.widthPx),
              )}
              unoptimized
              className="max-h-32 w-auto max-w-full object-contain"
            />
          ) : (
            <p className="text-center text-sm text-muted">Aucun logo actif</p>
          )}
        </div>

        <div>
          <p className="text-sm">
            <span className="font-semibold">Dernier import actif :</span>{" "}
            {logo
              ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(logo.createdAt))
              : "aucun"}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted">
            PNG ou JPEG réel · 512 Kio maximum · largeur et hauteur de 16 à
            2 000 pixels. Le ratio est toujours conservé.
          </p>

          {canEdit ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <form action={uploadOrganizationLogoAction}>
                <input type="hidden" name="organization_id" value={organizationId} />
                <label className="inline-flex cursor-pointer items-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                  {logo ? "Remplacer le logo" : "Importer un logo"}
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg"
                    required
                    className="sr-only"
                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  />
                </label>
              </form>
              {logo ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted-soft"
                    >
                      Retirer le logo
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Retirer le logo actif ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Les prochains documents seront générés sans logo. Les
                        versions précédentes et les PDF existants seront conservés.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <form ref={retirementFormRef} action={retireOrganizationLogoAction}>
                        <input type="hidden" name="organization_id" value={organizationId} />
                        <AlertDialogAction
                          type="button"
                          onClick={() => retirementFormRef.current?.requestSubmit()}
                        >
                          Confirmer le retrait
                        </AlertDialogAction>
                      </form>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
              Votre rôle permet de consulter le logo, mais pas de l’importer,
              le remplacer ou le retirer.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
