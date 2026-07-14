import { expect, test, type Page } from "@playwright/test";

import type { CommitmentCertificateTemplateDefinition, ReservationContractTemplateDefinition } from "../../src/features/documents/document-template-definitions";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f150002-0000-4000-8000-0000000000";
const ids = {
  contractFamily: `${prefix}01`, contractDraft: `${prefix}02`,
  certificateFamily: `${prefix}11`, certificatePublication: `${prefix}12`, certificateDraft: `${prefix}13`,
} as const;
const fixtureNamePrefix = "E2E discard UI ";

const contractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 1, locale: "fr-FR", documentType: "reservation_contract", title: "Contrat destructif E2E",
  preamble: ["Préambule."],
  clauses: { reservationPurpose: ["Objet."], priceAndPayments: ["Prix."], deposit: ["Arrhes."], cancellationAndRefund: ["Annulation."], postponementAndCredit: ["Report."], potentialWithholding: ["Retenue."], finalConditions: ["Final."] },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};
const certificateDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 1, locale: "fr-FR", documentType: "commitment_certificate", title: "Certificat destructif E2E",
  introduction: ["Introduction."],
  sections: { animalNeeds: ["Besoins."], health: ["Santé."], educationAndBehavior: ["Éducation."], costsAndConstraints: ["Coûts."], holderObligations: ["Obligations."] },
  acknowledgmentText: ["Reconnaissance."], signatureLabels: { holder: "Détenteur", issuer: "Émetteur" },
};

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }
function cleanup() {
  sql(`
    delete from public.document_templates where family_id in (${q(ids.contractFamily)}::uuid, ${q(ids.certificateFamily)}::uuid);
    delete from public.document_template_families where id in (${q(ids.contractFamily)}::uuid, ${q(ids.certificateFamily)}::uuid);
    set session_replication_role = replica;
    update public.memberships set role = 'owner' where id = ${q(membershipId)}::uuid;
    set session_replication_role = origin;
  `);
}
function remainingFixtureCount() {
  return Number(sql(`select
    (select count(*) from public.document_templates where family_id in (${q(ids.contractFamily)}::uuid, ${q(ids.certificateFamily)}::uuid))
    + (select count(*) from public.document_template_families where id in (${q(ids.contractFamily)}::uuid, ${q(ids.certificateFamily)}::uuid))
    + (select count(*) from public.memberships where id = ${q(membershipId)}::uuid and role <> 'owner');`));
}
function seedFixtures() {
  sql(`
    insert into public.document_template_families (id, organization_id, name, document_type, species, breed, created_by, updated_by) values
      (${q(ids.contractFamily)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix}contrat`)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.certificateFamily)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix}certificat`)}, 'commitment_certificate', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.document_templates (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by, created_by, updated_by) values
      (${q(ids.contractDraft)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contractFamily)}::uuid, ${q(`${fixtureNamePrefix}contrat`)}, 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'draft', false, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.certificatePublication)}::uuid, ${q(organizationId)}::uuid, ${q(ids.certificateFamily)}::uuid, ${q(`${fixtureNamePrefix}certificat`)}, 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 1, 'published', true, now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.certificateDraft)}::uuid, ${q(organizationId)}::uuid, ${q(ids.certificateFamily)}::uuid, ${q(`${fixtureNamePrefix}certificat`)}, 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 2, 'draft', false, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
function setRole(role: "owner" | "admin" | "member" | "viewer") {
  sql(`set session_replication_role = replica; update public.memberships set role = ${q(role)} where id = ${q(membershipId)}::uuid; set session_replication_role = origin;`);
}

test("présente les blocs automatiques et confirme les retraits destructifs", async ({ page }) => {
  cleanup();
  expect(remainingFixtureCount()).toBe(0);
  seedFixtures();
  try {
    await login(page);

    await page.goto(`/documents/modeles/${ids.contractFamily}`);
    await expect(page.getByRole("heading", { name: "Contenu automatiquement ajouté au document" })).toBeVisible();
    await expect(page.getByText("prix, arrhes convenues, arrhes reçues, complément et solde")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clauses communes à rédiger" }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer ce modèle de référence" })).toBeVisible();

    setRole("member");
    await page.reload();
    await expect(page.getByRole("button", { name: /Supprimer ce modèle|Abandonner le brouillon/ })).toHaveCount(0);
    setRole("viewer");
    await page.reload();
    await expect(page.getByRole("button", { name: /Supprimer ce modèle|Abandonner le brouillon/ })).toHaveCount(0);
    setRole("owner");
    await page.reload();

    await page.getByRole("button", { name: "Supprimer ce modèle de référence" }).click();
    let dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Sa famille et son brouillon seront retirés de la liste.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Supprimer ce modèle de référence" })).toBeDisabled();
    await dialog.getByLabel(/Saisissez le nom exact/).fill("nom incorrect");
    await expect(dialog.getByRole("button", { name: "Supprimer ce modèle de référence" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect(sql(`select deleted_at is null from public.document_template_families where id = ${q(ids.contractFamily)}::uuid;`)).toBe("t");

    await page.getByRole("button", { name: "Supprimer ce modèle de référence" }).click();
    dialog = page.getByRole("alertdialog");
    await dialog.getByLabel(/Saisissez le nom exact/).fill(`${fixtureNamePrefix}contrat`);
    await dialog.getByRole("button", { name: "Supprimer ce modèle de référence" }).click();
    await expect(page).toHaveURL(/\/documents\/modeles\?status=deleted$/);
    expect(sql(`select deleted_at is not null from public.document_template_families where id = ${q(ids.contractFamily)}::uuid;`)).toBe("t");

    await page.goto(`/documents/modeles/${ids.certificateFamily}`);
    await expect(page.getByRole("heading", { name: "Contenu automatiquement ajouté au document" })).toBeVisible();
    await expect(page.getByText("prix, arrhes convenues, arrhes reçues, complément et solde")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Abandonner le brouillon" })).toBeVisible();
    const publicationUpdatedAt = sql(`select updated_at::text from public.document_templates where id = ${q(ids.certificatePublication)}::uuid;`);
    await page.getByRole("button", { name: "Abandonner le brouillon" }).click();
    dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("La version publiée restera inchangée.")).toBeVisible();
    await dialog.getByRole("button", { name: "Abandonner le brouillon" }).click();
    await expect(page.getByRole("heading", { name: "Aucun brouillon en cours" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Version publiée · version 1/ })).toBeVisible();
    expect(sql(`select updated_at::text from public.document_templates where id = ${q(ids.certificatePublication)}::uuid and lifecycle_status = 'published' and is_active;`)).toBe(publicationUpdatedAt);

    console.info(`document-template-discard-ui fixture families: ${ids.contractFamily},${ids.certificateFamily}`);
    console.info(`document-template-discard-ui fixture templates: ${ids.contractDraft},${ids.certificatePublication},${ids.certificateDraft}`);
  } finally {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
  }
});
