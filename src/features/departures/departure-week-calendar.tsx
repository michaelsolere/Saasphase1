"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { moveDepartureAppointmentAction, upsertDepartureSlotAction } from "@/features/departures/departure-planning-actions";

const hours = Array.from({ length: 13 }, (_, index) => index + 8);
const zone = "Europe/Paris";
const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: zone });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: zone });
const partsFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

function addDays(key: string, count: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function parisParts(value: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function mondayKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  return addDays(dateKey, 1 - day);
}

function parisCellInstant(dateKey: string, hour: number) {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour);
  const rendered = parisParts(new Date(guess));
  const [renderedYear, renderedMonth, renderedDay] = rendered.dateKey.split("-").map(Number) as [number, number, number];
  const offset = Date.UTC(renderedYear, renderedMonth - 1, renderedDay, rendered.hour) - guess;
  return new Date(guess - offset);
}

export function DepartureWeekCalendar({ plan, initialWeek, returnTo }: {
  plan: {
    id: string;
    version: number;
    status: string;
    defaultDurationMinutes: number;
    slots: Array<{ id: string; startsAt: string; durationMinutes: number; visibility: "public" | "exceptional"; status: string; reservationId: string | null; familyName: string | null; version: number }>;
  };
  initialWeek: string;
  returnTo: string;
}) {
  const weekKey = mondayKey(initialWeek.slice(0, 10));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekKey, index));
  const weekEnd = addDays(weekKey, 7);
  const visible = plan.slots.filter((slot) => { const key = parisParts(new Date(slot.startsAt)).dateKey; return key >= weekKey && key < weekEnd; });
  const returnForWeek = (key: string) => { const url = new URL(returnTo, window.location.origin); url.searchParams.set("week", key); return `${url.pathname}?${url.searchParams.toString()}`; };
  const navigateWeek = (key: string) => router.replace(returnForWeek(mondayKey(key)), { scroll: false });

  function drop(slotId: string, startsAt: Date, slot: (typeof visible)[number]) {
    const data = new FormData();
    data.set("client_command_id", crypto.randomUUID());
    data.set("return_to", returnForWeek(weekKey));
    data.set("plan_id", plan.id);
    data.set("slot_id", slotId);
    data.set("starts_at", startsAt.toISOString());
    data.set("duration_minutes", String(slot.durationMinutes));
    data.set("slot_version", String(slot.version));
    if (slot.status === "open") { data.set("plan_version", String(plan.version)); data.set("visibility", slot.visibility); startTransition(() => upsertDepartureSlotAction(data)); }
    else { data.set("reason", "Déplacement confirmé depuis l’agenda"); startTransition(() => moveDepartureAppointmentAction(data)); }
  }

  return <section aria-label="Agenda hebdomadaire des départs" className="rounded-2xl border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Agenda hebdomadaire</p><h2 className="mt-1 text-xl font-semibold">Semaine du {dayFormatter.format(new Date(`${weekKey}T12:00:00Z`))}</h2></div>
      <div className="flex gap-2"><button type="button" onClick={() => navigateWeek(addDays(weekKey, -7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">← Semaine</button><button type="button" onClick={() => navigateWeek(parisParts(new Date()).dateKey)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Aujourd’hui</button><button type="button" onClick={() => navigateWeek(addDays(weekKey, 7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Semaine →</button></div>
    </div>
    {pending ? <p role="status" className="mt-3 text-sm font-semibold text-accent">Déplacement en cours…</p> : null}
    <div data-departure-calendar-scroll className="mt-5 overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(100px,1fr))] text-xs">
        <div className="border-b p-2" />{days.map((day) => <div key={day} className={`border-b border-l p-2 text-center font-semibold ${[5,6,0].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) ? "bg-accent-soft" : "bg-background"}`}>{dayFormatter.format(new Date(`${day}T12:00:00Z`))}</div>)}
        {hours.flatMap((hour) => [<div key={`hour-${hour}`} className="border-b p-2 text-right text-muted">{hour}:00</div>, ...days.map((day) => {
          const items = visible.filter((slot) => { const parts = parisParts(new Date(slot.startsAt)); return parts.dateKey === day && parts.hour === hour; });
          return <div key={`${day}-${hour}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const slotId = event.dataTransfer.getData("text/departure-slot"); const slot = visible.find((candidate) => candidate.id === slotId); if (slot) drop(slotId, parisCellInstant(day, hour), slot); }} className="min-h-16 border-b border-l p-1.5 hover:bg-accent-soft/50">{items.map((slot) => <article key={slot.id} draggable={plan.status === "draft" || slot.status !== "open"} onDragStart={(event) => event.dataTransfer.setData("text/departure-slot", slot.id)} className={`cursor-grab rounded-lg border px-2 py-1.5 shadow-sm ${slot.visibility === "exceptional" ? "border-violet-300 bg-violet-50" : slot.status === "open" ? "border-emerald-300 bg-emerald-50" : "border-sky-300 bg-sky-50"}`}><p className="font-semibold">{timeFormatter.format(new Date(slot.startsAt))} · {slot.durationMinutes} min</p><p className="mt-0.5 truncate text-[11px]">{slot.familyName ?? (slot.visibility === "public" ? "Créneau public" : "Rendez-vous exceptionnel")}</p></article>)}</div>;
        })])}
      </div>
    </div>
  </section>;
}