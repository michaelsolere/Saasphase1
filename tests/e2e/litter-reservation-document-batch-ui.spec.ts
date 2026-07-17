import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "9c180000";
const id = (suffix: number) =>
  `${prefix}-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const ids = {
  organization: id(1),
  foreignOrganization: id(2),
  membership: id(3),
  viewerUser: id(4),
  viewerIdentity: id(5),
  viewerMembership: id(6),
  contact: id(7),
  application: id(8),
  litter: id(9),
  otherLitter: id(10),
  foreignContact: id(11),
  foreignApplication: id(12),
  foreignLitter: id(13),
  settings: id(14),
  documentSettings: id(15),
  commitmentFamily: id(20),
  commitmentTemplate: id(21),
  contractFamily: id(22),
  contractTemplate: id(23),
  draftFamily: id(24),
  draftTemplate: id(25),
  retiredFamily: id(26),
  retiredTemplate: id(27),
  inactiveFamily: id(28),
  inactiveTemplate: id(29),
  otherBreedFamily: id(30),
  otherBreedTemplate: id(31),
  otherTypeFamily: id(32),
  otherTypeTemplate: id(33),
  invalidVariant: id(34),
  invalidVariantVersion: id(35),
  invalidContact: id(36),
  invalidApplication: id(37),
  wrongStatusContact: id(38),
  wrongStatusApplication: id(39),
  validReservation: id(101),
  invalidVariantReservation: id(102),
  wrongStatusReservation: id(103),
  otherLitterReservation: id(104),
  foreignReservation: id(105),
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const viewerEmail = "litter-batch-ui-viewer@saasphase1.invalid";
const viewerPassword = "LitterBatchUiViewer-2026!";

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat groupé UI E2E",
  introduction: ["Introduction."],
  sections: {
    animalNeeds: ["Besoins."],
    health: ["Santé."],
    educationAndBehavior: ["Éducation."],
    costsAndConstraints: ["Contraintes."],
    holderObligations: ["Obligations."],
  },
  acknowledgmentText: ["Reconnaissance."],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

const contractDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat groupé UI E2E",
  body: "Adoptant : [[adoptant.nom_complet]]\nRace : [[projet.race]]\nPrix : [[reservation.prix_formate]]\nFait à [[document.lieu_signature]] le [[document.date_generation]].",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function fixtureCount(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where id::text like ${q(`${prefix}-%`)};`,
    ),
  );
}

function organizationCount(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`,
    ),
  );
}

function storagePaths() {
  const raw = sql(
    `select name from storage.objects where bucket_id = 'documents' and name like 'organizations/${ids.organization}/%';`,
  );
  return raw ? raw.split("\n").filter(Boolean) : [];
}

async function removeStorage(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = storagePaths();
  if (paths.length === 0) return;
  const removed = await supabase.storage.from("documents").remove(paths);
  expect(removed.error, "Storage cleanup must succeed").toBeNull();
}

function cleanupRows() {
  sql(`
    delete from public.document_signed_returns where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservation_document_variant_versions where id::text like ${q(`${prefix}-%`)};
    delete from public.reservation_document_variants where id::text like ${q(`${prefix}-%`)};
    delete from public.email_delivery_attempts where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.payments where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservations where id::text like ${q(`${prefix}-%`)};
    delete from public.document_templates where id::text like ${q(`${prefix}-%`)};
    delete from public.document_template_families where id::text like ${q(`${prefix}-%`)};
    delete from public.organization_document_settings where id::text like ${q(`${prefix}-%`)};
    delete from public.organization_settings where id::text like ${q(`${prefix}-%`)};
    delete from public.animals where id::text like ${q(`${prefix}-%`)};
    delete from public.litters where id::text like ${q(`${prefix}-%`)};
    delete from public.applications where id::text like ${q(`${prefix}-%`)};
    delete from public.contacts where id::text like ${q(`${prefix}-%`)};
    delete from public.memberships where id::text like ${q(`${prefix}-%`)};
    delete from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;
    delete from auth.users where id = ${q(ids.viewerUser)}::uuid;
  `);
}

const extraFixtures = Array.from({ length: 29 }, (_, index) => ({
  contact: id(1000 + index),
  application: id(1100 + index),
  reservation: id(1200 + index),
  name: `Dossier éligible ${String(index + 1).padStart(2, "0")}`,
  createdAt: `2026-07-17T09:${String(index + 2).padStart(2, "0")}:00Z`,
}));

function seed() {
  cleanupRows();
  const extraContacts = extraFixtures
    .map(
      (item) =>
        `(${q(item.contact)}, ${q(ids.organization)}, ${q(item.name)}, 'Dossier', ${q(item.name)}, ${q(`extra-${item.contact}@example.invalid`)}, '1 rue QA', '75001', 'Paris', 'FR')`,
    )
    .join(",\n");
  const extraApplications = extraFixtures
    .map(
      (item) =>
        `(${q(item.application)}, ${q(ids.organization)}, ${q(item.contact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified')`,
    )
    .join(",\n");
  const extraReservations = extraFixtures
    .map(
      (item) =>
        `(${q(item.reservation)}, ${q(ids.organization)}, ${q(item.contact)}, ${q(item.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', ${q(item.createdAt)})`,
    )
    .join(",\n");

  sql(`
    insert into public.organizations (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage Batch UI QA', 'Élevage Batch UI QA', 'company', 'batch-ui-qa', 'batch-ui@example.invalid', '1 rue QA', '75001', 'Paris', 'FR'),
      (${q(ids.foreignOrganization)}, 'Élevage Batch UI étranger', 'Élevage Batch UI étranger', 'company', 'batch-ui-foreign-qa', 'batch-ui-foreign@example.invalid', '2 rue QA', '69001', 'Lyon', 'FR');
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');
    insert into public.contacts (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Camille Génération', 'Camille', 'Génération', 'camille-generation@example.invalid', '3 rue QA', '33000', 'Bordeaux', 'FR'),
      (${q(ids.invalidContact)}, ${q(ids.organization)}, 'Alex Source Invalide', 'Alex', 'Source Invalide', 'alex-invalid@example.invalid', '4 rue QA', '44000', 'Nantes', 'FR'),
      (${q(ids.wrongStatusContact)}, ${q(ids.organization)}, 'Morgan Statut Actif', 'Morgan', 'Statut Actif', 'morgan-active@example.invalid', '5 rue QA', '59000', 'Lille', 'FR'),
      (${q(ids.foreignContact)}, ${q(ids.foreignOrganization)}, 'Contact étranger invisible', 'Contact', 'Étranger', 'foreign@example.invalid', '6 rue QA', '13000', 'Marseille', 'FR'),
      ${extraContacts};
    insert into public.applications (id, organization_id, contact_id, species, breed, desired_sex_preference, status)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified'),
      (${q(ids.invalidApplication)}, ${q(ids.organization)}, ${q(ids.invalidContact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified'),
      (${q(ids.wrongStatusApplication)}, ${q(ids.organization)}, ${q(ids.wrongStatusContact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified'),
      (${q(ids.foreignApplication)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified'),
      ${extraApplications};
    insert into public.litters (id, organization_id, name, species, breed, actual_birth_date, available_from)
    values
      (${q(ids.litter)}, ${q(ids.organization)}, 'Portée Batch UI QA', 'dog', 'Golden Retriever', '2026-06-01', '2026-08-01'),
      (${q(ids.otherLitter)}, ${q(ids.organization)}, 'Autre portée Batch UI QA', 'dog', 'Golden Retriever', '2026-06-02', '2026-08-02'),
      (${q(ids.foreignLitter)}, ${q(ids.foreignOrganization)}, 'Portée étrangère Batch UI QA', 'dog', 'Golden Retriever', '2026-06-03', '2026-08-03');
    insert into public.organization_settings (id, organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents)
    values (${q(ids.settings)}, ${q(ids.organization)}, 30000, 45000);
    insert into public.organization_document_settings (id, organization_id, signature_city_default)
    values (${q(ids.documentSettings)}, ${q(ids.organization)}, 'Paris');
    insert into public.document_template_families (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.commitmentFamily)}, ${q(ids.organization)}, 'Certificat publié compatible QA', 'commitment_certificate', 'dog', 'Golden Retriever'),
      (${q(ids.contractFamily)}, ${q(ids.organization)}, 'Contrat publié compatible QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.draftFamily)}, ${q(ids.organization)}, 'Modèle brouillon exclu QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.retiredFamily)}, ${q(ids.organization)}, 'Modèle retiré exclu QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.inactiveFamily)}, ${q(ids.organization)}, 'Modèle inactif exclu QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.otherBreedFamily)}, ${q(ids.organization)}, 'Modèle Labrador exclu QA', 'reservation_contract', 'dog', 'Labrador Retriever'),
      (${q(ids.otherTypeFamily)}, ${q(ids.organization)}, 'Facture exclue QA', 'invoice', 'dog', 'Golden Retriever');
    insert into public.document_templates (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values
      (${q(ids.commitmentTemplate)}, ${q(ids.organization)}, ${q(ids.commitmentFamily)}, 'Certificat publié compatible QA', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 2, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, ${q(ids.contractFamily)}, 'Contrat publié compatible QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 3, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.draftTemplate)}, ${q(ids.organization)}, ${q(ids.draftFamily)}, 'Modèle brouillon exclu QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'draft', false, null, null),
      (${q(ids.retiredTemplate)}, ${q(ids.organization)}, ${q(ids.retiredFamily)}, 'Modèle retiré exclu QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'retired', false, now(), ${q(ownerId)}),
      (${q(ids.inactiveTemplate)}, ${q(ids.organization)}, ${q(ids.inactiveFamily)}, 'Modèle inactif exclu QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'retired', false, now(), ${q(ownerId)}),
      (${q(ids.otherBreedTemplate)}, ${q(ids.organization)}, ${q(ids.otherBreedFamily)}, 'Modèle Labrador exclu QA', 'reservation_contract', 'dog', 'Labrador Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.otherTypeTemplate)}, ${q(ids.organization)}, ${q(ids.otherTypeFamily)}, 'Facture exclue QA', 'invoice', 'dog', 'Golden Retriever', 'json', '{}', 1, 'published', true, now(), ${q(ownerId)});
    insert into public.reservations (id, organization_id, contact_id, application_id, litter_id, status, price_cents, currency, created_at)
    values
      (${q(ids.validReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-17T09:00:00Z'),
      (${q(ids.invalidVariantReservation)}, ${q(ids.organization)}, ${q(ids.invalidContact)}, ${q(ids.invalidApplication)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-17T09:01:00Z'),
      (${q(ids.wrongStatusReservation)}, ${q(ids.organization)}, ${q(ids.wrongStatusContact)}, ${q(ids.wrongStatusApplication)}, ${q(ids.litter)}, 'active', 250000, 'EUR', '2026-07-17T10:00:00Z'),
      (${q(ids.otherLitterReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.otherLitter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-17T10:01:00Z'),
      (${q(ids.foreignReservation)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, ${q(ids.foreignApplication)}, ${q(ids.foreignLitter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-17T10:02:00Z'),
      ${extraReservations};
    insert into public.reservation_document_variants (id, organization_id, reservation_id, template_family_id, document_type, species, breed, created_by, updated_by)
    values (${q(ids.invalidVariant)}, ${q(ids.organization)}, ${q(ids.invalidVariantReservation)}, ${q(ids.contractFamily)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)});
    insert into public.reservation_document_variant_versions (id, organization_id, variant_id, version, source_template_id, source_template_version, template_format, template_content, lifecycle_status, published_at, published_by, created_by, updated_by)
    values (${q(ids.invalidVariantVersion)}, ${q(ids.organization)}, ${q(ids.invalidVariant)}, 1, ${q(ids.contractTemplate)}, 3, 'json', '{"invalid":true}', 'published', now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)});
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.viewerMembership)}, ${q(ids.organization)}, ${q(ids.viewerUser)}, 'viewer', 'active');
  `);
}

async function login(page: Page, email = E2E_OWNER_EMAIL, password = E2E_OWNER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("pilote la génération groupée depuis la portée sans fuite ni effet annexe", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorage(supabase);

  try {
    seed();
    const paymentsBefore = organizationCount("payments");
    const emailsBefore = organizationCount("email_delivery_attempts");
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await login(viewerPage, viewerEmail, viewerPassword);
    await viewerPage.goto(`/litters/${ids.litter}#generation-documents-groupes`);
    const viewerSection = viewerPage.locator("#generation-documents-groupes");
    await expect(viewerSection).toContainText("Génération groupée des documents");
    await expect(viewerSection).toContainText("lecture seule");
    await expect(
      viewerSection.getByRole("button", {
        name: "Générer les documents sélectionnés",
      }),
    ).toHaveCount(0);
    await viewerContext.close();

    await login(page);
    await page.goto(`/litters/${ids.litter}#generation-documents-groupes`);
    const section = page.locator("#generation-documents-groupes");
    await section.locator("summary").click();
    const reservationsSection = page.locator("#reservations-liees");
    expect(
      await reservationsSection.evaluate((node) =>
        Boolean(node.compareDocumentPosition(document.querySelector("#generation-documents-groupes")) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ).toBe(true);
    expect(
      await section.evaluate((node) =>
        Boolean(node.compareDocumentPosition(document.querySelector("#campagnes-emails")) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ).toBe(true);

    await expect(section).toContainText("Camille Génération");
    await expect(section.getByRole("link", { name: "Camille Génération" })).toHaveAttribute(
      "href",
      `/reservations/${ids.validReservation}`,
    );
    await expect(section).toContainText("Morgan Statut Actif");
    await expect(section).not.toContainText("Contact étranger invisible");
    await expect(section).not.toContainText("Autre portée Batch UI QA");
    await expect(section.getByLabel("Sélectionner Camille Génération")).toBeEnabled();
    await expect(section.getByLabel("Sélectionner Morgan Statut Actif")).toBeDisabled();
    await expect(section).toContainText("Ce dossier ne remplit pas les conditions préalables.");

    await expect(section.getByRole("option", { name: "Certificat publié compatible QA — version 2" })).toHaveCount(1);
    await expect(section.getByRole("option", { name: "Contrat publié compatible QA — version 3" })).toHaveCount(1);
    for (const excluded of [
      "Modèle brouillon exclu QA",
      "Modèle retiré exclu QA",
      "Modèle inactif exclu QA",
      "Modèle Labrador exclu QA",
      "Facture exclue QA",
    ]) {
      await expect(section).not.toContainText(excluded);
    }

    const form = section.locator("form");
    for (const forbidden of [
      "litter_id",
      "organization_id",
      "operation_id",
      "captured_at",
      "document_id",
      "variant_id",
    ]) {
      await expect(form.locator(`[name="${forbidden}"]`)).toHaveCount(0);
    }
    await expect(form.locator('[name*="variant"]')).toHaveCount(0);
    await expect(form.locator('input[name="reservation_ids[]"]:checked')).toHaveCount(30);
    await expect(section).toContainText("30 dossier(s) sélectionné(s) sur 30");
    await expect(section).toContainText("La limite de 30 dossiers est atteinte");
    await expect(section.getByLabel(`Sélectionner ${extraFixtures.at(-1)!.name}`)).toBeDisabled();

    await section.getByRole("button", { name: "Tout désélectionner" }).click();
    await section.getByLabel("Sélectionner Camille Génération").check();
    await section.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("1");
    await expect(page.getByRole("alertdialog")).toContainText("Certificat publié compatible QA — version 2");
    await expect(page.getByRole("alertdialog")).toContainText("Contrat publié compatible QA — version 3");
    await expect(page.getByRole("alertdialog")).toContainText("Le certificat sera traité avant le contrat.");
    await expect(page.getByRole("alertdialog")).toContainText("Aucun e-mail ni paiement ne sera créé.");
    await page.getByRole("button", { name: "Annuler" }).click();
    expect(organizationCount("documents")).toBe(0);
    expect(storagePaths()).toEqual([]);

    await section.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await page.getByRole("button", { name: "Confirmer la génération" }).click();
    await expect(section).toContainText("Génération terminée", { timeout: 45_000 });
    await expect(section).toContainText("Générés");
    await expect(section).toContainText("Généré");
    await expect(section).toContainText("2");
    expect(organizationCount("documents")).toBe(2);
    expect(storagePaths()).toHaveLength(2);
    expect(
      sql(
        `select string_agg(document_type, ',' order by created_at, case document_type when 'commitment_certificate' then 0 else 1 end) from public.documents where reservation_id = ${q(ids.validReservation)}::uuid;`,
      ),
    ).toBe("commitment_certificate,reservation_contract");
    await expect(section.getByLabel("Sélectionner Camille Génération")).toBeDisabled();
    await expect(section.getByLabel("Certificat d’engagement")).toBeDisabled();
    await expect(section.getByLabel("Contrat de réservation")).toBeDisabled();
    const newOperationLink = section.getByRole("link", {
      name: "Démarrer une nouvelle opération",
    });
    await expect(newOperationLink).toBeVisible();
    const successText = (await section.textContent()) ?? "";
    expect(successText).not.toContain(ids.validReservation);
    expect(successText).not.toMatch(/storage|sha|reasonCode|database_error|snapshot/i);

    await newOperationLink.click();
    await expect(page).toHaveURL(
      `/litters/${ids.litter}#generation-documents-groupes`,
    );
    const reloadedSection = page.locator("#generation-documents-groupes");
    await reloadedSection.locator("summary").click();
    await reloadedSection.getByRole("button", { name: "Tout désélectionner" }).click();
    await reloadedSection.getByLabel("Sélectionner Camille Génération").check();
    await reloadedSection.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await page.getByRole("button", { name: "Confirmer la génération" }).click();
    await expect(reloadedSection).toContainText("Déjà présent", { timeout: 45_000 });
    expect(organizationCount("documents")).toBe(2);
    expect(storagePaths()).toHaveLength(2);

    await page.reload();
    const partialSection = page.locator("#generation-documents-groupes");
    await partialSection.locator("summary").click();
    await partialSection.getByRole("button", { name: "Tout désélectionner" }).click();
    await partialSection.getByLabel("Sélectionner Camille Génération").check();
    await partialSection.getByLabel("Sélectionner Alex Source Invalide").check();
    await partialSection.getByLabel("Sélectionner Dossier éligible 01").check();
    await partialSection.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await page.getByRole("button", { name: "Confirmer la génération" }).click();
    await expect(partialSection).toContainText("Génération partiellement terminée", { timeout: 45_000 });
    await expect(partialSection).toContainText("Source invalide");
    await expect(partialSection).toContainText("Déjà présent");
    const eligibleResult = partialSection.locator("article").filter({
      hasText: "Dossier éligible 01",
    });
    await expect(eligibleResult).toContainText("Généré");
    await expect(partialSection.getByRole("button", { name: "Rejouer cette opération" })).toBeVisible();
    expect(organizationCount("documents")).toBe(4);
    const rowsBeforeReplay = organizationCount("documents");
    const pathsBeforeReplay = storagePaths();
    const reservationIdsBeforeReplay = await partialSection
      .locator('input[name="reservation_ids[]"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    const commitmentTemplateBeforeReplay = await partialSection
      .locator('input[name="commitment_template_id"]')
      .inputValue();
    const contractTemplateBeforeReplay = await partialSection
      .locator('input[name="contract_template_id"]')
      .inputValue();
    await partialSection.getByRole("button", { name: "Rejouer cette opération" }).click();
    await expect(partialSection).toContainText("Génération partiellement terminée", { timeout: 45_000 });
    await expect(eligibleResult).toContainText("Déjà généré par cette opération");
    await expect(eligibleResult).not.toContainText("Déjà présent");
    expect(organizationCount("documents")).toBe(rowsBeforeReplay);
    expect(storagePaths()).toEqual(pathsBeforeReplay);
    expect(
      await partialSection
        .locator('input[name="reservation_ids[]"]')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    ).toEqual(reservationIdsBeforeReplay);
    expect(await partialSection.locator('input[name="commitment_template_id"]').inputValue()).toBe(
      commitmentTemplateBeforeReplay,
    );
    expect(await partialSection.locator('input[name="contract_template_id"]').inputValue()).toBe(
      contractTemplateBeforeReplay,
    );
    const partialText = (await partialSection.textContent()) ?? "";
    expect(partialText).not.toContain(ids.invalidVariantReservation);
    expect(partialText).not.toMatch(/storage|sha|reasonCode|database_error|snapshot/i);

    expect(organizationCount("payments")).toBe(paymentsBefore);
    expect(organizationCount("email_delivery_attempts")).toBe(emailsBefore);
  } finally {
    await removeStorage(supabase);
    cleanupRows();
    expect(storagePaths()).toEqual([]);
    for (const table of [
      "documents",
      "reservation_document_variant_versions",
      "reservation_document_variants",
      "payments",
      "email_delivery_attempts",
      "reservations",
      "document_templates",
      "document_template_families",
      "organization_document_settings",
      "organization_settings",
      "animals",
      "litters",
      "applications",
      "contacts",
      "memberships",
    ]) {
      expect(fixtureCount(table), `${table} fixtures must be hard-deleted`).toBe(0);
    }
    expect(
      Number(
        sql(
          `select count(*) from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(`select count(*) from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;`),
      ),
    ).toBe(0);
    expect(
      Number(sql(`select count(*) from auth.users where id = ${q(ids.viewerUser)}::uuid;`)),
    ).toBe(0);
  }
});
