"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AdopterProfileReviewView } from "@/features/adopter-profile-questionnaire/review-view";
import { recordAdopterManualContact } from "@/features/reservations/adopter-workbench-actions";
import {
  buildAdopterWorkbenchPath,
  deriveAdopterJourney,
  filterAndSortAdopterJourneys,
  groupAdopterJourneys,
  type AdopterActionState,
  type AdopterMilestoneKey,
  type AdopterQueue,
  type AdopterWorkbenchRecord,
  type AdopterWorkbenchSort,
  type AdopterWorkbenchView,
  type AdopterJourney,
} from "@/features/reservations/adopter-workbench-model";
import { ReservationNoteDialog } from "@/features/reservations/note-dialog";
import { ReservationNoteForm } from "@/features/reservations/note-form";

type InitialFilters = {
  view: AdopterWorkbenchView;
  search: string;
  step: AdopterMilestoneKey | "all";
  actionState: AdopterActionState | "all";
  queue: AdopterQueue | "all";
  sort: AdopterWorkbenchSort;
  selectedId: string | null;
};
type WorkbenchRole = "owner" | "admin" | "member" | "viewer";

const views: Array<[AdopterWorkbenchView, string]> = [
  ["current", "En cours"], ["waiting", "En attente / reportés"], ["follow_up", "À suivre"], ["finalized", "Finalisés"],
];
const stepLabels: Record<AdopterMilestoneKey, string> = {
  opening: "Ouverture", profile: "Profil", positioning: "Positionnement", reservation: "Réservation", choice_assignment: "Choix / attribution", departure: "Départ", adoption: "Adoption",
};
const shortStepLabels: Record<AdopterMilestoneKey, string> = {
  opening: "Ouv.", profile: "Profil", positioning: "Position", reservation: "Réserv.", choice_assignment: "Choix", departure: "Départ", adoption: "Adoption",
};
const queueLabels: Record<AdopterQueue, string> = {
  incomplete: "À compléter", flexible: "Préférence souple", female: "Femelles", male: "Mâles",
};

function actionTone(state: AdopterActionState) {
  if (state === "blocked") return "border-rose-200 bg-rose-50 text-rose-900";
  if (state === "overdue") return "border-amber-300 bg-amber-50 text-amber-950";
  if (state === "due") return "border-sky-200 bg-sky-50 text-sky-900";
  if (state === "none") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-border bg-background text-foreground";
}

function formatDate(value: string | null) {
  if (!value) return "Non planifié";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function positioningStatusLabel(value: string | null | undefined) {
  if (value === "confirmed") return "Place confirmée";
  if (value === "postponed") return "Reporté";
  if (value === "withdrawn") return "Retiré";
  if (value === "rectified") return "Rectifié";
  return "À positionner";
}

export function AdopterWorkbench({ records, role, initial }: { records: AdopterWorkbenchRecord[]; role: WorkbenchRole; initial: InitialFilters }) {
  const [view, setView] = useState(initial.view);
  const [search, setSearch] = useState(initial.search);
  const [step, setStep] = useState(initial.step);
  const [actionState, setActionState] = useState(initial.actionState);
  const [queue, setQueue] = useState(initial.queue);
  const [sort, setSort] = useState(initial.sort);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [isMobile, setIsMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const journeys = useMemo(() => records.map((record) => deriveAdopterJourney(record)), [records]);
  const visible = useMemo(() => filterAndSortAdopterJourneys(journeys, { view, search, step, actionState, queue, sort }), [journeys, view, search, step, actionState, queue, sort]);
  const grouped = useMemo(() => groupAdopterJourneys(visible), [visible]);
  const selectedIndex = visible.findIndex((journey) => journey.record.id === selectedId);
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : null;
  const returnPath = buildAdopterWorkbenchPath({ view, search, step, actionState, queue, sort, selectedId: selected?.record.id ?? null });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    window.history.replaceState(window.history.state, "", buildAdopterWorkbenchPath({ view, search, step, actionState, queue, sort, selectedId: selected?.record.id ?? null }));
  }, [view, search, step, actionState, queue, sort, selected]);

  const counts = Object.fromEntries(views.map(([key]) => [key, journeys.filter((item) => key === "follow_up" ? item.followUp : item.primaryView === key).length]));
  const panel = selected ? <AdopterPanel journey={selected} role={role} returnPath={returnPath} hasPrevious={selectedIndex > 0} hasNext={selectedIndex < visible.length - 1} onOpenProfile={() => setProfileOpen(true)} onClose={() => setSelectedId(null)} onPrevious={() => setSelectedId(visible[selectedIndex - 1]?.record.id ?? null)} onNext={() => setSelectedId(visible[selectedIndex + 1]?.record.id ?? null)} /> : <div className="py-20 text-center"><p className="font-semibold">Sélectionnez une famille</p><p className="mt-2 text-sm text-muted">La famille reste ouverte dans ce panneau sans perdre la vue ni les filtres.</p></div>;

  return <div className="space-y-5">
    <nav aria-label="Vues des parcours adoptants" className="flex gap-2 overflow-x-auto pb-1">
      {views.map(([key, label]) => <button key={key} type="button" onClick={() => { setView(key); setSelectedId(null); }} aria-pressed={view === key} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold ${view === key ? "border-accent bg-accent text-white" : "bg-surface text-muted hover:border-accent"}`}>{label} <span className="ml-1 opacity-75">{counts[key]}</span></button>)}
    </nav>

    <div className="rounded-2xl border bg-surface p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(135px,1fr))]">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Recherche transversale<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, email, téléphone, portée, animal…" className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-accent" /></label>
        <Filter label="Étape" value={step} onChange={(value) => setStep(value as typeof step)} options={[["all", "Toutes"], ...Object.entries(stepLabels)]} />
        <Filter label="État de l’action" value={actionState} onChange={(value) => setActionState(value as typeof actionState)} options={[["all", "Tous"], ["blocked", "Blocage"], ["overdue", "Retard"], ["due", "Échéance"], ["normal", "Normal"], ["none", "À jour"]]} />
        <Filter label="File" value={queue} onChange={(value) => setQueue(value as typeof queue)} options={[["all", "Toutes"], ...Object.entries(queueLabels)]} />
        <Filter label="Trier" value={sort} onChange={(value) => setSort(value as AdopterWorkbenchSort)} options={[["scope_queue_rank", "Portée, file, rang"], ["urgency", "Urgence"], ["deadline", "Échéance"], ["name", "Nom"], ["step", "Étape"], ["choice_appointment", "Rendez-vous choix"], ["departure_appointment", "Départ"]]} />
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-accent">Filtres avancés</summary><p className="mt-2 text-xs text-muted">Type d’action, rendez-vous, dérogation et motif de finalisation seront affinés lorsque leurs lots spécialisés fourniront les preuves structurées.</p></details>
    </div>

    <div className="grid min-h-[620px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(520px,550px)]">
      <div className="space-y-5">
        <p className="text-sm font-medium text-muted">{visible.length} parcours affiché{visible.length > 1 ? "s" : ""}</p>
        {grouped.length === 0 ? <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center"><p className="font-semibold">Aucun parcours dans cette vue</p><p className="mt-2 text-sm text-muted">Le statut technique seul n’ouvre jamais un parcours : un versement accepté est requis.</p></div> : grouped.map((group) => <section key={group.key} className="overflow-hidden rounded-2xl border bg-surface"><header className="flex items-center justify-between border-b bg-background px-4 py-3"><h2 className="font-semibold">{group.label}</h2><span className="text-xs text-muted">Actions collectives indisponibles dans ce lot</span></header>{group.sections.map((section) => <div key={section.key}><h3 className="border-b bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{section.label}</h3><div className="hidden md:block"><table className="w-full table-fixed text-left text-sm"><thead className="sr-only"><tr><th>Famille</th><th>Progression</th><th>À faire</th><th>Prochain repère</th></tr></thead><tbody className="divide-y">{section.items.map((journey) => <JourneyRow key={journey.record.id} journey={journey} selected={selected?.record.id === journey.record.id} onSelect={(button) => { triggerRef.current = button; setSelectedId(journey.record.id); }} />)}</tbody></table></div><div className="divide-y md:hidden">{section.items.map((journey) => <JourneyCard key={journey.record.id} journey={journey} onSelect={(button) => { triggerRef.current = button; setSelectedId(journey.record.id); }} />)}</div></div>)}</section>)}
      </div>
      <aside aria-label="Parcours adoptant sélectionné" className="hidden h-fit rounded-2xl border bg-surface p-5 shadow-sm lg:sticky lg:top-5 lg:block">{panel}</aside>
    </div>

    <Dialog open={isMobile && Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>{selected ? <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }} className="left-0 top-0 block h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 bg-surface p-5 [&>button:last-child]:hidden"><DialogTitle className="sr-only">Parcours adoptant de {selected.record.familyName}</DialogTitle><DialogDescription className="sr-only">Dossier de travail mobile</DialogDescription>{panel}</DialogContent> : null}</Dialog>
    <Dialog open={(role === "owner" || role === "admin") && profileOpen && Boolean(selected?.record.profile)} onOpenChange={setProfileOpen}>{selected?.record.profile ? <DialogContent className="h-[94dvh] w-[96vw] max-w-[1500px] overflow-y-auto bg-stone-50 p-6 sm:p-8"><DialogTitle className="sr-only">Questionnaire Profil de {selected.record.familyName}</DialogTitle><DialogDescription className="sr-only">Lecture large du questionnaire familial</DialogDescription><AdopterProfileReviewView profile={selected.record.profile} currentSexPreference={selected.record.sexPreference} canAdmin={role === "owner" || role === "admin"} canWrite={role !== "viewer"} returnTo={returnPath} manualContacts={selected.record.manualContacts ?? []} onClose={() => setProfileOpen(false)} /></DialogContent> : null}</Dialog>
  </div>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="text-xs font-semibold uppercase tracking-wide text-muted">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-accent">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

function JourneyRow({ journey, selected, onSelect }: { journey: AdopterJourney; selected: boolean; onSelect: (trigger: HTMLElement) => void }) {
  const select = (trigger: HTMLElement) => onSelect(trigger);
  return <tr tabIndex={0} aria-selected={selected} onClick={(event) => select(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(event.currentTarget); } }} className={`cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${selected ? "bg-accent-soft" : "hover:bg-background"}`}><td className="w-[25%] px-4 py-3 align-top"><span className="text-left font-semibold text-accent">{journey.record.familyName}</span><p className="mt-1 text-xs text-muted">{journey.record.rank ? `Rang #${journey.record.rank}` : "Rang à compléter"}</p></td><td className="w-[23%] px-3 py-3 align-top"><p className="font-medium">{journey.currentMilestone.label}</p><p className="mt-1 text-xs text-muted">{journey.milestones.filter((step) => step.state === "done").length}/7 jalons</p></td><td className="w-[30%] px-3 py-3 align-top"><span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${actionTone(journey.primaryAction.state)}`}>{journey.primaryAction.label}</span>{journey.otherActionCount > 0 ? <span className="ml-2 text-xs font-semibold text-muted">+{journey.otherActionCount} autres</span> : null}</td><td className="w-[22%] px-3 py-3 align-top text-xs text-muted">{journey.primaryAction.detail}</td></tr>;
}

function JourneyCard({ journey, onSelect }: { journey: AdopterJourney; onSelect: (button: HTMLElement) => void }) {
  return <button type="button" onClick={(event) => onSelect(event.currentTarget)} className="block w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-accent">{journey.record.familyName}</p><p className="mt-1 text-xs text-muted">{journey.currentMilestone.label} · {journey.milestones.filter((step) => step.state === "done").length}/7</p></div><span className="rounded-full border px-2 py-1 text-sm font-bold">#{journey.record.rank ?? "—"}</span></div><p className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${actionTone(journey.primaryAction.state)}`}>{journey.primaryAction.label}{journey.otherActionCount ? ` · +${journey.otherActionCount}` : ""}</p><p className="mt-2 text-xs text-muted">{journey.primaryAction.detail}</p></button>;
}

function AdopterPanel({ journey, role, returnPath, hasPrevious, hasNext, onOpenProfile, onClose, onPrevious, onNext }: { journey: AdopterJourney; role: WorkbenchRole; returnPath: string; hasPrevious: boolean; hasNext: boolean; onOpenProfile: () => void; onClose: () => void; onPrevious: () => void; onNext: () => void }) {
  const record = journey.record;
  const canMutate = role === "owner" || role === "admin";
  const canReadProfileDetails = role === "owner" || role === "admin";
  const canRecord = canMutate || role === "member";
  return <div>
    <header className="flex items-start justify-between gap-3 border-b pb-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Parcours adoptant · famille</p><h2 className="mt-1 truncate text-xl font-semibold">{record.familyName}</h2><p className="mt-1 text-sm text-muted">{journey.scopeLabel} · {queueLabels[journey.queue]} · {record.rank ? `rang #${record.rank}` : "rang à compléter"}</p></div><button type="button" onClick={onClose} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted">Fermer</button></header>

    <ol aria-label="Sept jalons du parcours" className="mt-5 grid grid-cols-7 gap-1">{journey.milestones.map((milestone, index) => <li key={milestone.key} title={`${milestone.label} — ${milestone.detail}`} className="min-w-0 text-center"><span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${milestone.state === "done" ? "border-emerald-500 bg-emerald-500 text-white" : milestone.key === journey.currentMilestone.key ? "border-amber-500 bg-amber-50 text-amber-800" : "bg-background text-muted"}`}>{milestone.state === "done" ? "✓" : index + 1}</span><span className="mt-1 block truncate text-[10px] font-semibold leading-3">{shortStepLabels[milestone.key]}</span></li>)}</ol>

    <section className="mt-5 rounded-xl border border-accent/20 bg-accent-soft p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Positionnement</h3><p className="mt-1 font-semibold">{positioningStatusLabel(record.postBirthPositionStatus)}</p></div><span className="rounded-full border bg-surface px-2.5 py-1 text-xs font-bold">{record.rank ? `#${record.rank}` : "—"}</span></div>
      <p className="mt-2 text-sm text-muted">Après naissance · {journey.scopeLabel} · {queueLabels[journey.queue]}</p>
      <Link href={record.litterGroupId ? `/litter-groups/${record.litterGroupId}/positioning` : "/positionnements"} className="mt-3 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-semibold !text-white">Ouvrir le positionnement</Link>
    </section>

    <section className={`mt-5 rounded-xl border p-4 ${actionTone(journey.primaryAction.state)}`}><p className="text-xs font-semibold uppercase tracking-wide">Action prioritaire</p><p className="mt-1 font-semibold">{journey.primaryAction.label}</p><p className="mt-1 text-xs leading-5">{journey.primaryAction.detail}</p>{journey.primaryAction.key === "profile" && journey.primaryAction.available && canReadProfileDetails ? <button type="button" onClick={onOpenProfile} className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">{journey.primaryAction.label}</button> : journey.primaryAction.key === "profile" && journey.primaryAction.available ? <p className="mt-2 text-xs font-semibold">Réponses détaillées réservées aux rôles owner et admin.</p> : !journey.primaryAction.available ? <p className="mt-2 rounded-lg bg-white/60 px-2 py-1 text-xs font-semibold">Indisponible dans ce lot — aucune action n’est simulée.</p> : null}</section>

    <section className="mt-5 rounded-xl border bg-background p-4"><h3 className="font-semibold">{journey.currentMilestone.label}</h3><p className="mt-1 text-sm text-muted">{journey.currentMilestone.detail}</p><ul className="mt-3 space-y-2 text-sm">{journey.actions.filter((item) => item.milestone === journey.currentMilestone.key).map((item) => <li key={item.key} className="flex items-start justify-between gap-2"><span>{item.label}</span><span className="text-xs text-muted">{item.available ? "Disponible" : "Prochain lot"}</span></li>)}</ul></section>

    <div className="mt-5 space-y-2">
      <Detail title="Famille et profil"><dl className="grid gap-3 text-sm sm:grid-cols-2"><Info label="Email" value={record.email ?? "Non renseigné"} /><Info label="Téléphone" value={record.phone ?? "Non renseigné"} /><Info label="Référence" value={record.reference} /><Info label="Rôle connecté" value={role} /></dl>{record.profile && canReadProfileDetails ? <button type="button" onClick={onOpenProfile} className="mt-3 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent">Lire le questionnaire</button> : record.profile ? <p className="mt-3 text-xs text-muted">État du jalon visible ; réponses détaillées réservées aux rôles owner et admin.</p> : null}{record.contactId ? <Link href={`/contacts/${record.contactId}`} className="ml-3 mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Ouvrir la fiche contact</Link> : null}</Detail>

      <Detail title="Paiements"><p className="text-sm">Reçu : {(record.paidCents / 100).toLocaleString("fr-FR")} € · Remboursé : {(record.refundedCents / 100).toLocaleString("fr-FR")} €</p><QuickMutationLink canMutate={canMutate} href={`/reservations/${record.id}?return_to=${encodeURIComponent(returnPath)}#payments`} label="Enregistrer un paiement" /></Detail>
      <Detail title="Documents"><p className="text-sm">{record.signedDocumentCount}/{record.documentCount} document(s) signé(s) ou validé(s).</p><Link href={`/reservations/${record.id}?return_to=${encodeURIComponent(returnPath)}#documents`} className="mt-3 inline-flex text-sm font-semibold text-accent">Ouvrir les documents</Link></Detail>
      <Detail title="Rendez-vous et attribution"><p className="text-sm">Choix : {formatDate(record.choiceAppointmentAt)}</p><p className="mt-1 text-sm">Départ : {formatDate(record.departureAppointmentAt)}</p><QuickMutationLink canMutate={canMutate} href={`/reservations/${record.id}?return_to=${encodeURIComponent(returnPath)}#appointments`} label="Créer ou modifier un rendez-vous" /></Detail>
      <Detail title="Communications">{canRecord ? <ManualContactForm record={record} returnPath={returnPath} /> : <ReadOnlyRoleMessage />}</Detail>
      <Detail title="Notes internes">{canRecord ? <ReservationNoteDialog triggerLabel="Ajouter une note" noteForm={<ReservationNoteForm reservationId={record.id} returnTo={returnPath} />} /> : <ReadOnlyRoleMessage />}</Detail>
      <Detail title="Activité récente" open>{record.recentEvents.length ? <ol className="space-y-3">{record.recentEvents.map((item) => <li key={`${item.kind}-${item.id}`} className="border-l-2 pl-3"><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-muted">{formatDate(item.occurredAt)}</p>{item.detail ? <p className="mt-1 line-clamp-2 text-xs text-muted">{item.detail}</p> : null}</li>)}</ol> : <p className="text-sm text-muted">Aucun événement récent.</p>}</Detail>
    </div>

    <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-2"><Link href={`/reservations/${record.id}?return_to=${encodeURIComponent(returnPath)}`} className="rounded-xl border px-3 py-2 text-center text-sm font-semibold text-accent">Ouvrir le parcours complet</Link><Link href={`/reservations/${record.id}?return_to=${encodeURIComponent(returnPath)}`} className="rounded-xl bg-accent px-3 py-2 text-center text-sm font-semibold !text-white">Agrandir le dossier</Link></div>
    <div className="mt-4 flex justify-between"><button type="button" disabled={!hasPrevious} onClick={onPrevious} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">← Précédent</button><button type="button" disabled={!hasNext} onClick={onNext} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Suivant →</button></div>
  </div>;
}

function Detail({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) { return <details open={open} className="rounded-xl border bg-surface"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{title}</summary><div className="border-t px-4 py-4">{children}</div></details>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase text-muted">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }
function QuickMutationLink({ canMutate, href, label }: { canMutate: boolean; href: string; label: string }) { return canMutate ? <Link href={href} className="mt-3 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent">{label}</Link> : <span className="mt-3 inline-flex cursor-not-allowed rounded-lg border px-3 py-2 text-sm font-semibold text-muted" title="Rôle owner ou admin requis">{label} · owner/admin requis</span>; }
function ReadOnlyRoleMessage() { return <p className="text-sm text-muted">Consultation uniquement pour ce rôle.</p>; }
function ManualContactForm({ record, returnPath }: { record: AdopterWorkbenchRecord; returnPath: string }) { const [defaults] = useState(() => { const date = new Date(); return { contactedAt: new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16), commandId: crypto.randomUUID() }; }); return <form action={recordAdopterManualContact} className="space-y-3"><input type="hidden" name="reservation_id" value={record.id} /><input type="hidden" name="expected_updated_at" value={record.updatedAt} /><input type="hidden" name="client_command_id" value={defaults.commandId} /><input type="hidden" name="return_to" value={returnPath} /><label className="block text-xs font-semibold uppercase text-muted">Canal<select name="channel" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm normal-case"><option value="phone">Appel</option><option value="sms">SMS</option><option value="external_email">Email externe</option><option value="visit">Visite</option><option value="video">Visio</option><option value="other">Autre</option></select></label><label className="block text-xs font-semibold uppercase text-muted">Date et heure<input name="contacted_at" type="datetime-local" required defaultValue={defaults.contactedAt} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted">Résumé<textarea name="summary" required minLength={3} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal normal-case" /></label><button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Tracer le contact manuel</button></form>; }
