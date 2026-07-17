import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  generateAndStoreReservationDocumentPdfCore,
  type GenerateAndStoreReservationDocumentPdfDependencies,
} from "../../src/features/documents/generated-reservation-document-orchestrator-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "7e160000-0000-4000-8000-000000000001",
  membership: "7e160000-0000-4000-8000-000000000002",
  contact: "7e160000-0000-4000-8000-000000000003",
  application: "7e160000-0000-4000-8000-000000000004",
  reservation: "7e160000-0000-4000-8000-000000000005",
  organizationSettings: "7e160000-0000-4000-8000-000000000006",
  documentSettings: "7e160000-0000-4000-8000-000000000007",
  contractTemplate: "7e160000-0000-4000-8000-000000000008",
  certificateTemplate: "7e160000-0000-4000-8000-000000000009",
  incompatibleTemplate: "7e160000-0000-4000-8000-000000000010",
  incompatibleDocument: "7e160000-0000-4000-8000-000000000011",
  alternateContractTemplate: "7e160000-0000-4000-8000-000000000012",
  foreignOrganization: "7e160000-0000-4000-8000-000000000013",
  foreignContact: "7e160000-0000-4000-8000-000000000014",
  foreignReservation: "7e160000-0000-4000-8000-000000000015",
  foreignTemplate: "7e160000-0000-4000-8000-000000000016",
  contractVariant: "7e160000-0000-4000-8000-000000000017",
  contractVariantVersion: "7e160000-0000-4000-8000-000000000018",
  concurrentVariantDocument: "7e160000-0000-4000-8000-000000000019",
  invalidVariant: "7e160000-0000-4000-8000-000000000020",
  invalidVariantVersion: "7e160000-0000-4000-8000-000000000021",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";

const contractDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat réservation UI E2E",
  body: "Adoptant : [[adoptant.nom_complet]]\nRace : [[projet.race]]\nPrix : [[reservation.prix_formate]]\nArrhes versées : [[reservation.arrhes_versees_formatees]]\nFait à [[document.lieu_signature]] le [[document.date_generation]].",
};

const certificateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat engagement UI E2E",
  body: "Contenu E2E du certificat.\nAdoptant : [[adoptant.nom_complet]]",
};

const alternateContractDefinition = {
  ...contractDefinition,
  title: "Contrat alternatif sélectionné UI E2E",
};

const variantContractDefinition = {
  ...contractDefinition,
  title: "Contrat personnalisé réservation UI E2E",
  body: "Texte personnalisé variante UI E2E pour [[adoptant.nom_complet]].",
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
    delete from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservation_document_variant_versions where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservation_document_variants where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.email_delivery_attempts where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.payments where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservations where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.document_templates where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.document_template_families where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.organization_document_settings where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.organization_settings where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.applications where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.contacts where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.memberships where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations
      (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage UI E2E', 'Élevage UI E2E', 'company', 'reservation-documents-ui-e2e', 'seller-ui@example.invalid', '1 rue E2E', '75001', 'Paris', 'FR'),
      (${q(ids.foreignOrganization)}, 'Élevage étranger UI E2E', 'Élevage étranger UI E2E', 'company', 'reservation-documents-foreign-ui-e2e', 'foreign-ui@example.invalid', '9 rue E2E', '33000', 'Bordeaux', 'FR');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.contacts
      (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Adoptant UI E2E', 'Adoptant', 'UI E2E', 'adopter-ui@example.invalid', '2 rue E2E', '69001', 'Lyon', 'FR'),
      (${q(ids.foreignContact)}, ${q(ids.foreignOrganization)}, 'Adoptant étranger UI E2E', 'Adoptant', 'Étranger', 'foreign-adopter-ui@example.invalid', '8 rue E2E', '33000', 'Bordeaux', 'FR');

    insert into public.applications
      (id, organization_id, contact_id, species, breed, desired_sex_preference, status)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'female_only', 'qualified');

    insert into public.reservations
      (id, organization_id, contact_id, application_id, status, reserved_sex_preference, price_cents, currency, created_at)
    values
      (${q(ids.reservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, 'active', 'female_only', 250000, 'EUR', '2026-07-13T09:00:00Z'),
      (${q(ids.foreignReservation)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, null, 'active', 'female_only', 240000, 'EUR', '2026-07-13T09:00:00Z');

    insert into public.organization_settings
      (id, organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents)
    values (${q(ids.organizationSettings)}, ${q(ids.organization)}, 30000, 45000);

    insert into public.organization_document_settings
      (id, organization_id, signature_city_default)
    values (${q(ids.documentSettings)}, ${q(ids.organization)}, 'Paris');

    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, 'Contrat compatible UI E2E', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.certificateTemplate)}, ${q(ids.organization)}, 'Certificat compatible UI E2E', 'commitment_certificate', 'dog', 'Golden Retriever'),
      (${q(ids.incompatibleTemplate)}, ${q(ids.organization)}, 'Contrat incompatible UI E2E', 'reservation_contract', 'cat', 'Maine Coon'),
      (${q(ids.alternateContractTemplate)}, ${q(ids.organization)}, 'Contrat alternatif UI E2E', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.foreignTemplate)}, ${q(ids.foreignOrganization)}, 'Contrat étranger UI E2E', 'reservation_contract', 'dog', 'Golden Retriever');

    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, ${q(ids.contractTemplate)}, 'Contrat compatible UI E2E', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 3, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.certificateTemplate)}, ${q(ids.organization)}, ${q(ids.certificateTemplate)}, 'Certificat compatible UI E2E', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 5, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.incompatibleTemplate)}, ${q(ids.organization)}, ${q(ids.incompatibleTemplate)}, 'Contrat incompatible UI E2E', 'reservation_contract', 'cat', 'Maine Coon', 'json', ${q(JSON.stringify(contractDefinition))}, 9, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.alternateContractTemplate)}, ${q(ids.organization)}, ${q(ids.alternateContractTemplate)}, 'Contrat alternatif UI E2E', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(alternateContractDefinition))}, 2, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.foreignTemplate)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignTemplate)}, 'Contrat étranger UI E2E', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)});
    insert into public.reservation_document_variants
      (id, organization_id, reservation_id, template_family_id, document_type, species, breed)
    values
      (${q(ids.contractVariant)}, ${q(ids.organization)}, ${q(ids.reservation)}, ${q(ids.contractTemplate)}, 'reservation_contract', 'dog', 'Golden Retriever');
    insert into public.reservation_document_variant_versions
      (id, organization_id, variant_id, version, source_template_id,
       source_template_version, template_format, template_content,
       lifecycle_status, published_at, published_by)
    values
      (${q(ids.contractVariantVersion)}, ${q(ids.organization)}, ${q(ids.contractVariant)}, 1,
       ${q(ids.contractTemplate)}, 3, 'json', ${q(JSON.stringify(variantContractDefinition))},
       'published', now(), ${q(ownerId)});
  `);
}

function previewUrl(
  reservationId: string,
  documentType: "commitment_certificate" | "reservation_contract",
  templateId: string,
) {
  return `/api/reservations/${reservationId}/document-preview?${new URLSearchParams({
    documentType,
    templateId,
  })}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("génère et versionne les PDF depuis la fiche réservation sans effet annexe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorageObjects(supabase);
  seed();
  await page.addInitScript(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const trackedWindow = window as unknown as Window & {
      __createdReservationPreviewUrls: string[];
      __revokedReservationPreviewUrls: string[];
    };
    trackedWindow.__createdReservationPreviewUrls = [];
    trackedWindow.__revokedReservationPreviewUrls = [];
    URL.createObjectURL = (object) => {
      const url = originalCreateObjectUrl(object);
      trackedWindow.__createdReservationPreviewUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      trackedWindow.__revokedReservationPreviewUrls.push(url);
      originalRevokeObjectUrl(url);
    };
  });

  const reservationBefore = sql(
    `select row_to_json(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`,
  );
  const emailsBefore = organizationCount("email_delivery_attempts");

  try {
    const unauthenticated = await page.request.get(
      previewUrl(
        ids.reservation,
        "reservation_contract",
        ids.contractTemplate,
      ),
    );
    expect(unauthenticated.status()).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Aperçu indisponible." });

    await login(page);
    await page.goto(`/reservations/${ids.reservation}#documents`);

    const contractCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(contractCard).toContainText("Aucun PDF courant");
    await expect(
      contractCard.getByRole("option", { name: /Contrat compatible UI E2E/ }),
    ).toHaveCount(1);
    await expect(
      contractCard.getByRole("option", { name: /Contrat incompatible UI E2E/ }),
    ).toHaveCount(0);
    await expect(
      contractCard.getByRole("option", {
        name: "Contrat alternatif UI E2E — version 2 · modèle de référence",
      }),
    ).toBeEnabled();
    await expect(
      contractCard.getByRole("option", {
        name: "Contrat compatible UI E2E — version 3 · variante personnalisée v1",
      }),
    ).toBeEnabled();
    await expect(contractCard).toContainText(
      "Le modèle de référence publié sera utilisé.",
    );
    await contractCard
      .getByLabel("Modèle compatible")
      .selectOption(ids.contractTemplate);
    await expect(contractCard).toContainText(
      "La variante personnalisée publiée de cette réservation sera utilisée automatiquement.",
    );
    await contractCard
      .getByLabel("Modèle compatible")
      .selectOption(ids.alternateContractTemplate);

    sql(`
      insert into public.reservation_document_variants
        (id, organization_id, reservation_id, template_family_id, document_type, species, breed)
      values
        (${q(ids.invalidVariant)}, ${q(ids.organization)}, ${q(ids.reservation)}, ${q(ids.alternateContractTemplate)}, 'reservation_contract', 'dog', 'Golden Retriever');
      insert into public.reservation_document_variant_versions
        (id, organization_id, variant_id, version, source_template_id,
         source_template_version, template_format, template_content,
         lifecycle_status, published_at, published_by)
      values
        (${q(ids.invalidVariantVersion)}, ${q(ids.organization)}, ${q(ids.invalidVariant)}, 4,
         ${q(ids.alternateContractTemplate)}, 2, 'html', '<p>Publication invalide E2E</p>',
         'published', now(), ${q(ownerId)});
    `);
    await page.reload();
    const invalidContractCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    const invalidOption = invalidContractCard.getByRole("option", {
      name: "Contrat alternatif UI E2E — version 2 · source personnalisée à corriger",
    });
    await expect(invalidOption).toBeDisabled();
    await expect(invalidContractCard).not.toContainText(
      "Contrat alternatif UI E2E — version 2 · modèle de référence",
    );
    await expect(page.getByText(/Supabase|database_error/i)).toHaveCount(0);
    sql(`
      delete from public.reservation_document_variant_versions where id = ${q(ids.invalidVariantVersion)}::uuid;
      delete from public.reservation_document_variants where id = ${q(ids.invalidVariant)}::uuid;
    `);
    await page.reload();

    const previewStateBefore = {
      documents: organizationCount("documents"),
      documentObjects: storagePaths(),
      reservation: reservationBefore,
      payments: organizationCount("payments"),
      emails: emailsBefore,
    };

    const certificateCard = page
      .locator("article")
      .filter({ hasText: "Certificat d’engagement et de connaissance" });
    const certificateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/document-preview?") &&
        response.url().includes("documentType=commitment_certificate"),
    );
    await certificateCard
      .getByRole("button", { name: "Prévisualiser avec les données du dossier" })
      .click();
    const certificateResponse = await certificateResponsePromise;
    expect(certificateResponse.status()).toBe(200);
    expect(certificateResponse.headers()["content-type"]).toBe("application/pdf");
    expect(certificateResponse.headers()["content-disposition"]).toContain("inline");
    expect(certificateResponse.headers()["cache-control"]).toBe("private, no-store");
    expect(certificateResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(new URL(certificateResponse.url()).searchParams.get("templateId")).toBe(
      ids.certificateTemplate,
    );
    await expect(
      page.getByText(
        "Aperçu temporaire avec les données actuelles du dossier — aucun document n’est créé ou modifié.",
      ),
    ).toBeVisible();
    await expect(
      page.getByTitle("Aperçu PDF — Certificat d’engagement et de connaissance"),
    ).toBeVisible({ timeout: 30_000 });
    const certificateFullSize = page.getByRole("link", {
      name: "Ouvrir l’aperçu en grand",
    });
    await expect(certificateFullSize).toHaveAttribute("target", "_blank");
    await expect(certificateFullSize).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    const firstCertificateBlobUrl = await certificateFullSize.getAttribute(
      "href",
    );
    expect(firstCertificateBlobUrl).toMatch(/^blob:/);
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(
      page.getByTitle("Aperçu PDF — Certificat d’engagement et de connaissance"),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          (url) =>
            (
              window as unknown as Window & {
                __revokedReservationPreviewUrls: string[];
              }
            ).__revokedReservationPreviewUrls.includes(url),
          firstCertificateBlobUrl!,
        ),
      )
      .toBe(true);

    const reopenedCertificateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("documentType=commitment_certificate") &&
        response.status() === 200,
    );
    await certificateCard
      .getByRole("button", { name: "Prévisualiser avec les données du dossier" })
      .click();
    await reopenedCertificateResponse;
    await expect(
      page.getByTitle("Aperçu PDF — Certificat d’engagement et de connaissance"),
    ).toBeVisible({ timeout: 30_000 });
    const reopenedBlobUrl = await page
      .getByRole("link", { name: "Ouvrir l’aperçu en grand" })
      .getAttribute("href");
    expect(reopenedBlobUrl).toMatch(/^blob:/);
    expect(reopenedBlobUrl).not.toBe(firstCertificateBlobUrl);
    await page.getByRole("button", { name: "Fermer" }).click();

    await contractCard
      .getByLabel("Modèle compatible")
      .selectOption(ids.alternateContractTemplate);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    const contractPreviewResponse = page.waitForResponse(
      (response) =>
        response.url().includes("documentType=reservation_contract") &&
        response.url().includes(`templateId=${ids.alternateContractTemplate}`),
    );
    await contractCard
      .getByRole("button", { name: "Prévisualiser avec les données du dossier" })
      .click();
    const alternateResponse = await contractPreviewResponse;
    expect(alternateResponse.status()).toBe(200);
    await expect(
      page.getByTitle("Aperçu PDF — Contrat de réservation"),
    ).toBeVisible({ timeout: 30_000 });
    const fullSizeLink = page.getByRole("link", {
      name: "Ouvrir l’aperçu en grand",
    });
    const popupPromise = page.waitForEvent("popup");
    await fullSizeLink.click();
    const popup = await popupPromise;
    expect(popup.isClosed()).toBe(false);
    await popup.close();
    await page.getByRole("button", { name: "Fermer" }).click();
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route("**/api/reservations/*/document-preview?*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "raw_database_error_must_not_be_shown" }),
        headers: { "Cache-Control": "private, no-store" },
      });
    });
    await certificateCard
      .getByRole("button", { name: "Prévisualiser avec les données du dossier" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "L’aperçu est indisponible pour le moment.",
    );
    await expect(page.getByText("raw_database_error_must_not_be_shown")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Ouvrir l’aperçu en grand" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Fermer" }).click();
    await page.unroute("**/api/reservations/*/document-preview?*");

    const mainPdf = await page.request.get(
      previewUrl(ids.reservation, "reservation_contract", ids.contractTemplate),
    );
    const alternatePdf = await page.request.get(
      previewUrl(
        ids.reservation,
        "reservation_contract",
        ids.alternateContractTemplate,
      ),
    );
    expect(mainPdf.status()).toBe(200);
    expect(alternatePdf.status()).toBe(200);
    const mainBytes = Buffer.from(await mainPdf.body());
    const alternateBytes = Buffer.from(await alternatePdf.body());
    expect(mainBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(alternateBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(createHash("sha256").update(mainBytes).digest("hex")).not.toBe(
      createHash("sha256").update(alternateBytes).digest("hex"),
    );
    sql(`delete from public.reservation_document_variant_versions where id = ${q(ids.contractVariantVersion)}::uuid;`);
    const fallbackPdf = await page.request.get(
      previewUrl(ids.reservation, "reservation_contract", ids.contractTemplate),
    );
    expect(fallbackPdf.status()).toBe(200);
    const fallbackBytes = Buffer.from(await fallbackPdf.body());
    expect(createHash("sha256").update(fallbackBytes).digest("hex")).not.toBe(
      createHash("sha256").update(mainBytes).digest("hex"),
    );
    sql(`
      insert into public.reservation_document_variant_versions
        (id, organization_id, variant_id, version, source_template_id,
         source_template_version, template_format, template_content,
         lifecycle_status, published_at, published_by)
      values
        (${q(ids.contractVariantVersion)}, ${q(ids.organization)}, ${q(ids.contractVariant)}, 1,
         ${q(ids.contractTemplate)}, 3, 'json', ${q(JSON.stringify(variantContractDefinition))},
         'published', now(), ${q(ownerId)});
    `);

    const missingReservation = await page.request.get(
      previewUrl(
        "7e160000-0000-4000-8000-000000000099",
        "reservation_contract",
        ids.contractTemplate,
      ),
    );
    const foreignReservation = await page.request.get(
      previewUrl(
        ids.foreignReservation,
        "reservation_contract",
        ids.foreignTemplate,
      ),
    );
    expect(foreignReservation.status()).toBe(missingReservation.status());
    expect(await foreignReservation.json()).toEqual(
      await missingReservation.json(),
    );

    for (const templateId of [
      ids.foreignTemplate,
      ids.incompatibleTemplate,
      "7e160000-0000-4000-8000-000000000098",
    ]) {
      const rejected = await page.request.get(
        previewUrl(ids.reservation, "reservation_contract", templateId),
      );
      expect(rejected.status()).toBe(404);
      expect(await rejected.json()).toEqual({ error: "Aperçu indisponible." });
      expect(rejected.headers()["cache-control"]).toBe("private, no-store");
    }

    sql(
      `update public.memberships set role = 'viewer' where id = ${q(ids.membership)}::uuid;`,
    );
    const forbiddenRole = await page.request.get(
      previewUrl(ids.reservation, "reservation_contract", ids.contractTemplate),
    );
    expect(forbiddenRole.status()).toBe(404);
    expect(await forbiddenRole.json()).toEqual({ error: "Aperçu indisponible." });
    sql(
      `update public.memberships set role = 'member' where id = ${q(ids.membership)}::uuid;`,
    );

    expect(organizationCount("documents")).toBe(previewStateBefore.documents);
    expect(storagePaths()).toEqual(previewStateBefore.documentObjects);
    expect(
      sql(
        `select row_to_json(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`,
      ),
    ).toBe(previewStateBefore.reservation);
    expect(organizationCount("payments")).toBe(previewStateBefore.payments);
    expect(organizationCount("email_delivery_attempts")).toBe(
      previewStateBefore.emails,
    );

    const beforeRetiredRaceRows = organizationCount("documents");
    const beforeRetiredRacePaths = storagePaths();
    const preparation = await import(
      "../../src/features/documents/prepare-document-generation-snapshot-core"
    );
    const renderer = await import(
      "../../src/features/documents/document-pdf-renderer-core"
    );
    const storage = await import(
      "../../src/features/documents/document-pdf-storage-core"
    );
    const retiredRaceDependencies: GenerateAndStoreReservationDocumentPdfDependencies = {
      prepare: preparation.prepareDocumentGenerationSnapshotForReservationCore,
      render: renderer.renderDocumentPdfCore,
      store: async (input, client) => {
        sql(`update public.reservation_document_variant_versions set lifecycle_status = 'retired' where id = ${q(ids.contractVariantVersion)}::uuid;`);
        return storage.storeDocumentPdfCore(input, client);
      },
    };
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        {
          documentId: ids.concurrentVariantDocument,
          reservationId: ids.reservation,
          documentType: "reservation_contract",
          templateId: ids.contractTemplate,
          capturedAt: "2026-07-13T17:30:00.000+02:00",
        },
        supabase,
        retiredRaceDependencies,
      ),
    ).toEqual({
      outcome: "error",
      error: { stage: "store", code: "database_error" },
    });
    expect(organizationCount("documents")).toBe(beforeRetiredRaceRows);
    expect(storagePaths()).toEqual(beforeRetiredRacePaths);
    sql(`update public.reservation_document_variant_versions set lifecycle_status = 'published' where id = ${q(ids.contractVariantVersion)}::uuid;`);

    await contractCard
      .getByLabel("Modèle compatible")
      .selectOption(ids.contractTemplate);

    await contractCard.getByRole("button", { name: "Générer le PDF" }).click();
    await expect(page).toHaveURL(/document_generation_status=created/, {
      timeout: 30_000,
    });
    await expect(page.getByRole("status")).toContainText(
      "Le PDF a bien été généré et enregistré.",
    );
    const generatedContractCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(generatedContractCard).toContainText("Source utilisée");
    await expect(generatedContractCard).toContainText(
      "Variante personnalisée — version 1",
    );
    await expect(generatedContractCard).toContainText("Origine commune");
    await expect(generatedContractCard).toContainText(
      "Contrat compatible UI E2E — version 3",
    );
    const visibleTextAfterVariantGeneration =
      (await generatedContractCard.textContent()) ?? "";
    expect(visibleTextAfterVariantGeneration).not.toContain(
      ids.contractVariant,
    );
    expect(visibleTextAfterVariantGeneration).not.toContain(
      ids.contractVariantVersion,
    );

    const v1Id = sql(
      `select id::text from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null and superseded_at is null;`,
    );
    const capturedAt = sql(
      `select generation_data->>'capturedAt' from public.documents where id = ${q(v1Id)}::uuid;`,
    );
    expect(
      sql(`select template_id::text || '|' || source_template_version::text || '|' || reservation_document_variant_version_id::text from public.documents where id = ${q(v1Id)}::uuid;`),
    ).toBe(`${ids.contractTemplate}|3|${ids.contractVariantVersion}`);
    expect(
      sql(`select (generation_data->>'snapshotVersion') || '|' || (generation_data->'template'->>'selectedTemplateId') || '|' || (generation_data->'template'->>'sourceKind') || '|' || (generation_data->'template'->>'reservationDocumentVariantVersionId') from public.documents where id = ${q(v1Id)}::uuid;`),
    ).toBe(`2|${ids.contractTemplate}|reservation_variant|${ids.contractVariantVersion}`);
    expect(
      sql(`select title from public.documents where id = ${q(v1Id)}::uuid;`),
    ).toBe("Contrat personnalisé réservation UI E2E");
    expect(
      sql(`select file_path ~ '/v1/' from public.documents where id = ${q(v1Id)}::uuid;`),
    ).toBe("t");

    const rowsBeforeReplay = organizationCount("documents");
    const pathsBeforeReplay = storagePaths();
    const replay = await generateAndStoreReservationDocumentPdfCore(
      {
        documentId: v1Id,
        reservationId: ids.reservation,
        documentType: "reservation_contract",
        templateId: ids.contractTemplate,
        capturedAt,
      },
      supabase,
    );
    expect(replay).toMatchObject({ outcome: "existing", documentId: v1Id, version: 1 });
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        {
          documentId: v1Id,
          reservationId: ids.reservation,
          documentType: "reservation_contract",
          templateId: ids.alternateContractTemplate,
          capturedAt,
        },
        supabase,
      ),
    ).toEqual({
      outcome: "error",
      error: { stage: "input", code: "document_id_conflict" },
    });
    expect(organizationCount("documents")).toBe(rowsBeforeReplay);
    expect(storagePaths()).toEqual(pathsBeforeReplay);

    sql(`update public.reservation_document_variant_versions set lifecycle_status = 'retired' where id = ${q(ids.contractVariantVersion)}::uuid;`);

    await page.goto(`/reservations/${ids.reservation}#documents`);
    const versionedContractCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(versionedContractCard).toContainText("Version 1");
    await versionedContractCard
      .getByRole("button", { name: "Créer une nouvelle version" })
      .click();
    await page
      .getByRole("button", { name: "Confirmer la nouvelle version" })
      .click();
    await expect(page).toHaveURL(/document_generation_status=created/, {
      timeout: 30_000,
    });
    const commonCurrentCard = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(commonCurrentCard).toContainText("Source utilisée");
    await expect(commonCurrentCard).toContainText("Modèle de référence");
    await expect(commonCurrentCard).toContainText(
      "Origine communeContrat alternatif UI E2E — version 2",
    );
    const historicalVariantRow = commonCurrentCard
      .locator("li")
      .filter({ hasText: "Version historique remplacée" });
    await expect(historicalVariantRow).toContainText(
      "Source : variante personnalisée — version 1",
    );
    await expect(historicalVariantRow).toContainText(
      "Origine commune : Contrat compatible UI E2E — version 3",
    );
    const currentCommonRow = commonCurrentCard
      .locator("li")
      .filter({ hasText: "Version courante" });
    await expect(currentCommonRow).toContainText(
      "Source : modèle de référence",
    );
    await expect(currentCommonRow).toContainText(
      "Modèle : Contrat alternatif UI E2E — version 2",
    );

    sql(`update public.documents set generation_data = '{"snapshotVersion": 0}'::jsonb where id = ${q(v1Id)}::uuid;`);
    await page.reload();
    const unreadableHistoricalVariant = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" })
      .locator("li")
      .filter({ hasText: "Version historique remplacée" });
    await expect(unreadableHistoricalVariant).toContainText(
      "Source : variante personnalisée — version 1",
    );
    await expect(unreadableHistoricalVariant).toContainText(
      "Origine commune : Contrat compatible UI E2E — version 3",
    );

    const currentCommonId = sql(
      `select id::text from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and superseded_at is null;`,
    );
    sql(`
      update public.documents
      set generation_data = jsonb_set(
        jsonb_set(generation_data, '{snapshotVersion}', '1'::jsonb),
        '{template}',
        jsonb_build_object(
          'templateId', generation_data->'template'->>'templateId',
          'templateVersion', (generation_data->'template'->>'templateVersion')::integer,
          'templateContentSha256', generation_data->'template'->>'templateContentSha256'
        )
      )
      where id = ${q(currentCommonId)}::uuid;
    `);
    await page.reload();
    const historicalV1Card = page
      .locator("article")
      .filter({ hasText: "Contrat de réservation" });
    await expect(
      historicalV1Card.locator("li").filter({ hasText: "Version courante" }),
    ).toContainText("Source : modèle de référence");

    expect(
      Number(
        sql(
          `select count(*) from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null and superseded_at is null;`,
        ),
      ),
    ).toBe(1);
    expect(
      Number(
        sql(
          `select count(*) from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null;`,
        ),
      ),
    ).toBe(2);
    expect(
      sql(
        `select file_path ~ '/v2/' from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null and superseded_at is null;`,
      ),
    ).toBe("t");
    expect(
      sql(`select reservation_document_variant_version_id is null from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and superseded_at is null;`),
    ).toBe("t");
    expect(
      sql(`select reservation_document_variant_version_id::text from public.documents where id = ${q(v1Id)}::uuid;`),
    ).toBe(ids.contractVariantVersion);

    const beforeIncompatible = organizationCount("documents");
    const pathsBeforeIncompatible = storagePaths();
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        {
          documentId: ids.incompatibleDocument,
          reservationId: ids.reservation,
          documentType: "reservation_contract",
          templateId: ids.incompatibleTemplate,
          capturedAt: "2026-07-13T18:00:00.000+02:00",
        },
        supabase,
      ),
    ).toEqual({
      outcome: "error",
      error: { stage: "prepare", code: "template_mismatch" },
    });
    expect(organizationCount("documents")).toBe(beforeIncompatible);
    expect(storagePaths()).toEqual(pathsBeforeIncompatible);

    expect(
      sql(
        `select row_to_json(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`,
      ),
    ).toBe(reservationBefore);
    expect(organizationCount("email_delivery_attempts")).toBe(emailsBefore);
  } finally {
    await removeStorageObjects(supabase);
    cleanupRows();

    expect(storagePaths()).toEqual([]);
    for (const table of [
      "documents",
      "email_delivery_attempts",
      "payments",
      "reservation_document_variant_versions",
      "reservation_document_variants",
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
        Number(
          sql(
            `select count(*) from public.${table} where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`,
          ),
        ),
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
          `select count(*) from public.organizations where id = ${q(ids.foreignOrganization)}::uuid;`,
        ),
      ),
    ).toBe(0);
  }
});
