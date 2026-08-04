"use client";

import { useMemo, useRef, useState } from "react";

import {
  isQuestionVisible,
  validateQuestionnaireSection,
  type PublicQuestionnaireDefinition,
  type PublicQuestionnaireQuestion,
  type QuestionnaireAnswers,
  type QuestionnaireNestedField,
} from "./public-model";

const sectionLabels: Record<string, string> = {
  adaptation: "Adaptation",
  behavior: "Comportement",
  education: "Accompagnement éducatif",
  cleanliness: "Propreté",
  care: "Soins et manipulations",
  context: "Vie quotidienne",
  health: "Santé",
  health_events: "Événements de santé",
  weight: "Poids et silhouette",
  food: "Alimentation",
  sterilization: "Stérilisation",
  conclusion: "Personnalité et vie de famille",
  satisfaction: "Votre parcours d’adoption",
};

const nestedLabels: Record<string, string> = {
  category: "Catégorie",
  approximate_date: "Date ou période approximative",
  reason_or_signs: "Motif ou signes observés",
  diagnosis: "Diagnostic",
  care_or_treatment: "Soins ou traitement",
  current_state: "État actuel",
  comment: "Commentaire facultatif",
};

function optionLabel(value: string) {
  const labels: Record<string, string> = {
    resolved: "Résolu",
    improved: "Amélioré",
    persistent: "Persistant",
    recurrent: "Récurrent",
    under_evaluation: "En cours d’évaluation",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function inputClasses(hasError = false) {
  return `mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent ${hasError ? "border-red-400" : ""}`;
}

function NestedFieldInput({
  field,
  value,
  categories,
  onChange,
}: {
  field: QuestionnaireNestedField;
  value: unknown;
  categories?: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const options =
    field.key === "category"
      ? categories
      : field.options?.map((option) =>
          typeof option === "string"
            ? { value: option, label: optionLabel(option) }
            : option,
        );
  return (
    <label className="block text-sm font-medium text-foreground">
      {field.label ?? nestedLabels[field.key] ?? optionLabel(field.key)}
      {field.required ? " *" : ""}
      {options ? (
        <select
          className={inputClasses()}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choisir…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "long_text" ? (
        <textarea
          className={inputClasses()}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClasses()}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: PublicQuestionnaireQuestion;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const errorId = `${question.key}-error`;
  if (question.type === "single_choice") {
    return (
      <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
        <legend className="text-base font-semibold leading-6 text-foreground">{question.label}{question.required || question.requiredWhen ? " *" : ""}</legend>
        <div className="mt-3 grid gap-2">
          {question.options?.map((option) => (
            <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border bg-background px-4 py-3 text-sm hover:border-accent/60">
              <input type="radio" name={question.key} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </fieldset>
    );
  }
  if (question.type === "multi_choice") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
        <legend className="text-base font-semibold leading-6 text-foreground">{question.label}{question.required || question.requiredWhen ? " *" : ""}</legend>
        <div className="mt-3 grid gap-2">
          {question.options?.map((option) => (
            <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border bg-background px-4 py-3 text-sm hover:border-accent/60">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </fieldset>
    );
  }
  if (question.type === "matrix_single_choice") {
    const matrix = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, string>) : {};
    return (
      <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
        <legend className="text-base font-semibold leading-6 text-foreground">{question.label} *</legend>
        <div className="mt-3 grid gap-3">
          {question.rows?.map((row) => (
            <label key={row.key} className="rounded-xl border bg-background p-4 text-sm font-medium">
              {row.label ?? row.key}
              <select className={inputClasses()} value={matrix[row.key] ?? ""} onChange={(event) => onChange({ ...matrix, [row.key]: event.target.value })}>
                <option value="">Choisir…</option>
                {question.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </fieldset>
    );
  }
  if (question.type === "repeater") {
    const entries = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    return (
      <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
        <legend className="text-base font-semibold leading-6 text-foreground">{question.label} *</legend>
        <div className="mt-3 space-y-4">
          {entries.map((entry, index) => (
            <div key={index} className="rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Événement {index + 1}</h3>
                <button type="button" className="text-sm font-medium text-red-700" onClick={() => onChange(entries.filter((_, candidate) => candidate !== index))}>Retirer</button>
              </div>
              <div className="mt-4 grid gap-4">
                {question.fields?.map((field) => (
                  <NestedFieldInput
                    key={field.key}
                    field={field}
                    value={entry[field.key]}
                    categories={question.eventCategories}
                    onChange={(nextValue) => onChange(entries.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, [field.key]: nextValue } : candidate))}
                  />
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold text-accent" onClick={() => onChange([...entries, {}])}>Ajouter un événement</button>
        </div>
        {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </fieldset>
    );
  }
  const isLong = question.type === "long_text";
  return (
    <label className="block text-base font-semibold leading-6 text-foreground">
      {question.label}{question.required || question.requiredWhen ? " *" : ""}
      {isLong ? (
        <textarea aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={inputClasses(Boolean(error))} rows={5} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={inputClasses(Boolean(error))}
          type={question.type === "decimal" ? "number" : "text"}
          min={question.min}
          max={question.max}
          step={question.type === "decimal" ? "0.1" : undefined}
          value={typeof value === "string" || typeof value === "number" ? value : ""}
          onChange={(event) => onChange(question.type === "decimal" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
        />
      )}
      {error ? <span id={errorId} role="alert" className="mt-2 block text-sm font-normal text-red-700">{error}</span> : null}
    </label>
  );
}

export function PublicQuestionnaireForm({
  animalName,
  definition,
  initialRevisionNo,
  latestSubmittedAt,
  sessionExpiresAt,
}: {
  animalName: string;
  definition: PublicQuestionnaireDefinition;
  initialRevisionNo: number;
  latestSubmittedAt: string | null;
  sessionExpiresAt: string;
}) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [baseRevisionNo, setBaseRevisionNo] = useState(initialRevisionNo);
  const [submittedAt, setSubmittedAt] = useState(latestSubmittedAt);
  const [showForm, setShowForm] = useState(initialRevisionNo === 0);
  const [pending, setPending] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const pendingSubmission = useRef<{
    clientCommandId: string;
    baseRevisionNo: number;
    answers: QuestionnaireAnswers;
    completionStartedAt: string;
    completionDurationSeconds: number;
  } | null>(null);
  const section = definition.sectionOrder[sectionIndex];
  const visibleQuestions = useMemo(
    () => definition.questions.filter((question) => question.section === section && isQuestionVisible(question, answers)),
    [answers, definition.questions, section],
  );

  function focusFirstInvalidControl() {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          '[aria-invalid="true"] input, [aria-invalid="true"] select, input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]',
        )
        ?.focus();
    });
  }

  function updateAnswer(key: string, value: unknown) {
    setAnswers((current) => {
      const next = { ...current, [key]: value };
      for (const question of definition.questions) {
        if (!isQuestionVisible(question, next)) delete next[question.key];
      }
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validateCurrentSection() {
    const nextErrors = validateQuestionnaireSection(definition, section, answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) focusFirstInvalidControl();
    return Object.keys(nextErrors).length === 0;
  }

  async function submit() {
    const allErrors = Object.fromEntries(
      definition.sectionOrder.flatMap((candidate) =>
        Object.entries(validateQuestionnaireSection(definition, candidate, answers)),
      ),
    );
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      const firstSection = definition.sectionOrder.findIndex((candidate) =>
        definition.questions.some((question) => question.section === candidate && allErrors[question.key]),
      );
      if (firstSection >= 0) setSectionIndex(firstSection);
      setMessage("Complétez les champs indiqués avant l’envoi.");
      focusFirstInvalidControl();
      return;
    }
    setPending(true);
    setMessage(null);
    const duration = Math.max(
      0,
      Math.round((Date.now() - Date.parse(startedAt.current)) / 1000),
    );
    const retryingUncertainSubmission = pendingSubmission.current !== null;
    const payload =
      pendingSubmission.current ??
      {
        clientCommandId: crypto.randomUUID(),
        baseRevisionNo,
        answers: structuredClone(answers),
        completionStartedAt: startedAt.current,
        completionDurationSeconds: Math.min(duration, 7_200),
      };
    pendingSubmission.current = payload;

    let response: Response | null = null;
    let result: Record<string, unknown> | null = null;
    if (retryingUncertainSubmission) {
      response = await fetch(
        `/api/suivi/questionnaire/submissions/${payload.clientCommandId}`,
        { cache: "no-store" },
      ).catch(() => null);
      result = response
        ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
        : null;
    }
    if (result?.outcome !== "success") {
      response = await fetch("/api/suivi/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      result = response
        ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
        : null;
    }
    if (!response || response.status >= 500 || result?.outcome === "uncertain") {
      response = await fetch(
        `/api/suivi/questionnaire/submissions/${payload.clientCommandId}`,
        { cache: "no-store" },
      ).catch(() => null);
      result = response
        ? ((await response.json().catch(() => null)) as Record<string, unknown> | null)
        : null;
    }
    setPending(false);
    if (result?.outcome === "success" && Number.isInteger(result.revisionNo)) {
      pendingSubmission.current = null;
      setSubmissionUncertain(false);
      setBaseRevisionNo(Number(result.revisionNo));
      setSubmittedAt(
        typeof result.submittedAt === "string"
          ? result.submittedAt
          : new Date().toISOString(),
      );
      setAnswers({});
      setSectionIndex(0);
      setShowForm(false);
      setMessage(null);
      return;
    }
    if (result?.outcome === "conflict") {
      pendingSubmission.current = null;
      setSubmissionUncertain(false);
      setBaseRevisionNo(
        Number.isInteger(result.revisionNo)
          ? Number(result.revisionNo)
          : baseRevisionNo,
      );
      setAnswers({});
      setSectionIndex(0);
      setMessage("Une autre réponse a été enregistrée avant la vôtre. Recommencez la révision depuis le début.");
      return;
    }
    if (result?.outcome === "rate_limited") {
      setAnswers(structuredClone(payload.answers));
      setSubmissionUncertain(true);
      setMessage("Trop de vérifications rapprochées. Votre envoi reste en attente de confirmation ; réessayez dans un instant.");
      return;
    }
    if (
      typeof result?.outcome === "string" &&
      ["expired", "validated", "unavailable"].includes(result.outcome)
    ) {
      pendingSubmission.current = null;
      setSubmissionUncertain(false);
      setMessage("Le questionnaire n’accepte plus de nouvelle réponse.");
      return;
    }
    setAnswers(structuredClone(payload.answers));
    setSubmissionUncertain(true);
    setMessage("L’envoi n’a pas pu être confirmé. Vérifiez son résultat dans un instant avant tout nouvel envoi.");
  }

  if (!showForm) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <section className="rounded-3xl border bg-surface p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Suivi post-adoption · {definition.code.endsWith("t1") ? "T1" : "T2"}</p>
          <h1 className="mt-3 text-3xl font-semibold text-foreground">Merci pour vos nouvelles de {animalName}</h1>
          <p className="mt-4 leading-7 text-muted">Votre réponse n° {baseRevisionNo} a bien été enregistrée{submittedAt ? ` (dernière réponse connue le ${new Date(submittedAt).toLocaleDateString("fr-FR")})` : ""}.</p>
          <p className="mt-3 text-sm leading-6 text-muted">Une révision est une nouvelle réponse complète. Les réponses précédentes ne sont pas affichées et restent conservées dans l’historique.</p>
          <button type="button" className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white" onClick={() => { setAnswers({}); setErrors({}); setMessage(null); setSubmissionUncertain(false); startedAt.current = new Date().toISOString(); setShowForm(true); }}>Envoyer une nouvelle version</button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="rounded-3xl border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Suivi post-adoption · {definition.code.endsWith("t1") ? "T1" : "T2"}</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">{definition.title} de {animalName}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Environ {definition.estimatedMinutes.min} à {definition.estimatedMinutes.max} minutes · session ouverte jusqu’à {new Date(sessionExpiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</p>
        <div
          role="progressbar"
          aria-label="Progression du questionnaire"
          aria-valuemin={1}
          aria-valuemax={definition.sectionOrder.length}
          aria-valuenow={sectionIndex + 1}
          className="mt-6 h-2 overflow-hidden rounded-full bg-muted/20"
        ><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((sectionIndex + 1) / definition.sectionOrder.length) * 100}%` }} /></div>
        <p className="mt-2 text-xs font-medium text-muted">Section {sectionIndex + 1} sur {definition.sectionOrder.length}</p>
      </header>

      <section aria-labelledby="questionnaire-section-title" className="mt-6 rounded-3xl border bg-surface p-6 shadow-sm sm:p-8">
        <h2 id="questionnaire-section-title" className="text-2xl font-semibold text-foreground">{sectionLabels[section] ?? section}</h2>
        <fieldset disabled={pending || submissionUncertain} className="mt-7 space-y-8 disabled:opacity-70">
          {visibleQuestions.map((question) => <QuestionField key={question.key} question={question} value={answers[question.key]} error={errors[question.key]} onChange={(value) => updateAnswer(question.key, value)} />)}
        </fieldset>
        {message ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{message}</p> : null}
        <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
          <button type="button" disabled={sectionIndex === 0 || pending} className="rounded-xl border px-5 py-3 text-sm font-semibold disabled:opacity-40" onClick={() => { setErrors({}); setMessage(null); setSectionIndex((value) => value - 1); }}>Précédent</button>
          {sectionIndex < definition.sectionOrder.length - 1 ? (
            <button type="button" className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white" onClick={() => { if (validateCurrentSection()) { setMessage(null); setSectionIndex((value) => value + 1); window.scrollTo({ top: 0, behavior: "smooth" }); } }}>Continuer</button>
          ) : (
            <button type="button" disabled={pending} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" onClick={submit}>{pending ? "Vérification en cours…" : submissionUncertain ? "Vérifier l’envoi" : baseRevisionNo > 0 ? "Envoyer cette nouvelle version" : "Envoyer mes réponses"}</button>
          )}
        </div>
      </section>
    </main>
  );
}
