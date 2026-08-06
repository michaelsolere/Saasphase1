import { expect, test } from "@playwright/test";

import {
  buildPostAdoptionEmailVariables,
  buildPostAdoptionVariablesSnapshot,
  classifyPostAdoptionProviderFailure,
  getPostAdoptionTemplateKey,
  selectPostAdoptionOrganization,
} from "../../src/features/post-adoption-questionnaire/automated-delivery-core";

test("choisit quatre modèles Brevo pour les six communications", () => {
  expect(getPostAdoptionTemplateKey("post-adoption-t1", "initial")).toBe("post_adoption_t1");
  expect(getPostAdoptionTemplateKey("post-adoption-t2", "initial")).toBe("post_adoption_t2");
  expect(getPostAdoptionTemplateKey("post-adoption-t1", "reminder_7")).toBe("post_adoption_reminder_7");
  expect(getPostAdoptionTemplateKey("post-adoption-t2", "reminder_14")).toBe("post_adoption_reminder_14");
});

test("classe un délai réseau comme incertain pour éviter un doublon", () => {
  expect(classifyPostAdoptionProviderFailure("timeout")).toBe("uncertain");
  expect(classifyPostAdoptionProviderFailure("api_error")).toBe("uncertain");
  expect(classifyPostAdoptionProviderFailure("rate_limited")).toBe("retryable");
  expect(classifyPostAdoptionProviderFailure("template_inactive")).toBe("retryable");
});

test("construit les variables métier sans HTML", () => {
  expect(
    buildPostAdoptionEmailVariables({
      contactFirstName: "Julie",
      contactName: "Julie Martin",
      animalName: "Nova",
      organizationName: "Élevage du Soleil",
      milestone: "t1",
      publicUrl: "https://example.test/suivi/opaque",
      responseDeadline: "2026-11-09T09:00:00.000Z",
      timezone: "Europe/Paris",
    }),
  ).toEqual({
    prenom: "Julie",
    nom_complet: "Julie Martin",
    animal: "Nova",
    nom_elevage: "Élevage du Soleil",
    questionnaire: "suivi T1",
    lien_questionnaire: "https://example.test/suivi/opaque",
    date_limite_reponse: "9 novembre 2026",
  });
});

test("ne journalise jamais le lien bearer envoyé à la famille", () => {
  const variables = buildPostAdoptionEmailVariables({
    contactFirstName: "Julie",
    contactName: "Julie Martin",
    animalName: "Nova",
    organizationName: "Élevage du Soleil",
    milestone: "t1",
    publicUrl: "https://example.test/suivi/token-secret",
    responseDeadline: "2026-11-09T09:00:00.000Z",
    timezone: "Europe/Paris",
  });
  const snapshot = buildPostAdoptionVariablesSnapshot(variables);

  expect(snapshot.lien_questionnaire).toBe("[secret temporaire non journalisé]");
  expect(JSON.stringify(snapshot)).not.toContain("token-secret");
});

test("exige un choix explicite quand le compte appartient à plusieurs organisations", () => {
  const organizations = [
    { organizationId: "organization-a", role: "owner" },
    { organizationId: "organization-b", role: "admin" },
  ];

  expect(selectPostAdoptionOrganization(organizations, null)).toBeNull();
  expect(selectPostAdoptionOrganization(organizations, "organization-b")).toEqual(organizations[1]);
  expect(selectPostAdoptionOrganization(organizations, "organization-inconnue")).toBeNull();
  expect(selectPostAdoptionOrganization([organizations[0]], null)).toEqual(organizations[0]);
});
