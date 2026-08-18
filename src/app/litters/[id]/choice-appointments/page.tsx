import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import {
  createChoiceAppointmentPlan,
  reportChoiceAppointment,
  retryChoiceAssignmentConfirmation,
  selectChoiceGalleryPhoto,
  sendChoiceAppointmentPlanInvitations,
  uploadChoiceGalleryPhoto,
  updateChoiceAppointmentSlot,
  validateChoiceAppointmentPlan,
} from "@/features/reservations/choice-appointment-actions";
import { loadChoicePlanningSnapshot } from "@/features/reservations/choice-appointment-planning-data";
import { ChoiceAnimalAssignmentForm } from "@/features/reservations/choice-animal-assignment-form";
import { RankedChoiceEditor } from "@/features/reservations/ranked-choice-editor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const paris = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return paris.replace(" ", "T");
}

function appointmentLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

const blockerLabels: Record<string, string> = {
  place_not_confirmed: "Place post-naissance non confirmée",
  sex_not_confirmed: "Sexe non confirmé",
  active_order_not_confirmed: "Ordre actif non confirmé",
  required_documents_not_signed: "Documents requis non signés",
  deposit_incomplete: "Arrhes incomplètes",
};

const responseLabels: Record<string, string> = {
  in_person: "Présentiel",
  video: "Visioconférence",
  prechoice: "Pré-choix sans rendez-vous",
};

export default async function ChoiceAppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const snapshot = await loadChoicePlanningSnapshot(id, supabase);
  if (!snapshot) notFound();

  const eligible = snapshot.candidates.filter((candidate) => candidate.eligible);
  const excluded = snapshot.candidates.filter((candidate) => !candidate.eligible);
  const statusMessage = query.status
    ? {
        created: "Le brouillon de créneaux a été créé.",
        validated: "Le planning a été validé. Il est prêt pour les invitations.",
        invitations_sent: "Les invitations ont été envoyées via Brevo sans doublon.",
        saved: "Le pré-choix classé a été enregistré.",
        assigned: "Le chiot a été attribué et le rendez-vous finalisé.",
        assigned_confirmation_pending: "Le chiot a été attribué, mais la confirmation Brevo reste à reprendre sans modifier l’attribution.",
        confirmation_sent: "La confirmation d’attribution a été envoyée via Brevo sans doublon.",
        confirmation_pending: "La confirmation Brevo n’a pas abouti. L’attribution reste intacte et l’envoi peut être repris.",
        reported: "La famille a été reportée après les familles déjà planifiées.",
        photo_added: "La photo a été ajoutée à la galerie privée.",
        photo_selected: "La photo de présentation a été mise à jour.",
        photo_cleanup_required: "La photo n’a pas été enregistrée et son nettoyage Storage doit être repris. Aucun dossier ni chiot n’a été modifié.",
      }[query.status] ?? `Opération non appliquée : ${query.status}.`
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8">
      <Link href={`/litters/${id}`} className="text-sm font-semibold text-accent hover:underline">← Retour à la portée</Link>
      <header className="mt-6 border-b pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Choix des chiots</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Planning de {snapshot.litter.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">Fusion des files mâles et femelles, réponses familiales, pré-choix classé et attribution contrôlée.</p>
      </header>

      {statusMessage ? <p role={query.status && ["created", "validated", "invitations_sent", "saved", "assigned", "confirmation_sent", "reported", "photo_added", "photo_selected"].includes(query.status) ? "status" : "alert"} className="mt-6 rounded-xl border bg-surface px-4 py-3 text-sm font-semibold">{statusMessage}</p> : null}
      {!snapshot.canMutate ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Lecture seule : un rôle owner ou admin est requis pour préparer ou attribuer.</p> : null}

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border bg-surface p-5"><p className="text-xs font-semibold uppercase text-muted">Éligibles</p><p className="mt-2 text-3xl font-semibold">{eligible.length}</p></article>
        <article className="rounded-2xl border bg-surface p-5"><p className="text-xs font-semibold uppercase text-muted">À corriger</p><p className="mt-2 text-3xl font-semibold">{excluded.length}</p></article>
        <article className="rounded-2xl border bg-surface p-5"><p className="text-xs font-semibold uppercase text-muted">État du planning</p><p className="mt-2 text-lg font-semibold">{snapshot.plan?.status ?? "Aucun brouillon"}</p></article>
      </section>

      {excluded.length > 0 ? (
        <section className="mt-7 rounded-2xl border bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Dossiers exclus du brouillon</h2>
          <ul className="mt-4 divide-y rounded-xl border bg-background">
            {excluded.map((candidate) => <li key={candidate.reservationId} className="px-4 py-3 text-sm"><strong>{candidate.familyName}</strong><p className="mt-1 text-amber-800">{candidate.blockers.map((blocker) => blockerLabels[blocker] ?? blocker).join(" · ")}</p></li>)}
          </ul>
        </section>
      ) : null}

      {!snapshot.plan ? (
        <section className="mt-7 rounded-2xl border bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Créer le brouillon</h2>
          <p className="mt-2 text-sm text-muted">Les files restent ordonnées par sexe. Entre les deux têtes de file, Hermès privilégie le rang historique le plus ancien.</p>
          <form action={createChoiceAppointmentPlan} className="mt-5 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <input type="hidden" name="litter_id" value={id} />
            <label className="text-sm font-semibold">Début<input required name="starts_at" type="datetime-local" defaultValue={snapshot.suggestedSlots[0] ? toLocalDateTime(snapshot.suggestedSlots[0].plannedAt) : ""} className="mt-2 block w-full rounded-xl border bg-background px-3 py-2" /></label>
            <label className="text-sm font-semibold">Durée<input required name="duration_minutes" type="number" min={5} max={480} defaultValue={45} className="mt-2 block w-full rounded-xl border bg-background px-3 py-2" /></label>
            <button disabled={!snapshot.canMutate || eligible.length === 0} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Calculer les créneaux</button>
          </form>
          {snapshot.suggestedSlots.length > 0 ? <ol className="mt-5 divide-y rounded-xl border bg-background">{snapshot.suggestedSlots.map((slot) => { const candidate = eligible.find((item) => item.reservationId === slot.reservationId); return <li key={slot.reservationId} className="flex flex-col justify-between gap-1 px-4 py-3 text-sm sm:flex-row"><span><strong>#{slot.sequence}</strong> · {candidate?.familyName} · {slot.sex === "male" ? "Mâle" : "Femelle"}</span><span className="text-muted">Historique #{slot.historicalRank} · ordre actif #{slot.activeOrder}</span></li>; })}</ol> : null}
        </section>
      ) : (
        <>
          <section className="mt-7 rounded-2xl border bg-surface p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div><h2 className="text-xl font-semibold">Brouillon version {snapshot.plan.version}</h2><p className="mt-2 text-sm text-muted">Début {appointmentLabel(snapshot.plan.startsAt)} · {snapshot.plan.durationMinutes} minutes par famille.</p></div>
              {snapshot.plan.status === "draft" ? <form action={validateChoiceAppointmentPlan}><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="plan_id" value={snapshot.plan.id} /><input type="hidden" name="version" value={snapshot.plan.version} /><button disabled={!snapshot.canMutate} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Valider le planning</button></form> : <div className="flex flex-col items-end gap-2"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">Planning {snapshot.plan.status}</span><form action={sendChoiceAppointmentPlanInvitations}><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="plan_id" value={snapshot.plan.id} /><button disabled={!snapshot.canMutate} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Envoyer les invitations via Brevo</button></form></div>}
            </div>
          </section>

          <section className="mt-7 space-y-5">
            <h2 className="text-2xl font-semibold">Familles et attribution</h2>
            {snapshot.plan.slots.map((slot) => {
              const compatibleAnimals = snapshot.animals.filter((animal) => animal.sex === slot.sex && !animal.isBreeder && (animal.status === "available" || animal.id === slot.animalId));
              return <article key={slot.id} className="rounded-2xl border bg-surface p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-3 md:flex-row"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Créneau #{slot.sequence}</p><h3 className="mt-1 text-xl font-semibold">{slot.familyName}</h3><p className="mt-2 text-sm text-muted">{appointmentLabel(slot.plannedAt)} · {slot.sex === "male" ? "Mâle" : "Femelle"} · historique #{slot.historicalRank} · ordre actif #{slot.activeOrder}</p>{snapshot.plan?.status === "draft" && snapshot.canMutate ? <form action={updateChoiceAppointmentSlot} className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="slot_id" value={slot.id} /><input type="hidden" name="plan_version" value={snapshot.plan.version} /><label className="text-xs font-semibold text-muted">Ajuster le créneau<input required name="planned_at" type="datetime-local" defaultValue={toLocalDateTime(slot.plannedAt)} className="mt-1 block rounded-lg border bg-white px-2 py-1.5 text-sm" /></label><button className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent">Enregistrer</button></form> : null}</div><div className="text-sm"><span className="rounded-full border px-3 py-1.5 font-semibold">{responseLabels[slot.responseKind ?? ""] ?? "Réponse attendue"}</span><p className="mt-2 text-right text-muted">{slot.status}</p>{slot.assignmentEventId ? <form action={retryChoiceAssignmentConfirmation} className="mt-2"><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="assignment_event_id" value={slot.assignmentEventId} /><button className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent">Envoyer/reprendre la confirmation</button></form> : null}</div></div>
                {snapshot.canMutate ? <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <RankedChoiceEditor litterId={id} slotId={slot.id} animals={compatibleAnimals.map(({ id: animalId, name }) => ({ id: animalId, name }))} />
                  <ChoiceAnimalAssignmentForm litterId={id} slotId={slot.id} animals={compatibleAnimals} isChange={Boolean(slot.animalId)} />
                  {slot.status !== "assigned" ? <form action={reportChoiceAppointment} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 lg:col-span-2"><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="slot_id" value={slot.id} /><label className="block text-xs font-semibold uppercase tracking-wide text-amber-900">Reporter sans bloquer les suivants<input required minLength={5} name="reason" placeholder="Motif du report" className="mt-2 block w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label><button className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-950">Placer après les familles planifiées</button></form> : null}
                </div> : null}
              </article>;
            })}
          </section>
        </>
      )}

      <section className="mt-8 rounded-2xl border bg-surface p-5 sm:p-6">
        <h2 className="text-2xl font-semibold">Galerie privée des chiots</h2>
        <p className="mt-2 text-sm text-muted">Plusieurs photos peuvent être conservées. La photo principale est proposée dans la confirmation d’attribution.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {snapshot.animals.map((animal) => <article key={animal.id} className="rounded-xl border bg-background p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{animal.name}</h3><p className="mt-1 text-xs text-muted">{animal.sex === "male" ? "Mâle" : "Femelle"} · {animal.isBreeder ? "Conservé par l’élevage" : animal.status}</p></div><span className="text-xs text-muted">{animal.photos.length} photo(s)</span></div><div className="mt-4 grid grid-cols-3 gap-2">{animal.photos.map((photo) => <div key={photo.id} className={`relative aspect-square overflow-hidden rounded-lg border ${photo.isPrimary ? "ring-2 ring-accent" : ""}`}><Image src={photo.url} alt={`Photo de ${animal.name}`} fill unoptimized className="object-cover" />{photo.isPrimary ? <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Présentation</span> : snapshot.canMutate ? <form action={selectChoiceGalleryPhoto} className="absolute inset-x-1 bottom-1"><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="animal_id" value={animal.id} /><input type="hidden" name="media_id" value={photo.id} /><button className="w-full rounded bg-black/70 px-1 py-1 text-[10px] font-semibold text-white">Choisir</button></form> : null}</div>)}</div>{snapshot.canMutate ? <form action={uploadChoiceGalleryPhoto} className="mt-4 flex flex-col gap-2"><input type="hidden" name="litter_id" value={id} /><input type="hidden" name="animal_id" value={animal.id} /><input required type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-xs" /><button className="w-fit rounded-lg border px-3 py-2 text-xs font-semibold">Ajouter une photo</button></form> : null}</article>)}
        </div>
      </section>
    </main>
  );
}
