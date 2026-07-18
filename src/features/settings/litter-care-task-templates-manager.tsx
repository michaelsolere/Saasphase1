"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useCallback, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatLitterCareTaskOffset,
  litterCareTaskAnchorLabels,
  litterCareTaskCategoryLabels,
  litterCareTaskSpeciesLabels,
  litterCareTaskTargetLabels,
} from "@/features/litter-journal/litter-care-task-labels";
import type {
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskTargetScope,
  LitterCareTaskTemplateSummary,
} from "@/features/litter-journal/litter-care-tasks";

import type { LitterCareTaskTemplateActionState } from "./litter-care-task-templates-actions";

const initialActionState: LitterCareTaskTemplateActionState = {
  status: "idle",
};
const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";

export type LitterCareTaskTemplateMutationAction = (
  previousState: LitterCareTaskTemplateActionState,
  formData: FormData,
) => Promise<LitterCareTaskTemplateActionState>;

export type LitterCareTaskTemplateWriteActions = {
  template: LitterCareTaskTemplateSummary;
  updateAction: LitterCareTaskTemplateMutationAction;
  activeAction: LitterCareTaskTemplateMutationAction;
};

type TemplateValues = {
  title: string;
  description: string;
  category: LitterCareTaskCategory;
  targetScope: LitterCareTaskTargetScope;
  anchorType: LitterCareTaskAnchorType;
  offsetDays: string;
  species: "dog" | "cat";
  breed: string;
  sortOrder: string;
};

const createValues: TemplateValues = {
  title: "",
  description: "",
  category: "preparation",
  targetScope: "litter",
  anchorType: "expected_birth",
  offsetDays: "0",
  species: "dog",
  breed: "",
  sortOrder: "0",
};

function valuesFromTemplate(
  template: LitterCareTaskTemplateSummary,
): TemplateValues {
  return {
    title: template.title,
    description: template.description ?? "",
    category: template.category,
    targetScope: template.targetScope,
    anchorType: template.anchorType,
    offsetDays: String(template.offsetDays),
    species: template.species,
    breed: template.breed ?? "",
    sortOrder: String(template.sortOrder),
  };
}

function ActionMessage({ state }: { state: LitterCareTaskTemplateActionState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className="rounded-xl border bg-surface px-3 py-2 text-sm text-foreground"
    >
      {state.message}
    </p>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function TemplateForm({
  initialValues,
  action,
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  initialValues: TemplateValues;
  action: LitterCareTaskTemplateMutationAction;
  submitLabel: string;
  pendingLabel: string;
  onSuccess: () => void;
}) {
  const fieldId = useId();
  const [values, setValues] = useState(initialValues);
  const submitAction = useCallback(
    async (
      previousState: LitterCareTaskTemplateActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") onSuccess();
      return nextState;
    },
    [action, onSuccess],
  );
  const [state, formAction] = useActionState(
    submitAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor={`${fieldId}-title`}>
          Titre
        </label>
        <input
          id={`${fieldId}-title`}
          className={inputClass}
          name="title"
          value={values.title}
          onChange={(event) =>
            setValues((current) => ({ ...current, title: event.target.value }))
          }
          maxLength={255}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${fieldId}-description`}>
          Description (facultative)
        </label>
        <textarea
          id={`${fieldId}-description`}
          className={inputClass}
          name="description"
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          rows={4}
          maxLength={5_000}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-category`}>
            Catégorie
          </label>
          <select
            id={`${fieldId}-category`}
            className={inputClass}
            name="category"
            value={values.category}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                category: event.target.value as LitterCareTaskCategory,
              }))
            }
            required
          >
            {Object.entries(litterCareTaskCategoryLabels).map(
              ([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-target`}>
            Cible
          </label>
          <select
            id={`${fieldId}-target`}
            className={inputClass}
            name="target_scope"
            value={values.targetScope}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                targetScope: event.target.value as LitterCareTaskTargetScope,
              }))
            }
            required
          >
            {Object.entries(litterCareTaskTargetLabels).map(
              ([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-anchor`}>
            Repère chronologique
          </label>
          <select
            id={`${fieldId}-anchor`}
            className={inputClass}
            name="anchor_type"
            value={values.anchorType}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                anchorType: event.target.value as LitterCareTaskAnchorType,
              }))
            }
            required
          >
            {Object.entries(litterCareTaskAnchorLabels).map(
              ([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-offset`}>
            Décalage en jours
          </label>
          <input
            id={`${fieldId}-offset`}
            className={inputClass}
            name="offset_days"
            type="number"
            step="1"
            min={values.anchorType === "offspring_age" ? 0 : undefined}
            value={values.offsetDays}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                offsetDays: event.target.value,
              }))
            }
            required
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-species`}>
            Espèce
          </label>
          <select
            id={`${fieldId}-species`}
            className={inputClass}
            name="species"
            value={values.species}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                species: event.target.value as "dog" | "cat",
              }))
            }
            required
          >
            {Object.entries(litterCareTaskSpeciesLabels).map(
              ([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-breed`}>
            Race (facultative)
          </label>
          <input
            id={`${fieldId}-breed`}
            className={inputClass}
            name="breed"
            value={values.breed}
            onChange={(event) =>
              setValues((current) => ({ ...current, breed: event.target.value }))
            }
            maxLength={255}
          />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${fieldId}-sort-order`}>
          Ordre d’affichage
        </label>
        <input
          id={`${fieldId}-sort-order`}
          className={inputClass}
          name="sort_order"
          type="number"
          step="1"
          value={values.sortOrder}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              sortOrder: event.target.value,
            }))
          }
          required
        />
      </div>
      <ActionMessage state={state} />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Annuler
          </Button>
        </DialogClose>
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
      </DialogFooter>
    </form>
  );
}

function CreateTemplateDialog({
  action,
}: {
  action: LitterCareTaskTemplateMutationAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus aria-hidden="true" />
          Créer un jalon
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer un jalon</DialogTitle>
          <DialogDescription>
            Définissez un modèle réutilisable pour le suivi de vos portées.
          </DialogDescription>
        </DialogHeader>
        <TemplateForm
          initialValues={createValues}
          action={action}
          submitLabel="Créer le jalon"
          pendingLabel="Création..."
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

function UpdateTemplateDialog({
  template,
  action,
}: {
  template: LitterCareTaskTemplateSummary;
  action: LitterCareTaskTemplateMutationAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier le jalon</DialogTitle>
          <DialogDescription>{template.title}</DialogDescription>
        </DialogHeader>
        <TemplateForm
          initialValues={valuesFromTemplate(template)}
          action={action}
          submitLabel="Enregistrer"
          pendingLabel="Enregistrement..."
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

function ActiveTemplateDialog({
  template,
  action,
}: {
  template: LitterCareTaskTemplateSummary;
  action: LitterCareTaskTemplateMutationAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const submitAction = useCallback(
    async (
      previousState: LitterCareTaskTemplateActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        setOpen(false);
        router.refresh();
      }
      return nextState;
    },
    [action, router],
  );
  const [state, formAction] = useActionState(
    submitAction,
    initialActionState,
  );
  const label = template.isActive ? "Désactiver" : "Réactiver";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label} ce jalon ?</DialogTitle>
          <DialogDescription>
            {template.isActive
              ? "Le modèle restera consultable dans les modèles inactifs."
              : "Le modèle redeviendra disponible pour un usage ultérieur."}
            {" "}Cette action ne crée et ne modifie aucune tâche.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton label={label} pendingLabel="Traitement..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  actions,
}: {
  template: LitterCareTaskTemplateSummary;
  actions?: LitterCareTaskTemplateWriteActions;
}) {
  const metadata = [
    ["Catégorie", litterCareTaskCategoryLabels[template.category]],
    ["Cible", litterCareTaskTargetLabels[template.targetScope]],
    ["Repère chronologique", litterCareTaskAnchorLabels[template.anchorType]],
    [
      "Décalage",
      formatLitterCareTaskOffset(template.anchorType, template.offsetDays),
    ],
    ["Espèce", litterCareTaskSpeciesLabels[template.species]],
    ["Race", template.breed ?? "Toutes les races"],
    ["Ordre d’affichage", String(template.sortOrder)],
  ] as const;

  return (
    <li className="min-w-0 rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-semibold">{template.title}</h3>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">
              {template.isActive ? "Actif" : "Inactif"}
            </span>
          </div>
          {template.libraryTemplateCode && template.libraryTemplateVersion ? (
            <p className="mt-2 text-xs font-medium text-muted">
              Importé depuis la bibliothèque · version {template.libraryTemplateVersion}
            </p>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
            {template.description || "Aucune description."}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <UpdateTemplateDialog
              template={template}
              action={actions.updateAction}
            />
            <ActiveTemplateDialog
              template={template}
              action={actions.activeAction}
            />
          </div>
        ) : null}
      </div>
      <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {metadata.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border bg-background p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function TemplateSection({
  title,
  emptyMessage,
  templates,
  actionsByTemplate,
}: {
  title: string;
  emptyMessage: string;
  templates: LitterCareTaskTemplateSummary[];
  actionsByTemplate: Map<string, LitterCareTaskTemplateWriteActions>;
}) {
  return (
    <section aria-labelledby={`${title === "Modèles actifs" ? "active" : "inactive"}-templates-heading`}>
      <h2
        id={`${title === "Modèles actifs" ? "active" : "inactive"}-templates-heading`}
        className="text-xl font-semibold"
      >
        {title}
      </h2>
      {templates.length === 0 ? (
        <p className="mt-4 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-4 grid min-w-0 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              actions={actionsByTemplate.get(template.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function LitterCareTaskTemplatesManager({
  templates,
  createAction,
  templateActions,
}: {
  templates: LitterCareTaskTemplateSummary[];
  createAction: LitterCareTaskTemplateMutationAction | null;
  templateActions: LitterCareTaskTemplateWriteActions[];
}) {
  const activeTemplates = templates.filter((template) => template.isActive);
  const inactiveTemplates = templates.filter((template) => !template.isActive);
  const actionsByTemplate = new Map(
    templateActions.map((actions) => [actions.template.id, actions]),
  );

  return (
    <div className="mt-8 min-w-0 space-y-10">
      {createAction ? (
        <div className="flex justify-end">
          <CreateTemplateDialog action={createAction} />
        </div>
      ) : (
        <p className="rounded-xl border bg-surface px-4 py-3 text-sm text-muted">
          Votre rôle permet de consulter ces modèles, mais pas de les modifier.
        </p>
      )}
      {templates.length === 0 ? (
        <p className="rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
          Aucun modèle de jalon n’a encore été créé.
        </p>
      ) : null}
      <TemplateSection
        title="Modèles actifs"
        emptyMessage="Aucun modèle de jalon actif."
        templates={activeTemplates}
        actionsByTemplate={actionsByTemplate}
      />
      <TemplateSection
        title="Modèles inactifs"
        emptyMessage="Aucun modèle de jalon inactif."
        templates={inactiveTemplates}
        actionsByTemplate={actionsByTemplate}
      />
    </div>
  );
}
