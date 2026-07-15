"use client";

import { useState } from "react";

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
import { DocumentVersionHistoryList } from "@/features/documents/document-version-history-list";
import type { DocumentVersionHistory } from "@/features/documents/document-version-history-core";
import {
  generateReservationDocumentPdf,
  type ReservationDocumentGenerationIntention,
} from "@/features/reservations/generate-reservation-document-action";
import { ReservationDocumentPreviewDialog } from "@/features/reservations/reservation-document-preview-dialog";

export type ReservationDocumentGenerationCard = {
  documentType: "commitment_certificate" | "reservation_contract";
  label: string;
  intention: ReservationDocumentGenerationIntention;
  currentDocument: {
    title: string;
    statusLabel: string;
    hasPdf: boolean;
    version: number | null;
    templateLabel: string | null;
    templateVersion: number | null;
    generatedAtLabel: string | null;
    history: DocumentVersionHistory | null;
  } | null;
  templates: Array<{
    id: string;
    name: string;
    version: number;
  }>;
};

function GenerationForm({ card }: { card: ReservationDocumentGenerationCard }) {
  const action = generateReservationDocumentPdf.bind(null, card.intention);
  const hasPdf = card.currentDocument?.hasPdf ?? false;
  const [templateId, setTemplateId] = useState(card.templates[0]?.id ?? "");
  const templateSelector = (
    <>
      <label
        className="block text-sm font-medium text-foreground"
        htmlFor={`template-${card.documentType}`}
      >
        Modèle compatible
      </label>
      <select
        id={`template-${card.documentType}`}
        name="template_id"
        required
        disabled={card.templates.length === 0}
        value={templateId}
        onChange={(event) => setTemplateId(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {card.templates.length === 0 ? (
          <option value="">Aucun modèle compatible disponible</option>
        ) : (
          card.templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} — version {template.version}
            </option>
          ))
        )}
      </select>
    </>
  );
  const preview = (
    <ReservationDocumentPreviewDialog
      reservationId={card.intention.reservationId}
      documentType={card.documentType}
      documentLabel={card.label}
      templateId={templateId}
      disabled={card.templates.length === 0}
    />
  );

  if (!hasPdf) {
    return (
      <form action={action} className="mt-5 space-y-3">
        {templateSelector}
        <Button
          type="submit"
          disabled={card.templates.length === 0}
          className="w-full"
        >
          Générer le PDF
        </Button>
        {preview}
      </form>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {templateSelector}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            disabled={card.templates.length === 0}
            className="w-full"
          >
            Créer une nouvelle version
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Créer une nouvelle version ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le PDF courant sera conservé comme version historique et le
              nouveau PDF deviendra le document courant. Cette action ne change
              ni la réservation ni les e-mails.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={action}>
            <input type="hidden" name="template_id" value={templateId} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Annuler</AlertDialogCancel>
              <AlertDialogAction asChild>
                <button
                  type="submit"
                  onClick={(event) => {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }}
                >
                  Confirmer la nouvelle version
                </button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {preview}
    </div>
  );
}

function GenerationCard({ card }: { card: ReservationDocumentGenerationCard }) {
  const current = card.currentDocument;

  return (
    <article className="rounded-xl border bg-background p-4">
      <h3 className="font-semibold text-foreground">{card.label}</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Document courant</dt>
          <dd className="mt-1 font-medium text-foreground">
            {current?.title ?? "Aucun PDF courant"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Statut</dt>
          <dd className="mt-1 text-foreground">
            {current?.statusLabel ?? "Non généré"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Version</dt>
          <dd className="mt-1 text-foreground">
            {current?.version ? `Version ${current.version}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Modèle</dt>
          <dd className="mt-1 text-foreground">
            {current?.templateLabel && current.templateVersion
              ? `${current.templateLabel} — version ${current.templateVersion}`
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted">Date de génération</dt>
          <dd className="mt-1 text-foreground">
            {current?.generatedAtLabel ?? "—"}
          </dd>
        </div>
      </dl>

      {current?.history ? (
        <DocumentVersionHistoryList history={current.history} compact />
      ) : current ? (
        <p className="mt-4 border-t pt-4 text-xs text-muted">
          L’historique de cette chaîne n’est pas disponible.
        </p>
      ) : null}

      <GenerationForm card={card} />
    </article>
  );
}

export function ReservationDocumentGenerationPanel({
  cards,
}: {
  cards: ReservationDocumentGenerationCard[];
}) {
  return (
    <div className="mb-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Génération des PDF contractuels
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Chaque génération crée une version immuable à partir du modèle
          sélectionné et des données actuelles du dossier. La génération
          définitive relira ces données au moment de sa confirmation.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <GenerationCard key={card.documentType} card={card} />
        ))}
      </div>
    </div>
  );
}
