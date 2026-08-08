"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getVisibleAdopterProfileQuestions,
  stripHiddenAdopterProfileAnswers,
  validateAdopterProfileAnswers,
  type AdopterProfileAnswers,
  type AdopterProfileQuestion,
} from "./definition";
import type { AdopterProfilePublicSession } from "./public-service";

type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";
type Animal = { species?: string; count?: number; approximateAge?: string; sex?: string; relationship?: string; details?: string };

const sectionTitles: Record<string, string> = {
  sex_preference: "Préférence de sexe",
  litter_preference: "Préférence de portée",
  household: "Composition du foyer",
  animals: "Animaux du foyer",
  experience: "Expérience canine",
  daily_organization: "Organisation quotidienne",
  housing: "Habitation",
  environment: "Environnement",
  walks_activities: "Promenades et activités",
  education_support: "Accompagnement éducatif",
  desired_qualities: "Qualités comportementales recherchées",
  anticipated_difficulties: "Difficultés anticipées",
  free_comment: "Complément libre",
};

const sexLabels: Record<string, string> = {
  male_only: "Un mâle uniquement",
  female_only: "Une femelle uniquement",
  male_preferred_female_possible: "Un mâle de préférence, mais une femelle est possible",
  female_preferred_male_possible: "Une femelle de préférence, mais un mâle est possible",
  no_preference: "Pas de préférence",
  unknown: "Non renseignée",
};

export function AdopterProfilePublicForm({ session }: { session: AdopterProfilePublicSession }) {
  const [answers, setAnswers] = useState<AdopterProfileAnswers>(() => stripHiddenAdopterProfileAnswers(session.definition, session.draftAnswers, { relevantLitters: session.relevantLitters }));
  const revisionRef = useRef(session.draftRevision);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(Boolean(session.finalSubmittedAt));
  const [confirming, setConfirming] = useState(false);
  const initialRender = useRef(true);
  const conflictRef = useRef(false);
  const visibleKeys = useMemo(() => new Set(getVisibleAdopterProfileQuestions(session.definition, answers, { relevantLitters: session.relevantLitters })), [answers, session]);

  const update = (key: string, value: unknown) => {
    setAnswers((current) => {
      const next = { ...current, [key]: value };
      if (key === "desired_qualities" && Array.isArray(value)) {
        const currentRanking = Array.isArray(current.desired_quality_ranking) ? current.desired_quality_ranking as string[] : [];
        next.desired_quality_ranking = [...currentRanking.filter((item) => value.includes(item)), ...value.filter((item) => !currentRanking.includes(item))];
      }
      return stripHiddenAdopterProfileAnswers(session.definition, next, { relevantLitters: session.relevantLitters });
    });
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    if (submitted || conflictRef.current) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/profil-adoptant/questionnaire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "draft", clientCommandId: crypto.randomUUID(), expectedRevision: revisionRef.current, answers }),
        });
        const result = await response.json() as { outcome?: string; revision?: number };
        if (response.status === 409 || result.outcome === "conflict") { conflictRef.current = true; setSaveState("conflict"); return; }
        if (!response.ok || result.outcome !== "saved" || typeof result.revision !== "number") { setSaveState("error"); return; }
        revisionRef.current = result.revision;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [answers, submitted]);

  const submit = async () => {
    const validation = validateAdopterProfileAnswers(session.definition, answers, { relevantLitters: session.relevantLitters });
    if (Object.keys(validation).length) {
      setErrors(validation);
      setConfirming(false);
      document.getElementById(`question-${Object.keys(validation)[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaveState("saving");
    const response = await fetch("/api/profil-adoptant/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "submit", clientCommandId: crypto.randomUUID(), expectedRevision: revisionRef.current, answers }),
    });
    const result = await response.json() as { outcome?: string };
    if (response.status === 409 || result.outcome === "conflict") { conflictRef.current = true; setSaveState("conflict"); setConfirming(false); return; }
    if (response.ok && (result.outcome === "submitted" || result.outcome === "already_submitted")) {
      setSubmitted(true); setConfirming(false); setSaveState("saved"); window.scrollTo({ top: 0, behavior: "smooth" }); return;
    }
    setSaveState("error"); setConfirming(false);
  };

  if (submitted) return <Confirmation familyName={session.familyName} organizationName={session.organizationName} />;

  return <div className="min-h-screen bg-[#f6f3ed] text-[#24302b]">
    <header className="border-b border-[#d9d2c6] bg-white/90 px-4 py-5 backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-4xl items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#947450]">{session.organizationName}</p><h1 className="mt-1 text-2xl font-semibold">Questionnaire d’accompagnement</h1><p className="mt-1 text-sm text-[#65706a]">{session.familyName} · échéance indicative le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(session.dueAt))}</p></div>
        <span aria-live="polite" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${saveState === "error" || saveState === "conflict" ? "border-red-300 bg-red-50 text-red-800" : "border-[#d9d2c6] bg-[#faf8f4] text-[#65706a]"}`}>{saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Enregistré" : saveState === "conflict" ? "Une version plus récente existe" : saveState === "error" ? "Enregistrement impossible" : "Brouillon autosauvegardé"}</span>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      {saveState === "conflict" ? <div role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Ce brouillon a été modifié sur un autre appareil.</p><p className="mt-1">Rechargez la page pour reprendre la version la plus récente. Vos réponses locales ne seront pas écrasées silencieusement.</p></div> : null}
      <div className="mb-7 rounded-2xl border border-[#d9d2c6] bg-white p-5"><p className="leading-7">Ce questionnaire nous aide à préparer votre accompagnement et le futur choix du chiot. Il ne sert ni à vous noter, ni à accepter ou refuser votre projet.</p><p className="mt-2 text-sm text-[#65706a]">Votre préférence actuelle : <strong>{sexLabels[session.initialSexPreference] ?? session.initialSexPreference}</strong>. Les champs structurés sont obligatoires ; les récits libres restent facultatifs.</p></div>
      <div className="space-y-6">
        {session.definition.sections.map((section) => {
          const questions = session.definition.questions.filter((question) => question.section === section && visibleKeys.has(question.key));
          if (!questions.length) return null;
          return <section key={section} className="rounded-2xl border border-[#d9d2c6] bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-semibold">{sectionTitles[section] ?? section}</h2>{section === "desired_qualities" ? <ul className="mt-3 space-y-1 text-sm text-[#65706a]">{session.definition.qualityHelp.map((help) => <li key={help}>• {help}</li>)}</ul> : null}<div className="mt-6 space-y-7">{questions.map((question) => <QuestionField key={question.key} question={question} answers={answers} error={errors[question.key]} relevantLitters={session.relevantLitters} update={update} />)}</div></section>;
        })}
      </div>
      <div className="sticky bottom-0 mt-8 rounded-2xl border border-[#d9d2c6] bg-white/95 p-3 shadow-lg backdrop-blur sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="hidden text-sm text-[#65706a] sm:block">Après l’envoi, vos réponses seront définitives. Une correction pourra être donnée directement à l’éleveur.</p><button type="button" disabled={saveState === "conflict" || saveState === "saving"} onClick={() => setConfirming(true)} className="rounded-xl bg-[#345f50] px-5 py-3 font-semibold text-white disabled:opacity-50">Envoyer mes réponses</button></div></div>
    </main>
    {confirming ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-semibold">Envoyer vos réponses ?</h2><p className="mt-3 text-sm leading-6 text-[#65706a]">Vous ne pourrez pas envoyer une seconde réponse pour ce parcours. Vérifiez que tout est complet.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirming(false)} className="rounded-xl border px-4 py-2 font-semibold">Revenir au questionnaire</button><button type="button" onClick={submit} className="rounded-xl bg-[#345f50] px-4 py-2 font-semibold text-white">Confirmer l’envoi</button></div></div></div> : null}
  </div>;
}

function QuestionField({ question, answers, error, relevantLitters, update }: { question: AdopterProfileQuestion; answers: AdopterProfileAnswers; error?: string; relevantLitters: Array<{ id: string; label: string }>; update: (key: string, value: unknown) => void }) {
  const value = answers[question.key];
  const options = question.dynamic === "relevant_litters"
    ? [...relevantLitters.map((litter) => ({ value: litter.id, label: litter.label })), { value: "none", label: "Pas de préférence." }]
    : question.key === "indispensable_quality"
      ? optionsForSelected(answers.desired_qualities, question)
      : question.key === "incompatible_situations"
        ? optionsForSelected(answers.anticipated_difficulties, question)
        : question.options ?? [];
  return <fieldset id={`question-${question.key}`} className="scroll-mt-28"><legend className="text-base font-semibold leading-6">{question.label}{question.required ? <span aria-hidden="true" className="ml-1 text-[#a54734]">*</span> : null}</legend>{question.help ? <p className="mt-1 text-sm leading-6 text-[#65706a]">{question.help}</p> : null}<div className="mt-3">
    {question.type === "single_choice" ? <div className="grid gap-2">{options.map((item) => <label key={item.value} className="flex cursor-pointer gap-3 rounded-xl border border-[#ddd7cd] p-3 hover:bg-[#faf8f4]"><input type="radio" name={question.key} value={item.value} checked={value === item.value} onChange={() => update(question.key, item.value)} className="mt-1" /><span>{item.label}</span></label>)}</div> : null}
    {question.type === "multiple_choice" ? <div className="grid gap-2 sm:grid-cols-2">{options.map((item) => { const selected = Array.isArray(value) && value.includes(item.value); return <label key={item.value} className="flex cursor-pointer gap-3 rounded-xl border border-[#ddd7cd] p-3 hover:bg-[#faf8f4]"><input type="checkbox" checked={selected} onChange={() => { const current = Array.isArray(value) ? value as string[] : []; update(question.key, selected ? current.filter((entry) => entry !== item.value) : [...current, item.value]); }} className="mt-1" /><span>{item.label}</span></label>; })}</div> : null}
    {question.type === "integer" ? <input type="number" min={0} max={20} value={typeof value === "number" ? value : ""} onChange={(event) => update(question.key, event.target.value === "" ? null : Number(event.target.value))} className="w-full rounded-xl border border-[#cfc7ba] px-4 py-3 sm:max-w-xs" /> : null}
    {question.type === "short_text" ? <input type="text" maxLength={500} value={typeof value === "string" ? value : ""} onChange={(event) => update(question.key, event.target.value)} className="w-full rounded-xl border border-[#cfc7ba] px-4 py-3" /> : null}
    {question.type === "long_text" ? <textarea rows={4} maxLength={4000} value={typeof value === "string" ? value : ""} onChange={(event) => update(question.key, event.target.value)} className="w-full rounded-xl border border-[#cfc7ba] px-4 py-3" /> : null}
    {question.type === "ordered_choice" ? <QualityRanking answers={answers} update={update} /> : null}
    {question.type === "animal_repeater" ? <AnimalRepeater value={Array.isArray(value) ? value as Animal[] : []} onChange={(animals) => update(question.key, animals)} /> : null}
  </div>{error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}</fieldset>;
}

function optionsForSelected(value: unknown, question: AdopterProfileQuestion) {
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const source = question.key === "indispensable_quality"
    ? ADOPTER_QUALITY_OPTIONS
    : ANTICIPATED_DIFFICULTY_OPTIONS;
  return selected.map((key) => ({ value: key, label: source[key] ?? key }));
}

const ADOPTER_QUALITY_OPTIONS: Record<string, string> = {
  close_to_humans: "Recherche volontiers la proximité de ses humains", calm_indoors: "Calme dans la maison", energetic: "Énergique et volontiers partant pour une activité", playful: "Joueur", cooperative_learning: "Facile à motiver et coopératif dans les apprentissages", comfortable_with_strangers: "À l’aise dans les rencontres avec des personnes inconnues", comfortable_with_novelty: "À l’aise dans les lieux et situations nouveaux", gentle_interactions: "Doux dans ses interactions", sensitive_receptive: "Sensible et réceptif à son environnement", confident_recovers: "Sûr de lui et capable de récupérer après une surprise", settles_after_excitement: "Capable de retrouver son calme malgré l’agitation", comfortable_with_autonomy: "À l’aise avec une certaine autonomie", affectionate_demonstrative: "Très affectueux et démonstratif",
};
const ANTICIPATED_DIFFICULTY_OPTIONS: Record<string, string> = { high_energy: "Niveau d’énergie élevé", sensitivity_fear: "Sensibilité ou réactions de crainte", human_dependency: "Forte dépendance aux humains", attention_seeking: "Demandes fréquentes d’attention", settling_difficulty: "Difficulté à retrouver le calme", visitor_enthusiasm: "Enthousiasme important avec les visiteurs", leash_pulling: "Traction en laisse pendant l’apprentissage", puppy_biting: "Mordillements du jeune chiot", destruction: "Destructions", toilet_accidents: "Accidents de propreté", mud_hair: "Poils, boue et retours de promenade mouillés", barking: "Aboiements", other: "Autre" };

function QualityRanking({ answers, update }: { answers: AdopterProfileAnswers; update: (key: string, value: unknown) => void }) {
  const ranking = Array.isArray(answers.desired_quality_ranking) ? answers.desired_quality_ranking as string[] : [];
  const move = (index: number, direction: -1 | 1) => { const next = [...ranking]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target]!, next[index]!]; update("desired_quality_ranking", next); };
  return ranking.length ? <ol className="space-y-2">{ranking.map((key, index) => <li key={key} className="flex items-center gap-3 rounded-xl border p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#345f50] font-bold text-white">{index + 1}</span><span className="flex-1">{ADOPTER_QUALITY_OPTIONS[key] ?? key}</span><button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg border px-2 py-1 disabled:opacity-30" aria-label="Monter">↑</button><button type="button" disabled={index === ranking.length - 1} onClick={() => move(index, 1)} className="rounded-lg border px-2 py-1 disabled:opacity-30" aria-label="Descendre">↓</button></li>)}</ol> : <p className="text-sm text-[#65706a]">Sélectionnez d’abord vos qualités.</p>;
}

function AnimalRepeater({ value, onChange }: { value: Animal[]; onChange: (animals: Animal[]) => void }) {
  const change = (index: number, field: keyof Animal, nextValue: string | number) => onChange(value.map((animal, itemIndex) => itemIndex === index ? { ...animal, [field]: nextValue } : animal));
  return <div className="space-y-4">{value.map((animal, index) => <div key={index} className="rounded-xl border bg-[#faf8f4] p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Espèce"><input value={animal.species ?? ""} onChange={(event) => change(index, "species", event.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field><Field label="Nombre"><input type="number" min={1} value={animal.count ?? 1} onChange={(event) => change(index, "count", Number(event.target.value))} className="w-full rounded-lg border px-3 py-2" /></Field><Field label="Âge approximatif"><input value={animal.approximateAge ?? ""} onChange={(event) => change(index, "approximateAge", event.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field><Field label="Sexe si pertinent"><input value={animal.sex ?? ""} onChange={(event) => change(index, "sex", event.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field><Field label="Relation déjà observée"><select value={animal.relationship ?? ""} onChange={(event) => change(index, "relationship", event.target.value)} className="w-full rounded-lg border px-3 py-2"><option value="">Choisir</option><option value="good">Bonne ou déjà éprouvée</option><option value="variable">Variable ou prudente</option><option value="difficult">Difficile</option><option value="unobserved">Jamais observée</option></select></Field><Field label="Précision facultative"><input value={animal.details ?? ""} onChange={(event) => change(index, "details", event.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field></div><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} className="mt-3 text-sm font-semibold text-red-700">Retirer cet animal</button></div>)}<button type="button" onClick={() => onChange([...value, { count: 1 }])} className="rounded-xl border px-4 py-2 font-semibold">Ajouter un animal</button></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold">{label}<span className="mt-1 block font-normal">{children}</span></label>; }
function Confirmation({ familyName, organizationName }: { familyName: string; organizationName: string }) { return <main className="grid min-h-screen place-items-center bg-[#f6f3ed] p-5"><div className="max-w-xl rounded-3xl border border-[#d9d2c6] bg-white p-8 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#947450]">{organizationName}</p><h1 className="mt-2 text-2xl font-semibold">Merci, vos réponses ont bien été reçues.</h1><p className="mt-3 leading-7 text-[#65706a]">{familyName}, votre questionnaire est désormais transmis à l’éleveur. Vous ne pouvez pas envoyer une seconde réponse pour ce parcours.</p></div></main>; }
