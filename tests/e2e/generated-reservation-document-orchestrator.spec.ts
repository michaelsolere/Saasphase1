import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  generateAndStoreReservationDocumentPdfCore,
  type GenerateAndStoreReservationDocumentPdfDependencies,
} from "../../src/features/documents/generated-reservation-document-orchestrator-core";
import { readDocumentPdfCore } from "../../src/features/documents/document-pdf-storage-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "7e150000-0000-4000-8000-000000000001",
  membership: "7e150000-0000-4000-8000-000000000002",
  contact: "7e150000-0000-4000-8000-000000000003",
  application: "7e150000-0000-4000-8000-000000000004",
  group: "7e150000-0000-4000-8000-000000000005",
  litter: "7e150000-0000-4000-8000-000000000006",
  animal: "7e150000-0000-4000-8000-000000000007",
  contractReservation: "7e150000-0000-4000-8000-000000000008",
  certificateReservation: "7e150000-0000-4000-8000-000000000009",
  contractTemplate: "7e150000-0000-4000-8000-000000000010",
  certificateTemplate: "7e150000-0000-4000-8000-000000000011",
  settings: "7e150000-0000-4000-8000-000000000012",
  paymentSettings: "7e150000-0000-4000-8000-000000000013",
  payment: "7e150000-0000-4000-8000-000000000014",
  legacy: "7e150000-0000-4000-8000-000000000015",
  contractV1: "7e150000-0000-4000-8000-000000000016",
  contractV2: "7e150000-0000-4000-8000-000000000017",
  certificateV1: "7e150000-0000-4000-8000-000000000018",
  identical: "7e150000-0000-4000-8000-000000000019",
  concurrentA: "7e150000-0000-4000-8000-000000000020",
  concurrentB: "7e150000-0000-4000-8000-000000000021",
  renderFailure: "7e150000-0000-4000-8000-000000000022",
  storeFailure: "7e150000-0000-4000-8000-000000000023",
  prepareFailure: "7e150000-0000-4000-8000-000000000024",
  viewerUser: "7e150000-0000-4000-8000-000000000025",
  viewerIdentity: "7e150000-0000-4000-8000-000000000026",
  viewerMembership: "7e150000-0000-4000-8000-000000000027",
  viewerDocument: "7e150000-0000-4000-8000-000000000028",
  mother: "7e150000-0000-4000-8000-000000000029",
  father: "7e150000-0000-4000-8000-000000000030",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const capturedAt = "2026-07-13T14:15:16.000+02:00";
const laterCapturedAt = "2026-07-13T15:15:16.000+02:00";
const viewerEmail = "orchestrator-viewer@saasphase1.invalid";
const viewerPassword = "OrchestratorViewer-2026!";

const contractDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat orchestré QA",
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
  title: "Certificat orchestré QA",
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

function count(table: string) {
  return Number(
    sql(
      `select count(*) from public.${table} where organization_id = ${q(ids.organization)}::uuid;`,
    ),
  );
}

async function storagePaths() {
  const raw = sql(
    `select name from storage.objects where bucket_id = 'documents' and name like 'organizations/${ids.organization}/%';`,
  );
  return raw ? raw.split("\n").filter(Boolean) : [];
}

async function cleanupStorage(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = await storagePaths();
  if (paths.length > 0) {
    const removed = await supabase.storage.from("documents").remove(paths);
    if (removed.error) throw new Error(`Storage cleanup failed: ${removed.error.message}`);
  }
}

function cleanupRows() {
  sql(`
    delete from public.documents where organization_id = ${q(ids.organization)}::uuid;
    delete from public.payments where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_templates where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_template_families where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_document_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals where organization_id = ${q(ids.organization)}::uuid and litter_id is not null;
    delete from public.litters where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litter_groups where organization_id = ${q(ids.organization)}::uuid;
    delete from public.applications where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.memberships where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organizations where id = ${q(ids.organization)}::uuid;
    delete from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;
    delete from auth.users where id = ${q(ids.viewerUser)}::uuid;
  `);
}

function seed() {
  cleanupRows();
  sql(`
    insert into public.organizations (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values (${q(ids.organization)}, 'Élevage Orchestrateur QA', 'Orchestrateur QA SARL', 'company', 'orchestrateur-qa', 'seller@example.invalid', '1 rue QA', '75001', 'Paris', 'FR');
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');
    insert into public.contacts (id, organization_id, display_name, first_name, last_name, email, address_line1, postal_code, city, country)
    values (${q(ids.contact)}, ${q(ids.organization)}, 'Camille Orchestrateur', 'Camille', 'Orchestrateur', 'adopter@example.invalid', '2 rue QA', '69001', 'Lyon', 'FR');
    insert into public.applications (id, organization_id, contact_id, species, breed, desired_sex_preference)
    values (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'female_only');
    insert into public.litter_groups (id, organization_id, name, species)
    values (${q(ids.group)}, ${q(ids.organization)}, 'Groupe QA', 'dog');
    insert into public.animals (id, organization_id, official_name, call_name, species, breed, sex, identification_number, lof_number)
    values (${q(ids.mother)}, ${q(ids.organization)}, 'Mère QA officielle', 'Mère QA', 'dog', 'Golden Retriever', 'female', '250269000000029', 'LOF-MERE-QA'),
           (${q(ids.father)}, ${q(ids.organization)}, 'Père QA officiel', 'Père QA', 'dog', 'Golden Retriever', 'male', '250269000000030', 'LOF-PERE-QA');
    insert into public.litters (id, organization_id, litter_group_id, name, species, breed, actual_birth_date, available_from, mother_id, father_id)
    values (${q(ids.litter)}, ${q(ids.organization)}, ${q(ids.group)}, 'Portée QA', 'dog', 'Golden Retriever', '2026-06-01', '2026-08-01', ${q(ids.mother)}, ${q(ids.father)});
    insert into public.animals (id, organization_id, litter_id, official_name, call_name, species, breed, sex, birth_date, identification_number)
    values (${q(ids.animal)}, ${q(ids.organization)}, ${q(ids.litter)}, 'NOVA QA', 'Nova', 'dog', 'Golden Retriever', 'female', '2026-06-01', '250269000000009');
    insert into public.reservations (id, organization_id, contact_id, application_id, litter_group_id, litter_id, rank_active, status, reserved_sex_preference, price_cents, currency, created_at)
    values (${q(ids.contractReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.group)}, ${q(ids.litter)}, 3, 'active', 'female_only', 250000, 'EUR', '2026-07-01T09:00:00Z');
    insert into public.reservations (id, organization_id, contact_id, application_id, litter_group_id, litter_id, animal_id, status, reserved_sex_preference, price_cents, currency, created_at)
    values (${q(ids.certificateReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.group)}, ${q(ids.litter)}, ${q(ids.animal)}, 'animal_assigned', 'female_only', 270000, 'EUR', '2026-07-02T09:00:00Z');
    insert into public.organization_settings (id, organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents)
    values (${q(ids.paymentSettings)}, ${q(ids.organization)}, 30000, 45000);
    insert into public.organization_document_settings (id, organization_id, signature_city_default)
    values (${q(ids.settings)}, ${q(ids.organization)}, 'Paris');
    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.contractTemplate)}, ${q(ids.organization)}, 'Contrat QA', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.certificateTemplate)}, ${q(ids.organization)}, 'Certificat QA', 'commitment_certificate', 'dog', 'Golden Retriever');
    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed, template_format, template_content, version, lifecycle_status, is_active, published_at, published_by)
    values (${q(ids.contractTemplate)}, ${q(ids.organization)}, ${q(ids.contractTemplate)}, 'Contrat QA', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(contractDefinition))}, 4, 'published', true, now(), ${q(ownerId)}),
           (${q(ids.certificateTemplate)}, ${q(ids.organization)}, ${q(ids.certificateTemplate)}, 'Certificat QA', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 6, 'published', true, now(), ${q(ownerId)});
    insert into public.payments (id, organization_id, contact_id, reservation_id, amount_cents, payment_type, status)
    values (${q(ids.payment)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.contractReservation)}, 75000, 'arrhes', 'paid');
    insert into public.documents (id, organization_id, contact_id, application_id, reservation_id, litter_id, document_type, status, title, signature_required)
    values (${q(ids.legacy)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.contractReservation)}, ${q(ids.litter)}, 'reservation_contract', 'uploaded', 'Contrat legacy QA', true);
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.viewerMembership)}, ${q(ids.organization)}, ${q(ids.viewerUser)}, 'viewer', 'active');
  `);
}

function contractInput(documentId: string, time = capturedAt) {
  return {
    documentId,
    reservationId: ids.contractReservation,
    documentType: "reservation_contract" as const,
    templateId: ids.contractTemplate,
    capturedAt: time,
  };
}

function certificateInput(documentId: string) {
  return {
    documentId,
    reservationId: ids.certificateReservation,
    documentType: "commitment_certificate" as const,
    templateId: ids.certificateTemplate,
    capturedAt,
  };
}

test("orchestrates generated reservation PDFs idempotently and cleans every fixture", async () => {
  test.setTimeout(120_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanupStorage(supabase);
  seed();

  try {
    const invalidInputs = [
      { ...contractInput(ids.contractV1), documentId: "invalid" },
      { ...contractInput(ids.contractV1), reservationId: "invalid" },
      { ...contractInput(ids.contractV1), templateId: "invalid" },
      { ...contractInput(ids.contractV1), documentType: "invoice" },
      { ...contractInput(ids.contractV1), capturedAt: "2026-07-13T12:00:00" },
    ];
    for (const invalidInput of invalidInputs) {
      expect(
        await generateAndStoreReservationDocumentPdfCore(
          // @ts-expect-error The runtime boundary must reject unsupported values.
          invalidInput,
          supabase,
        ),
      ).toEqual({ outcome: "error", error: { stage: "input", code: "invalid_input" } });
    }
    expect(count("documents")).toBe(1);
    expect((await storagePaths()).length).toBe(0);

    const contractV1 = await generateAndStoreReservationDocumentPdfCore(
      contractInput(ids.contractV1),
      supabase,
    );
    expect(contractV1).toMatchObject({
      outcome: "created",
      documentId: ids.contractV1,
      title: contractDefinition.title,
      fileName: `contrat-reservation-${ids.contractReservation}.pdf`,
      version: 1,
      templateId: ids.contractTemplate,
      templateVersion: 4,
      capturedAt,
      replacesDocumentId: ids.legacy,
    });
    if (contractV1.outcome === "error") throw new Error("Contract creation failed");
    const readContract = await readDocumentPdfCore(ids.organization, ids.contractV1, supabase);
    expect(readContract.outcome).toBe("success");
    if (readContract.outcome !== "success") throw new Error("Contract read failed");
    expect(new TextDecoder().decode(readContract.bytes.slice(0, 5))).toBe("%PDF-");
    expect(createHash("sha256").update(readContract.bytes).digest("hex")).toBe(contractV1.fileSha256);
    expect(readContract.document).toMatchObject({
      status: "generated",
      generated_from_template: true,
      generated_at: "2026-07-13T12:15:16+00:00",
      source_template_version: 4,
      signature_required: true,
      title: contractDefinition.title,
      litter_group_id: null,
      replaces_document_id: ids.legacy,
    });
    expect(readContract.document.generation_data).toMatchObject({
      capturedAt,
      sources: {
        reservationId: ids.contractReservation,
        litterId: ids.litter,
        litterGroupId: ids.group,
      },
      reservation: { choiceRank: 3 },
      adoptionProject: {
        litter: {
          availableFrom: "2026-08-01",
          mother: { id: ids.mother, identification: "250269000000029" },
          father: { id: ids.father, identification: "250269000000030" },
        },
      },
    });
    const archivedGenerationData = structuredClone(readContract.document.generation_data);
    sql(`
      update public.litters set available_from = '2026-09-15' where id = ${q(ids.litter)}::uuid;
      update public.animals set identification_number = 'MODIFIE-APRES-GENERATION' where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid);
    `);
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV1),
        supabase,
      ),
    ).toEqual({ ...contractV1, outcome: "existing" });
    const immutableContract = await readDocumentPdfCore(ids.organization, ids.contractV1, supabase);
    expect(immutableContract.outcome).toBe("success");
    if (immutableContract.outcome !== "success") throw new Error("Immutable contract read failed");
    expect(immutableContract.document.generation_data).toEqual(archivedGenerationData);
    expect(createHash("sha256").update(immutableContract.bytes).digest("hex")).toBe(contractV1.fileSha256);
    sql(`
      update public.litters set available_from = '2026-08-01' where id = ${q(ids.litter)}::uuid;
      update public.animals set identification_number = case id
        when ${q(ids.mother)}::uuid then '250269000000029'
        else '250269000000030'
      end where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid);
    `);
    expect(
      sql(`select superseded_at is not null from public.documents where id = ${q(ids.legacy)}::uuid;`),
    ).toBe("t");

    const lifecycleReplayDependencies: GenerateAndStoreReservationDocumentPdfDependencies = {
      prepare: async () => { throw new Error("prepare must not run during lifecycle replay"); },
      render: async () => { throw new Error("render must not run during lifecycle replay"); },
      store: async () => { throw new Error("store must not run during lifecycle replay"); },
    };
    const lifecycleRows = count("documents");
    const lifecyclePaths = await storagePaths();
    sql(`update public.documents set status = 'sent', sent_at = '2026-07-13T12:30:00Z' where id = ${q(ids.contractV1)}::uuid;`);
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV1),
        supabase,
        lifecycleReplayDependencies,
      ),
    ).toEqual({ ...contractV1, outcome: "existing" });
    expect(count("documents")).toBe(lifecycleRows);
    expect(await storagePaths()).toEqual(lifecyclePaths);
    expect(
      sql(`select status || '|' || sent_at::text from public.documents where id = ${q(ids.contractV1)}::uuid;`),
    ).toBe("sent|2026-07-13 12:30:00+00");

    sql(`update public.documents set status = 'signed', signed_at = '2026-07-13T12:45:00Z' where id = ${q(ids.contractV1)}::uuid;`);
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV1),
        supabase,
        lifecycleReplayDependencies,
      ),
    ).toEqual({ ...contractV1, outcome: "existing" });
    expect(count("documents")).toBe(lifecycleRows);
    expect(await storagePaths()).toEqual(lifecyclePaths);
    expect(
      sql(`select status || '|' || sent_at::text || '|' || signed_at::text from public.documents where id = ${q(ids.contractV1)}::uuid;`),
    ).toBe("signed|2026-07-13 12:30:00+00|2026-07-13 12:45:00+00");
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV1, laterCapturedAt),
        supabase,
        lifecycleReplayDependencies,
      ),
    ).toEqual({ outcome: "error", error: { stage: "input", code: "document_id_conflict" } });
    expect(count("documents")).toBe(lifecycleRows);
    expect(await storagePaths()).toEqual(lifecyclePaths);

    const certificate = await generateAndStoreReservationDocumentPdfCore(
      certificateInput(ids.certificateV1),
      supabase,
    );
    expect(certificate).toMatchObject({
      outcome: "created",
      title: certificateDefinition.title,
      fileName: `certificat-engagement-${ids.certificateReservation}.pdf`,
      version: 1,
      templateVersion: 6,
      replacesDocumentId: null,
    });

    const contractV2 = await generateAndStoreReservationDocumentPdfCore(
      contractInput(ids.contractV2, laterCapturedAt),
      supabase,
    );
    expect(contractV2).toMatchObject({
      outcome: "created",
      version: 2,
      replacesDocumentId: ids.contractV1,
    });
    expect(
      sql(`select superseded_at is not null from public.documents where id = ${q(ids.contractV1)}::uuid;`),
    ).toBe("t");

    const pathsBeforeReplay = await storagePaths();
    const rowsBeforeReplay = count("documents");
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV2, laterCapturedAt),
        supabase,
      ),
    ).toEqual({ ...contractV2, outcome: "existing" });
    expect(count("documents")).toBe(rowsBeforeReplay);
    expect(await storagePaths()).toEqual(pathsBeforeReplay);
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV2, "2026-07-13T13:15:16.000+00:00"),
        supabase,
      ),
    ).toEqual({ outcome: "error", error: { stage: "input", code: "document_id_conflict" } });

    sql(`update public.contacts set display_name = 'Source modifiée après génération' where id = ${q(ids.contact)}::uuid;`);
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.contractV2, laterCapturedAt),
        supabase,
      ),
    ).toEqual({ ...contractV2, outcome: "existing" });
    sql(`update public.contacts set display_name = 'Camille Orchestrateur' where id = ${q(ids.contact)}::uuid;`);

    const identical = await Promise.all([
      generateAndStoreReservationDocumentPdfCore(contractInput(ids.identical), supabase),
      generateAndStoreReservationDocumentPdfCore(contractInput(ids.identical), supabase),
    ]);
    expect(identical.map((result) => result.outcome).sort()).toEqual(["created", "existing"]);
    expect(new Set(identical.map((result) => result.outcome === "error" ? "" : result.filePath)).size).toBe(1);

    const pathsBeforeDifferentRace = new Set(await storagePaths());
    const differentRace = await Promise.all([
      generateAndStoreReservationDocumentPdfCore(contractInput(ids.concurrentA, laterCapturedAt), supabase),
      generateAndStoreReservationDocumentPdfCore(contractInput(ids.concurrentB, laterCapturedAt), supabase),
    ]);
    expect(differentRace.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(differentRace.filter((result) => result.outcome === "error")).toHaveLength(1);
    expect(
      Number(sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid and reservation_id = ${q(ids.contractReservation)}::uuid and document_type = 'reservation_contract' and deleted_at is null and superseded_at is null;`)),
    ).toBe(1);
    const pathsAfterDifferentRace = await storagePaths();
    expect(pathsAfterDifferentRace.filter((path) => !pathsBeforeDifferentRace.has(path))).toHaveLength(1);

    expect(
      await generateAndStoreReservationDocumentPdfCore(
        {
          ...contractInput(ids.certificateV1),
          reservationId: ids.certificateReservation,
        },
        supabase,
      ),
    ).toEqual({ outcome: "error", error: { stage: "input", code: "document_id_conflict" } });

    const rowsBeforeFailures = count("documents");
    const pathsBeforeFailures = await storagePaths();
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        { ...contractInput(ids.prepareFailure), templateId: "7e150000-0000-4000-8000-000000000099" },
        supabase,
      ),
    ).toEqual({ outcome: "error", error: { stage: "prepare", code: "template_not_found" } });

    const renderFailureDependencies: GenerateAndStoreReservationDocumentPdfDependencies = {
      prepare: async (input, client) => {
        const { prepareDocumentGenerationSnapshotForReservationCore } = await import("../../src/features/documents/prepare-document-generation-snapshot-core");
        return prepareDocumentGenerationSnapshotForReservationCore(input, client);
      },
      render: async () => ({ outcome: "error", error: { code: "render_error" } }),
      store: async () => { throw new Error("store must not be called"); },
    };
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.renderFailure),
        supabase,
        renderFailureDependencies,
      ),
    ).toEqual({ outcome: "error", error: { stage: "render", code: "render_error" } });

    const realDependencies = await import("../../src/features/documents/prepare-document-generation-snapshot-core");
    const renderer = await import("../../src/features/documents/document-pdf-renderer-core");
    const storeFailureDependencies: GenerateAndStoreReservationDocumentPdfDependencies = {
      prepare: realDependencies.prepareDocumentGenerationSnapshotForReservationCore,
      render: renderer.renderDocumentPdfCore,
      store: async () => ({
        outcome: "error",
        error: { code: "storage_error", message: "raw secret storage failure" },
      }),
    };
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.storeFailure),
        supabase,
        storeFailureDependencies,
      ),
    ).toEqual({ outcome: "error", error: { stage: "store", code: "storage_error" } });
    expect(count("documents")).toBe(rowsBeforeFailures);
    expect(await storagePaths()).toEqual(pathsBeforeFailures);

    const viewer = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const viewerAuth = await viewer.auth.signInWithPassword({ email: viewerEmail, password: viewerPassword });
    expect(viewerAuth.error).toBeNull();
    expect(
      await generateAndStoreReservationDocumentPdfCore(
        contractInput(ids.viewerDocument),
        viewer,
      ),
    ).toEqual({ outcome: "error", error: { stage: "prepare", code: "forbidden" } });

    expect(await storagePaths()).toEqual(pathsBeforeFailures);
    expect(count("documents")).toBe(rowsBeforeFailures);
  } finally {
    await cleanupStorage(supabase);
    cleanupRows();
    expect(await storagePaths()).toEqual([]);
    for (const table of [
      "documents", "payments", "reservations", "document_templates", "document_template_families",
      "organization_document_settings", "organization_settings", "animals",
      "litters", "litter_groups", "applications", "contacts", "memberships",
    ]) {
      expect(count(table), `${table} fixtures must be hard-deleted`).toBe(0);
    }
    expect(Number(sql(`select count(*) from public.organizations where id = ${q(ids.organization)}::uuid;`))).toBe(0);
    expect(Number(sql(`select count(*) from auth.identities where user_id = ${q(ids.viewerUser)}::uuid;`))).toBe(0);
    expect(Number(sql(`select count(*) from auth.users where id = ${q(ids.viewerUser)}::uuid;`))).toBe(0);
  }
});
