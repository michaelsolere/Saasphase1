import { expect, test } from "@playwright/test";

import {
  generateLitterGroupReservationDocumentsBatchCore,
  type LitterGroupReservationDocumentBatchDependencies,
  type LitterGroupReservationDocumentBatchInput,
} from "../../src/features/documents/litter-group-reservation-document-batch-core";
import { buildLitterGroupDocumentTaxonomyKey } from "../../src/features/documents/litter-group-reservation-document-batch-plan-core";
import type { LitterReservationDocumentBatchResult } from "../../src/features/documents/litter-reservation-document-batch-core";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "b2970002";
const id = (suffix: number) =>
  `${prefix}-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const ids = {
  organization: id(1),
  foreignOrganization: id(2),
  membership: id(3),
  group: id(4),
  otherGroup: id(5),
  deletedGroup: id(6),
  foreignGroup: id(7),
  litterOne: id(8),
  litterTwo: id(9),
  outsideLitter: id(10),
  deletedLitter: id(11),
  foreignLitter: id(12),
  contact: id(13),
  otherContact: id(14),
  application: id(15),
  otherApplication: id(16),
  catAnimal: id(17),
  documentSettings: id(18),
  dogCommitmentFamily: id(19),
  dogCommitmentTemplate: id(20),
  dogContractFamily: id(21),
  dogContractTemplate: id(22),
  catCommitmentFamily: id(23),
  catCommitmentTemplate: id(24),
  catContractFamily: id(25),
  catContractTemplate: id(26),
  absentTemplate: id(27),
  foreignContact: id(28),
  foreignApplication: id(29),
  inactiveContractFamily: id(30),
  inactiveContractTemplate: id(31),
  draftContractFamily: id(32),
  draftContractTemplate: id(33),
  retiredContractFamily: id(34),
  retiredContractTemplate: id(35),
  realOne: id(101),
  realTwo: id(102),
  groupOnly: id(103),
  groupMismatch: id(104),
  outside: id(105),
  deletedLitterReservation: id(106),
  wrongStatus: id(107),
  missingApplication: id(108),
  incoherentApplication: id(109),
  catTaxonomy: id(110),
  foreignReservation: id(111),
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const capturedAt = "2026-07-17T18:30:00.000+02:00";
const operationId = "litter-group-batch-orchestrator-e2e";

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat groupe orchestrateur QA",
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
  title: "Contrat groupe orchestrateur QA",
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

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function dogTaxonomyKey() {
  return buildLitterGroupDocumentTaxonomyKey({
    species: "dog",
    breed: "Golden Retriever",
  });
}

function catTaxonomyKey() {
  return buildLitterGroupDocumentTaxonomyKey({
    species: "cat",
    breed: "Maine Coon",
  });
}

function templates(
  taxonomyKey = dogTaxonomyKey(),
  commitmentTemplateId = ids.dogCommitmentTemplate,
  contractTemplateId = ids.dogContractTemplate,
) {
  return { taxonomyKey, commitmentTemplateId, contractTemplateId };
}

function input(
  reservationIds: unknown[],
  overrides: Partial<LitterGroupReservationDocumentBatchInput> = {},
): LitterGroupReservationDocumentBatchInput {
  return {
    litterGroupId: ids.group,
    reservationIds,
    templateSelections: [templates()],
    operationId,
    capturedAt,
    ...overrides,
  };
}

function documentCounts(
  overrides: Partial<LitterReservationDocumentBatchResult["counts"]> = {},
) {
  return {
    created: 0,
    existing: 0,
    alreadyPresent: 0,
    protected: 0,
    ineligible: 0,
    missingData: 0,
    invalidData: 0,
    invalidSource: 0,
    incoherent: 0,
    errors: 0,
    ...overrides,
  };
}

function successfulSubcall(
  reservationIds: string[],
  outcome: "created" | "existing" | "already_present" = "already_present",
): LitterReservationDocumentBatchResult {
  const countKey =
    outcome === "already_present"
      ? "alreadyPresent"
      : outcome === "created"
        ? "created"
        : "existing";
  return {
    status: "success",
    reservations: reservationIds.map((reservationId) => ({
      reservationId,
      commitment: { outcome },
      contract: { outcome },
    })),
    counts: documentCounts({ [countKey]: reservationIds.length * 2 }),
  };
}

function fixtureCount(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where id::text like ${q(`${prefix}-%`)};`,
    ),
  );
}

function organizationScopedCount(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);`,
    ),
  );
}

function setMembershipRole(role: "viewer" | "member" | "admin" | "owner") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)} where id = ${q(ids.membership)}::uuid;
    set session_replication_role = origin;
  `);
}

function storagePaths() {
  const value = sql(
    `select name from storage.objects where bucket_id = 'documents' and name like 'organizations/${ids.organization}/%';`,
  );
  return value ? value.split("\n").filter(Boolean) : [];
}

async function removeStorage(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = storagePaths();
  if (paths.length === 0) return;
  const removed = await supabase.storage.from("documents").remove(paths);
  if (removed.error) {
    throw new Error(`Storage cleanup failed: ${removed.error.message}`);
  }
}

function cleanupRows() {
  sql(`
    delete from public.document_signed_returns where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.documents where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.email_delivery_attempts where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.payments where organization_id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
    delete from public.reservations where id::text like ${q(`${prefix}-%`)};
    delete from public.animals where id::text like ${q(`${prefix}-%`)};
    delete from public.document_templates where id::text like ${q(`${prefix}-%`)};
    delete from public.document_template_families where id::text like ${q(`${prefix}-%`)};
    delete from public.organization_document_settings where id::text like ${q(`${prefix}-%`)};
    delete from public.litters where id::text like ${q(`${prefix}-%`)};
    delete from public.litter_groups where id::text like ${q(`${prefix}-%`)};
    delete from public.applications where id::text like ${q(`${prefix}-%`)};
    delete from public.contacts where id::text like ${q(`${prefix}-%`)};
    set session_replication_role = replica;
    delete from public.memberships where id::text like ${q(`${prefix}-%`)};
    set session_replication_role = origin;
    delete from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.foreignOrganization)}::uuid);
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations
      (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Élevage Groupe Batch QA', 'Élevage Groupe Batch QA', 'company', 'elevage-groupe-batch-qa', 'groupe-batch@example.invalid', '1 rue QA', '75001', 'Paris', 'FR'),
      (${q(ids.foreignOrganization)}, 'Organisation étrangère Groupe QA', 'Organisation étrangère Groupe QA', 'company', 'organisation-etrangere-groupe-qa', 'foreign-groupe@example.invalid', '2 rue QA', '69001', 'Lyon', 'FR');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.litter_groups (id, organization_id, name, species, status, deleted_at)
    values
      (${q(ids.group)}, ${q(ids.organization)}, 'Groupe orchestrateur QA', 'dog', 'planned', null),
      (${q(ids.otherGroup)}, ${q(ids.organization)}, 'Autre groupe orchestrateur QA', 'dog', 'planned', null),
      (${q(ids.deletedGroup)}, ${q(ids.organization)}, 'Groupe supprimé orchestrateur QA', 'dog', 'planned', now()),
      (${q(ids.foreignGroup)}, ${q(ids.foreignOrganization)}, 'Groupe étranger secret QA', 'dog', 'planned', null);

    insert into public.litters
      (id, organization_id, litter_group_id, name, species, breed, actual_birth_date, available_from, deleted_at)
    values
      (${q(ids.litterOne)}, ${q(ids.organization)}, ${q(ids.group)}, 'Portée Alpha Groupe QA', 'dog', 'Golden Retriever', '2026-06-01', '2026-08-01', null),
      (${q(ids.litterTwo)}, ${q(ids.organization)}, ${q(ids.group)}, 'Portée Bêta Groupe QA', 'dog', 'Golden Retriever', '2026-06-02', '2026-08-02', null),
      (${q(ids.outsideLitter)}, ${q(ids.organization)}, ${q(ids.otherGroup)}, 'Portée extérieure Groupe QA', 'dog', 'Golden Retriever', '2026-06-03', '2026-08-03', null),
      (${q(ids.deletedLitter)}, ${q(ids.organization)}, ${q(ids.group)}, 'Portée supprimée Groupe QA', 'dog', 'Golden Retriever', '2026-06-04', '2026-08-04', now()),
      (${q(ids.foreignLitter)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignGroup)}, 'Portée étrangère secrète QA', 'dog', 'Golden Retriever', '2026-06-05', '2026-08-05', null);

    insert into public.contacts
      (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Camille Groupe QA', 'Camille', 'Groupe', 'camille-groupe@example.invalid', '3 rue QA', '33000', 'Bordeaux', 'FR'),
      (${q(ids.otherContact)}, ${q(ids.organization)}, 'Autre Contact Groupe QA', 'Autre', 'Contact', 'autre-contact-groupe@example.invalid', '4 rue QA', '44000', 'Nantes', 'FR'),
      (${q(ids.foreignContact)}, ${q(ids.foreignOrganization)}, 'Contact étranger Groupe QA', 'Contact', 'Étranger', 'foreign-contact-groupe@example.invalid', '5 rue QA', '59000', 'Lille', 'FR');

    insert into public.applications
      (id, organization_id, contact_id, species, breed, desired_sex_preference)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'no_preference'),
      (${q(ids.otherApplication)}, ${q(ids.organization)}, ${q(ids.otherContact)}, 'cat', 'Maine Coon', 'no_preference'),
      (${q(ids.foreignApplication)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, 'dog', 'Golden Retriever', 'no_preference');

    insert into public.animals
      (id, organization_id, litter_id, official_name, call_name, species, breed, sex, birth_date)
    values
      (${q(ids.catAnimal)}, ${q(ids.organization)}, ${q(ids.litterOne)}, 'Animal taxonomie chat QA', 'Chat QA', 'cat', 'Maine Coon', 'female', '2026-06-01');

    insert into public.organization_document_settings
      (id, organization_id, signature_city_default)
    values (${q(ids.documentSettings)}, ${q(ids.organization)}, 'Paris');

    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.dogCommitmentFamily)}, ${q(ids.organization)}, 'Certificat chien groupe QA', 'commitment_certificate', 'dog', 'Golden Retriever'),
      (${q(ids.dogContractFamily)}, ${q(ids.organization)}, 'Contrat chien groupe QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.catCommitmentFamily)}, ${q(ids.organization)}, 'Certificat chat groupe QA', 'commitment_certificate', 'cat', 'Maine Coon'),
      (${q(ids.catContractFamily)}, ${q(ids.organization)}, 'Contrat chat groupe QA', 'reservation_contract', 'cat', 'Maine Coon'),
      (${q(ids.inactiveContractFamily)}, ${q(ids.organization)}, 'Contrat inactif groupe QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.draftContractFamily)}, ${q(ids.organization)}, 'Contrat brouillon groupe QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.retiredContractFamily)}, ${q(ids.organization)}, 'Contrat retiré groupe QA', 'reservation_contract', 'dog', 'Golden Retriever');

    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values
      (${q(ids.dogCommitmentTemplate)}, ${q(ids.organization)}, ${q(ids.dogCommitmentFamily)}, 'Certificat chien groupe QA', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.dogContractTemplate)}, ${q(ids.organization)}, ${q(ids.dogContractFamily)}, 'Contrat chien groupe QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.catCommitmentTemplate)}, ${q(ids.organization)}, ${q(ids.catCommitmentFamily)}, 'Certificat chat groupe QA', 'commitment_certificate', 'cat', 'Maine Coon', 'json', ${q(JSON.stringify(certificateDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.catContractTemplate)}, ${q(ids.organization)}, ${q(ids.catContractFamily)}, 'Contrat chat groupe QA', 'reservation_contract', 'cat', 'Maine Coon', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.inactiveContractTemplate)}, ${q(ids.organization)}, ${q(ids.inactiveContractFamily)}, 'Contrat inactif groupe QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'draft', false, null, null),
      (${q(ids.draftContractTemplate)}, ${q(ids.organization)}, ${q(ids.draftContractFamily)}, 'Contrat brouillon groupe QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'draft', false, null, null),
      (${q(ids.retiredContractTemplate)}, ${q(ids.organization)}, ${q(ids.retiredContractFamily)}, 'Contrat retiré groupe QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 1, 'retired', false, now(), ${q(ownerId)});

    insert into public.reservations
      (id, organization_id, contact_id, application_id, litter_id, litter_group_id, animal_id, status, price_cents, currency, created_at, deleted_at)
    values
      (${q(ids.realOne)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litterOne)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:00:00Z', null),
      (${q(ids.realTwo)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litterTwo)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:01:00Z', null),
      (${q(ids.groupOnly)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, null, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:02:00Z', null),
      (${q(ids.groupMismatch)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litterOne)}, ${q(ids.otherGroup)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:03:00Z', null),
      (${q(ids.outside)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.outsideLitter)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:04:00Z', null),
      (${q(ids.deletedLitterReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.deletedLitter)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:05:00Z', null),
      (${q(ids.wrongStatus)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litterOne)}, ${q(ids.group)}, null, 'active', 250000, 'EUR', '2026-07-01T09:06:00Z', null),
      (${q(ids.missingApplication)}, ${q(ids.organization)}, ${q(ids.contact)}, null, ${q(ids.litterOne)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:07:00Z', null),
      (${q(ids.incoherentApplication)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.otherApplication)}, ${q(ids.litterOne)}, ${q(ids.group)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:08:00Z', null),
      (${q(ids.catTaxonomy)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.litterOne)}, ${q(ids.group)}, ${q(ids.catAnimal)}, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:09:00Z', null),
      (${q(ids.foreignReservation)}, ${q(ids.foreignOrganization)}, ${q(ids.foreignContact)}, ${q(ids.foreignApplication)}, ${q(ids.foreignLitter)}, ${q(ids.foreignGroup)}, null, 'pre_reservation_paid', 250000, 'EUR', '2026-07-01T09:10:00Z', null);
  `);
}

function assertNoSensitiveData(value: unknown) {
  const forbidden =
    /documentId|variant|organizationId|filePath|fileSha|storage|snapshot|templateData|sql|token|url|bytes|version/i;
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      expect(key).not.toMatch(forbidden);
      visit(child);
    }
  };
  visit(value);
}

test("orchestrates litter-group document batches authoritatively, sequentially and idempotently", async () => {
  test.setTimeout(240_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorage(supabase);

  const calls: LitterGroupReservationDocumentBatchInput[] = [];
  const injected: LitterGroupReservationDocumentBatchDependencies = {
    generateLitterBatch: async (subInput) => {
      calls.push({
        litterGroupId: ids.group,
        reservationIds: subInput.reservationIds,
        templateSelections: [],
        operationId: subInput.operationId,
        capturedAt: subInput.capturedAt,
      });
      if (subInput.reservationIds.includes(ids.incoherentApplication)) {
        return {
          status: "partial",
          reservations: subInput.reservationIds.map((reservationId) =>
            reservationId === ids.incoherentApplication
              ? {
                  reservationId,
                  commitment: {
                    outcome: "ineligible",
                    reasonCode: "application_incoherent",
                  },
                  contract: {
                    outcome: "ineligible",
                    reasonCode: "application_incoherent",
                  },
                }
              : successfulSubcall([reservationId]).reservations[0],
          ),
          counts: documentCounts({
            alreadyPresent: (subInput.reservationIds.length - 1) * 2,
            ineligible: 2,
          }),
        };
      }
      return successfulSubcall(subInput.reservationIds);
    },
  };

  try {
    seed();
    const invalidInputs = [
      input([]),
      input(Array.from({ length: 31 }, () => ids.realOne)),
      input([ids.realOne], { litterGroupId: "invalid" }),
      input([ids.realOne], { operationId: "" }),
      input([ids.realOne], { operationId: "x".repeat(201) }),
      input([ids.realOne], { capturedAt: "2026-07-17T18:30:00" }),
      input([ids.realOne], {
        templateSelections: Array.from({ length: 31 }, () => templates()),
      }),
    ];
    for (const invalid of invalidInputs) {
      expect(
        await generateLitterGroupReservationDocumentsBatchCore(
          invalid,
          supabase,
          injected,
        ),
      ).toMatchObject({
        status: "error",
        reasonCode: "invalid_input",
        reservations: [],
      });
    }

    const anonymous = createAnonymousSupabaseClient();
    expect(
      await generateLitterGroupReservationDocumentsBatchCore(
        input([ids.realOne]),
        anonymous,
        injected,
      ),
    ).toMatchObject({
      status: "error",
      reasonCode: "unauthenticated",
      reservations: [],
    });

    setMembershipRole("viewer");
    expect(
      await generateLitterGroupReservationDocumentsBatchCore(
        input([ids.realOne]),
        supabase,
        injected,
      ),
    ).toMatchObject({ status: "error", reasonCode: "forbidden" });

    for (const role of ["member", "admin", "owner"]) {
      setMembershipRole(role as "member" | "admin" | "owner");
      expect(
        await generateLitterGroupReservationDocumentsBatchCore(
          input([ids.realOne], { operationId: `authorized-${role}` }),
          supabase,
          injected,
        ),
      ).toMatchObject({ status: "success" });
    }

    for (const litterGroupId of [
      ids.foreignGroup,
      ids.deletedGroup,
      id(999),
    ]) {
      expect(
        await generateLitterGroupReservationDocumentsBatchCore(
          input([ids.realOne], { litterGroupId }),
          supabase,
          injected,
        ),
      ).toMatchObject({
        status: "error",
        reasonCode: "group_not_found",
        reservations: [],
      });
    }

    const classified = await generateLitterGroupReservationDocumentsBatchCore(
      input([
        ids.groupOnly,
        ids.groupMismatch,
        ids.outside,
        ids.deletedLitterReservation,
        ids.foreignReservation,
        id(998),
        ids.wrongStatus,
        ids.missingApplication,
        ids.incoherentApplication,
        ids.realOne,
      ]),
      supabase,
      injected,
    );
    expect(classified.status).toBe("partial");
    expect(
      classified.reservations.map((reservation) => [
        reservation.reservationId,
        reservation.status,
        reservation.reasonCode,
      ]),
    ).toEqual([
      [ids.groupOnly, "excluded", "group_only"],
      [ids.groupMismatch, "excluded", "reservation_group_mismatch"],
      [ids.outside, "excluded", "litter_outside_group"],
      [ids.deletedLitterReservation, "excluded", "litter_missing_or_deleted"],
      [ids.foreignReservation, "excluded", "reservation_not_found"],
      [id(998), "excluded", "reservation_not_found"],
      [ids.wrongStatus, "excluded", "kernel_pre_ineligible"],
      [ids.missingApplication, "excluded", "kernel_pre_ineligible"],
      [ids.incoherentApplication, "processed", undefined],
      [ids.realOne, "processed", undefined],
    ]);
    expect(classified.reservations[4]).not.toHaveProperty("litterId");
    expect(classified.reservations[4]).not.toHaveProperty("taxonomy");
    expect(classified.reservations[8]).toMatchObject({
      commitment: { outcome: "ineligible", reasonCode: "application_incoherent" },
      contract: { outcome: "ineligible", reasonCode: "application_incoherent" },
    });
    expect(classified.planningCounts).toMatchObject({
      rawSelected: 10,
      selected: 10,
      planned: 2,
      excluded: 8,
      groupOnly: 1,
      incoherentAttachments: 3,
      preIneligible: 2,
    });

    calls.length = 0;
    const ordered = await generateLitterGroupReservationDocumentsBatchCore(
      input(
        [
          ids.realTwo,
          ids.catTaxonomy,
          ids.realOne,
          ids.realTwo.toUpperCase(),
        ],
        {
          operationId: "stable-operation",
          capturedAt: "2026-07-17T19:00:00.000+02:00",
          templateSelections: [
            templates(),
            templates(
              catTaxonomyKey(),
              ids.catCommitmentTemplate,
              ids.catContractTemplate,
            ),
          ],
        },
      ),
      supabase,
      injected,
    );
    expect(ordered.status).toBe("success");
    expect(ordered.reservations.map((reservation) => reservation.reservationId)).toEqual([
      ids.realTwo,
      ids.catTaxonomy,
      ids.realOne,
    ]);
    expect(calls.map((call) => call.reservationIds)).toEqual([
      [ids.realTwo],
      [ids.catTaxonomy],
      [ids.realOne],
    ]);
    expect(calls.map((call) => [call.operationId, call.capturedAt])).toEqual([
      ["stable-operation", "2026-07-17T19:00:00.000+02:00"],
      ["stable-operation", "2026-07-17T19:00:00.000+02:00"],
      ["stable-operation", "2026-07-17T19:00:00.000+02:00"],
    ]);
    expect(ordered.litters).toEqual([
      {
        litterId: ids.litterTwo,
        reservationCount: 1,
        status: "success",
        documentCounts: documentCounts({ alreadyPresent: 2 }),
      },
      {
        litterId: ids.litterOne,
        reservationCount: 2,
        status: "success",
        documentCounts: documentCounts({ alreadyPresent: 4 }),
      },
    ]);
    expect(ordered.documentCounts).toEqual(
      documentCounts({ alreadyPresent: 6 }),
    );
    expect(ordered.planningCounts).toMatchObject({
      rawSelected: 4,
      selected: 3,
      planned: 3,
      excluded: 0,
    });

    expect(
      await generateLitterGroupReservationDocumentsBatchCore(
        input(Array.from({ length: 30 }, () => ids.realOne)),
        supabase,
        injected,
      ),
    ).toMatchObject({
      status: "success",
      planningCounts: { rawSelected: 30, selected: 1, planned: 1 },
    });

    const modelCases: Array<{
      prepare?: string;
      selection: ReturnType<typeof templates>;
      reasonCode: string;
    }> = [
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.absentTemplate,
          ids.dogContractTemplate,
        ),
        reasonCode: "commitment_template_unavailable",
      },
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.dogCommitmentTemplate,
          ids.inactiveContractTemplate,
        ),
        reasonCode: "contract_template_unavailable",
      },
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.dogCommitmentTemplate,
          ids.draftContractTemplate,
        ),
        reasonCode: "contract_template_unavailable",
      },
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.dogCommitmentTemplate,
          ids.retiredContractTemplate,
        ),
        reasonCode: "contract_template_unavailable",
      },
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.catCommitmentTemplate,
          ids.dogContractTemplate,
        ),
        reasonCode: "commitment_template_unavailable",
      },
      {
        selection: templates(
          dogTaxonomyKey(),
          ids.dogCommitmentTemplate,
          ids.dogCommitmentTemplate,
        ),
        reasonCode: "template_selection_incoherent",
      },
    ];
    for (const [index, modelCase] of modelCases.entries()) {
      if (modelCase.prepare) sql(modelCase.prepare);
      calls.length = 0;
      const result = await generateLitterGroupReservationDocumentsBatchCore(
        input([ids.realOne], {
          operationId: `model-case-${index}`,
          templateSelections: [modelCase.selection],
        }),
        supabase,
        injected,
      );
      expect(result).toMatchObject({
        status: "error",
        reservations: [
          {
            reservationId: ids.realOne,
            status: "excluded",
            reasonCode: modelCase.reasonCode,
          },
        ],
        documentCounts: documentCounts(),
      });
      expect(calls).toEqual([]);
    }

    calls.length = 0;
    const isolatedTaxonomyFailure =
      await generateLitterGroupReservationDocumentsBatchCore(
        input([ids.catTaxonomy, ids.realTwo], {
          templateSelections: [
            templates(),
            templates(
              catTaxonomyKey(),
              ids.absentTemplate,
              ids.catContractTemplate,
            ),
          ],
        }),
        supabase,
        injected,
      );
    expect(isolatedTaxonomyFailure.status).toBe("partial");
    expect(isolatedTaxonomyFailure.reservations).toMatchObject([
      { status: "excluded", reasonCode: "commitment_template_unavailable" },
      { status: "processed" },
    ]);
    expect(calls.map((call) => call.reservationIds)).toEqual([[ids.realTwo]]);

    let firstPartition = true;
    const continueAfterFailure: LitterGroupReservationDocumentBatchDependencies = {
      generateLitterBatch: async (subInput) => {
        if (firstPartition) {
          firstPartition = false;
          throw new Error("local partition failure");
        }
        return successfulSubcall(subInput.reservationIds);
      },
    };
    const continued = await generateLitterGroupReservationDocumentsBatchCore(
      input([ids.realOne, ids.realTwo]),
      supabase,
      continueAfterFailure,
    );
    expect(continued.status).toBe("partial");
    expect(continued.reservations).toMatchObject([
      {
        reservationId: ids.realOne,
        status: "processed",
        reasonCode: "partition_error",
        commitment: { outcome: "error", reasonCode: "generation_error" },
        contract: { outcome: "error", reasonCode: "generation_error" },
      },
      { reservationId: ids.realTwo, status: "processed" },
    ]);
    expect(continued.litters.map((litter) => litter.status)).toEqual([
      "error",
      "success",
    ]);

    assertNoSensitiveData(classified);
    assertNoSensitiveData(ordered);
    assertNoSensitiveData(continued);
    expect(organizationScopedCount("email_delivery_attempts")).toBe(0);
    expect(organizationScopedCount("payments")).toBe(0);

    const realInput = input([ids.realTwo, ids.realOne], {
      operationId: "real-two-litters",
    });
    const firstReal = await generateLitterGroupReservationDocumentsBatchCore(
      realInput,
      supabase,
    );
    expect(firstReal.status).toBe("success");
    expect(firstReal.reservations).toMatchObject([
      {
        reservationId: ids.realTwo,
        litterId: ids.litterTwo,
        status: "processed",
        commitment: { outcome: "created" },
        contract: { outcome: "created" },
      },
      {
        reservationId: ids.realOne,
        litterId: ids.litterOne,
        status: "processed",
        commitment: { outcome: "created" },
        contract: { outcome: "created" },
      },
    ]);
    expect(firstReal.documentCounts).toEqual(documentCounts({ created: 4 }));
    expect(firstReal.litters.map((litter) => litter.litterId)).toEqual([
      ids.litterTwo,
      ids.litterOne,
    ]);
    expect(organizationScopedCount("documents")).toBe(4);
    expect(storagePaths()).toHaveLength(4);

    const replay = await generateLitterGroupReservationDocumentsBatchCore(
      realInput,
      supabase,
    );
    expect(replay.status).toBe("success");
    expect(replay.documentCounts).toEqual(documentCounts({ existing: 4 }));
    expect(organizationScopedCount("documents")).toBe(4);
    expect(storagePaths()).toHaveLength(4);

    const newOperation = await generateLitterGroupReservationDocumentsBatchCore(
      { ...realInput, operationId: "real-two-litters-new-operation" },
      supabase,
    );
    expect(newOperation.status).toBe("success");
    expect(newOperation.documentCounts).toEqual(
      documentCounts({ alreadyPresent: 4 }),
    );
    expect(organizationScopedCount("documents")).toBe(4);
    expect(storagePaths()).toHaveLength(4);
    expect(
      Number(
        sql(
          `select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid and replaces_document_id is not null;`,
        ),
      ),
    ).toBe(0);
    expect(organizationScopedCount("email_delivery_attempts")).toBe(0);
    expect(organizationScopedCount("payments")).toBe(0);
    assertNoSensitiveData(firstReal);
    assertNoSensitiveData(replay);
    assertNoSensitiveData(newOperation);
  } finally {
    await removeStorage(supabase);
    cleanupRows();
    expect(storagePaths()).toEqual([]);
    for (const table of [
      "document_signed_returns",
      "documents",
      "email_delivery_attempts",
      "payments",
      "reservations",
      "animals",
      "document_templates",
      "document_template_families",
      "organization_document_settings",
      "litters",
      "litter_groups",
      "applications",
      "contacts",
      "memberships",
    ]) {
      if (["document_signed_returns", "email_delivery_attempts", "payments"].includes(table)) {
        expect(organizationScopedCount(table), `${table} must be empty`).toBe(0);
      } else {
        expect(fixtureCount(table), `${table} fixtures must be hard-deleted`).toBe(0);
      }
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
        sql(
          `select count(*) from auth.users where email like ${q(`${prefix}-%`)};`,
        ),
      ),
    ).toBe(0);
    expect(
      Number(
        sql(
          `select count(*) from auth.identities where identity_data->>'email' like ${q(`${prefix}-%`)};`,
        ),
      ),
    ).toBe(0);
  }
});
