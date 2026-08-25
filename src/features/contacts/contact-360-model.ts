export type ContactChronologyKind =
  | "form_submission"
  | "application"
  | "payment"
  | "document"
  | "appointment"
  | "note"
  | "manual_contact"
  | "email";

export type ContactChronologyEmailDetails = {
  recipientEmail: string | null;
  subject: string | null;
  status: string | null;
  attemptCount: number | null;
  lastErrorCode: string | null;
  sentAt: string | null;
  createdAt: string | null;
  attachmentCount: number | null;
};

export type Contact360SourceEntry = {
  id: string;
  kind: ContactChronologyKind;
  label: string | null;
  detail: string | null;
  status: string | null;
  occurredAt: string | null;
  email: ContactChronologyEmailDetails | null;
};

export type ContactChronologyEntry = {
  id: string;
  kind: ContactChronologyKind;
  label: string;
  detail: string | null;
  status: string | null;
  occurredAt: string;
  email?: ContactChronologyEmailDetails;
};

export type Contact360JourneyReservation = {
  id: string;
  status: string | null;
};

export const CONTACT_CHRONOLOGY_PAGE_SIZE = 30;

const CONTACT_CHRONOLOGY_KIND_LABELS: Record<ContactChronologyKind, string> = {
  form_submission: "Soumission de formulaire",
  application: "Candidature",
  payment: "Paiement",
  document: "Document",
  appointment: "Rendez-vous",
  note: "Note interne",
  manual_contact: "Échange manuel",
  email: "Email",
};

export function getContactChronologyKindLabel(kind: ContactChronologyKind): string {
  return CONTACT_CHRONOLOGY_KIND_LABELS[kind];
}

export function buildContactChronology(
  entries: Contact360SourceEntry[],
): ContactChronologyEntry[] {
  const built: ContactChronologyEntry[] = [];
  for (const entry of entries) {
    if (!entry.occurredAt) continue;
    if (!entry.label) continue;
    built.push({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      detail: entry.detail,
      status: entry.status,
      occurredAt: entry.occurredAt,
      ...(entry.email ? { email: entry.email } : {}),
    });
  }
  built.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return built;
}

export type Contact360Mode =
  | { mode: "journey"; dossierCount: number }
  | { mode: "standalone"; dossierCount: 0 };

// A contact is presented in journey mode as soon as it holds at least one
// adopter-journey reservation — active or finalized alike. The dossier link
// card then carries the detailed history; the contact page never duplicates it.
export function classifyContact360(input: {
  reservations: Contact360JourneyReservation[];
}): Contact360Mode {
  const count = input.reservations.length;
  return count > 0 ? { mode: "journey", dossierCount: count } : { mode: "standalone", dossierCount: 0 };
}

export type ContactChronologyPage = {
  items: ContactChronologyEntry[];
  totalCount: number;
  hasMore: boolean;
  pageCount: number;
};

export function paginateContactChronology(
  entries: ContactChronologyEntry[],
  page: number,
): ContactChronologyPage {
  const totalCount = entries.length;
  const pageCount = Math.ceil(totalCount / CONTACT_CHRONOLOGY_PAGE_SIZE);
  const start = (page - 1) * CONTACT_CHRONOLOGY_PAGE_SIZE;
  return {
    items: entries.slice(start, start + CONTACT_CHRONOLOGY_PAGE_SIZE),
    totalCount,
    hasMore: page < pageCount && page > 0,
    pageCount,
  };
}
