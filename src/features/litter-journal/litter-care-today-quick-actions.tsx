"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";

const initialState: LitterCareTaskActionState = { status: "idle" };

type TaskAction = (
  previousState: LitterCareTaskActionState,
  formData: FormData,
) => Promise<LitterCareTaskActionState>;

export type LitterCareTodayQuickActions = {
  taskId: string;
  doneAction: TaskAction;
  notApplicableAction: TaskAction;
};

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function prepareResolution(
  resolvedAtRef: React.RefObject<HTMLInputElement | null>,
  timezoneNameRef: React.RefObject<HTMLInputElement | null>,
) {
  if (resolvedAtRef.current) resolvedAtRef.current.value = new Date().toISOString();
  if (timezoneNameRef.current) timezoneNameRef.current.value = browserTimezone();
}

function DoneSubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? "Traitement…" : "Marquer comme réalisé"}</Button>;
}

function NotApplicableSubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Traitement…" : "Confirmer"}</Button>;
}

function ActionMessage({ state }: { state: LitterCareTaskActionState }) {
  if (state.status !== "error" || !state.message) return null;
  return <p role="alert" className="text-sm text-destructive">{state.message}</p>;
}

export function LitterCareTodayQuickActions({
  taskTitle,
  actions,
}: {
  taskTitle: string;
  actions: LitterCareTodayQuickActions;
}) {
  const router = useRouter();
  const [notApplicableOpen, setNotApplicableOpen] = useState(false);
  const doneResolvedAtRef = useRef<HTMLInputElement>(null);
  const doneTimezoneNameRef = useRef<HTMLInputElement>(null);
  const notApplicableResolvedAtRef = useRef<HTMLInputElement>(null);
  const notApplicableTimezoneNameRef = useRef<HTMLInputElement>(null);
  const submitDone = useCallback(async (previousState: LitterCareTaskActionState, formData: FormData) => {
    const nextState = await actions.doneAction(previousState, formData);
    if (nextState.status === "success") router.refresh();
    return nextState;
  }, [actions, router]);
  const submitNotApplicable = useCallback(async (previousState: LitterCareTaskActionState, formData: FormData) => {
    const nextState = await actions.notApplicableAction(previousState, formData);
    if (nextState.status === "success") {
      setNotApplicableOpen(false);
      router.refresh();
    }
    return nextState;
  }, [actions, router]);
  const [doneState, doneFormAction] = useActionState(submitDone, initialState);
  const [notApplicableState, notApplicableFormAction, notApplicablePending] = useActionState(submitNotApplicable, initialState);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <form action={doneFormAction} onSubmit={() => prepareResolution(doneResolvedAtRef, doneTimezoneNameRef)}>
        <input type="hidden" name="resolution_status" value="done" />
        <input ref={doneResolvedAtRef} type="hidden" name="resolved_at" />
        <input ref={doneTimezoneNameRef} type="hidden" name="timezone_name" />
        <input type="hidden" name="resolution_note" value="" />
        <DoneSubmitButton />
      </form>
      <AlertDialog open={notApplicableOpen} onOpenChange={(open) => {
        if (notApplicablePending) return;
        setNotApplicableOpen(open);
      }}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">Non applicable</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déclarer cet élément non applicable ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{taskTitle}</span>
              Cet élément quittera les actions en attente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={notApplicableFormAction} onSubmit={() => prepareResolution(notApplicableResolvedAtRef, notApplicableTimezoneNameRef)} className="space-y-4">
            <input type="hidden" name="resolution_status" value="not_applicable" />
            <input ref={notApplicableResolvedAtRef} type="hidden" name="resolved_at" />
            <input ref={notApplicableTimezoneNameRef} type="hidden" name="timezone_name" />
            <div>
              <label htmlFor={`litter-care-today-note-${actions.taskId}`} className="text-sm font-semibold">Note (facultative)</label>
              <textarea id={`litter-care-today-note-${actions.taskId}`} name="resolution_note" maxLength={5000} rows={4} className="mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent" />
            </div>
            <ActionMessage state={notApplicableState} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={notApplicablePending}>Annuler</AlertDialogCancel>
              <NotApplicableSubmitButton />
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <ActionMessage state={doneState} />
    </div>
  );
}
