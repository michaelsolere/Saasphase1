"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bold, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DocumentTemplateDraftDestructiveAction } from "@/features/documents/document-template-draft-destructive-action";
import {
  publishDocumentTemplateDraftAction,
  saveDocumentTemplateDraftAction,
  validateDocumentTemplateDraftAction,
} from "@/features/documents/document-template-management-actions";
import { documentTemplateTypePresentations } from "@/features/documents/document-template-editor-config";
import type {
  CommitmentCertificateTemplateDefinition,
  DocumentTemplateDefinition,
  DocumentTemplateType,
  FreeReservationContractTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "@/features/documents/document-template-definitions";
import { insertTemplateVariableAtSelection } from "@/features/documents/insert-template-variable";
import { toggleTemplateBoldAtSelection } from "@/features/documents/insert-template-bold";
import { parseDocumentTemplateDefinition } from "@/features/documents/parse-document-template-definition";
import { RESERVATION_CONTRACT_VARIABLE_CATALOG } from "@/features/documents/reservation-contract-template-variables";

const DocumentTemplatePdfPreview = dynamic(
  () => import("@/features/documents/document-template-pdf-preview")
    .then((module) => module.DocumentTemplatePdfPreview),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex min-h-[32rem] items-center justify-center rounded-lg bg-muted-soft p-6 text-center text-sm text-muted"
      >
        Préparation de l’aperçu…
      </div>
    ),
  },
);

type DefinitionEditorProps<TDefinition extends DocumentTemplateDefinition> = {
  definition: TDefinition;
  readOnly: boolean;
  onChange: (definition: TDefinition) => void;
};

type StructuredEditorConfiguration = {
  label: string;
  description: string;
  renderEditor: (props: {
    definition: DocumentTemplateDefinition;
    readOnly: boolean;
    onChange: (definition: DocumentTemplateDefinition) => void;
  }) => ReactNode;
};

export type DocumentDefinitionEditorActionResult = {
  outcome: "success" | "error";
  message: string;
  updatedAt?: string;
};

export type DocumentDefinitionEditorActions = {
  save: (input: {
    templateContent: string;
    expectedUpdatedAt: string;
  }) => Promise<DocumentDefinitionEditorActionResult>;
  validate: () => Promise<DocumentDefinitionEditorActionResult>;
  publish: (input: {
    expectedUpdatedAt: string;
  }) => Promise<DocumentDefinitionEditorActionResult>;
};

const fieldClassName =
  "mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:bg-muted-soft disabled:text-muted";

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    );
  }
  return value;
}

function fingerprintValue(value: unknown) {
  return JSON.stringify(sortJsonValue(value));
}

function fingerprintStoredContent(templateContent: string | null) {
  if (templateContent === null) return fingerprintValue(null);
  try {
    return fingerprintValue(JSON.parse(templateContent));
  } catch {
    return fingerprintValue(templateContent);
  }
}

function previewValidationError(definition: DocumentTemplateDefinition) {
  if (definition.documentType !== "reservation_contract" || definition.schemaVersion !== 2) {
    return null;
  }
  const parsed = parseDocumentTemplateDefinition({
    templateFormat: "json",
    documentType: definition.documentType,
    templateContent: JSON.stringify(definition),
  });
  return parsed.success ? null : parsed.error;
}

function ParagraphList({
  id,
  label,
  paragraphs,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  paragraphs: string[];
  readOnly: boolean;
  onChange: (paragraphs: string[]) => void;
}) {
  function update(index: number, value: string) {
    onChange(paragraphs.map((paragraph, itemIndex) =>
      itemIndex === index ? value : paragraph,
    ));
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= paragraphs.length) return;
    const next = [...paragraphs];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  return (
    <fieldset className="rounded-xl border bg-surface p-4" data-paragraph-list={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <legend className="text-sm font-semibold">{label}</legend>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...paragraphs, ""])}
          >
            <Plus aria-hidden="true" />
            Ajouter un paragraphe
          </Button>
        ) : null}
      </div>

      {paragraphs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed px-4 py-5 text-sm text-muted">
          Aucun paragraphe. Le schéma documentaire peut exiger au moins un élément.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {paragraphs.map((paragraph, index) => (
            <div key={`${id}-${index}`} className="rounded-lg border bg-background p-3">
              <label htmlFor={`${id}-${index}`} className="text-xs font-semibold text-muted">
                Paragraphe {index + 1}
              </label>
              <textarea
                id={`${id}-${index}`}
                rows={3}
                value={paragraph}
                disabled={readOnly}
                onChange={(event) => update(index, event.target.value)}
                className={fieldClassName}
              />
              {!readOnly ? (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    aria-label={`Monter le paragraphe ${index + 1}`}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === paragraphs.length - 1}
                    aria-label={`Descendre le paragraphe ${index + 1}`}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Supprimer le paragraphe ${index + 1}`}
                    onClick={() => onChange(paragraphs.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function TextField({
  id,
  label,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </div>
  );
}

const commitmentSections: Array<{
  key: keyof CommitmentCertificateTemplateDefinition["sections"];
  label: string;
}> = [
  { key: "animalNeeds", label: "Besoins de l’animal" },
  { key: "health", label: "Santé" },
  { key: "educationAndBehavior", label: "Éducation et comportement" },
  { key: "costsAndConstraints", label: "Coûts et contraintes" },
  { key: "holderObligations", label: "Obligations du détenteur" },
];

function CommitmentCertificateEditor({
  definition,
  readOnly,
  onChange,
}: DefinitionEditorProps<CommitmentCertificateTemplateDefinition>) {
  const editorId = useId();
  return (
    <div className="space-y-5">
      <TextField
        id={`${editorId}-template-title`}
        label="Titre"
        value={definition.title}
        readOnly={readOnly}
        onChange={(title) => onChange({ ...definition, title })}
      />
      <ParagraphList
        id={`${editorId}-introduction`}
        label="Introduction"
        paragraphs={definition.introduction}
        readOnly={readOnly}
        onChange={(introduction) => onChange({ ...definition, introduction })}
      />
      {commitmentSections.map((section) => (
        <ParagraphList
          key={section.key}
          id={`${editorId}-section-${section.key}`}
          label={section.label}
          paragraphs={definition.sections[section.key]}
          readOnly={readOnly}
          onChange={(paragraphs) => onChange({
            ...definition,
            sections: { ...definition.sections, [section.key]: paragraphs },
          })}
        />
      ))}
      <ParagraphList
        id={`${editorId}-acknowledgment`}
        label="Texte de reconnaissance"
        paragraphs={definition.acknowledgmentText}
        readOnly={readOnly}
        onChange={(acknowledgmentText) => onChange({ ...definition, acknowledgmentText })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${editorId}-signature-holder`}
          label="Signature du détenteur"
          value={definition.signatureLabels.holder}
          readOnly={readOnly}
          onChange={(holder) => onChange({
            ...definition,
            signatureLabels: { ...definition.signatureLabels, holder },
          })}
        />
        <TextField
          id={`${editorId}-signature-issuer`}
          label="Signature de l’émetteur"
          value={definition.signatureLabels.issuer}
          readOnly={readOnly}
          onChange={(issuer) => onChange({
            ...definition,
            signatureLabels: { ...definition.signatureLabels, issuer },
          })}
        />
      </div>
    </div>
  );
}

const reservationClauses: Array<{
  key: keyof ReservationContractTemplateDefinition["clauses"];
  label: string;
}> = [
  { key: "reservationPurpose", label: "Objet de la réservation" },
  { key: "priceAndPayments", label: "Prix et paiements" },
  { key: "deposit", label: "Arrhes" },
  { key: "cancellationAndRefund", label: "Annulation et remboursement" },
  { key: "postponementAndCredit", label: "Report et avoir" },
  { key: "potentialWithholding", label: "Retenue éventuelle" },
  { key: "finalConditions", label: "Conditions finales" },
];

function ReservationContractEditor({
  definition,
  readOnly,
  onChange,
}: DefinitionEditorProps<ReservationContractTemplateDefinition>) {
  const editorId = useId();
  return (
    <div className="space-y-5">
      <TextField
        id={`${editorId}-template-title`}
        label="Titre"
        value={definition.title}
        readOnly={readOnly}
        onChange={(title) => onChange({ ...definition, title })}
      />
      <ParagraphList
        id={`${editorId}-preamble`}
        label="Préambule"
        paragraphs={definition.preamble}
        readOnly={readOnly}
        onChange={(preamble) => onChange({ ...definition, preamble })}
      />
      {reservationClauses.map((clause) => (
        <ParagraphList
          key={clause.key}
          id={`${editorId}-clause-${clause.key}`}
          label={clause.label}
          paragraphs={definition.clauses[clause.key]}
          readOnly={readOnly}
          onChange={(paragraphs) => onChange({
            ...definition,
            clauses: { ...definition.clauses, [clause.key]: paragraphs },
          })}
        />
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${editorId}-signature-breeder`}
          label="Signature de l’éleveur"
          value={definition.signatureLabels.breeder}
          readOnly={readOnly}
          onChange={(breeder) => onChange({
            ...definition,
            signatureLabels: { ...definition.signatureLabels, breeder },
          })}
        />
        <TextField
          id={`${editorId}-signature-reserving-party`}
          label="Signature du réservant"
          value={definition.signatureLabels.reservingParty}
          readOnly={readOnly}
          onChange={(reservingParty) => onChange({
            ...definition,
            signatureLabels: { ...definition.signatureLabels, reservingParty },
          })}
        />
      </div>
    </div>
  );
}

const variableCategories = [
  "Vendeur",
  "Adoptant",
  "Projet et animal",
  "Réservation et finances",
  "Portée et parents",
  "Groupe de portées",
  "Document",
] as const;

function FreeReservationContractEditor({
  definition,
  readOnly,
  onChange,
}: DefinitionEditorProps<FreeReservationContractTemplateDefinition>) {
  const editorId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodySelectionRef = useRef({ start: 0, end: 0 });
  const pendingBodySelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [selectedVariable, setSelectedVariable] = useState(
    RESERVATION_CONTRACT_VARIABLE_CATALOG[0].key,
  );
  const [boldMessage, setBoldMessage] = useState<string | null>(null);

  useLayoutEffect(() => {
    const pending = pendingBodySelectionRef.current;
    const textarea = bodyRef.current;
    if (!pending || !textarea) return;
    pendingBodySelectionRef.current = null;
    textarea.focus();
    textarea.setSelectionRange(pending.start, pending.end);
    bodySelectionRef.current = pending;
  }, [definition.body]);

  function rememberBodySelection(textarea: HTMLTextAreaElement) {
    bodySelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function currentBodySelection(textarea: HTMLTextAreaElement) {
    return document.activeElement === textarea
      ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : bodySelectionRef.current;
  }

  function insertVariable() {
    const textarea = bodyRef.current;
    if (!textarea || readOnly) return;
    const selection = currentBodySelection(textarea);
    const inserted = insertTemplateVariableAtSelection({
      value: definition.body,
      variable: selectedVariable,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    });
    onChange({ ...definition, body: inserted.value });
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(inserted.cursor, inserted.cursor);
      bodySelectionRef.current = { start: inserted.cursor, end: inserted.cursor };
    });
  }

  function insertBold() {
    const textarea = bodyRef.current;
    if (!textarea || readOnly) return;
    const selection = currentBodySelection(textarea);
    const inserted = toggleTemplateBoldAtSelection({
      value: definition.body,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    });
    if (inserted.changed) {
      setBoldMessage(null);
      pendingBodySelectionRef.current = {
        start: inserted.selectionStart,
        end: inserted.selectionEnd,
      };
      onChange({ ...definition, body: inserted.value });
    } else {
      setBoldMessage(inserted.reason === "overlap"
        ? "La sélection chevauche une zone déjà en gras. Sélectionnez une seule zone complète."
        : null);
      textarea.focus();
      textarea.setSelectionRange(inserted.selectionStart, inserted.selectionEnd);
      bodySelectionRef.current = {
        start: inserted.selectionStart,
        end: inserted.selectionEnd,
      };
    }
  }

  return (
    <div className="space-y-5">
      <TextField
        id={`${editorId}-template-title`}
        label="Titre"
        value={definition.title}
        readOnly={readOnly}
        onChange={(title) => onChange({ ...definition, title })}
      />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${editorId}-template-body`} className="text-sm font-semibold">
            Contenu du contrat
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            aria-label="Gras"
            onPointerDown={() => {
              if (bodyRef.current) rememberBodySelection(bodyRef.current);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertBold}
          >
            <Bold aria-hidden="true" className="size-4" />
            Gras
          </Button>
        </div>
        <textarea
          ref={bodyRef}
          id={`${editorId}-template-body`}
          rows={30}
          maxLength={30_000}
          value={definition.body}
          disabled={readOnly}
          onChange={(event) => {
            rememberBodySelection(event.currentTarget);
            onChange({ ...definition, body: event.target.value });
          }}
          onSelect={(event) => rememberBodySelection(event.currentTarget)}
          onKeyUp={(event) => rememberBodySelection(event.currentTarget)}
          onBlur={(event) => rememberBodySelection(event.currentTarget)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "b") {
              event.preventDefault();
              insertBold();
            }
          }}
          className={`${fieldClassName} min-h-[34rem] resize-y font-sans leading-relaxed`}
        />
        <p className="mt-2 text-sm text-muted">
          Utilisez **texte** pour afficher un passage en gras. Les données entre doubles crochets seront remplacées lors de l’aperçu ou de la génération.
        </p>
        {boldMessage ? (
          <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {boldMessage}
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border bg-surface p-4">
        <label htmlFor={`${editorId}-template-variable`} className="text-sm font-semibold">
          Insérer une donnée
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            id={`${editorId}-template-variable`}
            value={selectedVariable}
            disabled={readOnly}
            onChange={(event) => setSelectedVariable(event.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:bg-muted-soft"
          >
            {variableCategories.map((category) => (
              <optgroup key={category} label={category}>
                {RESERVATION_CONTRACT_VARIABLE_CATALOG
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} — [[{item.key}]]
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <Button type="button" disabled={readOnly} onClick={insertVariable}>
            Insérer
          </Button>
        </div>
      </div>
    </div>
  );
}

export const documentTemplateEditorConfigurations: Record<
  DocumentTemplateType,
  StructuredEditorConfiguration
> = {
  commitment_certificate: {
    ...documentTemplateTypePresentations.commitment_certificate,
    renderEditor: ({ definition, ...props }) =>
      definition.documentType === "commitment_certificate" ? (
        <CommitmentCertificateEditor definition={definition} {...props} />
      ) : null,
  },
  reservation_contract: {
    ...documentTemplateTypePresentations.reservation_contract,
    renderEditor: ({ definition, ...props }) =>
      definition.documentType === "reservation_contract" ? (
        definition.schemaVersion === 2 ? (
          <FreeReservationContractEditor definition={definition} {...props} />
        ) : (
          <ReservationContractEditor definition={definition} {...props} />
        )
      ) : null,
  },
};

function StatusMessage({ result }: { result: DocumentDefinitionEditorActionResult | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={result.outcome === "success"
        ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"}
    >
      {result.message}
    </div>
  );
}

export function DocumentTemplateEditor({
  templateId,
  version,
  initialDefinition,
  initialSavedContent = null,
  initialUpdatedAt,
  mode,
  canSave = false,
  canValidate = false,
  canPublish = false,
  destructiveAction,
  previewLogo = null,
  previewBrandingUnavailable = false,
  actions,
  previewNotice = "Aperçu avec données fictives et identité visuelle actuelle — aucune réservation ni aucun document n’est créé ou modifié.",
}: {
  templateId: string;
  version: number;
  initialDefinition: DocumentTemplateDefinition;
  initialSavedContent?: string | null;
  initialUpdatedAt: string;
  mode: "draft" | "published";
  canSave?: boolean;
  canValidate?: boolean;
  canPublish?: boolean;
  destructiveAction?: {
    familyId: string;
    familyName: string;
    hasPublication: boolean;
  };
  previewLogo?: { dataUri: string; widthPx: number; heightPx: number } | null;
  previewBrandingUnavailable?: boolean;
  actions?: DocumentDefinitionEditorActions;
  previewNotice?: string;
}) {
  const router = useRouter();
  const [definition, setDefinition] = useState(initialDefinition);
  const [savedContentFingerprint, setSavedContentFingerprint] = useState(
    () => fingerprintStoredContent(initialSavedContent),
  );
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [result, setResult] = useState<DocumentDefinitionEditorActionResult | null>(null);
  const initialPreviewError = previewValidationError(initialDefinition);
  const [previewDefinition, setPreviewDefinition] = useState<DocumentTemplateDefinition | null>(
    initialPreviewError ? null : initialDefinition,
  );
  const [previewFallbackReason, setPreviewFallbackReason] = useState<"bold" | "invalid" | null>(
    initialPreviewError === "invalid_template_formatting"
      ? "bold"
      : initialPreviewError
        ? "invalid"
        : null,
  );
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [isPending, startTransition] = useTransition();
  const configuration = documentTemplateEditorConfigurations[definition.documentType];
  const readOnly = mode === "published" || !canSave;
  const templateContent = JSON.stringify(definition);
  const isDirty = mode === "draft"
    && fingerprintValue(definition) !== savedContentFingerprint;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const validationError = previewValidationError(definition);
      if (validationError) {
        setPreviewFallbackReason(validationError === "invalid_template_formatting" ? "bold" : "invalid");
        return;
      }
      setPreviewDefinition(definition);
      setPreviewFallbackReason(null);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [definition]);

  function runAction(
    action: () => Promise<DocumentDefinitionEditorActionResult>,
    options?: {
      refreshAfterSuccess?: boolean;
      onSuccess?: () => void;
    },
  ) {
    setResult(null);
    startTransition(async () => {
      const nextResult = await action();
      setResult(nextResult);
      if (nextResult.outcome === "success") {
        if (nextResult.updatedAt) setUpdatedAt(nextResult.updatedAt);
        options?.onSuccess?.();
        if (options?.refreshAfterSuccess) router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5" data-template-version={version}>
      <div className="grid gap-3 rounded-xl border bg-muted-soft/40 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Version du schéma</p>
          <p className="mt-1 font-medium">{definition.schemaVersion}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Langue</p>
          <p className="mt-1 font-medium">{definition.locale}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Type documentaire</p>
          <p className="mt-1 font-medium">{configuration.label}</p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 rounded-lg border bg-muted-soft p-1 lg:hidden"
        aria-label="Vue de l’éditeur"
      >
        <Button
          type="button"
          variant={mobileView === "edit" ? "secondary" : "ghost"}
          aria-pressed={mobileView === "edit"}
          onClick={() => setMobileView("edit")}
        >
          Modifier
        </Button>
        <Button
          type="button"
          variant={mobileView === "preview" ? "secondary" : "ghost"}
          aria-pressed={mobileView === "preview"}
          onClick={() => setMobileView("preview")}
        >
          Aperçu
        </Button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(26rem,0.95fr)] lg:items-start lg:gap-6">
        <div
          data-template-editor-pane
          className={mobileView === "edit" ? "space-y-5" : "hidden space-y-5 lg:block"}
        >
          <div>
            <h3 className="text-xl font-semibold">
              {definition.schemaVersion === 2 ? "Contrat libre" : "Clauses communes à rédiger"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {definition.schemaVersion === 2
                ? "Composez librement le contrat et insérez les données à l’endroit souhaité."
                : "Les textes ci-dessous sont communs aux documents utilisant cette version du modèle."}
            </p>
          </div>

          {configuration.renderEditor({ definition, readOnly, onChange: setDefinition })}

          {mode === "draft" ? (
            <>
              {destructiveAction ? (
                <DocumentTemplateDraftDestructiveAction
                  {...destructiveAction}
                  templateId={templateId}
                  expectedUpdatedAt={updatedAt}
                  disabled={isPending}
                />
              ) : null}
              <div className="sticky bottom-4 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
                <StatusMessage result={result} />
                <div
                  data-editor-save-state={isDirty ? "dirty" : "saved"}
                  className={isDirty
                    ? "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    : "mt-3 text-sm text-muted"}
                >
                  {isDirty ? (
                    <>
                      <span className="font-semibold">Modifications non enregistrées.</span>{" "}
                      Enregistrez le brouillon avant de le publier.
                    </>
                  ) : (
                    "Toutes les modifications affichées sont enregistrées."
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    La validation contrôle la dernière sauvegarde et ne publie jamais le brouillon.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canSave ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => runAction(() => actions
                          ? actions.save({ templateContent, expectedUpdatedAt: updatedAt })
                          : saveDocumentTemplateDraftAction({
                              templateId,
                              templateContent,
                              expectedUpdatedAt: updatedAt,
                            }), {
                          onSuccess: () => setSavedContentFingerprint(
                            fingerprintStoredContent(templateContent),
                          ),
                        })}
                      >
                        Enregistrer le brouillon
                      </Button>
                    ) : null}
                    {canValidate ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => runAction(() => actions
                          ? actions.validate()
                          : validateDocumentTemplateDraftAction({ templateId }))}
                      >
                        Valider le brouillon
                      </Button>
                    ) : null}
                    {canPublish ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            disabled={isPending || isDirty}
                            title={isDirty ? "Enregistrez les modifications avant de publier." : undefined}
                          >
                            Publier
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Publier la version {version} ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Cette version deviendra la référence publiée. L’ancienne publication sera retirée.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => runAction(() => actions
                                ? actions.publish({ expectedUpdatedAt: updatedAt })
                                : publishDocumentTemplateDraftAction({ templateId }), {
                                  refreshAfterSuccess: true,
                                })}
                            >
                              Confirmer la publication
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <aside
          data-template-preview-pane
          className={mobileView === "preview"
            ? "space-y-3 lg:sticky lg:top-5"
            : "hidden space-y-3 lg:sticky lg:top-5 lg:block"}
        >
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {previewNotice}
          </p>
          {previewFallbackReason ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {previewFallbackReason === "bold"
                ? previewDefinition
                  ? "L’aperçu affiche la dernière version valide. Terminez ou corrigez la mise en forme en gras."
                  : "L’aperçu sera disponible après correction de la mise en forme en gras."
                : previewDefinition
                  ? "L’aperçu affiche la dernière version valide. Corrigez les erreurs du modèle pour l’actualiser."
                  : "L’aperçu sera disponible après correction des erreurs du modèle."}
            </p>
          ) : null}
          {previewDefinition ? (
            <DocumentTemplatePdfPreview
              definition={previewDefinition}
              logo={previewLogo}
              brandingUnavailable={previewBrandingUnavailable}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
