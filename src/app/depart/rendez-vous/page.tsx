import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { bookDepartureAppointment, declineDepartureAppointment } from "@/features/departures/departure-public-actions";
import { DEPARTURE_SESSION_COOKIE, readDepartureSession } from "@/features/departures/departure-public-service";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));

export default async function DeparturePublicPage({ searchParams }: { searchParams: Promise<{ confirmation?: string; conflit?: string }> }) {
  const query = await searchParams;
  const token = (await cookies()).get(DEPARTURE_SESSION_COOKIE)?.value;
  if (!token) redirect("/depart/indisponible");
  const session = await readDepartureSession(token);
  if (!session) redirect("/depart/indisponible");
  const confirmed = session.confirmedSlotId && session.confirmedStartsAt;
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10 sm:px-8"><header className="rounded-2xl border bg-surface p-6 sm:p-8"><p className="text-sm font-semibold uppercase tracking-wide text-accent">Rendez-vous de départ</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Choisissez votre rendez-vous</h1><p className="mt-3 text-sm leading-6 text-muted">Un bloc n’est réservé qu’après confirmation. Après votre choix, ce lien restera disponible en lecture seule.</p></header>{query.conflit ? <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">Ce créneau vient d’être réservé. Les disponibilités ont été actualisées : choisissez-en un autre.</p> : null}{query.confirmation === "none_fit" ? <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Votre réponse est enregistrée. L’éleveur vous contactera pour convenir d’un rendez-vous exceptionnel.</p> : null}{confirmed ? <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><p className="text-xs font-semibold uppercase text-emerald-800">Rendez-vous confirmé</p><p className="mt-2 text-xl font-semibold text-emerald-950">{date(session.confirmedStartsAt!)}</p><p className="mt-2 text-sm text-emerald-900">Durée prévue : {session.confirmedDurationMinutes} minutes. Pour toute modification, contactez directement l’éleveur.</p></section> : query.confirmation === "none_fit" ? null : <><form action={bookDepartureAppointment} className="mt-6 space-y-3"><fieldset><legend className="sr-only">Créneaux encore disponibles</legend>{session.slots.map((slot) => <label key={slot.id} className="flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-4"><input required type="radio" name="slot_id" value={slot.id} /><span><strong>{date(slot.startsAt)}</strong><span className="mt-1 block text-sm text-muted">Durée prévue : {slot.durationMinutes} minutes</span></span></label>)}</fieldset><button disabled={!session.slots.length} className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-40">Confirmer ce rendez-vous</button></form><form action={declineDepartureAppointment} className="mt-3"><button className="w-full rounded-xl border px-5 py-3 font-semibold text-accent">Aucun créneau ne me convient</button></form></>}</main>;
}
