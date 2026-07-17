import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  deriveLitterReservationDocumentId,
  generateLitterReservationDocumentsBatchCore,
  type LitterReservationDocumentBatchDependencies,
} from "../../src/features/documents/litter-reservation-document-batch-core";
import { generateAndStoreReservationDocumentPdfCore } from "../../src/features/documents/generated-reservation-document-orchestrator-core";
import { prepareDocumentGenerationSnapshotForReservationCore } from "../../src/features/documents/prepare-document-generation-snapshot-core";
import { renderDocumentPdfCore } from "../../src/features/documents/document-pdf-renderer-core";
import { readDocumentPdfCore } from "../../src/features/documents/document-pdf-storage-core";
import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "8b170000";
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
  foreignContact: id(9),
  foreignApplication: id(10),
  litter: id(11),
  otherLitter: id(12),
  deletedLitter: id(13),
  foreignLitter: id(14),
  commitmentFamily: id(15),
  commitmentTemplate: id(16),
  contractFamily: id(17),
  contractTemplate: id(18),
  missingContractFamily: id(19),
  missingContractTemplate: id(20),
  incompatibleFamily: id(21),
  incompatibleTemplate: id(22),
  variant: id(23),
  variantVersion: id(24),
  invalidVariant: id(25),
  invalidVariantVersion: id(26),
  settings: id(27),
  animalMismatch: id(28),
  reservationGenerate: id(101),
  reservationVariant: id(102),
  reservationOneMissing: id(103),
  reservationProtected: id(104),
  reservationMultiple: id(105),
  reservationCorrupt: id(106),
  reservationPrevalidation: id(107),
  reservationInvalidVariant: id(108),
  reservationWrongLitter: id(109),
  reservationWrongStatus: id(110),
  reservationDeleted: id(111),
  reservationAfterError: id(112),
  foreignReservation: id(113),
  forcedDuplicate: id(301),
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const capturedAt = "2026-07-17T14:15:16.000+02:00";
const viewerEmail = "litter-batch-viewer@saasphase1.invalid";
const viewerPassword = "LitterBatchViewer-2026!";

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat groupé QA",
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
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat groupé commun QA",
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

const variantContractDefinition = {
  ...contractDefinition,
  title: "Contrat groupé variante QA",
};

const missingContractDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat incomplet QA",
  body: "Animal : [[animal.nom]]",
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

function documentCount(reservationId?: string) {
  return Number(
    sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid${
      reservationId ? ` and reservation_id = ${q(reservationId)}::uuid` : ""
    };`),
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
  if (removed.error) throw new Error(`Storage cleanup failed: ${removed.error.message}`);
}

function cleanupRows() {
  sql(`
    delete from public.document_signed_returns where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservation_document_variant_versions where id::text like ${q(`${prefix}-%`)};
    delete from public.reservation_document_variants where id::text like ${q(`${prefix}-%`)};
    delete from public.payments where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservations where id::text like ${q(`${prefix}-%`)};
    delete from public.document_templates where id::text like ${q(`${prefix}-%`)};
    delete from public.document_template_families where id::text like ${q(`${prefix}-%`)};
    delete from public.organization_document_settings where id::text like ${q(`${prefix}-%`)};
    delete from public.organization_settings where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.animals where id::text like ${q(`${prefix}-%`)};
    delete from public.litters where id::text like ${q(`${prefix}-%`)};
    delete from public.applications where id::text like ${q(`${prefix}-%`)};
    delete from public.contacts where id::text like ${q(`${prefix}-%`)};
    delete from public.memberships where id::text like ${q(`${prefix}-%`)};
    delete from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;
    delete from auth.users where id = ${q(ids.viewerUser)}::uuid;
    create unique index if not exists documents_current_commitment_certificate_idx
      on public.documents (organization_id, reservation_id)
      where document_type = 'commitment_certificate'
        and deleted_at is null
        and superseded_at is null;
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage Lot QA', 'Élevage Lot QA', 'company', 'elevage-lot-qa', 'lot@example.invalid', '1 rue QA', '75001', 'Paris', 'FR'),
      (${q(ids.foreignOrganization)}, 'Élevage Étranger QA', 'Élevage Étranger QA', 'company', 'elevage-etranger-lot-qa', 'foreign@example.invalid', '2 rue QA', '69001', 'Lyon', 'FR');
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');
    insert into public.contacts (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Camille Lot', 'Camille', 'Lot', 'camille@example.invalid', '3 rue QA', '33000', 'Bordeaux', 'FR'),
      (${q(ids.foreignContact)}, ${q(ids.foreignOrganization)}, 'Contact Étranger', 'Contact', 'Étranger', 'foreign-contact@example.invalid', '4 rue QA', '44000', 'Nantes', 'FR');
    insert into public.applications (id, organization_id, contact_id, species, breed, desired_sex_preference)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'no_preference'),
      (${q(ids.foreignApplication)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, 'dog', 'Golden Retriever', 'no_preference');
    insert into public.litters (id, organization_id, name, species, breed, actual_birth_date, available_from, deleted_at)
    values
      (${q(ids.litter)}, ${q(ids.organization)}, 'Portée Lot QA', 'dog', 'Golden Retriever', '2026-06-01', '2026-08-01', null),
      (${q(ids.otherLitter)}, ${q(ids.organization)}, 'Autre portée QA', 'dog', 'Golden Retriever', '2026-06-02', '2026-08-02', null),
      (${q(ids.deletedLitter)}, ${q(ids.organization)}, 'Portée supprimée QA', 'dog', 'Golden Retriever', '2026-06-03', '2026-08-03', now()),
      (${q(ids.foreignLitter)}, ${q(ids.foreignOrganization)}, 'Portée étrangère QA', 'dog', 'Golden Retriever', '2026-06-04', '2026-08-04', null);
    insert into public.animals (id, organization_id, litter_id, official_name, call_name, species, breed, sex, birth_date)
    values (${q(ids.animalMismatch)}, ${q(ids.organization)}, ${q(ids.litter)}, 'Animal contradiction QA', 'Contradiction', 'dog', 'Golden Retriever', 'female', '2026-06-01');
    insert into public.organization_document_settings (id, organization_id, signature_city_default)
    values (${q(ids.settings)}, ${q(ids.organization)}, 'Paris');
    insert into public.document_template_families (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.commitmentFamily)}, ${q(ids.organization)}, 'Certificat commun QA', 'commitment_certificate', 'dog', 'Golden Retriever'),
      (${q(ids.contractFamily)}, ${q(ids.organization)}, 'Contrat commun QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.missingContractFamily)}, ${q(ids.organization)}, 'Contrat incomplet QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.incompatibleFamily)}, ${q(ids.organization)}, 'Contrat incompatible QA', 'reservation_contract', 'dog', 'Labrador Retriever');
    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values
      (${q(ids.commitmentTemplate)}, ${q(ids.organization)}, ${q(ids.commitmentFamily)}, 'Certificat commun QA', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, ${q(ids.contractFamily)}, 'Contrat commun QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.missingContractTemplate)}, ${q(ids.organization)}, ${q(ids.missingContractFamily)}, 'Contrat incomplet QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(missingContractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.incompatibleTemplate)}, ${q(ids.organization)}, ${q(ids.incompatibleFamily)}, 'Contrat incompatible QA', 'reservation_contract', 'dog', 'Labrador Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)});
    insert into public.reservations
      (id, organization_id, contact_id, application_id, litter_id, status, price_cents, currency, created_at, deleted_at)
    values
      (${q(ids.reservationGenerate)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:00:00Z', null),
      (${q(ids.reservationVariant)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:01:00Z', null),
      (${q(ids.reservationOneMissing)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:02:00Z', null),
      (${q(ids.reservationProtected)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:03:00Z', null),
      (${q(ids.reservationMultiple)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:04:00Z', null),
      (${q(ids.reservationCorrupt)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:05:00Z', null),
      (${q(ids.reservationPrevalidation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:06:00Z', null),
      (${q(ids.reservationInvalidVariant)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:07:00Z', null),
      (${q(ids.reservationWrongLitter)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.otherLitter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:08:00Z', null),
      (${q(ids.reservationWrongStatus)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'active', 250000, 'EUR', '2026-07-01T09:09:00Z', null),
      (${q(ids.reservationDeleted)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:10:00Z', now()),
      (${q(ids.reservationAfterError)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:11:00Z', null),
      (${q(ids.foreignReservation)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, ${q(ids.foreignApplication)}, ${q(ids.foreignLitter)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:12:00Z', null);
    insert into public.reservation_document_variants
      (id, organization_id, reservation_id, template_family_id, document_type, species, breed, created_by, updated_by)
    values
      (${q(ids.variant)}, ${q(ids.organization)}, ${q(ids.reservationVariant)}, ${q(ids.contractFamily)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.invalidVariant)}, ${q(ids.organization)}, ${q(ids.reservationInvalidVariant)}, ${q(ids.contractFamily)}, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)});
    insert into public.reservation_document_variant_versions
      (id, organization_id, variant_id, version, source_template_id, source_template_version, template_format, template_content, lifecycle_status, published_at, published_by, created_by, updated_by)
    values
      (${q(ids.variantVersion)}, ${q(ids.organization)}, ${q(ids.variant)}, 1, ${q(ids.contractTemplate)}, 1, 'json', ${q(JSON.stringify(variantContractDefinition))}, 'published', now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.invalidVariantVersion)}, ${q(ids.organization)}, ${q(ids.invalidVariant)}, 1, ${q(ids.contractTemplate)}, 1, 'json', '{"invalid":true}', 'published', now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)});
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.viewerMembership)}, ${q(ids.organization)}, ${q(ids.viewerUser)}, 'viewer', 'active');
  `);
}

function input(
  reservationIds: string[],
  operationId: string,
  overrides: Partial<{
    litterId: string;
    commitmentTemplateId: string;
    contractTemplateId: string;
    capturedAt: string;
  }> = {},
) {
  return {
    litterId: overrides.litterId ?? ids.litter,
    reservationIds,
    commitmentTemplateId:
      overrides.commitmentTemplateId ?? ids.commitmentTemplate,
    contractTemplateId: overrides.contractTemplateId ?? ids.contractTemplate,
    operationId,
    capturedAt: overrides.capturedAt ?? capturedAt,
  };
}

function assertNoSensitiveData(value: unknown) {
  const forbidden = /documentId|variant|organizationId|filePath|fileSha|storage|snapshot|templateData|sql|token|url|bytes|size/i;
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      expect(key).not.toMatch(forbidden);
      visit(child);
    }
  };
  visit(value);
}

test("generates litter reservation documents safely, idempotently and without fixture leaks", async () => {
  test.setTimeout(180_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorage(supabase);
  seed();

  try {
    const anonymous = createAnonymousSupabaseClient();
    expect(
      await generateLitterReservationDocumentsBatchCore(
        input([ids.reservationGenerate], "anonymous"),
        anonymous,
      ),
    ).toMatchObject({ status: "error", reasonCode: "unauthenticated", reservations: [] });

    const viewer = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const viewerAuth = await viewer.auth.signInWithPassword({
      email: viewerEmail,
      password: viewerPassword,
    });
    expect(viewerAuth.error).toBeNull();
    expect(
      await generateLitterReservationDocumentsBatchCore(
        input([ids.reservationGenerate], "viewer"),
        viewer,
      ),
    ).toMatchObject({ status: "error", reasonCode: "forbidden", reservations: [] });

    for (const litterId of [ids.foreignLitter, ids.deletedLitter]) {
      expect(
        await generateLitterReservationDocumentsBatchCore(
          input([ids.reservationGenerate], `litter-${litterId}`, { litterId }),
          supabase,
        ),
      ).toMatchObject({ status: "error", reasonCode: "litter_not_found", reservations: [] });
    }

    for (const invalid of [
      input([], "empty"),
      input(Array.from({ length: 31 }, (_, index) => id(500 + index)), "thirty-one"),
      input([ids.reservationGenerate], "bad-litter", { litterId: "invalid" }),
      input([ids.reservationGenerate], "bad-template", { contractTemplateId: "invalid" }),
      input([ids.reservationGenerate], "bad-date", { capturedAt: "2026-07-17T12:00:00" }),
    ]) {
      expect(
        await generateLitterReservationDocumentsBatchCore(invalid, supabase),
      ).toMatchObject({ status: "error", reasonCode: "invalid_input", reservations: [] });
    }
    expect(
      await generateLitterReservationDocumentsBatchCore(
        input(Array.from({ length: 30 }, () => ids.reservationWrongStatus), "thirty"),
        supabase,
      ),
    ).toMatchObject({ status: "partial", counts: { ineligible: 2 } });

    const ineligible = await generateLitterReservationDocumentsBatchCore(
      input(
        [
          "malformed",
          ids.foreignReservation,
          ids.reservationDeleted,
          ids.reservationWrongLitter,
          ids.reservationWrongStatus,
        ],
        "ineligible",
      ),
      supabase,
    );
    expect(ineligible.status).toBe("partial");
    expect(ineligible.counts.ineligible).toBe(10);
    expect(ineligible.reservations).toHaveLength(5);

    const first = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationGenerate], "operation-main"),
      supabase,
    );
    expect(first).toMatchObject({
      status: "success",
      reservations: [
        {
          reservationId: ids.reservationGenerate,
          commitment: { outcome: "created" },
          contract: { outcome: "created" },
        },
      ],
      counts: { created: 2, errors: 0 },
    });
    expect(documentCount(ids.reservationGenerate)).toBe(2);
    expect(storagePaths().filter((path) => path.includes(ids.organization))).toHaveLength(2);
    expect(
      sql(`select count(*) from public.documents where reservation_id = ${q(ids.reservationGenerate)}::uuid and generation_data->'template'->>'sourceKind' = 'common';`),
    ).toBe("2");

    sql(`update public.contacts set display_name = '' where id = ${q(ids.contact)}::uuid;`);
    const replay = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationGenerate], "operation-main"),
      supabase,
    );
    sql(`update public.contacts set display_name = 'Camille Lot' where id = ${q(ids.contact)}::uuid;`);
    expect(replay.reservations[0]).toMatchObject({
      commitment: { outcome: "existing" },
      contract: { outcome: "existing" },
    });
    expect(replay.counts.existing).toBe(2);
    expect(documentCount(ids.reservationGenerate)).toBe(2);

    const newOperation = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationGenerate], "operation-new"),
      supabase,
    );
    expect(newOperation.reservations[0]).toMatchObject({
      commitment: { outcome: "already_present" },
      contract: { outcome: "already_present" },
    });
    expect(documentCount(ids.reservationGenerate)).toBe(2);

    const concurrent = await Promise.all([
      generateLitterReservationDocumentsBatchCore(
        input([ids.reservationVariant], "operation-concurrent"),
        supabase,
      ),
      generateLitterReservationDocumentsBatchCore(
        input([ids.reservationVariant], "operation-concurrent"),
        supabase,
      ),
    ]);
    for (const result of concurrent) {
      expect(["created", "existing"]).toContain(result.reservations[0].commitment.outcome);
      expect(["created", "existing"]).toContain(result.reservations[0].contract.outcome);
    }
    expect(documentCount(ids.reservationVariant)).toBe(2);
    expect(
      sql(`select count(*) from public.documents where reservation_id = ${q(ids.reservationVariant)}::uuid and replaces_document_id is not null;`),
    ).toBe("0");
    expect(
      sql(`select count(*) from public.documents where reservation_id = ${q(ids.reservationVariant)}::uuid and reservation_document_variant_version_id = ${q(ids.variantVersion)}::uuid;`),
    ).toBe("1");
    const deterministicContractId = deriveLitterReservationDocumentId({
      organizationId: ids.organization,
      operationId: "operation-concurrent",
      reservationId: ids.reservationVariant,
      documentType: "reservation_contract",
    });
    const deterministicCommitmentId = deriveLitterReservationDocumentId({
      organizationId: ids.organization,
      operationId: "operation-concurrent",
      reservationId: ids.reservationVariant,
      documentType: "commitment_certificate",
    });
    const concurrentPaths = storagePaths().filter(
      (path) =>
        path.includes(`/documents/${deterministicCommitmentId}/`) ||
        path.includes(`/documents/${deterministicContractId}/`),
    );
    expect(concurrentPaths).toHaveLength(2);
    expect(concurrentPaths.every((path) => path.includes("/v1/"))).toBe(true);
    expect(
      sql(`select id::text || '|' || (generation_data->>'capturedAt') from public.documents where id = ${q(deterministicContractId)}::uuid;`),
    ).toBe(`${deterministicContractId}|${capturedAt}`);
    expect(
      sql(`select count(*) from public.documents where id in (${q(deterministicCommitmentId)}::uuid, ${q(deterministicContractId)}::uuid) and generation_data->>'capturedAt' = ${q(capturedAt)};`),
    ).toBe("2");

    const prevalidationRows = documentCount(ids.reservationPrevalidation);
    const prevalidationPaths = storagePaths().length;
    const prevalidation = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationPrevalidation], "prevalidation", {
        contractTemplateId: ids.missingContractTemplate,
      }),
      supabase,
    );
    expect(prevalidation.reservations[0]).toEqual({
      reservationId: ids.reservationPrevalidation,
      commitment: { outcome: "error", reasonCode: "paired_prevalidation_failed" },
      contract: { outcome: "missing_data", reasonCode: "missing_template_variables" },
    });
    expect(documentCount(ids.reservationPrevalidation)).toBe(prevalidationRows);
    expect(storagePaths()).toHaveLength(prevalidationPaths);

    const incompatible = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationAfterError], "incompatible", {
        contractTemplateId: ids.incompatibleTemplate,
      }),
      supabase,
    );
    expect(incompatible.reservations[0]).toMatchObject({
      commitment: { outcome: "error", reasonCode: "paired_prevalidation_failed" },
      contract: { outcome: "invalid_source", reasonCode: "template_mismatch" },
    });
    const invalidVariant = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationInvalidVariant], "invalid-variant"),
      supabase,
    );
    expect(invalidVariant.reservations[0].contract).toMatchObject({
      outcome: "invalid_source",
      reasonCode: "invalid_template",
    });
    expect(documentCount(ids.reservationInvalidVariant)).toBe(0);

    await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationOneMissing], "one-missing-initial"),
      supabase,
    );
    const contractToRemove = sql(`select id::text || '|' || file_path from public.documents where reservation_id = ${q(ids.reservationOneMissing)}::uuid and document_type = 'reservation_contract';`).split("|");
    const removedContract = await supabase.storage.from("documents").remove([contractToRemove[1]]);
    expect(removedContract.error).toBeNull();
    sql(`delete from public.documents where id = ${q(contractToRemove[0])}::uuid;`);
    const oneMissing = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationOneMissing], "one-missing-new"),
      supabase,
    );
    expect(oneMissing.reservations[0]).toMatchObject({
      commitment: { outcome: "already_present" },
      contract: { outcome: "created" },
    });
    expect(documentCount(ids.reservationOneMissing)).toBe(2);

    await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationProtected], "protected-initial"),
      supabase,
    );
    sql(`
      update public.documents set status = 'sent', sent_at = now()
      where reservation_id = ${q(ids.reservationProtected)}::uuid and document_type = 'commitment_certificate';
      update public.documents set status = 'signed', sent_at = now(), signed_at = now()
      where reservation_id = ${q(ids.reservationProtected)}::uuid and document_type = 'reservation_contract';
    `);
    const protectedResult = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationProtected], "protected-new"),
      supabase,
    );
    expect(protectedResult.reservations[0]).toMatchObject({
      commitment: { outcome: "protected" },
      contract: { outcome: "protected" },
    });

    await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationCorrupt], "corrupt-initial"),
      supabase,
    );
    const corruptPath = sql(`select file_path from public.documents where reservation_id = ${q(ids.reservationCorrupt)}::uuid and document_type = 'reservation_contract';`);
    const removedCorrupt = await supabase.storage.from("documents").remove([corruptPath]);
    expect(removedCorrupt.error).toBeNull();
    sql(`update public.documents set file_size_bytes = file_size_bytes + 1 where reservation_id = ${q(ids.reservationCorrupt)}::uuid and document_type = 'commitment_certificate';`);
    const corrupt = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationCorrupt], "corrupt-new"),
      supabase,
    );
    expect(corrupt.reservations[0].contract).toMatchObject({
      outcome: "incoherent_current_document",
      reasonCode: "current_document_incoherent",
    });
    expect(corrupt.reservations[0].commitment).toMatchObject({
      outcome: "incoherent_current_document",
      reasonCode: "current_document_incoherent",
    });

    const injectedFailureDependencies: LitterReservationDocumentBatchDependencies = {
      prepare: prepareDocumentGenerationSnapshotForReservationCore,
      render: renderDocumentPdfCore,
      readPdf: readDocumentPdfCore,
      generate: async (generationInput, client) =>
        generationInput.reservationId === ids.reservationMultiple
          ? {
              outcome: "error",
              error: { stage: "store", code: "storage_error" },
            }
          : generateAndStoreReservationDocumentPdfCore(generationInput, client),
    };
    const continuesAfterError = await generateLitterReservationDocumentsBatchCore(
      input(
        [ids.reservationMultiple, ids.reservationAfterError],
        "continues-after-error",
      ),
      supabase,
      injectedFailureDependencies,
    );
    expect(continuesAfterError.reservations[0]).toMatchObject({
      commitment: { outcome: "error", reasonCode: "storage_error" },
      contract: { outcome: "error", reasonCode: "storage_error" },
    });
    expect(continuesAfterError.reservations[1]).toMatchObject({
      commitment: { outcome: "created" },
      contract: { outcome: "created" },
    });
    expect(documentCount(ids.reservationMultiple)).toBe(0);
    expect(documentCount(ids.reservationAfterError)).toBe(2);

    await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationMultiple], "multiple-current-initial"),
      supabase,
    );
    sql(`
      drop index public.documents_current_commitment_certificate_idx;
      insert into public.documents
        (id, organization_id, contact_id, application_id, reservation_id, litter_id, document_type, status, title, signature_required)
      values
        (${q(ids.forcedDuplicate)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.reservationMultiple)}, ${q(ids.litter)}, 'commitment_certificate', 'uploaded', 'Doublon courant QA', true);
    `);
    expect(
      Number(
        sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid and reservation_id = ${q(ids.reservationMultiple)}::uuid and document_type = 'commitment_certificate' and deleted_at is null and superseded_at is null;`),
      ),
    ).toBe(2);
    const multipleCurrent = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationMultiple], "multiple-current-check"),
      supabase,
    );
    expect(multipleCurrent.reservations[0].commitment).toEqual({
      outcome: "incoherent_current_document",
      reasonCode: "multiple_current_documents",
    });
    sql(`
      delete from public.documents where id = ${q(ids.forcedDuplicate)}::uuid;
      create unique index documents_current_commitment_certificate_idx
        on public.documents (organization_id, reservation_id)
        where document_type = 'commitment_certificate'
          and deleted_at is null
          and superseded_at is null;
    `);
    expect(
      Number(sql(`select count(*) from public.documents where id = ${q(ids.forcedDuplicate)}::uuid;`)),
    ).toBe(0);

    sql(`update public.documents set animal_id = ${q(ids.animalMismatch)}::uuid where reservation_id = ${q(ids.reservationMultiple)}::uuid and document_type = 'reservation_contract';`);
    expect(
      sql(`select animal_id::text || '|' || coalesce(generation_data->'sources'->>'animalId', 'null') from public.documents where reservation_id = ${q(ids.reservationMultiple)}::uuid and document_type = 'reservation_contract';`),
    ).toBe(`${ids.animalMismatch}|null`);
    const animalMismatch = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationMultiple], "animal-mismatch-check"),
      supabase,
    );
    expect(animalMismatch.reservations[0].contract).toEqual({
      outcome: "incoherent_current_document",
      reasonCode: "current_document_incoherent",
    });

    const ordered = await generateLitterReservationDocumentsBatchCore(
      input(
        [
          ids.reservationWrongStatus,
          ids.reservationAfterError,
          ids.reservationWrongStatus.toUpperCase(),
        ],
        "ordered",
      ),
      supabase,
    );
    expect(ordered.reservations.map((row) => row.reservationId)).toEqual([
      ids.reservationWrongStatus,
      ids.reservationAfterError,
    ]);
    expect(ordered.counts).toEqual({
      created: 0,
      existing: 0,
      alreadyPresent: 2,
      protected: 0,
      ineligible: 2,
      missingData: 0,
      invalidData: 0,
      invalidSource: 0,
      incoherent: 0,
      errors: 0,
    });
    assertNoSensitiveData(ordered);

    const beforeNoReplacementRows = documentCount(ids.reservationAfterError);
    const beforeNoReplacementPaths = storagePaths().length;
    const noReplacement = await generateLitterReservationDocumentsBatchCore(
      input([ids.reservationAfterError], "no-replacement-new"),
      supabase,
    );
    expect(noReplacement.reservations[0]).toMatchObject({
      commitment: { outcome: "already_present" },
      contract: { outcome: "already_present" },
    });
    expect(documentCount(ids.reservationAfterError)).toBe(beforeNoReplacementRows);
    expect(storagePaths()).toHaveLength(beforeNoReplacementPaths);
    expect(
      sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid and replaces_document_id is not null;`),
    ).toBe("0");
  } finally {
    await removeStorage(supabase);
    cleanupRows();
    expect(storagePaths()).toEqual([]);
    for (const table of [
      "documents",
      "reservation_document_variant_versions",
      "reservation_document_variants",
      "payments",
      "reservations",
      "document_templates",
      "document_template_families",
      "organization_document_settings",
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
        sql(`select count(*) from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`),
      ),
    ).toBe(0);
    expect(
      Number(sql(`select count(*) from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;`)),
    ).toBe(0);
    expect(
      Number(sql(`select count(*) from auth.users where id = ${q(ids.viewerUser)}::uuid;`)),
    ).toBe(0);
  }
});
