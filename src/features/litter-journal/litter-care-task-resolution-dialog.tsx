"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import type { LitterCareTaskResolutionStatus } from "./litter-care-tasks";

const initialState: LitterCareTaskActionState = { status: "idle" };
const labels: Record<LitterCareTaskResolutionStatus, string> = { done: "Réalisée", cancelled: "Annulée", not_applicable: "Non applicable" };
const inputClass = "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";

type TaskAction = (previousState: LitterCareTaskActionState, formData: FormData) => Promise<LitterCareTaskActionState>;

function timezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }
function currentLocalDateTime() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function asIso(value: string) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toISOString() : ""; }
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Traitement..." : "Valider le résultat"}</Button>; }

export function LitterCareTaskResolutionDialog({ itemTitle, action, triggerLabel, dialogTitle, objectLabel = "élément", domIdPrefix, onSuccess }: { itemTitle: string; action: TaskAction; triggerLabel: string; dialogTitle: string; objectLabel?: string; domIdPrefix: string; onSuccess: (message: string) => void; }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolvedAt, setResolvedAt] = useState("");
  const [status, setStatus] = useState<LitterCareTaskResolutionStatus>("done");
  const [note, setNote] = useState("");
  const resolvedAtRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);
  const submit = useCallback(async (previousState: LitterCareTaskActionState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.status === "success" && nextState.message) { setOpen(false); onSuccess(nextState.message); router.refresh(); }
    return nextState;
  }, [action, onSuccess, router]);
  const [state, formAction, isPending] = useActionState(submit, initialState);
  const id = (suffix: string) => `${domIdPrefix}-${suffix}`;
  const onOpenChange = (nextOpen: boolean) => { if (isPending) return; if (nextOpen && !open) { setResolvedAt(currentLocalDateTime()); setStatus("done"); setNote(""); } setOpen(nextOpen); };
  const prepare = () => { if (resolvedAtRef.current) resolvedAtRef.current.value = asIso(resolvedAt); if (timezoneNameRef.current) timezoneNameRef.current.value = timezone(); };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm">{triggerLabel}</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
      <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{itemTitle}</DialogDescription></DialogHeader>
      <form action={formAction} onSubmit={prepare} className="space-y-4">
        <input ref={resolvedAtRef} type="hidden" name="resolved_at" /><input ref={timezoneNameRef} type="hidden" name="timezone_name" />
        <div><label className="text-sm font-semibold" htmlFor={id("result")}>Résultat</label><select id={id("result")} className={inputClass} name="resolution_status" value={status} onChange={(event) => setStatus(event.target.value as LitterCareTaskResolutionStatus)} required>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label className="text-sm font-semibold" htmlFor={id("resolved-at")}>Date et heure de résolution</label><input id={id("resolved-at")} className={inputClass} type="datetime-local" value={resolvedAt} onChange={(event) => setResolvedAt(event.target.value)} required /></div>
        <div><label className="text-sm font-semibold" htmlFor={id("note")}>Note (facultative)</label><textarea id={id("note")} className={inputClass} name="resolution_note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={5000} /></div>
        {state.status === "error" && state.message ? <p role="alert" className="rounded-xl border bg-surface px-3 py-2 text-sm text-foreground">{state.message}</p> : null}
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>Annuler</Button></DialogClose><SubmitButton /></DialogFooter>
      </form>
      <p className="sr-only">Résolution de l’{objectLabel}</p>
    </DialogContent>
  </Dialog>;
}
