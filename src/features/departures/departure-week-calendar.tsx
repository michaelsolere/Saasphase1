"use client";
/* eslint-disable react-hooks/refs -- The cleanup ref is accessed only by effects and pointer-event handlers. */

import { useEffect, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";

import { moveDepartureAppointmentAction, upsertDepartureSlotAction } from "@/features/departures/departure-planning-actions";
import { DEPARTURE_DRAG_STEP_PIXELS, departureBlockHeightPixels, departureDropTargetFromDelta, departureDurationFromResize } from "@/features/departures/departure-calendar-interaction-core";

const hours = Array.from({ length: 12 }, (_, index) => index + 8);
const zone = "Europe/Paris";
const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: zone });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: zone });
const partsFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function addDays(key: string, count: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function parisParts(value: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function mondayKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  return addDays(dateKey, 1 - day);
}

function parisCellInstant(dateKey: string, hour: number, minute = 0) {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const rendered = parisParts(new Date(guess));
  const [renderedYear, renderedMonth, renderedDay] = rendered.dateKey.split("-").map(Number) as [number, number, number];
  const offset = Date.UTC(renderedYear, renderedMonth - 1, renderedDay, rendered.hour, rendered.minute) - guess;
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
  const [resizedDurations, setResizedDurations] = useState<Record<string, number>>({});
  const [resizingSlotId, setResizingSlotId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ slotId: string; deltaX: number; deltaY: number } | null>(null);
  const [gestureActive, setGestureActive] = useState(false);
  const gestureCleanupRef = useRef<(() => void) | null>(null);
  const gestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekKey, index));
  const weekEnd = addDays(weekKey, 7);
  const visible = plan.slots.filter((slot) => { const key = parisParts(new Date(slot.startsAt)).dateKey; return key >= weekKey && key < weekEnd; });
  const returnForWeek = (key: string) => { const url = new URL(returnTo, window.location.origin); url.searchParams.set("week", key); return `${url.pathname}?${url.searchParams.toString()}`; };
  const navigateWeek = (key: string) => router.replace(returnForWeek(mondayKey(key)), { scroll: false });

  useEffect(() => () => gestureCleanupRef.current?.(), []);


  function persistSlot(slot: (typeof visible)[number], startsAt: Date, durationMinutes: number, reason = "Déplacement confirmé depuis l’agenda") {
    const data = new FormData();
    data.set("client_command_id", crypto.randomUUID());
    data.set("return_to", returnForWeek(weekKey));
    data.set("plan_id", plan.id);
    data.set("slot_id", slot.id);
    data.set("starts_at", startsAt.toISOString());
    data.set("duration_minutes", String(durationMinutes));
    data.set("slot_version", String(slot.version));
    if (slot.status === "open") { data.set("plan_version", String(plan.version)); data.set("visibility", slot.visibility); startTransition(() => upsertDepartureSlotAction(data)); }
    else { data.set("reason", reason); startTransition(() => moveDepartureAppointmentAction(data)); }
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>, slot: (typeof visible)[number]) {
    if (gestureActive) gestureCleanupRef.current?.();
    setGestureActive(true);
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const pointerTarget = event.currentTarget;
    const startY = event.clientY;
    let lastY = startY;
    const initialDuration = resizedDurations[slot.id] ?? slot.durationMinutes;
    const source = parisParts(new Date(slot.startsAt));
    const maxDurationMinutes = 20 * 60 - (source.hour * 60 + source.minute);
    setResizingSlotId(slot.id);
    const onMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      lastY = pointerEvent.clientY;
      const duration = departureDurationFromResize({ initialDurationMinutes: initialDuration, deltaPixels: lastY - startY, maxDurationMinutes });
      setResizedDurations((current) => ({ ...current, [slot.id]: duration }));
    };
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onAbort);
      pointerTarget.removeEventListener("lostpointercapture", onAbort);
      try { if (pointerTarget.hasPointerCapture(pointerId)) pointerTarget.releasePointerCapture(pointerId); } catch { /* capture already released */ }
      if (gestureTimeoutRef.current) { clearTimeout(gestureTimeoutRef.current); gestureTimeoutRef.current = null; }
      gestureCleanupRef.current = null;
      setGestureActive(false);
    };
    const onUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      const duration = departureDurationFromResize({ initialDurationMinutes: initialDuration, deltaPixels: (pointerEvent.clientY || lastY) - startY, maxDurationMinutes });
      setResizedDurations((current) => { const next = { ...current }; delete next[slot.id]; return next; });
      setResizingSlotId(null);
      if (duration !== slot.durationMinutes) persistSlot(slot, new Date(slot.startsAt), duration, "Durée ajustée depuis l’agenda");
    };
    const onAbort = () => {
      cleanup();
      setResizedDurations((current) => { const next = { ...current }; delete next[slot.id]; return next; });
      setResizingSlotId(null);
    };
    const onCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) onAbort();
    };
    gestureCleanupRef.current = onAbort;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onAbort);
    pointerTarget.addEventListener("lostpointercapture", onAbort);
    try { pointerTarget.setPointerCapture(pointerId); } catch { /* capture is optional; window listeners keep working */ }
    gestureTimeoutRef.current = setTimeout(onAbort, 20_000);
  }

  function handleMovePointerDown(event: ReactPointerEvent<HTMLElement>, slot: (typeof visible)[number]) {
    if (gestureActive) gestureCleanupRef.current?.();
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-resize-handle]")) return;
    setGestureActive(true);
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const pointerTarget = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const source = parisParts(new Date(slot.startsAt));
    const dayColumnWidth = pointerTarget.closest<HTMLElement>("[data-departure-drop-day]")?.getBoundingClientRect().width ?? 1;
    let lastX = startX;
    let lastY = startY;
    setDragPreview({ slotId: slot.id, deltaX: 0, deltaY: 0 });
    const onMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      lastX = pointerEvent.clientX;
      lastY = pointerEvent.clientY;
      setDragPreview({ slotId: slot.id, deltaX: lastX - startX, deltaY: Math.round((lastY - startY) / DEPARTURE_DRAG_STEP_PIXELS) * DEPARTURE_DRAG_STEP_PIXELS });
    };
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onAbort);
      pointerTarget.removeEventListener("lostpointercapture", onAbort);
      try { if (pointerTarget.hasPointerCapture(pointerId)) pointerTarget.releasePointerCapture(pointerId); } catch { /* capture already released */ }
      if (gestureTimeoutRef.current) { clearTimeout(gestureTimeoutRef.current); gestureTimeoutRef.current = null; }
      gestureCleanupRef.current = null;
      setGestureActive(false);
    };
    const onUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      const endX = pointerEvent.clientX || lastX;
      const endY = pointerEvent.clientY || lastY;
      const durationMinutes = resizedDurations[slot.id] ?? slot.durationMinutes;
      const target = departureDropTargetFromDelta({ sourceDateKey: source.dateKey, sourceHour: source.hour, sourceMinute: source.minute, durationMinutes, deltaX: endX - startX, deltaY: endY - startY, dayColumnWidth, weekStartKey: weekKey });
      setDragPreview(null);
      if (!target) return;
      persistSlot(slot, parisCellInstant(target.dateKey, target.hour, target.minute), durationMinutes);
    };
    const onAbort = () => {
      cleanup();
      setDragPreview(null);
    };
    const onCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) onAbort();
    };
    gestureCleanupRef.current = onAbort;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onAbort);
    pointerTarget.addEventListener("lostpointercapture", onAbort);
    try { pointerTarget.setPointerCapture(pointerId); } catch { /* capture is optional; window listeners keep working */ }
    gestureTimeoutRef.current = setTimeout(onAbort, 20_000);
  }

  function moveWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>, slot: (typeof visible)[number]) {
    const delta = event.key === "ArrowLeft" ? { x: -100, y: 0 } : event.key === "ArrowRight" ? { x: 100, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -64 } : event.key === "ArrowDown" ? { x: 0, y: 64 } : null;
    if (!delta) return;
    event.preventDefault();
    const source = parisParts(new Date(slot.startsAt));
    const target = departureDropTargetFromDelta({ sourceDateKey: source.dateKey, sourceHour: source.hour, sourceMinute: source.minute, durationMinutes: slot.durationMinutes, deltaX: delta.x, deltaY: delta.y, dayColumnWidth: 100, weekStartKey: weekKey });
    if (target) persistSlot(slot, parisCellInstant(target.dateKey, target.hour, target.minute), slot.durationMinutes, "Horaire ajusté au clavier depuis l’agenda");
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>, slot: (typeof visible)[number]) {
    const deltaPixels = event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : null;
    if (deltaPixels === null) return;
    event.preventDefault();
    event.stopPropagation();
    const source = parisParts(new Date(slot.startsAt));
    const maxDurationMinutes = 20 * 60 - (source.hour * 60 + source.minute);
    const duration = departureDurationFromResize({ initialDurationMinutes: slot.durationMinutes, deltaPixels, maxDurationMinutes });
    if (duration !== slot.durationMinutes) persistSlot(slot, new Date(slot.startsAt), duration, "Durée ajustée au clavier depuis l’agenda");
  }

  return <section aria-label="Agenda hebdomadaire des départs" data-plan-version={plan.version} className="rounded-2xl border bg-surface p-4 sm:p-5">
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
          return <div key={`${day}-${hour}`} data-departure-drop-day={day} data-departure-drop-hour={hour} className="relative h-16 border-b border-l hover:bg-accent-soft/50">{items.map((slot) => { const displayDuration = resizedDurations[slot.id] ?? slot.durationMinutes; const canAdjust = !pending && (slot.status === "open" ? plan.status === "draft" : ["booked", "to_review", "late", "no_show"].includes(slot.status)); return <article key={slot.id} data-departure-slot={slot.id} data-duration-minutes={displayDuration} data-dragging={dragPreview?.slotId === slot.id ? "true" : "false"} data-resizing={resizingSlotId === slot.id ? "true" : "false"} onPointerDown={(event) => canAdjust && handleMovePointerDown(event, slot)} style={{ top: `${(parisParts(new Date(slot.startsAt)).minute / 60) * 64}px`, height: `${departureBlockHeightPixels(displayDuration)}px`, transform: dragPreview?.slotId === slot.id ? `translate(${dragPreview.deltaX}px, ${dragPreview.deltaY}px)` : undefined, opacity: dragPreview?.slotId === slot.id ? 0.75 : 1 }} title={canAdjust ? "Glissez pour déplacer. Tirez la poignée basse pour modifier la durée." : undefined} className={`absolute inset-x-1 z-10 overflow-visible rounded-lg border px-2 py-1.5 shadow-sm ${dragPreview ? "pointer-events-none" : ""} ${canAdjust ? "cursor-grab" : ""} ${slot.visibility === "exceptional" ? "border-violet-300 bg-violet-50" : slot.status === "open" ? "border-emerald-300 bg-emerald-50" : "border-sky-300 bg-sky-50"}`}><p className="pr-6 font-semibold">{timeFormatter.format(new Date(slot.startsAt))} · {displayDuration} min</p><p className="mt-0.5 truncate text-[11px]">{slot.familyName ?? (slot.visibility === "public" ? "Créneau public" : "Rendez-vous exceptionnel")}</p>{canAdjust ? <><button type="button" data-drag-handle aria-label={`Déplacer le rendez-vous de ${timeFormatter.format(new Date(slot.startsAt))}`} onPointerDown={(event) => handleMovePointerDown(event, slot)} onKeyDown={(event) => moveWithKeyboard(event, slot)} className="absolute right-0 top-0 h-10 w-10 touch-none cursor-grab rounded font-bold" title="Glisser pour déplacer">⠿</button><button type="button" data-resize-handle aria-label={`Modifier la durée du rendez-vous de ${timeFormatter.format(new Date(slot.startsAt))}`} onPointerDown={(event) => handleResizePointerDown(event, slot)} onKeyDown={(event) => resizeWithKeyboard(event, slot)} className="absolute inset-x-0 bottom-0 h-8 touch-none cursor-ns-resize border-t border-current/20 bg-white/35" /></> : null}</article>; })}</div>;
        })])}
      </div>
    </div>
    <p className="mt-3 text-xs text-muted">Glissez un bloc pour changer son horaire. Tirez sa poignée basse pour ajuster sa durée par pas de 15 minutes.</p>
  </section>;
}