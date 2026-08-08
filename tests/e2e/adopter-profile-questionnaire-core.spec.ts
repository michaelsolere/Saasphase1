import { expect, test } from "@playwright/test";

import {
  ADOPTER_PROFILE_QUESTIONNAIRE_V1,
  getVisibleAdopterProfileQuestions,
  validateAdopterProfileAnswers,
} from "../../src/features/adopter-profile-questionnaire/definition";
import {
  buildAdopterProfileQuestionnairePath,
  deriveAdopterProfileQuestionnaireToken,
  generateAdopterProfileQuestionnaireToken,
  hashAdopterProfileQuestionnaireToken,
  isAdopterProfileQuestionnaireTokenFormat,
} from "../../src/features/adopter-profile-questionnaire/public-token";
import { parseAdopterProfilePublicCommand } from "../../src/features/adopter-profile-questionnaire/public-request";
import {
  buildAdopterProfileDeliveryIdempotencyKey,
  chooseAdopterProfileStaleDeliveryAction,
  chooseAdopterProfileDeliveryKind,
  isAdopterProfileDeliveryLeaseExpired,
} from "../../src/features/adopter-profile-questionnaire/delivery-model";
import {
  deriveAdopterProfileState,
  isAdopterProfileMilestoneComplete,
  requiresAdopterProfileSexPreferenceDecision,
} from "../../src/features/adopter-profile-questionnaire/state";
import { brevoTransactionalTemplateConfigs } from "../../src/features/settings/brevo-template-registry";

const completeAnswers = {
  sex_preference_confirmation: "confirmed",
  adults_count: 2,
  children_present: "no",
  animals_present: "no",
  dog_experience: "raised_one_puppy",
  daily_organization: ["remote_partial"],
  usual_alone_duration: "two_to_four_hours",
  first_weeks_organization: ["leave_or_increased_presence"],
  housing: "house_small_garden",
  home_environment: "countryside",
  urban_exposure: "occasionally",
  walk_environments: ["countryside", "forest"],
  adult_walk_rhythm: "one_main_daily_walk",
  walk_freedom: "mixed_by_location",
  planned_activities: ["quiet_walks", "hiking"],
  education_support: ["family_education", "puppy_school"],
  advice_topics: ["arrival_preparation", "recall_and_walks"],
  desired_qualities: ["close_to_humans", "calm_indoors", "playful"],
  desired_quality_ranking: ["close_to_humans", "calm_indoors", "playful"],
  indispensable_quality_present: "no",
  anticipated_difficulties: ["puppy_biting"],
  incompatible_situation_present: "no",
};

test("publie la définition V1 exacte, stable et dépourvue de score", () => {
  expect(ADOPTER_PROFILE_QUESTIONNAIRE_V1).toMatchObject({
    schemaVersion: 1,
    code: "adopter-profile",
    version: 1,
    title: "Questionnaire d’accompagnement",
  });
  expect(ADOPTER_PROFILE_QUESTIONNAIRE_V1.sections).toHaveLength(13);
  expect(ADOPTER_PROFILE_QUESTIONNAIRE_V1.qualities.map((quality) => quality.label)).toEqual([
    "Recherche volontiers la proximité de ses humains",
    "Calme dans la maison",
    "Énergique et volontiers partant pour une activité",
    "Joueur",
    "Facile à motiver et coopératif dans les apprentissages",
    "À l’aise dans les rencontres avec des personnes inconnues",
    "À l’aise dans les lieux et situations nouveaux",
    "Doux dans ses interactions",
    "Sensible et réceptif à son environnement",
    "Sûr de lui et capable de récupérer après une surprise",
    "Capable de retrouver son calme malgré l’agitation",
    "À l’aise avec une certaine autonomie",
    "Très affectueux et démonstratif",
  ]);
  expect(JSON.stringify(ADOPTER_PROFILE_QUESTIONNAIRE_V1).toLowerCase()).not.toContain("score");
});

test("affiche uniquement les branches pertinentes et exige leurs précisions", () => {
  const visibleWithoutBranches = getVisibleAdopterProfileQuestions(
    ADOPTER_PROFILE_QUESTIONNAIRE_V1,
    completeAnswers,
    { relevantLitters: [] },
  );
  expect(visibleWithoutBranches).not.toContain("sex_preference_proposal");
  expect(visibleWithoutBranches).not.toContain("children_ages");
  expect(visibleWithoutBranches).not.toContain("animals");
  expect(visibleWithoutBranches).not.toContain("litter_preference");

  const answers = {
    ...completeAnswers,
    sex_preference_confirmation: "changed",
    children_present: "yes",
    animals_present: "yes",
    indispensable_quality_present: "yes",
    incompatible_situation_present: "yes",
  };
  const visible = getVisibleAdopterProfileQuestions(
    ADOPTER_PROFILE_QUESTIONNAIRE_V1,
    answers,
    { relevantLitters: [{ id: "litter-a", label: "Portée Alba" }, { id: "litter-b", label: "Portée Belle" }] },
  );
  expect(visible).toEqual(expect.arrayContaining([
    "sex_preference_proposal",
    "litter_preference",
    "children_ages",
    "animals",
    "indispensable_quality",
    "indispensable_quality_reason",
    "incompatible_situations",
    "incompatible_situation_reason",
  ]));

  const validation = validateAdopterProfileAnswers(
    ADOPTER_PROFILE_QUESTIONNAIRE_V1,
    answers,
    { relevantLitters: [{ id: "litter-a", label: "Portée Alba" }, { id: "litter-b", label: "Portée Belle" }] },
  );
  expect(validation).toMatchObject({
    sex_preference_proposal: "Ce champ est obligatoire.",
    litter_preference: "Ce champ est obligatoire.",
    children_ages: "Ce champ est obligatoire.",
    animals: "Ce champ est obligatoire.",
    indispensable_quality: "Ce champ est obligatoire.",
    indispensable_quality_reason: "Ce champ est obligatoire.",
    incompatible_situations: "Ce champ est obligatoire.",
    incompatible_situation_reason: "Ce champ est obligatoire.",
  });
});

test("refuse plus de quatre qualités, un classement incomplet ou dupliqué", () => {
  expect(
    validateAdopterProfileAnswers(
      ADOPTER_PROFILE_QUESTIONNAIRE_V1,
      {
        ...completeAnswers,
        desired_qualities: [
          "close_to_humans",
          "calm_indoors",
          "energetic",
          "playful",
          "cooperative_learning",
        ],
        desired_quality_ranking: ["close_to_humans", "calm_indoors", "playful"],
      },
      { relevantLitters: [] },
    ),
  ).toMatchObject({
    desired_qualities: "Choisissez au maximum quatre qualités.",
    desired_quality_ranking: "Classez chaque qualité une seule fois.",
  });
});

test("rejette les valeurs hors définition, les textes surdimensionnés et les animaux incomplets", () => {
  const invalidOptions = validateAdopterProfileAnswers(ADOPTER_PROFILE_QUESTIONNAIRE_V1, {
    ...completeAnswers,
    housing: "castle",
    advice_topics: ["none", "socialization"],
  }, { relevantLitters: [] });
  expect(invalidOptions.housing).toBeTruthy();
  expect(invalidOptions.advice_topics).toBeTruthy();

  const invalidAnimal = validateAdopterProfileAnswers(ADOPTER_PROFILE_QUESTIONNAIRE_V1, {
    ...completeAnswers,
    animals_present: "yes",
    animals: [{ species: "chat", count: 1 }],
    free_comment: "x".repeat(4_001),
  }, { relevantLitters: [] });
  expect(invalidAnimal.animals).toBeTruthy();
  expect(invalidAnimal.free_comment).toBeTruthy();

  const hiddenAnswer = validateAdopterProfileAnswers(ADOPTER_PROFILE_QUESTIONNAIRE_V1, {
    ...completeAnswers,
    children_ages: "8 ans",
  }, { relevantLitters: [] });
  expect(hiddenAnswer.children_ages).toContain("ne doit pas être renseigné");
});

test("génère un jeton opaque fort et une URL sans identifiant métier", () => {
  const token = generateAdopterProfileQuestionnaireToken();
  expect(isAdopterProfileQuestionnaireTokenFormat(token)).toBe(true);
  expect(token).toHaveLength(43);
  expect(hashAdopterProfileQuestionnaireToken(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(buildAdopterProfileQuestionnairePath(token)).toBe(`/profil-adoptant/${token}`);
  expect(isAdopterProfileQuestionnaireTokenFormat("10000000-0000-4000-8000-000000000001")).toBe(false);
});

test("reconstruit le même jeton depuis un accès privé et garde une clé d’envoi logique stable", () => {
  const accessId = "9f350001-0000-4000-8000-000000000007";
  const secret = "profile-review-test-secret-with-at-least-32-characters";
  const token = deriveAdopterProfileQuestionnaireToken(accessId, secret);

  expect(token).toBe(deriveAdopterProfileQuestionnaireToken(accessId, secret));
  expect(token).not.toContain(accessId);
  expect(isAdopterProfileQuestionnaireTokenFormat(token)).toBe(true);
  expect(deriveAdopterProfileQuestionnaireToken("9f350001-0000-4000-8000-000000000008", secret)).not.toBe(token);
  expect(() => deriveAdopterProfileQuestionnaireToken(accessId, "too-short")).toThrow();

  expect(buildAdopterProfileDeliveryIdempotencyKey(accessId, "invitation", "access-generation-1")).toBe(
    buildAdopterProfileDeliveryIdempotencyKey(accessId, "invitation", "access-generation-1"),
  );
  expect(buildAdopterProfileDeliveryIdempotencyKey(accessId, "reminder", "access-generation-1")).not.toBe(
    buildAdopterProfileDeliveryIdempotencyKey(accessId, "invitation", "access-generation-1"),
  );
  expect(buildAdopterProfileDeliveryIdempotencyKey(accessId, "invitation", "access-generation-2")).not.toBe(
    buildAdopterProfileDeliveryIdempotencyKey(accessId, "invitation", "access-generation-1"),
  );
});

test("borne et valide les commandes publiques avant tout accès aux données", () => {
  expect(parseAdopterProfilePublicCommand({
    mode: "draft",
    clientCommandId: "9f350001-0000-4000-8000-000000000099",
    expectedRevision: 0,
    answers: { adults_count: 2 },
  })).toMatchObject({ ok: true });
  expect(parseAdopterProfilePublicCommand({
    mode: "submit",
    clientCommandId: "reservation-123",
    expectedRevision: 0,
    answers: {},
  })).toEqual({ ok: false });
  expect(parseAdopterProfilePublicCommand({
    mode: "draft",
    clientCommandId: "9f350001-0000-4000-8000-000000000099",
    expectedRevision: 0,
    answers: { comment: "x".repeat(130_000) },
  })).toEqual({ ok: false });
});

test("dérive les sept états simples et ne termine le jalon que par lecture ou dérogation", () => {
  const base = {
    instanceCreatedAt: "2026-08-01T10:00:00.000Z",
    dueAt: "2026-08-15T10:00:00.000Z",
    invitationSentAt: null,
    invitationFailedAt: null,
    finalSubmittedAt: null,
    reviewedAt: null,
    waivedAt: null,
  };
  expect(deriveAdopterProfileState(base, new Date("2026-08-02T10:00:00.000Z"))).toBe("to_send");
  expect(deriveAdopterProfileState({ ...base, invitationFailedAt: "2026-08-01T10:01:00.000Z" })).toBe("send_failed");
  expect(deriveAdopterProfileState({ ...base, invitationSentAt: "2026-08-01T10:01:00.000Z" }, new Date("2026-08-10T10:00:00.000Z"))).toBe("awaiting_response");
  expect(deriveAdopterProfileState({ ...base, invitationSentAt: "2026-08-01T10:01:00.000Z" }, new Date("2026-08-16T10:00:00.000Z"))).toBe("overdue");
  expect(deriveAdopterProfileState({ ...base, finalSubmittedAt: "2026-08-10T10:00:00.000Z" })).toBe("received_to_read");
  expect(deriveAdopterProfileState({ ...base, finalSubmittedAt: "2026-08-10T10:00:00.000Z", reviewedAt: "2026-08-11T10:00:00.000Z" })).toBe("reviewed");
  expect(deriveAdopterProfileState({ ...base, waivedAt: "2026-08-11T10:00:00.000Z" })).toBe("waived");
  expect(isAdopterProfileMilestoneComplete({ finalSubmittedAt: "2026-08-10T10:00:00.000Z", reviewedAt: null, waivedAt: null })).toBe(false);
  expect(isAdopterProfileMilestoneComplete({ finalSubmittedAt: "2026-08-10T10:00:00.000Z", reviewedAt: "2026-08-11T10:00:00.000Z", waivedAt: null })).toBe(true);
  expect(isAdopterProfileMilestoneComplete({ finalSubmittedAt: null, reviewedAt: null, waivedAt: "2026-08-11T10:00:00.000Z" })).toBe(true);
});

test("la décision de préférence dépend du changement exprimé depuis la préférence initiale", () => {
  expect(requiresAdopterProfileSexPreferenceDecision({
    initialSexPreference: "male_only",
    proposedSexPreference: "female_only",
  })).toBe(true);
  expect(requiresAdopterProfileSexPreferenceDecision({
    initialSexPreference: "male_only",
    proposedSexPreference: "male_only",
  })).toBe(false);
});

test("planifie une seule invitation puis la relance J+7, sans renvoi automatique après incident", () => {
  const now = new Date("2026-08-20T10:00:00Z");
  expect(chooseAdopterProfileDeliveryKind({ automaticInvitationAllowed: true, invitationAttemptId: null, invitationFailedAt: null, invitationSentAt: null, reminderAttemptId: null, reminderFailedAt: null, finalSubmittedAt: null, waivedAt: null }, now)).toBe("invitation");
  expect(chooseAdopterProfileDeliveryKind({ automaticInvitationAllowed: true, invitationAttemptId: null, invitationFailedAt: "2026-08-19T10:00:00Z", invitationSentAt: null, reminderAttemptId: null, reminderFailedAt: null, finalSubmittedAt: null, waivedAt: null }, now)).toBeNull();
  expect(chooseAdopterProfileDeliveryKind({ automaticInvitationAllowed: true, invitationAttemptId: "attempt", invitationFailedAt: null, invitationSentAt: "2026-08-13T09:59:59Z", reminderAttemptId: null, reminderFailedAt: null, finalSubmittedAt: null, waivedAt: null }, now)).toBe("reminder");
  expect(chooseAdopterProfileDeliveryKind({ automaticInvitationAllowed: true, invitationAttemptId: "attempt", invitationFailedAt: null, invitationSentAt: "2026-08-13T10:00:01Z", reminderAttemptId: null, reminderFailedAt: null, finalSubmittedAt: null, waivedAt: null }, now)).toBeNull();
  expect(chooseAdopterProfileDeliveryKind({ automaticInvitationAllowed: true, invitationAttemptId: "attempt", invitationFailedAt: null, invitationSentAt: "2026-08-01T10:00:00Z", reminderAttemptId: null, reminderFailedAt: null, finalSubmittedAt: "2026-08-02T10:00:00Z", waivedAt: null }, now)).toBeNull();
});

test("considère le bail d’envoi expiré après cinq minutes sans interrompre une tentative active", () => {
  const now = new Date("2026-08-08T10:10:00.000Z");
  expect(isAdopterProfileDeliveryLeaseExpired("2026-08-08T10:04:59.999Z", now)).toBe(true);
  expect(isAdopterProfileDeliveryLeaseExpired("2026-08-08T10:05:00.001Z", now)).toBe(false);
  expect(isAdopterProfileDeliveryLeaseExpired(null, now)).toBe(true);
});

test("ne réémet automatiquement qu’une tentative expirée sans appel fournisseur commencé", () => {
  const now = new Date("2026-08-08T10:10:00.000Z");
  expect(chooseAdopterProfileStaleDeliveryAction({ lastAttemptAt: "2026-08-08T10:09:00Z", providerCallStartedAt: null, attemptCount: 1 }, now)).toBe("wait");
  expect(chooseAdopterProfileStaleDeliveryAction({ lastAttemptAt: "2026-08-08T10:00:00Z", providerCallStartedAt: null, attemptCount: 1 }, now)).toBe("retry");
  expect(chooseAdopterProfileStaleDeliveryAction({ lastAttemptAt: "2026-08-08T10:00:00Z", providerCallStartedAt: "2026-08-08T10:00:01Z", attemptCount: 1 }, now)).toBe("uncertain");
  expect(chooseAdopterProfileStaleDeliveryAction({ lastAttemptAt: "2026-08-08T10:00:00Z", providerCallStartedAt: null, attemptCount: 3 }, now)).toBe("exhausted");
});

test("rend configurables les deux modèles Brevo du jalon Profil", () => {
  expect(brevoTransactionalTemplateConfigs.filter((template) => template.templateKey.startsWith("adopter_profile_"))).toEqual([
    { templateKey: "adopter_profile_invitation", title: "Invitation au questionnaire Profil", category: "adopter_journey" },
    { templateKey: "adopter_profile_reminder", title: "Relance du questionnaire Profil à J+7", category: "adopter_journey" },
  ]);
});
