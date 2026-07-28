"use client";

import { useActionState, useEffect, useId, useState } from "react";
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
const initial: LitterPlanAdHocMetadataActionState = { status: "idle" };
const kindLabel = (kind: LitterPlanAdHocMetadataView["kind"]) => kind === "milestone" ? "Jalon" : kind === "window" ? "Période" : "Tâche";

function FieldError({ id, message }: { id: string; message?: string }) { return message ? <p id={id} className="text-sm text-destructive" role="alert">{message}</p> : null; }
function SubmitButton({ locked }: { locked: boolean }) { return <Button type="submit" disabled={locked}>{locked ? "Rechargement requis" : "Enregistrer"}</Button>; }

export function LitterPlanAdHocMetadataDialog({ view, action, onSuccess }: { view: LitterPlanAdHocMetadataView; action: Action; onSuccess: (message: string) => void }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [session, setSession] = useState(0); const [state, submit, pending] = useActionState(action, initial); const prefix = `metadata-${useId().replace(/:/g, "")}`;
  useEffect(() => { if (state.status === "success") queueMicrotask(() => { setOpen(false); onSuccess(state.message ?? "Informations mises à jour."); router.refresh(); }); }, [state, onSuccess, router]);
  const errors = state.fieldErrors ?? {}; const refreshRequired = state.requiresRefresh === true;
  const close = (next: boolean) => { setOpen(next); if (!next) setSession((value) => value + 1); };
  return <Dialog open={open} onOpenChange={close}><DialogTrigger asChild><Button type="button" size="sm" variant="outline">Modifier les informations</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Modifier les informations</DialogTitle><DialogDescription>Le calendrier, le verrouillage et le statut restent inchangés.</DialogDescription></DialogHeader><form key={session} action={submit} className="space-y-4"><p className="text-sm"><span className="font-semibold">Type :</span> {kindLabel(view.kind)}</p><div className="space-y-1"><Label htmlFor={`${prefix}-title`}>Titre</Label><Input id={`${prefix}-title`} name="title" defaultValue={view.title} maxLength={255} required aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${prefix}-title-error` : undefined} /><FieldError id={`${prefix}-title-error`} message={errors.title} /></div><div className="space-y-1"><Label htmlFor={`${prefix}-description`}>Description</Label><Textarea id={`${prefix}-description`} name="description" defaultValue={view.description ?? ""} maxLength={5000} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? `${prefix}-description-error` : undefined} /><FieldError id={`${prefix}-description-error`} message={errors.description} /></div><SelectField id={`${prefix}-category`} name="category" label="Catégorie" value={view.category} error={errors.category}>{LITTER_CARE_TASK_CATEGORIES.map((value) => <option key={value} value={value}>{litterCareTaskCategoryLabels[value]}</option>)}</SelectField><SelectField id={`${prefix}-target`} name="target_scope" label="Cible" value={view.targetScope} error={errors.targetScope}>{LITTER_CARE_TASK_TARGET_SCOPES.map((value) => <option key={value} value={value}>{litterCareTaskTargetLabels[value]}</option>)}</SelectField><SelectField id={`${prefix}-priority`} name="priority" label="Priorité" value={view.priority} error={errors.priority}>{LITTER_CARE_TASK_PRIORITIES.map((value) => <option key={value} value={value}>{value === "normal" ? "Normale" : value === "important" ? "Importante" : "Critique pour l’organisation"}</option>)}</SelectField>{state.status === "error" && !refreshRequired ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}{refreshRequired ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}<DialogFooter><DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>{refreshRequired ? <Button type="button" onClick={() => router.refresh()}>Recharger le Journal</Button> : <SubmitButton locked={pending} />}</DialogFooter></form></DialogContent></Dialog>;
}
function SelectField({ id, name, label, value, error, children }: { id: string; name: string; label: string; value: string; error?: string; children: React.ReactNode }) { const errorId=`${id}-error`; return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><select id={id} name={name} defaultValue={value} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>{children}</select><FieldError id={errorId} message={error} /></div>; }
