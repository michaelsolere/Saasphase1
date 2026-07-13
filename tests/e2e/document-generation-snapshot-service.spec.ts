import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { prepareDocumentGenerationSnapshotForReservationCore } from "../../src/features/documents/document-generation-snapshot-service-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "9a140000-0000-4000-8000-000000000001",
  membership: "9a140000-0000-4000-8000-000000000002",
  contact: "9a140000-0000-4000-8000-000000000003",
  application: "9a140000-0000-4000-8000-000000000004",
  group: "9a140000-0000-4000-8000-000000000005",
  litter: "9a140000-0000-4000-8000-000000000006",
  animal: "9a140000-0000-4000-8000-000000000007",
  groupReservation: "9a140000-0000-4000-8000-000000000008",
  animalReservation: "9a140000-0000-4000-8000-000000000009",
  incompleteReservation: "9a140000-0000-4000-8000-000000000010",
  contractTemplate: "9a140000-0000-4000-8000-000000000011",
  certificateTemplate: "9a140000-0000-4000-8000-000000000012",
  representative: "9a140000-0000-4000-8000-000000000013",
  documentSettings: "9a140000-0000-4000-8000-000000000014",
  paymentSettings: "9a140000-0000-4000-8000-000000000015",
  paidPreReservation: "9a140000-0000-4000-8000-000000000016",
  paidArrhes: "9a140000-0000-4000-8000-000000000017",
  cancelledArrhes: "9a140000-0000-4000-8000-000000000018",
  pendingArrhes: "9a140000-0000-4000-8000-000000000019",
  deletedArrhes: "9a140000-0000-4000-8000-000000000020",
  viewerUser: "9a140000-0000-4000-8000-000000000021",
  viewerIdentity: "9a140000-0000-4000-8000-000000000022",
  viewerMembership: "9a140000-0000-4000-8000-000000000023",
  conflictingGroup: "9a140000-0000-4000-8000-000000000024",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const capturedAt = "2026-07-13T10:11:12.000Z";
const viewerEmail = "snapshot-viewer@saasphase1.invalid";
const viewerPassword = "SnapshotViewer-2026!";

const contractDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat QA",
  preamble: ["Préambule."],
  clauses: {
    reservationPurpose: ["Objet."], priceAndPayments: ["Prix."], deposit: ["Arrhes."],
    cancellationAndRefund: ["Annulation."], postponementAndCredit: ["Report."],
    potentialWithholding: ["Retenue."], finalConditions: ["Final."],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat QA",
  introduction: ["Introduction."],
  sections: {
    animalNeeds: ["Besoins."], health: ["Santé."], educationAndBehavior: ["Éducation."],
    costsAndConstraints: ["Contraintes."], holderObligations: ["Obligations."],
  },
  acknowledgmentText: ["Reconnaissance."],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function cleanup() {
  sql(`
    delete from public.documents where organization_id = ${q(ids.organization)}::uuid;
    delete from public.payments where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_templates where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_document_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_representatives where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organization_settings where organization_id = ${q(ids.organization)}::uuid;
    delete from public.animals where organization_id = ${q(ids.organization)}::uuid;
    delete from public.litters where organization_id = ${q(ids.organization)}::uuid;
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
  cleanup();
  sql(`
    insert into public.organizations (id, name, legal_name, legal_form, slug, email, phone, website_url, address_line1, postal_code, city, country, siret)
    values (${q(ids.organization)}, 'Élevage Snapshot QA', 'Snapshot QA SARL', 'company', 'snapshot-qa', 'seller@example.invalid', '+33102030405', 'https://example.invalid', '1 rue QA', '75001', 'Paris', 'FR', '12345678900011');
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');
    insert into public.contacts (id, organization_id, display_name, first_name, last_name, email, phone, address_line1, postal_code, city, country)
    values (${q(ids.contact)}, ${q(ids.organization)}, 'Camille Snapshot', 'Camille', 'Snapshot', 'adopter@example.invalid', '+33601020304', '2 rue Test', '69001', 'Lyon', 'FR');
    insert into public.litter_groups (id, organization_id, name, species)
    values (${q(ids.group)}, ${q(ids.organization)}, 'Groupe Automne QA', 'dog'),
           (${q(ids.conflictingGroup)}, ${q(ids.organization)}, 'Groupe Concurrent QA', 'dog');
    insert into public.applications (id, organization_id, contact_id, species, breed, desired_sex_preference)
    values (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'female_only');
    insert into public.litters (id, organization_id, litter_group_id, name, species, breed, actual_birth_date)
    values (${q(ids.litter)}, ${q(ids.organization)}, ${q(ids.group)}, 'Portée QA', 'dog', 'Golden Retriever', '2026-06-01');
    insert into public.animals (id, organization_id, litter_id, official_name, call_name, species, breed, sex, birth_date, identification_number, lof_number)
    values (${q(ids.animal)}, ${q(ids.organization)}, ${q(ids.litter)}, 'NOVA SNAPSHOT', 'Nova', 'dog', 'Golden Retriever', 'female', '2026-06-01', '250269000000001', 'LOF-QA-1');
    insert into public.reservations (id, organization_id, contact_id, application_id, litter_group_id, status, reserved_sex_preference, price_cents, currency, adoption_planned_at, created_at)
    values (${q(ids.groupReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.group)}, 'active', 'male_only', 250000, 'EUR', '2026-08-15', '2026-07-01T09:00:00Z');
    insert into public.reservations (id, organization_id, contact_id, application_id, litter_group_id, litter_id, animal_id, status, reserved_sex_preference, price_cents, currency, created_at)
    values (${q(ids.animalReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, ${q(ids.group)}, ${q(ids.litter)}, ${q(ids.animal)}, 'animal_assigned', 'female_only', 270000, 'EUR', '2026-07-02T09:00:00Z');
    insert into public.reservations (id, organization_id, contact_id, litter_group_id, status, reserved_sex_preference, currency)
    values (${q(ids.incompleteReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.group)}, 'draft', 'no_preference', 'EUR');
    insert into public.organization_settings (id, organization_id, default_pre_reservation_deposit_cents, default_arrhes_second_payment_cents)
    values (${q(ids.paymentSettings)}, ${q(ids.organization)}, 30000, 45000);
    insert into public.organization_representatives (id, organization_id, display_name, first_name, last_name, representative_role, email, is_default_signatory, is_active)
    values (${q(ids.representative)}, ${q(ids.organization)}, 'Alice Signataire', 'Alice', 'Signataire', 'Gérante', 'alice@example.invalid', true, true);
    insert into public.organization_document_settings (id, organization_id, mediator_name, mediator_contact, mediator_website_url, signature_city_default)
    values (${q(ids.documentSettings)}, ${q(ids.organization)}, 'Médiateur QA', 'contact médiateur', 'https://mediateur.example.invalid', 'Paris');
    insert into public.document_templates (id, organization_id, name, document_type, species, breed, template_format, template_content, version, is_active)
    values (${q(ids.contractTemplate)}, ${q(ids.organization)}, 'Contrat QA', 'reservation_contract', 'DOG', ' golden retriever ', 'json', ${q(JSON.stringify(contractDefinition))}, 7, true),
           (${q(ids.certificateTemplate)}, ${q(ids.organization)}, 'Certificat QA', 'commitment_certificate', 'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(certificateDefinition))}, 9, true);
    insert into public.payments (id, organization_id, contact_id, reservation_id, amount_cents, payment_type, status, deleted_at)
    values (${q(ids.paidPreReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.groupReservation)}, 30000, 'pre_reservation_deposit_refundable', 'paid', null),
           (${q(ids.paidArrhes)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.groupReservation)}, 45000, 'arrhes', 'paid', null),
           (${q(ids.cancelledArrhes)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.groupReservation)}, 9000, 'arrhes', 'cancelled', null),
           (${q(ids.pendingArrhes)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.groupReservation)}, 8000, 'arrhes', 'pending', null),
           (${q(ids.deletedArrhes)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.groupReservation)}, 7000, 'arrhes', 'paid', now());
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.viewerMembership)}, ${q(ids.organization)}, ${q(ids.viewerUser)}, 'viewer', 'active');
  `);
}

test("prepares validated reservation snapshots from authenticated Supabase reads and cleans fixtures", async () => {
  test.setTimeout(60_000);
  seed();
  const supabase = await createAuthenticatedSupabaseClient();
  const documentsBefore = Number(sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid;`));

  try {
    const contract = await prepareDocumentGenerationSnapshotForReservationCore({
      reservationId: ids.groupReservation,
      documentType: "reservation_contract",
      templateId: ids.contractTemplate,
      capturedAt,
    }, supabase);
    expect(contract.outcome, JSON.stringify(contract)).toBe("success");
    if (contract.outcome !== "success" || contract.snapshot.documentType !== "reservation_contract") throw new Error("Expected contract snapshot");
    expect(contract.snapshot).toMatchObject({
      capturedAt,
      sources: { organizationId: ids.organization, reservationId: ids.groupReservation, contactId: ids.contact, applicationId: ids.application, litterId: null, litterGroupId: ids.group, animalId: null },
      seller: { tradeName: "Élevage Snapshot QA", legalName: "Snapshot QA SARL" },
      adopter: { displayName: "Camille Snapshot", email: "adopter@example.invalid" },
      adoptionProject: { species: "dog", breed: "Golden Retriever", sexPreference: "male_only", litter: null, litterGroup: { id: ids.group }, animal: null },
      reservation: { id: ids.groupReservation, status: "active", createdAt: "2026-07-01T09:00:00+00:00", plannedAdoptionDate: "2026-08-15" },
      financials: { priceCents: 250000, paidCents: 75000, refundedCents: 0, netPaidCents: 75000, remainingCents: 175000, depositPaidCents: 75000, fullDepositTargetCents: 75000 },
    });
    expect(contract.templateId).toBe(ids.contractTemplate);
    expect(contract.templateVersion).toBe(7);
    expect(contract.templateContent).toBe(JSON.stringify(contractDefinition));
    expect(contract.snapshot.template.templateContentSha256).toBe(createHash("sha256").update(JSON.stringify(contractDefinition)).digest("hex"));

    const certificate = await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.animalReservation, documentType: "commitment_certificate", templateId: ids.certificateTemplate, capturedAt }, supabase);
    expect(certificate.outcome).toBe("success");
    if (certificate.outcome !== "success") throw new Error("Expected certificate snapshot");
    expect(certificate.snapshot).not.toHaveProperty("financials");
    expect(certificate.snapshot).not.toHaveProperty("mediator");
    expect(certificate.snapshot.adoptionProject).toMatchObject({ litter: { id: ids.litter }, animal: { id: ids.animal, callName: "Nova", identification: "250269000000001" } });
    expect(certificate.templateVersion).toBe(9);

    const expectIncompleteAfterMutation = async (
      mutation: string,
      restore: string,
    ) => {
      sql(mutation);
      try {
        expect(
          await prepareDocumentGenerationSnapshotForReservationCore({
            reservationId: ids.animalReservation,
            documentType: "commitment_certificate",
            templateId: ids.certificateTemplate,
            capturedAt,
          }, supabase),
        ).toEqual({ outcome: "error", error: { code: "incomplete_source_data" } });
      } finally {
        sql(restore);
      }
    };

    await expectIncompleteAfterMutation(
      `update public.applications set deleted_at = now() where id = ${q(ids.application)}::uuid;`,
      `update public.applications set deleted_at = null where id = ${q(ids.application)}::uuid;`,
    );
    await expectIncompleteAfterMutation(
      `update public.litters set deleted_at = now() where id = ${q(ids.litter)}::uuid;`,
      `update public.litters set deleted_at = null where id = ${q(ids.litter)}::uuid;`,
    );
    await expectIncompleteAfterMutation(
      `update public.animals set deleted_at = now() where id = ${q(ids.animal)}::uuid;`,
      `update public.animals set deleted_at = null where id = ${q(ids.animal)}::uuid;`,
    );
    await expectIncompleteAfterMutation(
      `update public.litter_groups set deleted_at = now() where id = ${q(ids.group)}::uuid;`,
      `update public.litter_groups set deleted_at = null where id = ${q(ids.group)}::uuid;`,
    );
    await expectIncompleteAfterMutation(
      `update public.reservations set litter_group_id = ${q(ids.conflictingGroup)}::uuid where id = ${q(ids.animalReservation)}::uuid;`,
      `update public.reservations set litter_group_id = ${q(ids.group)}::uuid where id = ${q(ids.animalReservation)}::uuid;`,
    );

    sql(`update public.reservations set litter_group_id = null where id = ${q(ids.animalReservation)}::uuid;`);
    try {
      const inheritedGroup = await prepareDocumentGenerationSnapshotForReservationCore({
        reservationId: ids.animalReservation,
        documentType: "commitment_certificate",
        templateId: ids.certificateTemplate,
        capturedAt,
      }, supabase);
      expect(inheritedGroup.outcome).toBe("success");
      if (inheritedGroup.outcome !== "success") throw new Error("Expected inherited litter group snapshot");
      expect(inheritedGroup.snapshot.sources.litterGroupId).toBe(ids.group);
      expect(inheritedGroup.snapshot.adoptionProject.litterGroup).toEqual({
        id: ids.group,
        name: "Groupe Automne QA",
      });
    } finally {
      sql(`update public.reservations set litter_group_id = ${q(ids.group)}::uuid where id = ${q(ids.animalReservation)}::uuid;`);
    }

    expect(await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: "00000000-0000-4000-8000-000000000404", documentType: "reservation_contract", templateId: ids.contractTemplate, capturedAt }, supabase)).toEqual({ outcome: "error", error: { code: "reservation_not_found" } });
    expect(await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.incompleteReservation, documentType: "reservation_contract", templateId: ids.contractTemplate, capturedAt }, supabase)).toEqual({ outcome: "error", error: { code: "incomplete_source_data" } });

    for (const mutation of [
      "is_active = false",
      "deleted_at = now()",
      "template_format = 'html'",
      "species = 'cat'",
      "breed = 'Labrador Retriever'",
    ]) {
      sql(`update public.document_templates set ${mutation} where id = ${q(ids.contractTemplate)}::uuid;`);
      const refused = await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.groupReservation, documentType: "reservation_contract", templateId: ids.contractTemplate, capturedAt }, supabase);
      expect(refused.outcome).toBe("error");
      sql(`update public.document_templates set is_active = true, deleted_at = null, template_format = 'json', document_type = 'reservation_contract', species = 'dog', breed = 'Golden Retriever' where id = ${q(ids.contractTemplate)}::uuid;`);
    }
    expect(await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.groupReservation, documentType: "reservation_contract", templateId: ids.certificateTemplate, capturedAt }, supabase)).toEqual({ outcome: "error", error: { code: "template_mismatch" } });

    sql(`delete from public.organization_representatives where id = ${q(ids.representative)}::uuid; delete from public.organization_document_settings where id = ${q(ids.documentSettings)}::uuid;`);
    const optionalMissing = await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.groupReservation, documentType: "reservation_contract", templateId: ids.contractTemplate, capturedAt }, supabase);
    expect(optionalMissing.outcome).toBe("success");
    if (optionalMissing.outcome === "success") {
      expect(optionalMissing.snapshot.signer).toBeNull();
      expect(optionalMissing.snapshot.signature.defaultCity).toBeNull();
    }

    const viewer = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const signIn = await viewer.auth.signInWithPassword({ email: viewerEmail, password: viewerPassword });
    expect(signIn.error).toBeNull();
    expect(await prepareDocumentGenerationSnapshotForReservationCore({ reservationId: ids.groupReservation, documentType: "reservation_contract", templateId: ids.contractTemplate, capturedAt }, viewer)).toEqual({ outcome: "error", error: { code: "forbidden" } });

    expect(Number(sql(`select count(*) from public.documents where organization_id = ${q(ids.organization)}::uuid;`))).toBe(documentsBefore);
  } finally {
    cleanup();
    const count = Number(sql(`select count(*) from (select id from public.organizations where id = ${q(ids.organization)}::uuid union all select id from public.memberships where organization_id = ${q(ids.organization)}::uuid union all select id from public.contacts where organization_id = ${q(ids.organization)}::uuid union all select id from public.applications where organization_id = ${q(ids.organization)}::uuid union all select id from public.litter_groups where organization_id = ${q(ids.organization)}::uuid union all select id from public.litters where organization_id = ${q(ids.organization)}::uuid union all select id from public.animals where organization_id = ${q(ids.organization)}::uuid union all select id from public.reservations where organization_id = ${q(ids.organization)}::uuid union all select id from public.payments where organization_id = ${q(ids.organization)}::uuid union all select id from public.document_templates where organization_id = ${q(ids.organization)}::uuid union all select id from public.documents where organization_id = ${q(ids.organization)}::uuid union all select id from auth.users where id = ${q(ids.viewerUser)}::uuid) fixtures;`));
    expect(count).toBe(0);
  }
});
