export type AdopterProfileQuestionnaireContext = {
  relevantLitters: Array<{ id: string; label: string }>;
};

export type AdopterProfileAnswers = Record<string, unknown>;

export type AdopterProfileQuestion = {
  key: string;
  section: string;
  label: string;
  help?: string;
  type: "single_choice" | "multiple_choice" | "integer" | "short_text" | "long_text" | "ordered_choice" | "animal_repeater";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  visibleWhen?: { question: string; equals?: string; contains?: string };
  dynamic?: "relevant_litters";
};

const option = (value: string, label: string) => ({ value, label });

export const ADOPTER_PROFILE_QUALITIES = [
  option("close_to_humans", "Recherche volontiers la proximité de ses humains"),
  option("calm_indoors", "Calme dans la maison"),
  option("energetic", "Énergique et volontiers partant pour une activité"),
  option("playful", "Joueur"),
  option("cooperative_learning", "Facile à motiver et coopératif dans les apprentissages"),
  option("comfortable_with_strangers", "À l’aise dans les rencontres avec des personnes inconnues"),
  option("comfortable_with_novelty", "À l’aise dans les lieux et situations nouveaux"),
  option("gentle_interactions", "Doux dans ses interactions"),
  option("sensitive_receptive", "Sensible et réceptif à son environnement"),
  option("confident_recovers", "Sûr de lui et capable de récupérer après une surprise"),
  option("settles_after_excitement", "Capable de retrouver son calme malgré l’agitation"),
  option("comfortable_with_autonomy", "À l’aise avec une certaine autonomie"),
  option("affectionate_demonstrative", "Très affectueux et démonstratif"),
] as const;

const housingOptions = [
  option("ground_floor_apartment", "appartement RDC"),
  option("upper_floor_apartment_stairs", "appartement à l’étage avec escaliers"),
  option("upper_floor_apartment_elevator", "appartement à l’étage avec ascenseur"),
  option("house_no_garden", "maison sans jardin"),
  option("house_small_garden", "maison avec petit jardin"),
  option("house_large_garden", "maison avec grand jardin"),
];

export const ADOPTER_PROFILE_QUESTIONNAIRE_V1 = {
  schemaVersion: 1,
  code: "adopter-profile",
  version: 1,
  title: "Questionnaire d’accompagnement",
  sections: [
    "sex_preference",
    "litter_preference",
    "household",
    "animals",
    "experience",
    "daily_organization",
    "housing",
    "environment",
    "walks_activities",
    "education_support",
    "desired_qualities",
    "anticipated_difficulties",
    "free_comment",
  ],
  qualityHelp: [
    "Sensible n’est pas un défaut.",
    "Autonome ne signifie pas distant.",
    "Énergique ne signifie pas incapable de se poser.",
    "Aucune qualité ne peut être garantie isolément chez un chiot.",
  ],
  qualities: ADOPTER_PROFILE_QUALITIES,
  questions: [
    { key: "sex_preference_confirmation", section: "sex_preference", label: "Votre préférence est-elle toujours la même ?", type: "single_choice", required: true, options: [option("confirmed", "Oui, je la confirme."), option("changed", "Non, je souhaite la modifier.")] },
    { key: "sex_preference_proposal", section: "sex_preference", label: "Quelle est votre nouvelle préférence ?", type: "single_choice", required: true, visibleWhen: { question: "sex_preference_confirmation", equals: "changed" }, options: [option("male_only", "Un mâle uniquement."), option("female_only", "Une femelle uniquement."), option("male_preferred_female_possible", "Un mâle de préférence, mais une femelle est possible."), option("female_preferred_male_possible", "Une femelle de préférence, mais un mâle est possible."), option("no_preference", "Pas de préférence.")] },
    { key: "litter_preference", section: "litter_preference", label: "Avez-vous actuellement une préférence entre les portées suivantes ?", type: "single_choice", required: true, dynamic: "relevant_litters" },
    { key: "adults_count", section: "household", label: "Combien d’adultes vivent habituellement dans votre foyer ?", type: "integer", required: true },
    { key: "children_present", section: "household", label: "Des enfants vivent-ils dans le foyer ou y sont-ils accueillis régulièrement ?", type: "single_choice", required: true, options: [option("no", "Non."), option("yes", "Oui.")] },
    { key: "children_ages", section: "household", label: "Quel âge ont-ils ?", help: "Indiquez uniquement les âges, sans noms ni dates de naissance.", type: "short_text", required: true, visibleWhen: { question: "children_present", equals: "yes" } },
    { key: "animals_present", section: "animals", label: "Des animaux vivent-ils actuellement dans votre foyer ?", type: "single_choice", required: true, options: [option("no", "Non."), option("yes", "Oui.")] },
    { key: "animals", section: "animals", label: "Animaux du foyer", help: "Espèce, nombre, âge approximatif, sexe si pertinent et relation déjà observée avec les chiens ou jeunes animaux.", type: "animal_repeater", required: true, visibleWhen: { question: "animals_present", equals: "yes" } },
    { key: "dog_experience", section: "experience", label: "Quelle expérience avez-vous personnellement avec les chiens ?", type: "single_choice", required: true, options: [option("never_lived_with_dog", "Je n’ai jamais vécu avec un chien."), option("lived_not_responsible", "J’ai vécu avec un ou plusieurs chiens sans être principalement responsable."), option("responsible_adult_dog", "J’ai été responsable d’un chien arrivé adulte."), option("raised_one_puppy", "J’ai personnellement accompagné l’éducation d’un chiot jusqu’à l’âge adulte."), option("raised_several_puppies", "J’ai personnellement accompagné plusieurs chiots jusqu’à l’âge adulte.")] },
    { key: "dog_experience_details", section: "experience", label: "Vous pouvez préciser les chiens concernés, leur type ou leur race, et ce que vous retenez de cette expérience.", type: "long_text" },
    { key: "daily_organization", section: "daily_organization", label: "Quelle sera l’organisation habituelle du foyer ?", type: "multiple_choice", required: true, options: [option("outside_regular", "Travail principalement hors du domicile avec horaires réguliers"), option("outside_variable", "Travail principalement hors du domicile avec horaires variables"), option("remote_partial", "Télétravail partiel"), option("remote_frequent", "Télétravail fréquent ou permanent"), option("usually_present", "Une personne est généralement présente"), option("staggered_schedules", "Horaires décalés entre les membres du foyer"), option("other", "Autre organisation")] },
    { key: "daily_organization_other", section: "daily_organization", label: "Précisez cette autre organisation.", type: "short_text", required: true, visibleWhen: { question: "daily_organization", contains: "other" } },
    { key: "usual_alone_duration", section: "daily_organization", label: "Combien de temps le chien pourrait-il habituellement rester seul sans interruption ?", type: "single_choice", required: true, options: [option("never", "Généralement jamais."), option("under_two_hours", "Moins de 2 heures."), option("two_to_four_hours", "Entre 2 et 4 heures."), option("four_to_six_hours", "Entre 4 et 6 heures."), option("over_six_hours", "Plus de 6 heures."), option("varies", "Cela variera fortement selon les jours."), option("undefined", "L’organisation n’est pas encore définie.")] },
    { key: "first_weeks_organization", section: "daily_organization", label: "Comment prévoyez-vous les premières semaines ?", type: "multiple_choice", required: true, options: [option("leave_or_increased_presence", "Congés ou présence accrue"), option("remote_work", "Télétravail"), option("household_rotation", "Alternance entre les membres du foyer"), option("relative_or_professional_help", "Aide d’un proche ou d’un professionnel"), option("unchanged", "Organisation habituelle inchangée"), option("undefined", "Organisation pas encore définie"), option("other", "Autre, avec précision")] },
    { key: "first_weeks_organization_other", section: "daily_organization", label: "Précisez cette autre organisation des premières semaines.", type: "short_text", required: true, visibleWhen: { question: "first_weeks_organization", contains: "other" } },
    { key: "housing", section: "housing", label: "Votre habitation :", type: "single_choice", required: true, options: housingOptions },
    { key: "home_environment", section: "environment", label: "Dans quel environnement se trouve votre domicile ?", type: "single_choice", required: true, options: [option("urban", "Milieu urbain"), option("residential", "Lotissement ou zone résidentielle"), option("countryside", "Campagne"), option("other", "Autre")] },
    { key: "home_environment_other", section: "environment", label: "Précisez cet autre environnement.", type: "short_text", required: true, visibleWhen: { question: "home_environment", equals: "other" } },
    { key: "urban_exposure", section: "environment", label: "Votre chien sera-t-il régulièrement amené en ville ou dans des environnements urbains animés ?", type: "single_choice", required: true, options: [option("frequently", "Oui, fréquemment."), option("occasionally", "Oui, occasionnellement."), option("rarely_never", "Rarement ou jamais."), option("undefined", "Je ne sais pas encore.")] },
    { key: "walk_environments", section: "walks_activities", label: "Dans quels environnements pensez-vous le promener régulièrement ?", type: "multiple_choice", required: true, options: [option("countryside", "Campagne"), option("seaside", "Bord de mer"), option("forest", "Forêt"), option("city", "Ville"), option("residential_area", "Alentours du lotissement"), option("other", "Autre")] },
    { key: "walk_environments_other", section: "walks_activities", label: "Précisez cet autre environnement de promenade.", type: "short_text", required: true, visibleWhen: { question: "walk_environments", contains: "other" } },
    { key: "adult_walk_rhythm", section: "walks_activities", label: "Quel rythme imaginez-vous lorsqu’il sera adulte ?", type: "single_choice", required: true, options: [option("short_outings", "Sorties courtes principalement"), option("one_main_daily_walk", "Une promenade principale quotidienne, complétée de sorties courtes"), option("several_substantial_walks", "Plusieurs promenades substantielles par jour"), option("week_weekend_variable", "Rythme très variable entre semaine et week-end"), option("undefined", "Organisation pas encore définie")] },
    { key: "walk_freedom", section: "walks_activities", label: "Lorsque l’environnement et les apprentissages le permettront, comment imaginez-vous les promenades ?", type: "single_choice", required: true, options: [option("mostly_leash_longline", "Principalement en laisse ou longe"), option("mixed_by_location", "Laisse, longe et liberté selon les lieux"), option("mostly_off_leash", "Principalement en liberté dans les lieux adaptés"), option("undefined", "Je ne sais pas encore")] },
    { key: "planned_activities", section: "walks_activities", label: "Quels types d’activités envisagez-vous ?", type: "multiple_choice", required: true, options: [option("quiet_walks", "Promenades tranquilles"), option("hiking", "Longues balades ou randonnées"), option("dog_sports", "Activités sportives avec le chien"), option("education_scent", "Activités éducatives ou de flair"), option("water", "Activités aquatiques"), option("urban_social", "Sorties urbaines ou sociales"), option("none", "Aucune activité particulière prévue"), option("other", "Autre")] },
    { key: "planned_activities_other", section: "walks_activities", label: "Précisez cette autre activité.", type: "short_text", required: true, visibleWhen: { question: "planned_activities", contains: "other" } },
    { key: "education_support", section: "education_support", label: "Comment envisagez-vous son éducation ?", type: "multiple_choice", required: true, options: [option("family_education", "Éducation principalement en famille"), option("puppy_school", "Cours collectifs dans un club ou une école du chiot"), option("educator_group_walks", "Balades collectives avec un éducateur"), option("individual_educator", "Accompagnement individuel par un éducateur"), option("regular_dog_activity", "Activité canine régulière"), option("undefined", "Je ne sais pas encore"), option("other", "Autre")] },
    { key: "education_support_other", section: "education_support", label: "Précisez cette autre forme d’accompagnement.", type: "short_text", required: true, visibleWhen: { question: "education_support", contains: "other" } },
    { key: "advice_topics", section: "education_support", label: "Sur quels sujets souhaiteriez-vous recevoir des conseils ?", type: "multiple_choice", required: true, options: [option("arrival_preparation", "Préparation de l’arrivée"), option("toilet_nights", "Propreté et premières nuits"), option("biting_destruction", "Mordillements et destructions"), option("alone_time", "Solitude"), option("recall_and_walks", "Rappel et promenades"), option("socialization", "Socialisation"), option("children", "Cohabitation avec les enfants"), option("other_animals", "Cohabitation avec d’autres animaux"), option("feeding_care", "Alimentation et soins courants"), option("none", "Aucun besoin particulier pour le moment"), option("other", "Autre")] },
    { key: "advice_topics_other", section: "education_support", label: "Précisez cet autre sujet de conseil.", type: "short_text", required: true, visibleWhen: { question: "advice_topics", contains: "other" } },
    { key: "desired_qualities", section: "desired_qualities", label: "Quelles qualités comportementales recherchez-vous ?", help: "Choisissez jusqu’à quatre qualités.", type: "multiple_choice", required: true, options: [...ADOPTER_PROFILE_QUALITIES] },
    { key: "desired_quality_ranking", section: "desired_qualities", label: "Classez les qualités choisies par ordre de priorité.", type: "ordered_choice", required: true },
    { key: "indispensable_quality_present", section: "desired_qualities", label: "L’une de ces qualités est-elle réellement indispensable ?", type: "single_choice", required: true, options: [option("no", "Non."), option("yes", "Oui.")] },
    { key: "indispensable_quality", section: "desired_qualities", label: "Quelle qualité est réellement indispensable ?", type: "single_choice", required: true, visibleWhen: { question: "indispensable_quality_present", equals: "yes" } },
    { key: "indispensable_quality_reason", section: "desired_qualities", label: "Pourquoi cette qualité est-elle indispensable ?", type: "long_text", required: true, visibleWhen: { question: "indispensable_quality_present", equals: "yes" } },
    { key: "anticipated_difficulties", section: "anticipated_difficulties", label: "Quelles situations pensez-vous pouvoir trouver difficiles à gérer ?", type: "multiple_choice", required: true, options: [option("high_energy", "Niveau d’énergie élevé"), option("sensitivity_fear", "Sensibilité ou réactions de crainte"), option("human_dependency", "Forte dépendance aux humains"), option("attention_seeking", "Demandes fréquentes d’attention"), option("settling_difficulty", "Difficulté à retrouver le calme"), option("visitor_enthusiasm", "Enthousiasme important avec les visiteurs"), option("leash_pulling", "Traction en laisse pendant l’apprentissage"), option("puppy_biting", "Mordillements du jeune chiot"), option("destruction", "Destructions"), option("toilet_accidents", "Accidents de propreté"), option("mud_hair", "Poils, boue et retours de promenade mouillés"), option("barking", "Aboiements"), option("none", "Aucune difficulté particulière anticipée"), option("other", "Autre")] },
    { key: "anticipated_difficulties_other", section: "anticipated_difficulties", label: "Précisez cette autre difficulté.", type: "short_text", required: true, visibleWhen: { question: "anticipated_difficulties", contains: "other" } },
    { key: "incompatible_situation_present", section: "anticipated_difficulties", label: "L’une de ces situations serait-elle réellement incompatible avec votre foyer ou votre quotidien ?", type: "single_choice", required: true, options: [option("no", "Non, il s’agit surtout de sujets sur lesquels je pourrais avoir besoin d’aide."), option("yes", "Oui.")] },
    { key: "incompatible_situations", section: "anticipated_difficulties", label: "Quelles situations seraient réellement incompatibles ?", type: "multiple_choice", required: true, visibleWhen: { question: "incompatible_situation_present", equals: "yes" } },
    { key: "incompatible_situation_reason", section: "anticipated_difficulties", label: "Pourquoi seraient-elles incompatibles ?", type: "long_text", required: true, visibleWhen: { question: "incompatible_situation_present", equals: "yes" } },
    { key: "free_comment", section: "free_comment", label: "Y a-t-il un élément important que nous n’avons pas abordé et qui pourrait nous aider à mieux vous accompagner ?", help: "Vous pouvez notamment préciser une contrainte particulière, un changement familial ou professionnel prévu, une inquiétude, une attente ou une question concernant l’arrivée du chien.", type: "long_text" },
  ] satisfies AdopterProfileQuestion[],
} as const;

function hasValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function questionVisible(question: AdopterProfileQuestion, answers: AdopterProfileAnswers, context: AdopterProfileQuestionnaireContext) {
  if (question.dynamic === "relevant_litters") return context.relevantLitters.length > 1;
  if (!question.visibleWhen) return true;
  const answer = answers[question.visibleWhen.question];
  if (question.visibleWhen.contains) {
    return Array.isArray(answer) && answer.includes(question.visibleWhen.contains);
  }
  return answer === question.visibleWhen.equals;
}

export function getVisibleAdopterProfileQuestions(
  definition: typeof ADOPTER_PROFILE_QUESTIONNAIRE_V1,
  answers: AdopterProfileAnswers,
  context: AdopterProfileQuestionnaireContext,
) {
  return definition.questions
    .filter((question) => questionVisible(question, answers, context))
    .map((question) => question.key);
}

export function stripHiddenAdopterProfileAnswers(
  definition: typeof ADOPTER_PROFILE_QUESTIONNAIRE_V1,
  answers: AdopterProfileAnswers,
  context: AdopterProfileQuestionnaireContext,
) {
  const visible = new Set(getVisibleAdopterProfileQuestions(definition, answers, context));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => visible.has(key)));
}

export function validateAdopterProfileAnswers(
  definition: typeof ADOPTER_PROFILE_QUESTIONNAIRE_V1,
  answers: AdopterProfileAnswers,
  context: AdopterProfileQuestionnaireContext,
  mode: "complete" | "draft" = "complete",
) {
  const errors: Record<string, string> = {};
  const allowedKeys = new Set(definition.questions.map((question) => question.key));
  if (Object.keys(answers).some((key) => !allowedKeys.has(key))) {
    errors._form = "Le questionnaire contient un champ inconnu.";
  }
  for (const question of definition.questions) {
    const answer = answers[question.key];
    if (!questionVisible(question, answers, context)) {
      if (hasValue(answer)) errors[question.key] = "Ce champ ne doit pas être renseigné dans cette situation.";
      continue;
    }
    if (mode === "complete" && question.required && !hasValue(answer)) {
      errors[question.key] = "Ce champ est obligatoire.";
      continue;
    }
    if (!hasValue(answer)) continue;

    if (question.type === "single_choice") {
      const optionValues = question.dynamic === "relevant_litters"
        ? [...context.relevantLitters.map((litter) => litter.id), "none"]
        : (question as AdopterProfileQuestion).options?.map((item) => item.value) ?? [];
      if (typeof answer !== "string" || (optionValues.length > 0 && !optionValues.includes(answer))) {
        errors[question.key] = "Choisissez une option proposée.";
      }
    }
    if (question.type === "multiple_choice") {
      const values = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === "string") : [];
      const optionValues = question.key === "incompatible_situations"
        ? (Array.isArray(answers.anticipated_difficulties) ? answers.anticipated_difficulties.filter((item): item is string => typeof item === "string") : [])
        : (question as AdopterProfileQuestion).options?.map((item) => item.value) ?? [];
      if (!Array.isArray(answer) || values.length !== answer.length || new Set(values).size !== values.length || values.some((value) => !optionValues.includes(value))) {
        errors[question.key] = "Choisissez uniquement les options proposées.";
      } else if (values.includes("none") && values.length > 1) {
        errors[question.key] = "« Aucun » ne peut pas être combiné avec une autre option.";
      }
    }
    if (question.type === "integer" && (!Number.isInteger(answer) || Number(answer) < 1 || Number(answer) > 20)) {
      errors[question.key] = "Indiquez un nombre compris entre 1 et 20.";
    }
    if ((question.type === "short_text" || question.type === "long_text") && (typeof answer !== "string" || answer.length > (question.type === "short_text" ? 500 : 4_000))) {
      errors[question.key] = "Cette réponse est trop longue.";
    }
    if (question.type === "animal_repeater") {
      const animals = Array.isArray(answer) ? answer : [];
      const valid = animals.length <= 10 && animals.every((animal) => {
        if (!animal || typeof animal !== "object" || Array.isArray(animal)) return false;
        const row = animal as Record<string, unknown>;
        return typeof row.species === "string" && row.species.trim().length > 0 && row.species.length <= 100
          && Number.isInteger(row.count) && Number(row.count) >= 1 && Number(row.count) <= 20
          && typeof row.approximateAge === "string" && row.approximateAge.trim().length > 0 && row.approximateAge.length <= 100
          && typeof row.relationship === "string" && ["good", "variable", "difficult", "unobserved"].includes(row.relationship)
          && (row.sex === undefined || typeof row.sex === "string")
          && (row.details === undefined || (typeof row.details === "string" && row.details.length <= 500));
      });
      if (!valid) errors[question.key] = "Renseignez chaque animal avec les informations demandées.";
    }
  }

  const qualities = Array.isArray(answers.desired_qualities)
    ? answers.desired_qualities.filter((value): value is string => typeof value === "string")
    : [];
  const ranking = Array.isArray(answers.desired_quality_ranking)
    ? answers.desired_quality_ranking.filter((value): value is string => typeof value === "string")
    : [];
  if (qualities.length > 4) errors.desired_qualities = "Choisissez au maximum quatre qualités.";
  if (
    qualities.length > 0 &&
    (ranking.length !== qualities.length || new Set(ranking).size !== ranking.length || ranking.some((value) => !qualities.includes(value)))
  ) {
    errors.desired_quality_ranking = "Classez chaque qualité une seule fois.";
  }
  if (
    answers.indispensable_quality_present === "yes" &&
    typeof answers.indispensable_quality === "string" &&
    !qualities.includes(answers.indispensable_quality)
  ) {
    errors.indispensable_quality = "Choisissez une qualité déjà classée.";
  }
  const difficulties = Array.isArray(answers.anticipated_difficulties)
    ? answers.anticipated_difficulties.filter((value): value is string => typeof value === "string")
    : [];
  if (answers.incompatible_situation_present === "yes") {
    const incompatible = Array.isArray(answers.incompatible_situations)
      ? answers.incompatible_situations.filter((value): value is string => typeof value === "string")
      : [];
    if (incompatible.some((value) => !difficulties.includes(value))) {
      errors.incompatible_situations = "Choisissez une situation déjà indiquée.";
    }
  }
  return errors;
}
