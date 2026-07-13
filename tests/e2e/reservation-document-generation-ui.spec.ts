import { expect, test, type Page } from "@playwright/test";

import { generateAndStoreReservationDocumentPdfCore } from "../../src/features/documents/generated-reservation-document-orchestrator-core";
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
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";

const contractDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat réservation UI E2E",
  preamble: ["Préambule."],
  clauses: {
    reservationPurpose: ["Objet."],
    priceAndPayments: ["Prix."],
    deposit: ["Arrhes."],
    cancellationAndRefund: ["Annulation."],
    postponementAndCredit: ["Report."],
    potentialWithholding: ["Retenue."],
    finalConditions: ["Conditions finales."],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat engagement UI E2E",
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
    delete from public.organization_document_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.applications where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.memberships where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organizations where id = ${q(ids.organization)}::uuid;
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations
      (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage UI E2E', 'Élevage UI E2E', 'company', 'reservation-documents-ui-e2e', 'seller-ui@example.invalid', '1 rue E2E', '75001', 'Paris', 'FR');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.contacts
      (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Adoptant UI E2E', 'Adoptant', 'UI E2E', 'adopter-ui@example.invalid', '2 rue E2E', '69001', 'Lyon', 'FR');

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

    insert into public.document_templates
      (id, organization_id, name, document_type, species, breed, template_format, template_content, version, is_active)
    values
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, 'Contrat compatible UI E2E', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 3, true),
      (${q(ids.certificateTemplate)}, ${q(ids.organization)}, 'Certificat compatible UI E2E', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 5, true),
      (${q(ids.incompatibleTemplate)}, ${q(ids.organization)}, 'Contrat incompatible UI E2E', 'reservation_contract', 'cat', 'Maine Coon', 'json', ${q(JSON.stringify(contractDefinition))}, 9, true);
  `);
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

  const reservationBefore = sql(
    `select row_to_json(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`,
  );
  const emailsBefore = organizationCount("email_delivery_attempts");

  try {
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

    await contractCard.getByRole("button", { name: "Générer le PDF" }).click();
    await expect(page).toHaveURL(/document_generation_status=created/, {
      timeout: 30_000,
    });
    await expect(page.getByRole("status")).toContainText(
      "Le PDF a bien été généré et enregistré.",
    );

    const v1Id = sql(
      `select id::text from public.documents where reservation_id = ${q(ids.reservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null and superseded_at is null;`,
    );
    const capturedAt = sql(
      `select generation_data->>'capturedAt' from public.documents where id = ${q(v1Id)}::uuid;`,
    );
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
    expect(organizationCount("documents")).toBe(rowsBeforeReplay);
    expect(storagePaths()).toEqual(pathsBeforeReplay);

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
      "reservations",
      "document_templates",
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
  }
});
