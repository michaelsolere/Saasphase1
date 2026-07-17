import { expect, test } from "@playwright/test";

import {
  parseDocumentTemplateDefinition,
  type CommitmentCertificateTemplateDefinition,
  type ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import { runE2eSqlSync } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const templateIds = [
  "99130000-0000-4000-8000-000000000001",
  "99130000-0000-4000-8000-000000000002",
  "99130000-0000-4000-8000-000000000003",
  "99130000-0000-4000-8000-000000000004",
  "99130000-0000-4000-8000-000000000005",
  "99130000-0000-4000-8000-000000000006",
] as const;

const commitmentCertificate: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat d’engagement",
  body: "Contenu E2E du certificat.\nAdoptant : [[adoptant.nom_complet]]",
};

const reservationContract: ReservationContractTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de réservation",
  body: "Contenu E2E du contrat.\nAdoptant : [[adoptant.nom_complet]]\nPrix : [[reservation.prix_formate]]",
};

const v1ContractShape = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat V1",
  preamble: ["Préambule."],
  clauses: {
    reservationPurpose: ["Objet."],
    priceAndPayments: ["Prix."],
    deposit: ["Arrhes."],
    cancellationAndRefund: ["Annulation."],
    postponementAndCredit: ["Report."],
    potentialWithholding: ["Retenue."],
    finalConditions: ["Final."],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};

const v1CertificateShape = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat V1",
  introduction: ["Introduction."],
  sections: {
    animalNeeds: ["Besoins."],
    health: ["Santé."],
    educationAndBehavior: ["Éducation."],
    costsAndConstraints: ["Coûts."],
    holderObligations: ["Obligations."],
  },
  acknowledgmentText: ["Reconnaissance."],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

function parse(
  documentType: string,
  content: unknown,
  templateFormat = "json",
) {
  return parseDocumentTemplateDefinition({
    templateFormat,
    documentType,
    templateContent:
      typeof content === "string" ? content : JSON.stringify(content),
  });
}

function sql(sqlText: string) {
  return runE2eSqlSync(sqlText);
}

function expectSqlFailure(sqlText: string, expected: RegExp) {
  expect(() => sql(sqlText)).toThrow(expected);
}

function cleanupFixtures() {
  sql(`
    delete from public.document_templates
    where id in (${templateIds.map((id) => `'${id}'`).join(", ")});
    delete from public.document_template_families
    where id in (${templateIds.map((id) => `'${id}'`).join(", ")});
  `);
}

function assertNoFixtures() {
  const count = Number(sql(`
    select
      (select count(*) from public.document_templates
       where id in (${templateIds.map((id) => `'${id}'`).join(", ")}))
      + (select count(*) from public.document_template_families
         where id in (${templateIds.map((id) => `'${id}'`).join(", ")}));
  `));
  expect(count).toBe(0);
}

test("validates versioned JSON document template definitions and SQL constraints", () => {
  cleanupFixtures();

  try {
    sql(`
      insert into public.document_template_families
        (id, organization_id, name, document_type)
      values
        ('${templateIds[0]}', '${organizationId}', 'QA JSON template', 'reservation_contract'),
        ('${templateIds[1]}', '${organizationId}', 'QA HTML', 'other'),
        ('${templateIds[2]}', '${organizationId}', 'QA Markdown', 'other'),
        ('${templateIds[3]}', '${organizationId}', 'QA DOCX', 'other'),
        ('${templateIds[4]}', '${organizationId}', 'QA PDF form', 'other'),
        ('${templateIds[5]}', '${organizationId}', 'QA Other', 'other');
    `);

    const certificateResult = parse(
      "commitment_certificate",
      commitmentCertificate,
    );
    expect(certificateResult).toEqual({
      success: true,
      definition: commitmentCertificate,
    });

    const contractResult = parse("reservation_contract", reservationContract);
    expect(contractResult).toEqual({
      success: true,
      definition: reservationContract,
    });

    expect(parse("reservation_contract", "{invalid")).toEqual({
      success: false,
      error: "invalid_json",
    });
    expect(parse("reservation_contract", [])).toEqual({
      success: false,
      error: "invalid_template_content",
    });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        schemaVersion: 3,
      }),
    ).toEqual({ success: false, error: "unsupported_schema_version" });
    expect(parse("reservation_contract", v1ContractShape)).toEqual({
      success: false,
      error: "unsupported_schema_version",
    });
    expect(parse("commitment_certificate", v1CertificateShape)).toEqual({
      success: false,
      error: "unsupported_schema_version",
    });
    expect(parse("commitment_certificate", reservationContract)).toEqual({
      success: false,
      error: "document_type_mismatch",
    });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        unexpected: true,
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        preamble: ["x"],
        clauses: {},
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });

    expect(
      parse("reservation_contract", {
        ...reservationContract,
        title: "   ",
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        body: "   ",
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        body: "x".repeat(30_001),
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(parse("reservation_contract", reservationContract, "html")).toEqual(
      { success: false, error: "invalid_format" },
    );

    sql(`
      insert into public.document_templates (
        id, organization_id, family_id, name, document_type, template_format,
        template_content, lifecycle_status, is_active, published_at, published_by
      ) values (
        '${templateIds[0]}', '${organizationId}', '${templateIds[0]}', 'QA JSON template',
        'reservation_contract', 'json',
        $json$${JSON.stringify(reservationContract)}$json$, 'published', true,
        now(), '${ownerId}'
      );
    `);

    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, template_format,
        template_content, version, lifecycle_status, is_active,
        publication_metadata_is_legacy
      ) values (
        '${templateIds[1]}', '${organizationId}', '${templateIds[0]}', 'QA invalid JSON',
        'reservation_contract', 'json', '{invalid', 2, 'retired', false, true
      );`,
      /invalid input syntax for type json/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, template_format,
        template_content, version, lifecycle_status, is_active,
        publication_metadata_is_legacy
      ) values (
        '${templateIds[2]}', '${organizationId}', '${templateIds[0]}', 'QA null JSON',
        'reservation_contract', 'json', null, 3, 'retired', false, true
      );`,
      /document_templates_json_content_check/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, template_format,
        template_content, version, lifecycle_status, is_active,
        publication_metadata_is_legacy
      ) values (
        '${templateIds[3]}', '${organizationId}', '${templateIds[0]}', 'QA array JSON',
        'reservation_contract', 'json', '[]', 4, 'retired', false, true
      );`,
      /document_templates_json_content_check/,
    );

    sql(`
      insert into public.document_templates (
        id, organization_id, family_id, name, document_type, template_format,
        template_content, lifecycle_status, is_active, published_at, published_by
      ) values
        ('${templateIds[1]}', '${organizationId}', '${templateIds[1]}', 'QA HTML', 'other', 'html', null, 'published', true, now(), '${ownerId}'),
        ('${templateIds[2]}', '${organizationId}', '${templateIds[2]}', 'QA Markdown', 'other', 'markdown', 'not json', 'published', true, now(), '${ownerId}'),
        ('${templateIds[3]}', '${organizationId}', '${templateIds[3]}', 'QA DOCX', 'other', 'docx', null, 'published', true, now(), '${ownerId}'),
        ('${templateIds[4]}', '${organizationId}', '${templateIds[4]}', 'QA PDF form', 'other', 'pdf_form', null, 'published', true, now(), '${ownerId}'),
        ('${templateIds[5]}', '${organizationId}', '${templateIds[5]}', 'QA Other', 'other', 'other', null, 'published', true, now(), '${ownerId}');
    `);

    expect(Number(sql(`
      select count(*) from public.document_templates
      where id in (${templateIds.map((id) => `'${id}'`).join(", ")});
    `))).toBe(6);
  } finally {
    cleanupFixtures();
    assertNoFixtures();
  }
});
