"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LITTER_PLANNING_MODEL_ANCHORS,
  LITTER_PLANNING_MODEL_ITEM_KINDS,
  LITTER_PLANNING_MODEL_PRIORITIES,
  LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS,
  type LitterPlanningModelItemKind,
} from "@/features/litter-journal/litter-planning-models-core";
import {
  applyLitterPlanningModelEditorRequired,
  convertLitterPlanningModelEditorItemKind,
  createEmptyLitterPlanningModelEditorItem,
  duplicateLitterPlanningModelEditorItem,
  itemHasComplexConfiguration,
  listPreferredAddableElementaryTemplates,
  moveLitterPlanningModelEditorItem,
  normalizeLitterPlanningModelEditorItemOrders,
  removeLitterPlanningModelEditorItem,
  validateLitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorItemDraft,
  type LitterPlanningModelEditorTemplateOption,
} from "@/features/settings/litter-planning-model-editor-draft";
import {
  formatLitterCareBreedLabel,
  formatLitterCareCategoryLabel,
  formatLitterCareSpeciesLabel,
  formatLitterCareTargetLabel,
  LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE,
  litterPlanningModelAnchorLabels,
  litterPlanningModelItemKindLabels,
  litterPlanningModelPriorityLabels,
} from "@/features/settings/litter-planning-model-labels";
import { projectLitterPlanningModelTemplatePicker } from "@/features/settings/litter-planning-model-template-picker";
import type { LitterPlanningModelEditorActionState } from "@/features/settings/litter-planning-models-actions";

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";
const initialActionState: LitterPlanningModelEditorActionState = {
  status: "idle",
};

const recurrenceEndLabels = {
  fixed_end_offset: "Décalage final fixe",
  fixed_recurrence_day_count: "Nombre de jours de suivi",
  actual_birth: "Mise-bas réelle",
} as const;

export type LitterPlanningModelEditorMutationAction = (
  previousState: LitterPlanningModelEditorActionState,
  formData: FormData,
) => Promise<LitterPlanningModelEditorActionState>;

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function fieldError(
  errors: Array<{ path: string; message: string }>,
  path: string,
) {
  return errors.find((error) => error.path === path)?.message ?? null;
}

function ItemCard({
  item,
  index,
  total,
  templatesById,
  draftSpecies,
  draftBreed,
  fieldId,
  errors,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  item: LitterPlanningModelEditorItemDraft;
  index: number;
  total: number;
  templatesById: Map<string, LitterPlanningModelEditorTemplateOption>;
  draftSpecies: "" | "dog" | "cat";
  draftBreed: string;
  fieldId: string;
  errors: Array<{ path: string; message: string }>;
  onChange: (next: LitterPlanningModelEditorItemDraft) => void;
  onMove: (direction: "up" | "down") => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const template = templatesById.get(item.organizationTemplateId);
  const canUseMaternalTemperatureCompletion =
    item.itemKind === "recurring_task" &&
    template?.category === "maternal_health" &&
    template.targetScope === "mother";
  const prefix = `items.${item.key}`;
  const [confirmKind, setConfirmKind] = useState<LitterPlanningModelItemKind | null>(
    null,
  );

  const changeKind = (nextKind: LitterPlanningModelItemKind) => {
    if (nextKind === item.itemKind) return;
    if (itemHasComplexConfiguration(item)) {
      setConfirmKind(nextKind);
      return;
    }
    onChange(convertLitterPlanningModelEditorItemKind(item, nextKind));
  };

  return (
    <li
      className="min-w-0 rounded-2xl border bg-surface p-4 sm:p-5"
      data-editor-item={item.key}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">
            {template?.title ?? "Jalon élémentaire introuvable"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Position {index + 1} ·{" "}
            {template
              ? `${formatLitterCareCategoryLabel(template.category)} · ${formatLitterCareTargetLabel(template.targetScope)}`
              : "Métadonnées indisponibles"}
          </p>
          {!template?.isActive ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              Ce jalon est inactif dans la bibliothèque, mais reste conservé dans
              le modèle.
            </p>
          ) : null}
          {fieldError(errors, `${prefix}.organizationTemplateId`) ? (
            <p
              role="alert"
              id={`${fieldId}-${item.key}-template-error`}
              className="mt-2 text-sm text-amber-900"
            >
              {fieldError(errors, `${prefix}.organizationTemplateId`)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove("up")}
          >
            Monter
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index >= total - 1}
            onClick={() => onMove("down")}
          >
            Descendre
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDuplicate}>
            Dupliquer l’élément
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Retirer du modèle
          </Button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${fieldId}-${item.key}-kind`}>
            Type d’élément
          </label>
          <select
            id={`${fieldId}-${item.key}-kind`}
            className={inputClass}
            value={item.itemKind}
            onChange={(event) =>
              changeKind(event.target.value as LitterPlanningModelItemKind)
            }
          >
            {LITTER_PLANNING_MODEL_ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {litterPlanningModelItemKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className={labelClass}
            htmlFor={`${fieldId}-${item.key}-priority`}
          >
            Priorité
          </label>
          <select
            id={`${fieldId}-${item.key}-priority`}
            className={inputClass}
            value={item.priority}
            onChange={(event) =>
              onChange({
                ...item,
                priority: event.target
                  .value as LitterPlanningModelEditorItemDraft["priority"],
              })
            }
          >
            {LITTER_PLANNING_MODEL_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {litterPlanningModelPriorityLabels[priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className={labelClass}
            htmlFor={`${fieldId}-${item.key}-anchor`}
          >
            Ancrage
          </label>
          <select
            id={`${fieldId}-${item.key}-anchor`}
            className={inputClass}
            value={item.anchorType}
            onChange={(event) =>
              onChange({
                ...item,
                anchorType: event.target
                  .value as LitterPlanningModelEditorItemDraft["anchorType"],
              })
            }
          >
            {LITTER_PLANNING_MODEL_ANCHORS.map((anchor) => (
              <option key={anchor} value={anchor}>
                {litterPlanningModelAnchorLabels[anchor]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3 rounded-xl border bg-background p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={item.isRequired}
              onChange={(event) =>
                onChange(
                  applyLitterPlanningModelEditorRequired(
                    item,
                    event.target.checked,
                  ),
                )
              }
            />
            Obligatoire
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={item.isSelectedByDefault}
              disabled={item.isRequired}
              onChange={(event) =>
                onChange({
                  ...item,
                  isSelectedByDefault: event.target.checked,
                })
              }
            />
            Sélectionné par défaut
          </label>
        </div>
      </div>

      {(item.itemKind === "milestone" || item.itemKind === "task") && (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-point-offset`}
            >
              Décalage en jours
            </label>
            <input
              id={`${fieldId}-${item.key}-point-offset`}
              className={inputClass}
              inputMode="numeric"
              value={item.pointOffsetDays}
              aria-invalid={Boolean(
                fieldError(errors, `${prefix}.pointOffsetDays`),
              )}
              aria-describedby={
                fieldError(errors, `${prefix}.pointOffsetDays`)
                  ? `${fieldId}-${item.key}-point-offset-error`
                  : undefined
              }
              onChange={(event) =>
                onChange({ ...item, pointOffsetDays: event.target.value })
              }
            />
            {fieldError(errors, `${prefix}.pointOffsetDays`) ? (
              <p
                id={`${fieldId}-${item.key}-point-offset-error`}
                role="alert"
                className="mt-1 text-sm text-amber-900"
              >
                {fieldError(errors, `${prefix}.pointOffsetDays`)}
              </p>
            ) : null}
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-point-time`}
            >
              Heure locale (facultative)
            </label>
            <input
              id={`${fieldId}-${item.key}-point-time`}
              className={inputClass}
              placeholder="08:00"
              value={item.pointLocalTime}
              aria-invalid={Boolean(
                fieldError(errors, `${prefix}.pointLocalTime`),
              )}
              onChange={(event) =>
                onChange({ ...item, pointLocalTime: event.target.value })
              }
            />
          </div>
        </div>
      )}

      {item.itemKind === "window" && (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-window-start`}
            >
              Décalage de début
            </label>
            <input
              id={`${fieldId}-${item.key}-window-start`}
              className={inputClass}
              inputMode="numeric"
              value={item.windowStartsOffsetDays}
              onChange={(event) =>
                onChange({
                  ...item,
                  windowStartsOffsetDays: event.target.value,
                })
              }
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-window-start-time`}
            >
              Heure de début (facultative)
            </label>
            <input
              id={`${fieldId}-${item.key}-window-start-time`}
              className={inputClass}
              placeholder="08:00"
              value={item.windowStartsLocalTime}
              onChange={(event) =>
                onChange({
                  ...item,
                  windowStartsLocalTime: event.target.value,
                })
              }
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-window-end`}
            >
              Décalage de fin
            </label>
            <input
              id={`${fieldId}-${item.key}-window-end`}
              className={inputClass}
              inputMode="numeric"
              value={item.windowEndsOffsetDays}
              onChange={(event) =>
                onChange({
                  ...item,
                  windowEndsOffsetDays: event.target.value,
                })
              }
            />
            {fieldError(errors, `${prefix}.windowEndsOffsetDays`) ? (
              <p role="alert" className="mt-1 text-sm text-amber-900">
                {fieldError(errors, `${prefix}.windowEndsOffsetDays`)}
              </p>
            ) : null}
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-window-end-time`}
            >
              Heure de fin (facultative)
            </label>
            <input
              id={`${fieldId}-${item.key}-window-end-time`}
              className={inputClass}
              placeholder="20:00"
              value={item.windowEndsLocalTime}
              onChange={(event) =>
                onChange({
                  ...item,
                  windowEndsLocalTime: event.target.value,
                })
              }
            />
          </div>
        </div>
      )}

      {item.itemKind === "recurring_task" && (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          {canUseMaternalTemperatureCompletion ? (
            <div className="sm:col-span-2">
              <label
                className={labelClass}
                htmlFor={`${fieldId}-${item.key}-journal-completion`}
              >
                Validation automatique par le Journal
              </label>
              <select
                id={`${fieldId}-${item.key}-journal-completion`}
                className={inputClass}
                value={
                  item.completionFactKind ===
                  "maternal_temperature_observation"
                    ? "temperature"
                    : "none"
                }
                onChange={(event) =>
                  onChange({
                    ...item,
                    completionFactKind:
                      event.target.value === "temperature"
                        ? "maternal_temperature_observation"
                        : null,
                  })
                }
              >
                <option value="none">Aucune</option>
                <option value="temperature">
                  Température maternelle enregistrée
                </option>
              </select>
              {fieldError(errors, `${prefix}.completionFactKind`) ? (
                <p role="alert" className="mt-1 text-sm text-amber-900">
                  {fieldError(errors, `${prefix}.completionFactKind`)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-interval`}
            >
              Fréquence
            </label>
            <select
              id={`${fieldId}-${item.key}-interval`}
              className={inputClass}
              value={
                item.recurrenceIntervalDays === "1"
                  ? "daily"
                  : "every_n_days"
              }
              onChange={(event) =>
                onChange({
                  ...item,
                  recurrenceIntervalDays:
                    event.target.value === "daily"
                      ? "1"
                      : item.recurrenceIntervalDays === "1"
                        ? "2"
                        : item.recurrenceIntervalDays,
                })
              }
            >
              <option value="daily">Tous les jours</option>
              <option value="every_n_days">Tous les N jours</option>
            </select>
          </div>
          {item.recurrenceIntervalDays !== "1" ? (
            <div>
              <label
                className={labelClass}
                htmlFor={`${fieldId}-${item.key}-interval-days`}
              >
                Intervalle en jours
              </label>
              <input
                id={`${fieldId}-${item.key}-interval-days`}
                className={inputClass}
                inputMode="numeric"
                value={item.recurrenceIntervalDays}
                onChange={(event) =>
                  onChange({
                    ...item,
                    recurrenceIntervalDays: event.target.value,
                  })
                }
              />
            </div>
          ) : null}
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-rec-start`}
            >
              Décalage de début
            </label>
            <input
              id={`${fieldId}-${item.key}-rec-start`}
              className={inputClass}
              inputMode="numeric"
              value={item.recurrenceStartsOffsetDays}
              onChange={(event) =>
                onChange({
                  ...item,
                  recurrenceStartsOffsetDays: event.target.value,
                })
              }
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-end-kind`}
            >
              Règle de fin
            </label>
            <select
              id={`${fieldId}-${item.key}-end-kind`}
              className={inputClass}
              value={item.recurrenceEndKind}
              onChange={(event) =>
                onChange({
                  ...item,
                  recurrenceEndKind: event.target
                    .value as LitterPlanningModelEditorItemDraft["recurrenceEndKind"],
                })
              }
            >
              {LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {recurrenceEndLabels[kind]}
                </option>
              ))}
            </select>
          </div>
          {item.recurrenceEndKind === "fixed_end_offset" ? (
            <div>
              <label
                className={labelClass}
                htmlFor={`${fieldId}-${item.key}-rec-end`}
              >
                Décalage final
              </label>
              <input
                id={`${fieldId}-${item.key}-rec-end`}
                className={inputClass}
                inputMode="numeric"
                value={item.recurrenceEndsOffsetDays}
                onChange={(event) =>
                  onChange({
                    ...item,
                    recurrenceEndsOffsetDays: event.target.value,
                  })
                }
              />
            </div>
          ) : null}
          {item.recurrenceEndKind === "fixed_recurrence_day_count" ? (
            <div>
              <label
                className={labelClass}
                htmlFor={`${fieldId}-${item.key}-day-count`}
              >
                Nombre de jours de suivi
              </label>
              <input
                id={`${fieldId}-${item.key}-day-count`}
                className={inputClass}
                inputMode="numeric"
                value={item.recurrenceDayCount}
                onChange={(event) =>
                  onChange({
                    ...item,
                    recurrenceDayCount: event.target.value,
                  })
                }
              />
            </div>
          ) : null}
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-horizon`}
            >
              Horizon initial de préparation
            </label>
            <input
              id={`${fieldId}-${item.key}-horizon`}
              className={inputClass}
              inputMode="numeric"
              value={item.initialMaterializationHorizonDays}
              onChange={(event) =>
                onChange({
                  ...item,
                  initialMaterializationHorizonDays: event.target.value,
                })
              }
            />
          </div>
          <div>
            <label
              className={labelClass}
              htmlFor={`${fieldId}-${item.key}-max`}
            >
              Plafond absolu d’occurrences
            </label>
            <input
              id={`${fieldId}-${item.key}-max`}
              className={inputClass}
              inputMode="numeric"
              value={item.absoluteMaxOccurrences}
              onChange={(event) =>
                onChange({
                  ...item,
                  absoluteMaxOccurrences: event.target.value,
                })
              }
            />
            {fieldError(errors, `${prefix}.absoluteMaxOccurrences`) ? (
              <p role="alert" className="mt-1 text-sm text-amber-900">
                {fieldError(errors, `${prefix}.absoluteMaxOccurrences`)}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <p className={labelClass}>Créneaux horaires</p>
            <ul className="mt-2 space-y-2">
              {item.timeSlots.map((slot, slotIndex) => (
                <li
                  key={`${item.key}-slot-${slotIndex}`}
                  className="flex min-w-0 flex-wrap items-end gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <label
                      className="sr-only"
                      htmlFor={`${fieldId}-${item.key}-slot-${slotIndex}`}
                    >
                      Créneau {slotIndex + 1}
                    </label>
                    <input
                      id={`${fieldId}-${item.key}-slot-${slotIndex}`}
                      className={inputClass}
                      placeholder="08:00"
                      value={slot}
                      onChange={(event) => {
                        const timeSlots = [...item.timeSlots];
                        timeSlots[slotIndex] = event.target.value;
                        onChange({ ...item, timeSlots });
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={item.timeSlots.length <= 1}
                    onClick={() =>
                      onChange({
                        ...item,
                        timeSlots: item.timeSlots.filter(
                          (_, current) => current !== slotIndex,
                        ),
                      })
                    }
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
            {fieldError(errors, `${prefix}.timeSlots`) ||
            fieldError(errors, `${prefix}.timeSlots.0`) ? (
              <p role="alert" className="mt-1 text-sm text-amber-900">
                {fieldError(errors, `${prefix}.timeSlots`) ??
                  fieldError(errors, `${prefix}.timeSlots.0`)}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={item.timeSlots.length >= 8}
              onClick={() =>
                onChange({
                  ...item,
                  timeSlots: [...item.timeSlots, ""],
                })
              }
            >
              Ajouter un créneau
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Changer le type d’élément ?</DialogTitle>
            <DialogDescription>
              Cette conversion remplacera la configuration temporelle actuelle
              par des valeurs adaptées au nouveau type.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (!confirmKind) return;
                onChange(
                  convertLitterPlanningModelEditorItemKind(item, confirmKind),
                );
                setConfirmKind(null);
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only">
        Espèce du modèle : {formatLitterCareSpeciesLabel(draftSpecies || null)} ·
        Race : {formatLitterCareBreedLabel(draftBreed || null)}
      </p>
    </li>
  );
}

export function LitterPlanningModelEditor({
  initialDraft,
  templates,
  saveAction,
  mode,
}: {
  initialDraft: LitterPlanningModelEditorDraft;
  templates: LitterPlanningModelEditorTemplateOption[];
  saveAction: LitterPlanningModelEditorMutationAction;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const fieldId = useId();
  const [draft, setDraft] = useState(initialDraft);
  const [baseline] = useState(() => JSON.stringify(initialDraft));
  const [showErrors, setShowErrors] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateTarget, setTemplateTarget] = useState("");
  const [addKind, setAddKind] =
    useState<LitterPlanningModelItemKind>("milestone");
  const [, startTransition] = useTransition();

  const templatesById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );
  const addableTemplates = useMemo(
    () =>
      listPreferredAddableElementaryTemplates(
        templates,
        draft.species,
        draft.breed,
      ),
    [templates, draft.species, draft.breed],
  );
  const templatePicker = useMemo(
    () =>
      projectLitterPlanningModelTemplatePicker({
        templates: addableTemplates,
        filters: {
          query: templateSearch,
          category: templateCategory,
          targetScope: templateTarget,
        },
      }),
    [addableTemplates, templateSearch, templateCategory, templateTarget],
  );
  const validation = useMemo(
    () => validateLitterPlanningModelEditorDraft(draft, templates),
    [draft, templates],
  );
  const errors = showErrors && !validation.ok ? validation.errors : [];
  const isDirty = JSON.stringify(draft) !== baseline;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(
      "Des modifications n’ont pas été enregistrées. Quitter cette page ?",
    );
  }, [isDirty]);

  const submitAction = useCallback(
    async (
      previousState: LitterPlanningModelEditorActionState,
      formData: FormData,
    ) => {
      const currentValidation = validateLitterPlanningModelEditorDraft(
        draft,
        templates,
      );
      if (!currentValidation.ok) {
        setShowErrors(true);
        return {
          status: "error" as const,
          message:
            currentValidation.errors[0]?.message ??
            "Corrigez les erreurs avant d’enregistrer.",
        };
      }
      formData.set("draft_json", JSON.stringify(draft));
      const nextState = await saveAction(previousState, formData);
      if (nextState.status === "success" && nextState.modelId) {
        startTransition(() => {
          router.push(`/settings/litter-planning-models/${nextState.modelId}`);
          router.refresh();
        });
      }
      return nextState;
    },
    [draft, templates, saveAction, router],
  );
  const [state, formAction] = useActionState(submitAction, initialActionState);

  const updateItem = (
    key: string,
    updater: (item: LitterPlanningModelEditorItemDraft) => LitterPlanningModelEditorItemDraft,
  ) => {
    setDraft((current) => ({
      ...current,
      items: normalizeLitterPlanningModelEditorItemOrders(
        current.items.map((item) => (item.key === key ? updater(item) : item)),
      ),
    }));
  };

  return (
    <form action={formAction} className="mt-8 space-y-10">
      <aside className="rounded-2xl border bg-surface px-4 py-4 text-sm leading-6 text-muted">
        {LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE}
      </aside>

      {(state.status !== "idle" && state.message) ||
      (showErrors && !validation.ok) ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        >
          <p className="font-semibold">Résumé avant enregistrement</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.status === "error" && state.message ? (
              <li>{state.message}</li>
            ) : null}
            {state.status === "success" && state.message ? (
              <li>{state.message}</li>
            ) : null}
            {showErrors && !validation.ok
              ? validation.errors.map((error) => (
                  <li key={`${error.path}:${error.message}`}>{error.message}</li>
                ))
              : null}
          </ul>
          {state.code === "stale_revision" ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!confirmLeave()) return;
                  router.refresh();
                }}
              >
                Recharger la version actuelle
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {validation.warnings.length > 0 ? (
        <p
          role="status"
          className="rounded-xl border bg-surface px-4 py-3 text-sm text-muted"
        >
          {validation.warnings[0]}
        </p>
      ) : null}

      <section
        aria-labelledby={`${fieldId}-general-heading`}
        className="rounded-2xl border bg-surface p-5 sm:p-6"
      >
        <h2 id={`${fieldId}-general-heading`} className="text-xl font-semibold">
          Informations générales
        </h2>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className={labelClass} htmlFor={`${fieldId}-title`}>
              Titre
            </label>
            <input
              id={`${fieldId}-title`}
              className={inputClass}
              value={draft.title}
              maxLength={255}
              required
              aria-invalid={Boolean(fieldError(errors, "title"))}
              aria-describedby={
                fieldError(errors, "title")
                  ? `${fieldId}-title-error`
                  : undefined
              }
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
            {fieldError(errors, "title") ? (
              <p
                id={`${fieldId}-title-error`}
                role="alert"
                className="mt-1 text-sm text-amber-900"
              >
                {fieldError(errors, "title")}
              </p>
            ) : null}
          </div>
          <div className="lg:col-span-2">
            <label className={labelClass} htmlFor={`${fieldId}-description`}>
              Description (facultative)
            </label>
            <textarea
              id={`${fieldId}-description`}
              className={inputClass}
              rows={4}
              maxLength={5_000}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-species`}>
              Espèce
            </label>
            <select
              id={`${fieldId}-species`}
              className={inputClass}
              value={draft.species}
              onChange={(event) => {
                setSelectedTemplateId("");
                setTemplateSearch("");
                setTemplateCategory("");
                setTemplateTarget("");
                setDraft((current) => ({
                  ...current,
                  species: event.target.value as "" | "dog" | "cat",
                  breed:
                    event.target.value === "" ? "" : current.breed,
                }));
              }}
            >
              <option value="">Toutes les espèces</option>
              <option value="dog">Chien</option>
              <option value="cat">Chat</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-breed`}>
              Race (facultative)
            </label>
            <input
              id={`${fieldId}-breed`}
              className={inputClass}
              maxLength={255}
              disabled={!draft.species}
              value={draft.breed}
              aria-invalid={Boolean(fieldError(errors, "breed"))}
              onChange={(event) => {
                setSelectedTemplateId("");
                setTemplateSearch("");
                setTemplateCategory("");
                setTemplateTarget("");
                setDraft((current) => ({ ...current, breed: event.target.value }));
              }}
            />
            {fieldError(errors, "breed") ? (
              <p role="alert" className="mt-1 text-sm text-amber-900">
                {fieldError(errors, "breed")}
              </p>
            ) : null}
          </div>
          <div>
            <p className={labelClass}>Statut</p>
            <p className="mt-2 text-sm">
              {draft.isActive ? "Actif" : "Inactif"} — l’activation se gère hors
              de ce formulaire.
            </p>
          </div>
          {mode === "edit" && draft.expectedRevision !== null ? (
            <div>
              <p className={labelClass}>Révision actuelle</p>
              <p className="mt-2 text-sm">{draft.expectedRevision}</p>
            </div>
          ) : null}
          {draft.sourceOriginLabel ? (
            <div className="lg:col-span-2">
              <p className={labelClass}>Origine du modèle source</p>
              <p className="mt-2 text-sm">{draft.sourceOriginLabel}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby={`${fieldId}-add-heading`}
        className="rounded-2xl border bg-surface p-5 sm:p-6"
      >
        <h2 id={`${fieldId}-add-heading`} className="text-xl font-semibold">
          Ajouter un élément
        </h2>
        <p className="mt-2 text-sm text-muted">
          Les jalons actifs compatibles avec l’espèce et la race du modèle sont
          proposés en priorité.
        </p>
        <div className="mt-4 rounded-xl border bg-background p-4">
          <p className="text-sm leading-6 text-muted">
            Les jalons définissent le contenu des actions. Le modèle définit leur
            organisation, leurs dates et leurs récurrences.
          </p>
          <Link
            href="/settings/litter-care-task-templates"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline"
          >
            Créer ou modifier les jalons de suivi
            <span className="sr-only"> (nouvel onglet)</span>
          </Link>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-template-search`}>
              Rechercher un jalon
            </label>
            <input
              id={`${fieldId}-template-search`}
              type="search"
              className={inputClass}
              value={templateSearch}
              placeholder="Titre, description, catégorie ou cible"
              onChange={(event) => {
                setSelectedTemplateId("");
                setTemplateSearch(event.target.value);
              }}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-template-category`}>
              Catégorie
            </label>
            <select
              id={`${fieldId}-template-category`}
              className={inputClass}
              value={templateCategory}
              onChange={(event) => {
                setSelectedTemplateId("");
                setTemplateCategory(event.target.value);
              }}
            >
              <option value="">Toutes les catégories</option>
              {templatePicker.categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-template-target`}>
              Cible
            </label>
            <select
              id={`${fieldId}-template-target`}
              className={inputClass}
              value={templateTarget}
              onChange={(event) => {
                setSelectedTemplateId("");
                setTemplateTarget(event.target.value);
              }}
            >
              <option value="">Toutes les cibles</option>
              {templatePicker.targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-template`}>
              Jalon élémentaire
            </label>
            <select
              id={`${fieldId}-template`}
              className={inputClass}
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">Choisir un jalon</option>
              {templatePicker.results.map((result) => (
                <option key={result.templateId} value={result.templateId}>
                  {result.presentation.optionLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${fieldId}-add-kind`}>
              Type
            </label>
            <select
              id={`${fieldId}-add-kind`}
              className={inputClass}
              value={addKind}
              onChange={(event) =>
                setAddKind(event.target.value as LitterPlanningModelItemKind)
              }
            >
              {LITTER_PLANNING_MODEL_ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {litterPlanningModelItemKindLabels[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={!selectedTemplateId}
              onClick={() => {
                const template = templatesById.get(selectedTemplateId);
                if (!template) return;
                setDraft((current) => ({
                  ...current,
                  items: normalizeLitterPlanningModelEditorItemOrders([
                    ...current.items,
                    createEmptyLitterPlanningModelEditorItem(
                      template,
                      current.items.length,
                      addKind,
                    ),
                  ]),
                }));
              }}
            >
              Ajouter
            </Button>
          </div>
        </div>
        {templateSearch || templateCategory || templateTarget ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSelectedTemplateId("");
              setTemplateSearch("");
              setTemplateCategory("");
              setTemplateTarget("");
            }}
          >
            Réinitialiser les critères
          </Button>
        ) : null}
        {addableTemplates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun jalon actif compatible n’est disponible. Ajustez l’espèce ou
            la race, ou importez des jalons élémentaires.
          </p>
        ) : templatePicker.results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aucun jalon ne correspond à ces critères.
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`${fieldId}-items-heading`}>
        <h2 id={`${fieldId}-items-heading`} className="text-xl font-semibold">
          Éléments du modèle
        </h2>
        {draft.items.length === 0 ? (
          <p className="mt-4 rounded-2xl border bg-surface px-5 py-8 text-center text-sm text-muted">
            Aucun élément pour le moment.
          </p>
        ) : (
          <ol className="mt-4 grid min-w-0 gap-4">
            {draft.items.map((item, index) => (
              <ItemCard
                key={item.key}
                item={item}
                index={index}
                total={draft.items.length}
                templatesById={templatesById}
                draftSpecies={draft.species}
                draftBreed={draft.breed}
                fieldId={fieldId}
                errors={errors}
                onChange={(next) => updateItem(item.key, () => next)}
                onMove={(direction) =>
                  setDraft((current) => ({
                    ...current,
                    items: moveLitterPlanningModelEditorItem(
                      current.items,
                      item.key,
                      direction,
                    ),
                  }))
                }
                onDuplicate={() =>
                  setDraft((current) => ({
                    ...current,
                    items: duplicateLitterPlanningModelEditorItem(
                      current.items,
                      item.key,
                    ),
                  }))
                }
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    items: removeLitterPlanningModelEditorItem(
                      current.items,
                      item.key,
                    ),
                  }))
                }
              />
            ))}
          </ol>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-6 border-t bg-background/95 px-6 py-4 backdrop-blur sm:-mx-10 sm:px-10 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild type="button" variant="outline">
            <Link
              href={
                draft.modelId
                  ? `/settings/litter-planning-models/${draft.modelId}`
                  : "/settings/litter-planning-models"
              }
              onClick={(event) => {
                if (!confirmLeave()) event.preventDefault();
              }}
            >
              Annuler
            </Link>
          </Button>
          <SubmitButton
            label={mode === "create" ? "Créer le modèle" : "Enregistrer"}
            pendingLabel={
              mode === "create" ? "Création..." : "Enregistrement..."
            }
          />
        </div>
      </div>
    </form>
  );
}
