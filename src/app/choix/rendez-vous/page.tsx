import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { respondChoiceAppointment } from "@/features/reservations/choice-appointment-public-actions";
import {
  CHOICE_APPOINTMENT_SESSION_COOKIE,
  readChoiceAppointmentSession,
} from "@/features/reservations/choice-appointment-public-service";

export const dynamic = "force-dynamic";

const confirmationLabels: Record<string, string> = {
  in_person: "Votre présence sur place est confirmée.",
  video: "Votre rendez-vous en visioconférence est confirmé.",
  prechoice: "Votre impossibilité de participer est enregistrée. L’éleveur préparera le pré-choix classé avec vous.",
};

export default async function PublicChoiceAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const query = await searchParams;
  const token = (await cookies()).get(CHOICE_APPOINTMENT_SESSION_COOKIE)?.value;
  if (!token) redirect("/choix/indisponible");
  const session = await readChoiceAppointmentSession(token);
  if (!session) redirect("/choix/indisponible");
  const appointment = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(session.plannedAt));
  const confirmation = query.confirmation ? confirmationLabels[query.confirmation] : null;

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10 sm:px-8"><header className="rounded-2xl border bg-surface p-6 sm:p-8"><p className="text-sm font-semibold uppercase tracking-wide text-accent">Hermès · rendez-vous de choix</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Votre proposition de rendez-vous</h1><p className="mt-4 text-lg font-semibold">{appointment}</p><p className="mt-2 text-sm leading-6 text-muted">Choisissez la modalité qui correspond à votre situation. Vous pouvez réviser cette réponse tant que le rendez-vous reste ouvert.</p></header>{confirmation ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{confirmation}</p> : null}<form action={respondChoiceAppointment} className="mt-6 space-y-3"><label className="flex cursor-pointer gap-3 rounded-xl border bg-surface p-4"><input required type="radio" name="response_kind" value="in_person" defaultChecked={session.responseKind === "in_person"} /><span><strong>Présentiel</strong><span className="mt-1 block text-sm text-muted">Je serai présent(e) à l’élevage.</span></span></label><label className="flex cursor-pointer gap-3 rounded-xl border bg-surface p-4"><input required type="radio" name="response_kind" value="video" defaultChecked={session.responseKind === "video"} /><span><strong>Visioconférence</strong><span className="mt-1 block text-sm text-muted">Je participerai à distance avec l’éleveur.</span></span></label><label className="flex cursor-pointer gap-3 rounded-xl border bg-surface p-4"><input required type="radio" name="response_kind" value="prechoice" defaultChecked={session.responseKind === "prechoice"} /><span><strong>Je ne peux pas participer</strong><span className="mt-1 block text-sm text-muted">L’éleveur enregistrera avec moi un pré-choix classé.</span></span></label><button className="mt-2 w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white">Enregistrer ma réponse</button></form></main>;
}
