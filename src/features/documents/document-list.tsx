import Link from "next/link";

import { formatApplicationDate } from "@/features/applications/formatters";

import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "./formatters";
import type { DBDocument } from "./types";

export type DocumentWithContact = DBDocument & {
  contacts?: {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

function DateValue({ value }: { value: string | null }) {
  return (
    <span className="text-muted">
      {value ? formatApplicationDate(value) : "Non renseigné"}
    </span>
  );
}

function RelatedLinks({ document }: { document: DBDocument }) {
  const links = [
    document.contact_id
      ? { href: `/contacts/${document.contact_id}`, label: "Contact" }
      : null,
    document.application_id
      ? { href: `/candidatures/${document.application_id}`, label: "Candidature" }
      : null,
    document.reservation_id
      ? { href: `/reservations/${document.reservation_id}`, label: "Réservation" }
      : null,
    document.payment_id
      ? { href: `/payments/${document.payment_id}`, label: "Paiement" }
      : null,
    document.litter_id
      ? { href: `/litters/${document.litter_id}`, label: "Portée" }
      : null,
    document.animal_id
      ? { href: `/animals/${document.animal_id}`, label: "Animal" }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  if (links.length === 0) {
    return <span className="text-muted/60">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="font-medium text-accent hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function DocumentList({ documents }: { documents: DocumentWithContact[] }) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-sm text-muted">Aucun document trouvé.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface">
      <table className="w-full border-collapse text-left text-sm text-foreground">
        <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-6 py-4">Document</th>
            <th scope="col" className="px-6 py-4">Adoptant</th>
            <th scope="col" className="px-6 py-4">Statut</th>
            <th scope="col" className="px-6 py-4">Dates</th>
            <th scope="col" className="px-6 py-4">Fichier</th>
            <th scope="col" className="px-6 py-4">Signature</th>
            <th scope="col" className="px-6 py-4">Liens</th>
            <th scope="col" className="px-6 py-4">Détail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {documents.map((document) => {
            const contact = document.contacts;
            const contactName = contact
              ? contact.display_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : null;

            return (
              <tr key={document.id} className="transition-colors hover:bg-muted-soft/40">
                <td className="min-w-72 px-6 py-4">
                  <p className="font-semibold text-foreground">{document.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {getDocumentTypeLabel(document.document_type)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  {document.contact_id && contact ? (
                    <div>
                      <Link
                        href={`/contacts/${document.contact_id}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {contactName || "Contact sans nom"}
                      </Link>
                      {contact.email ? (
                        <p className="mt-1 text-xs text-muted">
                          {contact.email}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted/60">Non lié à un contact</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    {getDocumentStatusLabel(
                      document.status,
                      document.document_type,
                    )}
                  </span>
                </td>
                <td className="min-w-64 px-6 py-4 text-xs leading-6">
                  <p>Créé : <DateValue value={document.created_at} /></p>
                  <p>Mis à jour : <DateValue value={document.updated_at} /></p>
                  <p>Envoyé : <DateValue value={document.sent_at} /></p>
                  <p>Reçu signé : <DateValue value={document.signed_at} /></p>
                  <p>Reçu : <DateValue value={document.received_at} /></p>
                  <p>Expire : <DateValue value={document.expires_at} /></p>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {document.file_name || "Non renseigné"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {getSignatureRequiredLabel(document.signature_required)}
                </td>
                <td className="min-w-48 px-6 py-4">
                  <RelatedLinks document={document} />
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Link
                    href={`/documents/${document.id}`}
                    className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                  >
                    Consulter
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
