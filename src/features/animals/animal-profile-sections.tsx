import Link from "next/link";

import { getDocumentStatusLabel, getDocumentTypeLabel } from "@/features/documents/formatters";
import { getLitterStatusLabel } from "@/features/litters/formatters";
import { AnimalHistorySection } from "./animal-history-section";
import { formatAnimalDate } from "./formatters";
import type { AnimalHistoryEntry } from "./animal-history-model";
import type { AnimalAttentionPoint } from "./animal-profile-model";

export type AnimalProfileDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  file_name: string | null;
};

export type AnimalProfileEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  priority: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};

export type AnimalProfileNote = {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  created_at: string;
};

export type AnimalProfileLitter = {
  id: string;
  name: string | null;
  status: string;
  actualBirthDate: string | null;
  bornTotalCount: number | null;
  aliveCount: number | null;
};

export type AnimalProfileFemaleSummary = {
  latestCycle: {
    id: string;
    startedOn: string;
    endedOn: string | null;
    status: string;
  } | null;
  latestMeasurement: {
    measuredAt: string;
    value: number;
    unit: string;
  } | null;
  matingCount: number;
  litterCount: number;
  descendantCount: number;
};

export type AnimalProfileMaleSummary = {
  litterCount: number;
  descendantCount: number;
  aliveDescendantCount: number;
};

function DefinitionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/70 py-3 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{children || "Non renseigné"}</dd>
    </div>
  );
}

export function AnimalOverviewSection({
  animal,
  litter,
  mother,
  father,
  owner,
  reservationContact,
  reservation,
  attention,
  recentActivity,
  onOpenTab,
  onOpenIdentity,
  hasSituationError,
}: {
  animal: {
    birthDate: string | null;
    identificationNumber: string | null;
    lofNumber: string | null;
    coatColor: string | null;
    pedigreeUrl: string | null;
    birthOrder: number | null;
    birthWeightGrams: number | null;
    collarColor: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  litter: { id: string; name: string | null } | null;
  mother: { id: string; name: string } | null;
  father: { id: string; name: string } | null;
  owner: { id: string | null; name: string | null } | null;
  reservationContact: { id: string | null; name: string | null } | null;
  reservation: { id: string; status: string; paidCents: number; priceCents: number | null; currency: string } | null;
  attention: AnimalAttentionPoint[];
  recentActivity: AnimalHistoryEntry[];
  onOpenTab: (tab: "overview" | "health" | "history") => void;
  onOpenIdentity: () => void;
  hasSituationError: boolean;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="animal-attention-heading">
        <div className="flex items-end justify-between gap-4 border-b pb-3">
          <h2 id="animal-attention-heading" className="text-lg font-semibold tracking-tight">Points d’attention</h2>
          <span className="text-xs text-muted">3 maximum</span>
        </div>
        {attention.length === 0 ? (
          <p className="py-5 text-sm text-muted">Aucun point d’attention actuellement.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {attention.map((point) => (
              <li key={point.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{point.title}</p>
                  {point.detail ? <p className="mt-1 text-xs text-muted">Échéance : {formatAnimalDate(point.detail)}</p> : null}
                </div>
                <button type="button" onClick={() => point.kind === "identity" ? onOpenIdentity() : onOpenTab(point.tab === "health" || point.tab === "history" ? point.tab : "overview")} className="w-fit text-sm font-semibold text-accent hover:underline">Consulter</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <section id="animal-essential-identity" tabIndex={-1} className="border-t pt-4 outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-labelledby="animal-essential-heading">
          <h2 id="animal-essential-heading" className="text-lg font-semibold tracking-tight">Essentiel</h2>
          <dl className="mt-3">
            <DefinitionRow label="Né(e) le">{formatAnimalDate(animal.birthDate)}</DefinitionRow>
            <DefinitionRow label="Identification">{animal.identificationNumber}</DefinitionRow>
            <DefinitionRow label="Numéro LOF">{animal.lofNumber}</DefinitionRow>
            <DefinitionRow label="Robe">{animal.coatColor}</DefinitionRow>
            <DefinitionRow label="Page SCC">{animal.pedigreeUrl ? <a href={animal.pedigreeUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">Ouvrir la fiche ↗</a> : "Non renseignée"}</DefinitionRow>
          </dl>
        </section>
        <section className="border-t pt-4" aria-labelledby="animal-origin-heading">
          <h2 id="animal-origin-heading" className="text-lg font-semibold tracking-tight">Origines</h2>
          <dl className="mt-3">
            <DefinitionRow label="Portée">{litter ? <Link href={`/litters/${litter.id}`} className="text-accent hover:underline">{litter.name || "Ouvrir la portée"}</Link> : "Non renseignée"}</DefinitionRow>
            <DefinitionRow label="Mère">{mother ? <Link href={`/animals/${mother.id}`} className="text-accent hover:underline">{mother.name}</Link> : "Non renseignée"}</DefinitionRow>
            <DefinitionRow label="Père">{father ? <Link href={`/animals/${father.id}`} className="text-accent hover:underline">{father.name}</Link> : "Non renseigné"}</DefinitionRow>
            <DefinitionRow label="Naissance">{[animal.birthOrder ? `${animal.birthOrder}e` : null, animal.birthWeightGrams ? `${animal.birthWeightGrams} g` : null, animal.collarColor].filter(Boolean).join(" · ") || "Non renseignée"}</DefinitionRow>
          </dl>
        </section>
      </div>

      <section className="border-t pt-4" aria-labelledby="animal-situation-heading">
        <h2 id="animal-situation-heading" className="text-lg font-semibold tracking-tight">Situation, propriétaire et réservation</h2>
        {hasSituationError ? <p role="alert" className="mt-3 text-sm text-amber-800">Certaines informations de situation n’ont pas pu être chargées.</p> : null}
        <dl className="mt-3 grid gap-x-10 lg:grid-cols-2">
          <DefinitionRow label="Propriétaire">{owner?.id ? <Link href={`/contacts/${owner.id}`} className="text-accent hover:underline">{owner.name || "Ouvrir le contact"}</Link> : owner?.name || "Non renseigné"}</DefinitionRow>
          <DefinitionRow label="Contact de réservation">{reservationContact?.id ? <Link href={`/contacts/${reservationContact.id}`} className="text-accent hover:underline">{reservationContact.name || "Ouvrir le contact"}</Link> : reservationContact?.name || "Aucun"}</DefinitionRow>
          <DefinitionRow label="Réservation">{reservation ? <Link href={`/reservations/${reservation.id}`} className="text-accent hover:underline">{reservation.status}</Link> : "Aucune"}</DefinitionRow>
          {reservation ? <DefinitionRow label="Paiement">{new Intl.NumberFormat("fr-FR", { style: "currency", currency: reservation.currency }).format(reservation.paidCents / 100)}{reservation.priceCents ? ` / ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: reservation.currency }).format(reservation.priceCents / 100)}` : ""}</DefinitionRow> : null}
        </dl>
      </section>

      <section className="border-t pt-4" aria-labelledby="animal-activity-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="animal-activity-heading" className="text-lg font-semibold tracking-tight">Dernières informations</h2>
          <button type="button" onClick={() => onOpenTab("history")} className="text-sm font-semibold text-accent hover:underline">Tout l’historique</button>
        </div>
        {recentActivity.length === 0 ? <p className="py-5 text-sm text-muted">Aucune activité récente.</p> : (
          <ol className="mt-3 divide-y divide-border/70">
            {recentActivity.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-5 py-4"><div><p className="text-sm font-semibold">{entry.label}</p>{entry.detail ? <p className="mt-1 line-clamp-2 text-xs text-muted">{entry.detail}</p> : null}</div><time className="shrink-0 text-xs text-muted">{formatAnimalDate(entry.occurredAt)}</time></li>)}
          </ol>
        )}
      </section>

      <section className="grid gap-6 border-t pt-4 lg:grid-cols-2" aria-label="Informations secondaires">
        <div><h2 className="text-sm font-semibold">Note générale</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{animal.notes || "Aucune note générale."}</p></div>
        <dl><DefinitionRow label="Création">{formatAnimalDate(animal.createdAt)}</DefinitionRow><DefinitionRow label="Mise à jour">{formatAnimalDate(animal.updatedAt)}</DefinitionRow></dl>
      </section>
    </div>
  );
}

export function AnimalHealthSection({ notes, events, documents, onAdd, onDocuments, hasError }: { notes: AnimalProfileNote[]; events: AnimalProfileEvent[]; documents: AnimalProfileDocument[]; onAdd: React.ReactNode; onDocuments: () => void; hasError: boolean }) {
  const eventStatusLabels: Record<string, string> = { planned: "Planifié", todo: "À faire", in_progress: "En cours", done: "Fait", late: "En retard", cancelled: "Annulé", postponed: "Reporté", not_applicable: "Sans objet" };
  return <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,.85fr)]">
    <section className="border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold tracking-tight">Suivi de santé</h2>{onAdd}</div>
      {hasError ? <p role="alert" className="mt-3 text-sm text-amber-800">Certaines informations de santé n’ont pas pu être chargées.</p> : null}
      {events.length === 0 && notes.length === 0 ? <p className="py-5 text-sm text-muted">Aucun événement ou note santé.</p> : <div className="mt-3 divide-y divide-border/70">{events.map((event) => <article key={event.id} className="py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{event.title}</h3><span className="rounded-full border px-2 py-0.5 text-xs text-muted">{eventStatusLabels[event.status] ?? event.status}</span></div><p className="mt-1 text-xs text-muted">{formatAnimalDate(event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at)}</p>{event.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{event.description}</p> : null}</article>)}{notes.map((note) => <article key={note.id} className="py-4"><h3 className="text-sm font-semibold">{note.title || "Note santé"}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{note.body}</p><p className="mt-1 text-xs text-muted">{formatAnimalDate(note.created_at)}</p></article>)}</div>}
    </section>
    <aside className="border-t pt-4"><h2 className="text-lg font-semibold tracking-tight">Documents santé</h2><p className="mt-2 text-sm text-muted">{documents.length} document{documents.length > 1 ? "s" : ""} lié{documents.length > 1 ? "s" : ""} à la santé</p><ul className="mt-3 divide-y divide-border/70">{documents.slice(0, 3).map((document) => <li key={document.id} className="py-3"><Link href={`/documents/${document.id}`} className="text-sm font-semibold text-accent hover:underline">{document.title}</Link></li>)}</ul><button type="button" onClick={onDocuments} className="mt-4 text-sm font-semibold text-accent hover:underline">Voir tous les documents</button></aside>
  </div>;
}

export function AnimalReproductionSection({ animalId, sex, female, male, litters, hasError }: { animalId: string; sex: string; female: AnimalProfileFemaleSummary | null; male: AnimalProfileMaleSummary | null; litters: AnimalProfileLitter[]; hasError: boolean }) {
  const statusLabels: Record<string, string> = { planned: "Prévu", in_progress: "En cours", mated: "Saillie enregistrée", closed: "Terminé", cancelled: "Annulé" };
  const errorNotice = hasError ? <p role="alert" className="mb-5 text-sm text-amber-800">La synthèse reproductive est partielle. Les informations chargées restent affichées.</p> : null;
  if (sex === "female") return <>{errorNotice}<div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,.85fr)]"><section className="border-t pt-4"><h2 className="text-lg font-semibold tracking-tight">Parcours reproductif</h2><div className="mt-5 grid grid-cols-3 gap-4 border-b pb-5"><div><strong className="block text-2xl">{female?.litterCount ?? 0}</strong><span className="text-xs text-muted">portées</span></div><div><strong className="block text-2xl">{female?.descendantCount ?? 0}</strong><span className="text-xs text-muted">chiots nés</span></div><div><strong className="block text-2xl">{female?.matingCount ?? 0}</strong><span className="text-xs text-muted">saillies du cycle</span></div></div><LitterList litters={litters} /></section><aside className="border-t pt-4"><h2 className="text-lg font-semibold tracking-tight">Dernier cycle</h2>{female?.latestCycle ? <dl className="mt-3"><DefinitionRow label="Début">{formatAnimalDate(female.latestCycle.startedOn)}</DefinitionRow><DefinitionRow label="Statut">{statusLabels[female.latestCycle.status] ?? female.latestCycle.status}</DefinitionRow><DefinitionRow label="Dernier dosage">{female.latestMeasurement ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(female.latestMeasurement.value)} ${female.latestMeasurement.unit === "ng_ml" ? "ng/mL" : "nmol/L"}` : "Aucun"}</DefinitionRow></dl> : <p className="mt-3 text-sm text-muted">Aucun cycle reproductif.</p>}<Link href={`/animals/${animalId}/reproduction`} className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold !text-white">Ouvrir le suivi complet</Link></aside></div></>;
  return <>{errorNotice}<section className="border-t pt-4"><h2 className="text-lg font-semibold tracking-tight">Descendance</h2><div className="mt-5 flex gap-10 border-b pb-5"><div><strong className="block text-2xl">{male?.litterCount ?? 0}</strong><span className="text-xs text-muted">{male?.litterCount === 1 ? "portée" : "portées"}</span></div><div><strong className="block text-2xl">{male?.descendantCount ?? 0}</strong><span className="text-xs text-muted">chiots nés</span></div><div><strong className="block text-2xl">{male?.aliveDescendantCount ?? 0}</strong><span className="text-xs text-muted">vivants</span></div></div><LitterList litters={litters} empty="Aucune portée liée à ce mâle." /></section></>;
}

function LitterList({ litters, empty = "Aucune portée enregistrée." }: { litters: AnimalProfileLitter[]; empty?: string }) { return litters.length === 0 ? <p className="py-5 text-sm text-muted">{empty}</p> : <ul className="mt-3 divide-y divide-border/70">{litters.map((litter) => <li key={litter.id} className="flex items-center justify-between gap-5 py-4"><div><Link href={`/litters/${litter.id}`} className="text-sm font-semibold text-accent hover:underline">{litter.name || "Portée"}</Link><p className="mt-1 text-xs text-muted">{litter.actualBirthDate ? formatAnimalDate(litter.actualBirthDate) : "Date non renseignée"} · {litter.bornTotalCount ?? litter.aliveCount ?? 0} chiots</p></div><span className="text-xs text-muted">{getLitterStatusLabel(litter.status)}</span></li>)}</ul>; }

export function AnimalDocumentsSection({ documents, hasError }: { documents: AnimalProfileDocument[]; hasError: boolean }) { return <section className="border-t pt-4"><div className="flex items-end justify-between gap-4"><h2 className="text-lg font-semibold tracking-tight">Documents</h2><span className="text-xs text-muted">{documents.length} au total</span></div>{hasError ? <p role="alert" className="mt-3 text-sm text-amber-800">La liste des documents n’a pas pu être chargée complètement.</p> : null}{documents.length === 0 && !hasError ? <p className="py-5 text-sm text-muted">Aucun document lié.</p> : <ul className="mt-3 divide-y divide-border/70">{documents.map((document) => <li key={document.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><Link href={`/documents/${document.id}`} className="text-sm font-semibold text-accent hover:underline">{document.title}</Link><p className="mt-1 text-xs text-muted">{getDocumentTypeLabel(document.document_type)} · {document.file_name || "Sans fichier"}</p></div><div className="text-xs text-muted"><span className="rounded-full border px-2 py-1">{getDocumentStatusLabel(document.status, document.document_type)}</span><time className="ml-3">{formatAnimalDate(document.created_at)}</time></div></li>)}</ul>}</section>; }

export function AnimalHistoryTab({ entries, hasError }: { entries: AnimalHistoryEntry[]; hasError: boolean }) { return <AnimalHistorySection entries={entries} hasError={hasError} variant="plain" />; }
