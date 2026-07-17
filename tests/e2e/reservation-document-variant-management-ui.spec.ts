import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const ownerId = "10000000-0000-4000-8000-000000000001";
const ids = {
  organization: "8e160002-0000-4000-8000-000000000001",
  membership: "8e160002-0000-4000-8000-000000000002",
  contact: "8e160002-0000-4000-8000-000000000003",
  application: "8e160002-0000-4000-8000-000000000004",
  reservation: "8e160002-0000-4000-8000-000000000005",
  otherReservation: "8e160002-0000-4000-8000-000000000006",
  contractFamily: "8e160002-0000-4000-8000-000000000007",
  contractSource: "8e160002-0000-4000-8000-000000000008",
  certificateFamily: "8e160002-0000-4000-8000-000000000009",
  certificateSource: "8e160002-0000-4000-8000-000000000010",
  noPublicationFamily: "8e160002-0000-4000-8000-000000000011",
  incompatibleFamily: "8e160002-0000-4000-8000-000000000012",
  incompatibleSource: "8e160002-0000-4000-8000-000000000013",
  otherVariant: "8e160002-0000-4000-8000-000000000014",
  otherVariantVersion: "8e160002-0000-4000-8000-000000000015",
  foreignOrganization: "8e160002-0000-4000-8000-000000000016",
  foreignContact: "8e160002-0000-4000-8000-000000000017",
  foreignReservation: "8e160002-0000-4000-8000-000000000018",
  foreignFamily: "8e160002-0000-4000-8000-000000000019",
  foreignSource: "8e160002-0000-4000-8000-000000000020",
  foreignVariant: "8e160002-0000-4000-8000-000000000021",
  foreignVariantVersion: "8e160002-0000-4000-8000-000000000022",
} as const;

const contractDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat commun origine exacte",
  body: "Adoptant : [[adoptant.nom_complet]]\n**Conditions personnalisables.**",
};

const certificateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat commun compatible",
  body: "Contenu E2E du certificat.\nAdoptant : [[adoptant.nom_complet]]",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function setRole(role: "viewer" | "member" | "admin" | "owner") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ids.membership)}::uuid;
    set session_replication_role = origin;
  `);
}

function cleanup() {
  sql(`
    delete from public.reservation_document_variant_versions
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservation_document_variants
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.documents
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservations
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.document_templates
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.document_template_families
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.applications where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts
    where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    set session_replication_role = replica;
    delete from public.memberships where organization_id = ${q(ids.organization)}::uuid;
    set session_replication_role = origin;
    delete from public.organizations
    where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
  `);
}

function finalCounts() {
  return sql(`
    select json_build_object(
      'variants', (select count(*) from public.reservation_document_variants where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'versions', (select count(*) from public.reservation_document_variant_versions where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'documents', (select count(*) from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'reservations', (select count(*) from public.reservations where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'templates', (select count(*) from public.document_templates where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'families', (select count(*) from public.document_template_families where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'applications', (select count(*) from public.applications where organization_id = ${q(ids.organization)}::uuid),
      'contacts', (select count(*) from public.contacts where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'memberships', (select count(*) from public.memberships where organization_id = ${q(ids.organization)}::uuid),
      'organizations', (select count(*) from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid)),
      'storage', (select count(*) from storage.objects where bucket_id = 'documents' and (name like 'organizations/${ids.organization}/%' or name like 'organizations/${ids.foreignOrganization}/%'))
    )::text;
  `);
}

function seed() {
  cleanup();
  sql(`
    insert into public.organizations (id, name, slug)
    values
      (${q(ids.organization)}, 'Variantes UI E2E', 'variantes-ui-e2e'),
      (${q(ids.foreignOrganization)}, 'Variantes UI étrangère E2E', 'variantes-ui-foreign-e2e');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.contacts (id, organization_id, display_name, email)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Adoptant variantes UI', 'variants@example.invalid'),
      (${q(ids.foreignContact)}, ${q(ids.foreignOrganization)}, 'Adoptant étranger variantes UI', 'foreign-variants@example.invalid');

    insert into public.applications (id, organization_id, contact_id, species, breed, desired_sex_preference, status)
    values (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'no_preference', 'qualified');

    insert into public.reservations (id, organization_id, contact_id, application_id, status, reserved_sex_preference, price_cents, currency)
    values
      (${q(ids.reservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, 'active', 'no_preference', 250000, 'EUR'),
      (${q(ids.otherReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, 'active', 'no_preference', 250000, 'EUR'),
      (${q(ids.foreignReservation)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, null, 'active', 'no_preference', 250000, 'EUR');

    insert into public.document_template_families (id, organization_id, name, document_type, species, breed, created_by, updated_by)
    values
      (${q(ids.contractFamily)}, ${q(ids.organization)}, 'Contrat compatible variantes UI', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.certificateFamily)}, ${q(ids.organization)}, 'Certificat compatible variantes UI', 'commitment_certificate', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.noPublicationFamily)}, ${q(ids.organization)}, 'Contrat sans publication variantes UI', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.incompatibleFamily)}, ${q(ids.organization)}, 'Contrat incompatible variantes UI', 'reservation_contract', 'cat', 'Maine Coon', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.foreignFamily)}, ${q(ids.foreignOrganization)}, 'Contrat étranger variantes UI', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)});

    insert into public.document_templates (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by, created_by, updated_by)
    values
      (${q(ids.contractSource)}, ${q(ids.organization)}, ${q(ids.contractFamily)}, 'Contrat compatible variantes UI', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 7, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.certificateSource)}, ${q(ids.organization)}, ${q(ids.certificateFamily)}, 'Certificat compatible variantes UI', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 4, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.incompatibleSource)}, ${q(ids.organization)}, ${q(ids.incompatibleFamily)}, 'Contrat incompatible variantes UI', 'reservation_contract', 'cat', 'Maine Coon', 'json', ${q(JSON.stringify(contractDefinition))}, 2, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.foreignSource)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignFamily)}, 'Contrat étranger variantes UI', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)});

    insert into public.reservation_document_variants (id, organization_id, reservation_id, template_family_id, document_type, species, breed, created_by, updated_by)
    values
      (${q(ids.otherVariant)}, ${q(ids.organization)}, ${q(ids.otherReservation)}, ${q(ids.contractFamily)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.foreignVariant)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignReservation)}, ${q(ids.foreignFamily)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)});

    insert into public.reservation_document_variant_versions (id, organization_id, variant_id, version, source_template_id, source_template_version, template_format, template_content, lifecycle_status, created_by, updated_by)
    values
      (${q(ids.otherVariantVersion)}, ${q(ids.organization)}, ${q(ids.otherVariant)}, 1, ${q(ids.contractSource)}, 7, 'json', ${q(JSON.stringify(contractDefinition))}, 'draft', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.foreignVariantVersion)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignVariant)}, 1, ${q(ids.foreignSource)}, 1, 'json', ${q(JSON.stringify(contractDefinition))}, 'draft', ${q(ownerId)}, ${q(ownerId)});
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function variantSection(page: Page) {
  return page.getByRole("region", {
    name: "Variantes documentaires personnalisées",
    exact: true,
  });
}

function draftSection(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Brouillon courant" }),
  });
}

test("gère le parcours UI complet des variantes sans raccorder documents ni Storage", async ({ page }) => {
  let createdVariantId = "";
  const createdVersionIds: string[] = [];
  try {
    seed();
    expect(JSON.parse(finalCounts()).storage).toBe(0);
    await login(page);

    await page.goto(`/reservations/${ids.reservation}#documents`);
    const section = variantSection(page);
    await expect(section).toBeVisible();
    await expect(section.getByText("Contrat compatible variantes UI", { exact: true })).toBeVisible();
    await expect(section.getByText("Certificat compatible variantes UI", { exact: true })).toBeVisible();
    await expect(section.getByText("Contrat sans publication variantes UI", { exact: true })).toBeVisible();
    await expect(section.getByText("Contrat incompatible variantes UI", { exact: true })).toBeVisible();
    await expect(section.getByText("Aucune publication commune active compatible.")).toHaveCount(2);

    setRole("viewer");
    await page.reload();
    await expect(variantSection(page).getByRole("button", { name: "Créer une variante personnalisée" })).toHaveCount(0);

    setRole("member");
    await page.reload();
    const contractCard = variantSection(page).locator("div.rounded-lg").filter({ hasText: "Contrat compatible variantes UI" });
    await contractCard.getByRole("button", { name: "Créer une variante personnalisée" }).click();
    await expect(page).toHaveURL(/\/documents\/variantes\/[0-9a-f-]+$/, { timeout: 30_000 });
    createdVariantId = page.url().split("/").at(-1)!;
    createdVersionIds.push(sql(`select id::text from public.reservation_document_variant_versions where variant_id = ${q(createdVariantId)}::uuid and version = 1;`));

    await expect(page.getByText("Contrat compatible variantes UI", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Version 7", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Aperçu avec données fictives — la variante n’est pas encore raccordée aux données réelles du dossier ni à la génération PDF.")).toBeVisible();
    const draft = draftSection(page);
    await draft.getByLabel("Titre").fill("Contrat personnalisé sauvegardé");
    await expect(draft.getByRole("button", { name: "Publier" })).toHaveCount(0);
    await draft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(draft.getByText("Toutes les modifications affichées sont enregistrées.")).toBeVisible();
    expect(sql(`select template_content::jsonb->>'title' from public.reservation_document_variant_versions where id = ${q(createdVersionIds[0])}::uuid;`)).toBe("Contrat personnalisé sauvegardé");

    setRole("viewer");
    await page.reload();
    const viewerDraft = draftSection(page);
    await expect(viewerDraft.getByLabel("Titre")).toBeDisabled();
    await viewerDraft.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(viewerDraft.getByRole("status")).toContainText("respecte le schéma documentaire");

    setRole("member");
    await page.reload();
    await expect(draftSection(page).getByRole("button", { name: "Publier" })).toHaveCount(0);

    setRole("admin");
    await page.reload();
    const adminDraft = draftSection(page);
    await adminDraft.getByLabel("Titre").fill("Modification locale non enregistrée");
    await expect(adminDraft.getByRole("button", { name: "Publier" })).toBeDisabled();
    await adminDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(adminDraft.getByRole("button", { name: "Publier" })).toBeEnabled();
    sql(`
      update public.reservation_document_variant_versions
      set template_content = jsonb_set(template_content::jsonb, '{title}', '"Modification concurrente valide"')::text,
          updated_at = updated_at + interval '1 second'
      where id = ${q(createdVersionIds[0])}::uuid;
    `);
    await adminDraft.getByRole("button", { name: "Publier" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(adminDraft.getByRole("status")).toContainText("modifié entre-temps");
    expect(sql(`select lifecycle_status from public.reservation_document_variant_versions where id = ${q(createdVersionIds[0])}::uuid;`)).toBe("draft");
    await page.reload();
    const refreshedAdminDraft = draftSection(page);
    await refreshedAdminDraft.getByRole("button", { name: "Publier" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.getByRole("heading", { name: "Publication courante" })).toBeVisible();
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Publication courante" }) }).getByLabel("Titre")).toBeDisabled();

    setRole("member");
    await page.reload();
    expect(Number(sql(`select count(*) from public.reservation_document_variant_versions where variant_id = ${q(createdVariantId)}::uuid and lifecycle_status = 'draft';`))).toBe(0);
    await expect(page.getByRole("heading", { name: "Contenu automatiquement ajouté au document" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Créer la version suivante" })).toBeVisible();
    await page.getByRole("button", { name: "Créer la version suivante" }).click();
    await expect(draftSection(page).getByText("Version 2", { exact: false }).first()).toBeVisible();
    createdVersionIds.push(sql(`select id::text from public.reservation_document_variant_versions where variant_id = ${q(createdVariantId)}::uuid and version = 2;`));

    setRole("admin");
    await page.reload();
    await draftSection(page).getByRole("button", { name: "Publier" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.getByText("Version 2 · published · publiée")).toBeVisible();
    await expect(page.getByText("Version 1 · retired · retirée")).toBeVisible();

    setRole("member");
    await page.reload();
    await page.getByRole("button", { name: "Créer la version suivante" }).click();
    await expect(page.getByText("Version 3 · draft · brouillon")).toBeVisible();
    createdVersionIds.push(sql(`select id::text from public.reservation_document_variant_versions where variant_id = ${q(createdVariantId)}::uuid and version = 3;`));
    await expect(page.getByText("Version 2 · published · publiée")).toBeVisible();
    await expect(page.getByText("Version 1 · retired · retirée")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDraft = draftSection(page);
    await expect(mobileDraft.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(mobileDraft.getByRole("button", { name: "Aperçu" })).toBeVisible();
    await mobileDraft.getByRole("button", { name: "Aperçu" }).click();
    await expect(mobileDraft.getByText("Aperçu avec données fictives — la variante n’est pas encore raccordée aux données réelles du dossier ni à la génération PDF.")).toBeVisible();
    await mobileDraft.getByRole("button", { name: "Modifier" }).click();
    await expect(mobileDraft.getByLabel("Titre")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/reservations/${ids.reservation}/documents/variantes/${ids.otherVariant}`);
    await expect(page).toHaveURL(/\/not-found|\/reservations\//);
    await expect(page.getByRole("heading", { name: /introuvable|404/i })).toBeVisible();
    await page.goto(`/reservations/${ids.foreignReservation}/documents/variantes/${ids.foreignVariant}`);
    await expect(page.getByRole("heading", { name: /introuvable|404/i })).toBeVisible();

    expect(Number(sql(`select count(*) from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`))).toBe(0);
    expect(Number(sql(`select count(*) from storage.objects where bucket_id = 'documents' and (name like 'organizations/${ids.organization}/%' or name like 'organizations/${ids.foreignOrganization}/%');`))).toBe(0);
    await page.goto(`/reservations/${ids.reservation}#documents`);
    await expect(page.getByText("Générer le PDF", { exact: false }).first()).toBeVisible();
    await page.getByRole("link", { name: "Consulter la variante" }).first().click();
    await page.getByRole("link", { name: "← Retour à la réservation" }).click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${ids.reservation}#documents$`));

    console.info(`reservation-document-variant-management-ui variant: ${createdVariantId}`);
    console.info(`reservation-document-variant-management-ui versions: ${createdVersionIds.join(",")}`);
  } finally {
    cleanup();
    const counts = JSON.parse(finalCounts()) as Record<string, number>;
    expect(counts).toEqual({
      variants: 0,
      versions: 0,
      documents: 0,
      reservations: 0,
      templates: 0,
      families: 0,
      applications: 0,
      contacts: 0,
      memberships: 0,
      organizations: 0,
      storage: 0,
    });
  }
});
