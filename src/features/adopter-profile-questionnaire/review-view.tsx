"use client";

import {
  renewAdopterProfileAccess,
  reviewAdopterProfileQuestionnaire,
  revokeAdopterProfileAccess,
  sendAdopterProfileQuestionnaire,
  waiveAdopterProfileQuestionnaire,
} from "@/features/reservations/adopter-workbench-actions";
import { ADOPTER_PROFILE_QUESTIONNAIRE_V1 } from "./definition";
import { adopterProfileStateLabels, deriveAdopterProfileState, requiresAdopterProfileSexPreferenceDecision, type AdopterProfileWorkbenchSummary } from "./state";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "—";
}

function displayAnswer(value: unknown, options?: Array<{ value: string; label: string }>): string {
  if (typeof value === "string") return options?.find((option) => option.value === value)?.label ?? value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${displayAnswer(item, options)}`).join(" · ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key} : ${displayAnswer(item)}`).join(" · ");
  return "Non renseigné";
}

const sexLabels: Record<string, string> = { male_only: "Un mâle uniquement", female_only: "Une femelle uniquement", male_preferred_female_possible: "Un mâle de préférence, mais une femelle est possible", female_preferred_male_possible: "Une femelle de préférence, mais un mâle est possible", no_preference: "Sans préférence" };
const sectionLabels: Record<string, string> = {
  sex_preference: "Préférence de sexe", litter_preference: "Préférence de portée", household: "Composition du foyer",
  animals: "Animaux présents", experience: "Expérience canine", daily_organization: "Organisation quotidienne",
  housing: "Habitation", environment: "Environnement", walks_activities: "Promenades et activités",
  education_support: "Accompagnement éducatif", desired_qualities: "Qualités recherchées",
  anticipated_difficulties: "Difficultés anticipées", free_comment: "Complément libre",
};

export function AdopterProfileReviewView({
  profile,
  currentSexPreference,
  canAdmin,
  canWrite,
  returnTo,
  manualContacts,
  onClose,
}: {
  profile: AdopterProfileWorkbenchSummary;
  currentSexPreference: string | null;
  canAdmin: boolean;
  canWrite: boolean;
  returnTo: string;
  manualContacts: Array<{ id: string; label: string }>;
  onClose?: () => void;
}) {
  const state = deriveAdopterProfileState(profile);
  const sexChanged = requiresAdopterProfileSexPreferenceDecision(profile);
  return <div className="space-y-6" data-testid="adopter-profile-review">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-stone-50/95 pb-4 backdrop-blur">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jalon Profil</p><h2 className="mt-1 text-2xl font-semibold text-stone-950">{adopterProfileStateLabels[state]}</h2><p className="mt-1 text-sm text-stone-600">Créé le {date(profile.instanceCreatedAt)} · échéance indicative {date(profile.dueAt)}</p>{profile.reviewedAt ? <p className="mt-1 text-xs font-medium text-emerald-800">Relu le {date(profile.reviewedAt)} · auteur {profile.reviewedBy?.slice(0, 8).toUpperCase() ?? "—"}</p> : null}</div>
      {onClose ? <button type="button" onClick={onClose} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold">Retour au poste</button> : null}
    </header>

    {state === "to_send" || state === "send_failed" ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold">{state === "send_failed" ? "L’envoi a échoué" : "Questionnaire à envoyer"}</h3><p className="mt-1 text-sm text-stone-700">Aucun email n’est envoyé automatiquement aux parcours historiques. L’envoi reste explicite.</p>{canAdmin ? <form action={sendAdopterProfileQuestionnaire} className="mt-4"><input type="hidden" name="instance_id" value={profile.instanceId}/><input type="hidden" name="return_to" value={returnTo}/><button className="rounded-full bg-stone-950 px-5 py-2 text-sm font-semibold text-white">{state === "send_failed" ? "Renvoyer après l’échec" : "Envoyer le questionnaire"}</button></form> : null}</section> : null}

    {profile.finalAnswers ? <>
      {sexChanged ? <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><h3 className="font-semibold">Préférence de sexe à décider</h3><p className="mt-2 text-sm">Préférence opérationnelle actuelle : <strong>{sexLabels[currentSexPreference ?? ""] ?? currentSexPreference ?? "Non renseignée"}</strong></p><p className="text-sm">Nouvelle préférence exprimée : <strong>{sexLabels[profile.proposedSexPreference ?? ""] ?? profile.proposedSexPreference}</strong></p></section> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {ADOPTER_PROFILE_QUESTIONNAIRE_V1.sections.map((section) => {
          const answers = ADOPTER_PROFILE_QUESTIONNAIRE_V1.questions.filter((question) => question.section === section && profile.finalAnswers && Object.hasOwn(profile.finalAnswers, question.key));
          if (!answers.length) return null;
          return <section key={section} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-semibold">{sectionLabels[section]}</h3><dl className="mt-4 space-y-4">{answers.map((question) => <div key={question.key}><dt className="text-sm font-medium text-stone-600">{question.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-stone-950">{displayAnswer(profile.finalAnswers?.[question.key], question.options)}</dd></div>)}</dl></section>;
        })}
      </div>
      {canAdmin && !profile.reviewedAt ? <form action={reviewAdopterProfileQuestionnaire} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><input type="hidden" name="instance_id" value={profile.instanceId}/><input type="hidden" name="return_to" value={returnTo}/><h3 className="font-semibold">Terminer le jalon Profil</h3>{sexChanged ? <fieldset className="mt-3 space-y-2"><legend className="text-sm font-medium">Décision obligatoire sur la préférence de sexe</legend><label className="flex gap-2 text-sm"><input type="radio" name="sex_preference_decision" value="keep" required/> Conserver la préférence opérationnelle actuelle</label><label className="flex gap-2 text-sm"><input type="radio" name="sex_preference_decision" value="update" required/> Mettre à jour avec la préférence exprimée dans ce questionnaire</label></fieldset> : null}<button className="mt-4 rounded-full bg-emerald-800 px-5 py-2 text-sm font-semibold text-white">Marquer comme relu</button></form> : null}
    </> : <section className="rounded-2xl border border-stone-200 bg-white p-5"><h3 className="font-semibold">Réponse familiale</h3><p className="mt-1 text-sm text-stone-600">Aucune réponse finale reçue. Les autosauvegardes ne sont pas affichées dans l’historique.</p></section>}

    {profile.waivedAt ? <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><h3 className="font-semibold">Traité par dérogation</h3><p className="mt-2 whitespace-pre-wrap text-sm">{profile.waiverReason}</p><p className="mt-2 text-xs text-stone-600">Auteur : {profile.waivedBy ?? "—"} · {date(profile.waivedAt)}</p></section> : null}

    {!profile.finalSubmittedAt && !profile.waivedAt && canAdmin ? <section className="rounded-2xl border border-stone-200 bg-white p-5"><h3 className="font-semibold">Terminer le profil sans questionnaire</h3><p className="mt-1 text-sm text-stone-600">Réservé aux owner/admin. Un motif et un contact manuel déjà tracé sont obligatoires.</p><form action={waiveAdopterProfileQuestionnaire} className="mt-4 grid gap-3"><input type="hidden" name="instance_id" value={profile.instanceId}/><input type="hidden" name="return_to" value={returnTo}/><select name="manual_contact_id" required className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"><option value="">Choisir le contact manuel obligatoire</option>{manualContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.label}</option>)}</select><textarea name="reason" required minLength={3} maxLength={2000} placeholder="Motif obligatoire de la dérogation" className="min-h-24 rounded-xl border border-stone-300 px-3 py-2 text-sm"/><button disabled={!canWrite} className="w-fit rounded-full border border-violet-300 bg-violet-50 px-5 py-2 text-sm font-semibold text-violet-900">Terminer le profil sans questionnaire</button></form></section> : null}

    {canAdmin && !profile.finalSubmittedAt && !profile.waivedAt ? <section className="flex flex-wrap gap-3 border-t border-stone-200 pt-5"><form action={revokeAdopterProfileAccess}><input type="hidden" name="instance_id" value={profile.instanceId}/><input type="hidden" name="return_to" value={returnTo}/><button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold">Révoquer le lien</button></form><form action={renewAdopterProfileAccess}><input type="hidden" name="instance_id" value={profile.instanceId}/><input type="hidden" name="return_to" value={returnTo}/><button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold">Renouveler le lien et le renvoyer</button></form></section> : null}
  </div>;
}
