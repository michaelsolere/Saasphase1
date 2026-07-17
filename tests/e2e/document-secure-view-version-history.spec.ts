import { createHash } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { storeDocumentPdfCore } from "../../src/features/documents/document-pdf-storage-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "7e170000-0000-4000-8000-000000000001",
  membership: "7e170000-0000-4000-8000-000000000002",
  contact: "7e170000-0000-4000-8000-000000000003",
  application: "7e170000-0000-4000-8000-000000000004",
  reservation: "7e170000-0000-4000-8000-000000000005",
  template: "7e170000-0000-4000-8000-000000000006",
  organizationSettings: "7e170000-0000-4000-8000-000000000007",
  documentSettings: "7e170000-0000-4000-8000-000000000008",
  payment: "7e170000-0000-4000-8000-000000000009",
  legacy: "7e170000-0000-4000-8000-000000000010",
  version1: "7e170000-0000-4000-8000-000000000011",
  version2: "7e170000-0000-4000-8000-000000000012",
  viewerUser: "7e170000-0000-4000-8000-000000000013",
  viewerIdentity: "7e170000-0000-4000-8000-000000000014",
  viewerMembership: "7e170000-0000-4000-8000-000000000015",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const seedOrganizationId = "20000000-0000-4000-8000-000000000001";
const viewerEmail = "document-history-viewer@saasphase1.invalid";
const viewerPassword = "DocumentHistoryViewer-2026!";
const pdfV1 = Buffer.from("%PDF-1.4\n% secure history E2E v1\n%%EOF\n");
const pdfV2 = Buffer.from("%PDF-1.4\n% secure history E2E v2\n%%EOF\n");

const templateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat historique sécurisé E2E",
  body: "Contenu E2E du contrat.\nAdoptant : [[adoptant.nom_complet]]",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function organizationCount(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where organization_id = ${q(ids.organization)}::uuid;`,
    ),
  );
}

function storagePaths() {
  const result = sql(
    `select name from storage.objects where bucket_id = 'documents' and name like 'organizations/${ids.organization}/%';`,
  );
  return result ? result.split("\n").filter(Boolean) : [];
}

async function removeStorageObjects(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = storagePaths();
  if (paths.length === 0) return;

  const removed = await supabase.storage.from("documents").remove(paths);
  expect(removed.error, "Storage cleanup must succeed").toBeNull();
}

function cleanupRows() {
  sql(`
    delete from public.documents where organization_id = ${q(ids.organization)}::uuid;
    delete from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.payments where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_templates where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_template_families where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_document_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.applications where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.memberships where id = ${q(ids.viewerMembership)}::uuid;
    delete from public.memberships where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organizations where id = ${q(ids.organization)}::uuid;
    delete from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;
    delete from auth.users where id = ${q(ids.viewerUser)}::uuid;
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations
      (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage historique E2E', 'Élevage historique E2E', 'company', 'document-history-e2e', 'seller-history@example.invalid', '1 rue E2E', '75001', 'Paris', 'FR');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.contacts
      (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Adoptant historique E2E', 'Adoptant', 'Historique E2E', 'adopter-history@example.invalid', '2 rue E2E', '69001', 'Lyon', 'FR');

    insert into public.applications
      (id, organization_id, contact_id, species, breed, desired_sex_preference, status)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'female_only', 'qualified');

    insert into public.reservations
      (id, organization_id, contact_id, application_id, status, reserved_sex_preference, price_cents, currency, created_at)
    values
      (${q(ids.reservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, 'active', 'female_only', 250000, 'EUR', '2026-07-13T09:00:00Z');

    insert into public.organization_settings
      (id, organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents)
    values (${q(ids.organizationSettings)}, ${q(ids.organization)}, 30000, 45000);

    insert into public.organization_document_settings
      (id, organization_id, signature_city_default)
    values (${q(ids.documentSettings)}, ${q(ids.organization)}, 'Paris');

    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.template)}, ${q(ids.organization)}, 'Contrat historique E2E', 'reservation_contract', 'dog', 'Golden Retriever');

    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values
      (${q(ids.template)}, ${q(ids.organization)}, ${q(ids.template)}, 'Contrat historique E2E', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(templateDefinition))}, 7, 'published', true, now(), ${q(ownerId)});

    insert into public.payments
      (id, organization_id, contact_id, reservation_id, amount_cents, payment_type, status)
    values
      (${q(ids.payment)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.reservation)}, 75000, 'arrhes', 'paid');

    insert into public.documents
      (id, organization_id, contact_id, application_id, reservation_id, document_type, status, title, signature_required)
    values
      (${q(ids.legacy)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.reservation)}, 'reservation_contract', 'uploaded', 'Legacy sans PDF E2E', true);

    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{"display_name":"Viewer historique E2E"}', now(), now());

    insert into auth.identities
      (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values
      (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.viewerMembership)}, ${q(seedOrganizationId)}, ${q(ids.viewerUser)}, 'viewer', 'active');
  `);
}

async function login(
  page: Page,
  email = E2E_OWNER_EMAIL,
  password = E2E_OWNER_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

function immutableState() {
  return sql(`
    select concat_ws('|',
      (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id)::text, '[]')) from public.documents d where d.organization_id = ${q(ids.organization)}::uuid),
      (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text, '[]')) from public.reservations r where r.organization_id = ${q(ids.organization)}::uuid),
      (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) from public.payments p where p.organization_id = ${q(ids.organization)}::uuid),
      (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.email_delivery_attempts e where e.organization_id = ${q(ids.organization)}::uuid)
    );
  `);
}

async function expectPdfResponse({
  page,
  documentId,
  version,
  expectedBytes,
}: {
  page: Page;
  documentId: string;
  version: number;
  expectedBytes: Buffer;
}) {
  for (const download of [false, true]) {
    const response = await page.request.get(
      `/documents/${documentId}/pdf${download ? "?download=1" : ""}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-disposition"]).toBe(
      `${download ? "attachment" : "inline"}; filename="reservation-contract-v${version}.pdf"`,
    );
    expect(Buffer.compare(await response.body(), expectedBytes)).toBe(0);
  }
}

async function expectUnauthorizedAccess(browser: Browser) {
  const anonymousContext = await browser.newContext();
  const anonymousResponse = await anonymousContext.request.get(
    `/documents/${ids.version2}/pdf`,
    { maxRedirects: 0 },
  );
  expect(anonymousResponse.status()).toBe(307);
  expect(anonymousResponse.headers().location).toMatch(/\/login$/);
  await anonymousContext.close();

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, viewerEmail, viewerPassword);
  const denied = await viewerPage.request.get(
    `/documents/${ids.version2}/pdf`,
    { maxRedirects: 0 },
  );
  expect(denied.status()).toBe(404);
  expect(await denied.text()).toBe("Document indisponible.");
  await viewerContext.close();
}

test("sert les PDF privés et affiche la chaîne réelle sans mutation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorageObjects(supabase);
  seed();

  try {
    const version1 = await storeDocumentPdfCore(
      {
        organizationId: ids.organization,
        documentId: ids.version1,
        replacesDocumentId: ids.legacy,
        bytes: pdfV1,
        documentType: "reservation_contract",
        title: "Contrat historique E2E v1",
        templateId: ids.template,
        generatedFromTemplate: true,
        generatedAt: "2026-07-13T10:00:00Z",
        sourceTemplateVersion: 7,
        signatureRequired: true,
        contactId: ids.contact,
        applicationId: ids.application,
        reservationId: ids.reservation,
      },
      supabase,
    );
    expect(version1).toMatchObject({ outcome: "created", version: 1 });
    sql(`update public.documents set status = 'sent', sent_at = '2026-07-13T10:30:00Z' where id = ${q(ids.version1)}::uuid;`);

    const version2 = await storeDocumentPdfCore(
      {
        organizationId: ids.organization,
        documentId: ids.version2,
        replacesDocumentId: ids.version1,
        bytes: pdfV2,
        documentType: "reservation_contract",
        title: "Contrat historique E2E v2",
        templateId: ids.template,
        generatedFromTemplate: true,
        generatedAt: "2026-07-13T11:00:00Z",
        sourceTemplateVersion: 7,
        signatureRequired: true,
        contactId: ids.contact,
        applicationId: ids.application,
        reservationId: ids.reservation,
      },
      supabase,
    );
    expect(version2).toMatchObject({ outcome: "created", version: 2 });
    sql(`
      update public.documents set status = 'sent', sent_at = '2026-07-13T11:30:00Z' where id = ${q(ids.version2)}::uuid;
      update public.documents set status = 'signed', signed_at = '2026-07-13T12:00:00Z' where id = ${q(ids.version2)}::uuid;
    `);

    const paths = storagePaths();
    const hashes = [pdfV1, pdfV2].map((bytes) =>
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(paths).toHaveLength(2);
    const stateBefore = immutableState();

    await login(page);
    await expectPdfResponse({
      page,
      documentId: ids.version1,
      version: 1,
      expectedBytes: pdfV1,
    });
    await expectPdfResponse({
      page,
      documentId: ids.version2,
      version: 2,
      expectedBytes: pdfV2,
    });
    await expectUnauthorizedAccess(browser);

    await page.goto(`/reservations/${ids.reservation}#documents`);
    const contractCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(contractCard).toHaveCount(1);
    await expect(contractCard).toContainText("Version 2");
    await expect(contractCard).toContainText("Version 1");
    await expect(contractCard).toContainText("Version courante");
    await expect(contractCard).toContainText("Version historique remplacée");
    await expect(contractCard).toContainText("Reçu signé");
    await expect(contractCard).toContainText("Envoyé");
    await expect(
      contractCard.getByRole("link", { name: "Ouvrir l’original" }),
    ).toHaveCount(2);
    await expect(
      contractCard.getByRole("link", { name: "Télécharger l’original" }),
    ).toHaveCount(2);
    await expect(contractCard).toContainText(
      "Il ne signifie pas qu’un fichier retourné signé est archivé.",
    );
    await expect(
      contractCard.getByRole("link", { name: /PDF signé/i }),
    ).toHaveCount(0);
    await expect(
      contractCard.getByText("PDF signé archivé", { exact: true }),
    ).toHaveCount(0);
    await expect(
      contractCard.locator(`a[href="/documents/${ids.version1}/pdf"]`),
    ).toHaveCount(1);
    await expect(
      contractCard.locator(`a[href="/documents/${ids.version2}/pdf"]`),
    ).toHaveCount(1);
    const legacyRow = contractCard
      .locator("li")
      .filter({ hasText: "Version non disponible" });
    await expect(legacyRow).toHaveCount(1);
    await expect(legacyRow.locator("a")).toHaveCount(0);

    let html = await page.content();
    for (const secret of [...paths, ...hashes, "/storage/v1/", "token="]) {
      expect(html).not.toContain(secret);
    }

    await page.goto(`/documents/${ids.version1}`);
    await expect(page.getByText("Le PDF proposé ici est la version exacte archivée.", { exact: false })).toBeVisible();
    await expect(
      page.locator("span").filter({ hasText: "Version courante" }),
    ).toHaveCount(1);
    await expect(
      page.locator("span").filter({ hasText: "Version historique remplacée" }),
    ).toHaveCount(2);
    await expect(page.getByText("Statut métier : Envoyé", { exact: true })).toBeVisible();
    await expect(page.getByText("Statut métier : Reçu signé", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Source : modèle de référence", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText("Source : non renseignée", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Modèle : Non renseigné", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Modèle : Contrat historique E2E — version 7", {
        exact: true,
      }),
    ).toHaveCount(2);
    await expect(
      page.getByText(
        "Le statut “Reçu signé” correspond actuellement au suivi manuel du dossier.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /PDF signé/i })).toHaveCount(0);
    html = await page.content();
    for (const secret of [
      ...paths,
      ...hashes,
      ids.template,
      "/storage/v1/",
      "token=",
    ]) {
      expect(html).not.toContain(secret);
    }

    await page.goto(`/documents/${ids.legacy}`);
    const selectedLegacy = page
      .locator("li")
      .filter({ hasText: "Fiche consultée" });
    await expect(selectedLegacy).toContainText("Aucun PDF cohérent");
    await expect(selectedLegacy).toContainText("Source : non renseignée");
    await expect(selectedLegacy).not.toContainText("Modèle : Non renseigné");
    await expect(selectedLegacy.locator("a")).toHaveCount(0);
    html = await page.content();
    for (const secret of [
      ...paths,
      ...hashes,
      ids.template,
      "/storage/v1/",
      "token=",
    ]) {
      expect(html).not.toContain(secret);
    }

    expect(immutableState()).toBe(stateBefore);
  } finally {
    await removeStorageObjects(supabase);
    cleanupRows();

    expect(storagePaths()).toEqual([]);
    for (const table of [
      "documents",
      "email_delivery_attempts",
      "payments",
      "reservations",
      "document_templates",
      "document_template_families",
      "organization_document_settings",
      "organization_settings",
      "applications",
      "contacts",
      "memberships",
    ]) {
      expect(
        organizationCount(table),
        `${table} fixtures must be hard-deleted`,
      ).toBe(0);
    }
    expect(
      Number(
        sql(
          `select count(*) from public.organizations where id = ${q(ids.organization)}::uuid;`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(
          `select count(*) from public.memberships where id = ${q(ids.viewerMembership)}::uuid;`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(
          `select count(*) from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(
          `select count(*) from auth.users where id = ${q(ids.viewerUser)}::uuid;`,
        ),
      ),
    ).toBe(0);
  }
});
