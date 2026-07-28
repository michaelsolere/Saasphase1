"use client";

import { useActionState, useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { litterCareTaskCategoryLabels, litterCareTaskTargetLabels } from "./litter-care-task-labels";
import { LITTER_CARE_TASK_CATEGORIES, LITTER_CARE_TASK_PRIORITIES, LITTER_CARE_TASK_TARGET_SCOPES } from "./litter-care-tasks-core";
import type { LitterPlanAdHocMetadataActionState } from "./litter-plan-ad-hoc-metadata-actions";

type Action = (previous: LitterPlanAdHocMetadataActionState, data: FormData) => Promise<LitterPlanAdHocMetadataActionState>;
export type LitterPlanAdHocMetadataView = { title: string; description: string | null; category: string; targetScope: string; priority: string; kind: "milestone" | "task" | "window" };
const initialState: LitterPlanAdHocMetadataActionState = { status: "idle" };
const kindLabel = (kind: LitterPlanAdHocMetadataView["kind"]) => kind === "milestone" ? "Jalon" : kind === "window" ? "Période" : "Tâche";

export function LitterPlanAdHocMetadataDialog({ view, action, onSuccess }: { view: LitterPlanAdHocMetadataView; action: Action; onSuccess: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const close = useCallback((next: boolean) => { if (!next) setSession((value) => value + 1); setOpen(next); }, []);
  const handleSuccess = useCallback((message: string) => {
    close(false);
    onSuccess(message);
  }, [close, onSuccess]);
  return <Dialog open={open} onOpenChange={close}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">Modifier les informations</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Modifier les informations</DialogTitle><DialogDescription>Le calendrier, le verrouillage et le statut restent inchangés.</DialogDescription></DialogHeader>
      {open ? <LitterPlanAdHocMetadataForm key={session} view={view} action={action} onSuccess={handleSuccess} /> : null}
    </DialogContent>
  </Dialog>;
}

function LitterPlanAdHocMetadataForm({ view, action, onSuccess }: { view: LitterPlanAdHocMetadataView; action: Action; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const prefix = `metadata-${useId().replace(/:/g, "")}`;
  const submitAction = useCallback(
    async (
      previousState: LitterPlanAdHocMetadataActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);

      if (nextState.status === "success") {
        onSuccess(nextState.message ?? "Informations mises à jour.");
      }

      return nextState;
    },
    [action, onSuccess],
  );
  const [state, submit, pending] = useActionState(submitAction, initialState);
  const errors = state.fieldErrors ?? {}; const stale = state.requiresRefresh === true;
  return <form action={submit} noValidate className="space-y-4">
    <p className="text-sm"><span className="font-semibold">Type :</span> {kindLabel(view.kind)}</p>
    <TextField id={`${prefix}-title`} name="title" label="Titre" value={view.title} error={errors.title} />
    <TextAreaField id={`${prefix}-description`} name="description" label="Description" value={view.description ?? ""} error={errors.description} />
    <SelectField id={`${prefix}-category`} name="category" label="Catégorie" value={view.category} error={errors.category}>{LITTER_CARE_TASK_CATEGORIES.map((value) => <option key={value} value={value}>{litterCareTaskCategoryLabels[value]}</option>)}</SelectField>
    <SelectField id={`${prefix}-target`} name="target_scope" label="Cible" value={view.targetScope} error={errors.targetScope}>{LITTER_CARE_TASK_TARGET_SCOPES.map((value) => <option key={value} value={value}>{litterCareTaskTargetLabels[value]}</option>)}</SelectField>
    <SelectField id={`${prefix}-priority`} name="priority" label="Priorité" value={view.priority} error={errors.priority}>{LITTER_CARE_TASK_PRIORITIES.map((value) => <option key={value} value={value}>{value === "normal" ? "Normale" : value === "important" ? "Importante" : "Critique pour l’organisation"}</option>)}</SelectField>
    {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>{stale ? <Button type="button" onClick={() => router.refresh()}>Recharger le Journal</Button> : <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>}</DialogFooter>
  </form>;
}
function FieldError({ id, message }: { id: string; message?: string }) { return message ? <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{message}</p> : null; }
function TextField({ id, name, label, value, error }: { id: string; name: string; label: string; value: string; error?: string }) { return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} defaultValue={value} maxLength={255} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><FieldError id={id} message={error} /></div>; }
function TextAreaField({ id, name, label, value, error }: { id: string; name: string; label: string; value: string; error?: string }) { return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Textarea id={id} name={name} defaultValue={value} maxLength={5000} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><FieldError id={id} message={error} /></div>; }
function SelectField({ id, name, label, value, error, children }: { id: string; name: string; label: string; value: string; error?: string; children: React.ReactNode }) { return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><select id={id} name={name} defaultValue={value} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>{children}</select><FieldError id={id} message={error} /></div>; }
