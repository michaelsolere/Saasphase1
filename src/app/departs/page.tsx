import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { assignDepartureSlotAction, createDeparturePlanAction, publishDeparturePlanAction, sendDepartureInvitationsAction, shiftDepartureLitterAppointmentsAction, upsertDepartureSlotAction } from "@/features/departures/departure-planning-actions";
import { loadDeparturePlanningSnapshot } from "@/features/departures/departure-planning-data";
import { DepartureWeekCalendar } from "@/features/departures/departure-week-calendar";
import { isoToParisLocalInput, parisWallTimeToIso } from "@/features/departures/departure-time-zone";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";


function weekStartKey(value: string) {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusMessage(status: string) {
  if (status === "litter_required") return "Sélectionnez au moins une portée avant de créer le planning.";
  if (status === "duration_invalid") return "La durée doit être comprise entre 5 et 480 minutes.";
  if (status === "departure_date_invalid") return "Vérifiez la première date de départ de chaque portée sélectionnée.";
  if (status === "config_error") return "Configuration du serveur incomplète : la clé de signature des liens de rendez-vous est manquante. Contactez l’administrateur.";
  return `Résultat : ${status.replaceAll("_", " ")}`;
}

export default async function DeparturesPage({ searchParams }: { searchParams: Promise<{ plan?: string; week?: string; status?: string; organization?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const snapshot = await loadDeparturePlanningSnapshot(query.plan, query.organization);
  if (!snapshot) redirect("/login");
  const plan = snapshot.selectedPlan;
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const thisFridayKey = addDateKey(weekStartKey(todayKey), 4);
  const firstFridayKey = todayKey <= thisFridayKey ? thisFridayKey : addDateKey(thisFridayKey, 7);
  const firstFridayIso = parisWallTimeToIso(`${firstFridayKey}T09:00`)!;
  const deadlineDefault = new Date(now.getTime() + 5 * 86_400_000).toISOString();
  const calendarWeek = weekStartKey(query.week ?? plan?.slots[0]?.startsAt ?? firstFridayIso);
  const departureReturnTo = `/departs?${new URLSearchParams({ ...(snapshot.activeOrganizationId ? { organization: snapshot.activeOrganizationId } : {}), ...(plan?.id ? { plan: plan.id } : {}), week: calendarWeek, ...(query.status ? { status: query.status } : {}) }).toString()}`;
  if (query.week !== calendarWeek) redirect(departureReturnTo);

  return <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10">
    <Link href={`/reservations${snapshot.activeOrganizationId ? `?organization=${snapshot.activeOrganizationId}` : ""}`} className="text-sm font-semibold text-accent hover:underline">← Parcours adoptants</Link>
    <header className="mt-5 border-b pb-6"><p className="text-sm font-semibold uppercase tracking-wide text-accent">Organisation des départs</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agenda des rendez-vous de départ</h1><p className="mt-3 max-w-3xl leading-7 text-muted">Préparez le week-end habituel, ajoutez les cas exceptionnels et laissez chaque famille réserver un seul créneau libre.</p></header>
    {query.status ? <p role={query.status === "created" || query.status === "updated" || query.status === "published" || query.status === "moved" ? "status" : "alert"} className="mt-5 rounded-xl border bg-surface px-4 py-3 text-sm font-semibold">{statusMessage(query.status)}</p> : null}

    {snapshot.organizations.length > 1 ? <nav aria-label="Organisation active" className="mt-5 flex flex-wrap gap-2">{snapshot.organizations.map((organization) => <Link key={organization.id} href={`/departs?organization=${organization.id}&week=${encodeURIComponent(calendarWeek)}`} className={`rounded-full border px-4 py-2 text-sm font-semibold ${organization.id === snapshot.activeOrganizationId ? "border-accent bg-accent-soft text-accent" : "bg-surface"}`}>{organization.name}</Link>)}</nav> : null}
    <div className="mt-8 grid gap-6 2xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-2xl border bg-surface p-4"><h2 className="font-semibold">Plannings</h2><nav className="mt-3 space-y-2">{snapshot.plans.map((item) => <Link key={item.id} href={`/departs?organization=${snapshot.activeOrganizationId}&plan=${item.id}&week=${encodeURIComponent(calendarWeek)}`} className={`block rounded-lg border px-3 py-2 text-sm ${plan?.id === item.id ? "border-accent bg-accent-soft font-semibold" : "bg-background"}`}><span className="block">{item.title}</span><span className="text-xs text-muted">{item.status}</span></Link>)}</nav></section>
        <details open={!plan} className="rounded-2xl border bg-surface p-4"><summary className="cursor-pointer font-semibold">Nouveau planning</summary><form action={createDeparturePlanAction} className="mt-4 space-y-3"><input type="hidden" name="client_command_id" value={randomUUID()} /><input type="hidden" name="return_to" value={departureReturnTo} /><label className="block text-xs font-semibold uppercase text-muted">Titre<input name="title" defaultValue="Week-end des départs" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm normal-case" /></label><label className="block text-xs font-semibold uppercase text-muted">Durée type<input name="default_duration_minutes" type="number" min={5} max={480} defaultValue={75} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm normal-case" /></label><fieldset><legend className="text-xs font-semibold uppercase text-muted">Portées et première date</legend><p className="mt-1 text-xs text-muted">Cochez au moins une portée.</p><div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{snapshot.litters.map((litter) => <label key={litter.id} className="block rounded-lg border bg-background p-2 text-sm"><span className="flex gap-2"><input type="checkbox" name="litter_ids" value={litter.id} />{litter.name}</span><input aria-label={`Première date ${litter.name}`} name={`earliest_${litter.id}`} type="datetime-local" defaultValue={isoToParisLocalInput(litter.actualBirthDate ? new Date(Date.parse(litter.actualBirthDate) + 56 * 86_400_000).toISOString() : firstFridayIso)} className="mt-2 w-full rounded border px-2 py-1 text-xs" /></label>)}</div></fieldset><button className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Créer le planning</button></form></details>
      </aside>

      <div className="min-w-0 space-y-5">{plan ? <><section className="rounded-2xl border bg-surface p-5"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-semibold">{plan.title}</h2><p className="mt-1 text-sm text-muted">Version {plan.version} · durée type {plan.defaultDurationMinutes} min · {plan.litters.map((litter) => litter.name).join(" · ")}</p></div>{plan.status === "draft" ? <form action={publishDeparturePlanAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="client_command_id" value={randomUUID()} /><input type="hidden" name="return_to" value={departureReturnTo} /><input type="hidden" name="plan_id" value={plan.id} /><input type="hidden" name="plan_version" value={plan.version} /><label className="text-xs font-semibold text-muted">Date limite<input required name="response_deadline_at" type="datetime-local" defaultValue={isoToParisLocalInput(deadlineDefault)} className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" /></label><button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Publier et préparer les invitations</button></form> : <div className="flex flex-col items-end gap-2"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">{plan.status}</span>{plan.status === "published" ? <form action={sendDepartureInvitationsAction}><input type="hidden" name="return_to" value={departureReturnTo} /><input type="hidden" name="plan_id" value={plan.id} /><button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Relire et envoyer les invitations</button></form> : null}</div>}</div></section><DepartureWeekCalendar plan={plan} initialWeek={calendarWeek} returnTo={departureReturnTo} /><details className="rounded-2xl border bg-surface p-5"><summary className="cursor-pointer font-semibold">Réserver un bloc public pour une famille</summary><div className="mt-4 space-y-2">{plan.slots.filter((slot) => slot.visibility === "public" && slot.status === "open").map((slot) => <form key={slot.id} action={assignDepartureSlotAction} className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center"><input type="hidden" name="client_command_id" value={randomUUID()} /><input type="hidden" name="return_to" value={departureReturnTo} /><input type="hidden" name="plan_id" value={plan.id} /><input type="hidden" name="slot_id" value={slot.id} /><span className="text-sm font-semibold">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(slot.startsAt))}</span><select name="reservation_id" required className="rounded-lg border px-3 py-2 text-sm"><option value="">Choisir une famille</option>{plan.families.map((family) => <option key={family.reservationId} value={family.reservationId}>{family.familyName}</option>)}</select><button className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent">Réserver</button></form>)}</div></details><details className="rounded-2xl border bg-surface p-5"><summary className="cursor-pointer font-semibold">Décaler collectivement une portée</summary><form action={shiftDepartureLitterAppointmentsAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_2fr_auto] sm:items-end"><input type="hidden" name="client_command_id" value={randomUUID()} /><input type="hidden" name="return_to" value={departureReturnTo} /><input type="hidden" name="plan_id" value={plan.id} /><label className="text-xs font-semibold uppercase text-muted">Portée<select name="litter_id" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case">{plan.litters.map((litter) => <option key={litter.litterId} value={litter.litterId}>{litter.name}</option>)}</select></label><label className="text-xs font-semibold uppercase text-muted">Jours<input name="day_delta" type="number" min={-60} max={60} defaultValue={1} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case" /></label><label className="text-xs font-semibold uppercase text-muted">Motif<input name="reason" required minLength={3} placeholder="Ex. visite vétérinaire décalée" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case" /></label><button className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent">Préparer et confirmer</button></form></details>{plan.status === "draft" ? <section className="rounded-2xl border bg-surface p-5"><h2 className="text-xl font-semibold">Ajouter un bloc</h2><form action={upsertDepartureSlotAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_160px_auto] sm:items-end"><input type="hidden" name="client_command_id" value={randomUUID()} /><input type="hidden" name="return_to" value={departureReturnTo} /><input type="hidden" name="plan_id" value={plan.id} /><input type="hidden" name="plan_version" value={plan.version} /><label className="text-xs font-semibold uppercase text-muted">Date et heure<input required name="starts_at" type="datetime-local" defaultValue={isoToParisLocalInput(firstFridayIso)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case" /></label><label className="text-xs font-semibold uppercase text-muted">Durée<input required name="duration_minutes" type="number" min={5} max={480} defaultValue={plan.defaultDurationMinutes} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case" /></label><label className="text-xs font-semibold uppercase text-muted">Type<select name="visibility" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case"><option value="public">Public</option><option value="exceptional">Exceptionnel</option></select></label><label className="text-xs font-semibold uppercase text-muted">Famille exceptionnelle<select name="reservation_id" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm normal-case"><option value="">Aucune · bloc public</option>{plan.families.map((family) => <option key={family.reservationId} value={family.reservationId}>{family.familyName}</option>)}</select></label><button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Ajouter</button></form></section> : null}</> : <div className="rounded-2xl border border-dashed bg-surface p-12 text-center"><p className="font-semibold">Créez ou sélectionnez un planning</p><p className="mt-2 text-sm text-muted">Les valeurs vendredi–dimanche et 1 h 15 restent modifiables.</p></div>}</div>
    </div>
  </main>;
}
