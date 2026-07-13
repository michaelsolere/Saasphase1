import { expect, test } from "@playwright/test";

import {
  parseDocumentTemplateDefinition,
  type CommitmentCertificateTemplateDefinition,
  type ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import { runE2eSqlSync } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const templateIds = [
  "99130000-0000-4000-8000-000000000001",
  "99130000-0000-4000-8000-000000000002",
  "99130000-0000-4000-8000-000000000003",
  "99130000-0000-4000-8000-000000000004",
  "99130000-0000-4000-8000-000000000005",
  "99130000-0000-4000-8000-000000000006",
] as const;

const commitmentCertificate: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat d’engagement",
  introduction: ["Texte introductif stable."],
  sections: {
    animalNeeds: ["Besoins de l’animal."],
    health: ["Principes de santé."],
    educationAndBehavior: ["Éducation et comportement."],
    costsAndConstraints: ["Coûts et contraintes."],
    holderObligations: ["Obligations du détenteur."],
  },
  acknowledgmentText: ["Texte de reconnaissance."],
  signatureLabels: {
    holder: "Le détenteur",
    issuer: "Le cédant",
  },
};

const reservationContract: ReservationContractTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de réservation",
  preamble: ["Préambule stable."],
  clauses: {
    reservationPurpose: ["Objet de la réservation."],
    priceAndPayments: ["Prix et paiements."],
    deposit: ["Arrhes."],
    cancellationAndRefund: ["Annulation et remboursement."],
    postponementAndCredit: ["Report et avoir."],
    potentialWithholding: ["Retenue éventuelle."],
    finalConditions: ["Conditions finales."],
  },
  signatureLabels: {
    breeder: "L’éleveur",
    reservingParty: "Le réservant",
  },
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
  `);
}

function assertNoFixtures() {
  const count = Number(sql(`
    select count(*)
    from public.document_templates
    where id in (${templateIds.map((id) => `'${id}'`).join(", ")});
  `));
  expect(count).toBe(0);
}

test("validates versioned JSON document template definitions and SQL constraints", () => {
  cleanupFixtures();

  try {
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
        schemaVersion: 2,
      }),
    ).toEqual({ success: false, error: "unsupported_schema_version" });
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

    const missingSection = structuredClone(commitmentCertificate) as Record<
      string,
      unknown
    >;
    delete (missingSection.sections as Record<string, unknown>).health;
    expect(parse("commitment_certificate", missingSection)).toEqual({
      success: false,
      error: "invalid_template_content",
    });

    expect(
      parse("reservation_contract", {
        ...reservationContract,
        title: "   ",
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        preamble: [],
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(
      parse("reservation_contract", {
        ...reservationContract,
        preamble: ["x".repeat(2_001)],
      }),
    ).toEqual({ success: false, error: "invalid_template_content" });
    expect(parse("reservation_contract", reservationContract, "html")).toEqual(
      { success: false, error: "invalid_format" },
    );

    sql(`
      insert into public.document_templates (
        id, organization_id, name, document_type, template_format, template_content
      ) values (
        '${templateIds[0]}', '${organizationId}', 'QA JSON template',
        'reservation_contract', 'json',
        $json$${JSON.stringify(reservationContract)}$json$
      );
    `);

    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, name, document_type, template_format, template_content
      ) values (
        '${templateIds[1]}', '${organizationId}', 'QA invalid JSON',
        'reservation_contract', 'json', '{invalid'
      );`,
      /invalid input syntax for type json/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, name, document_type, template_format, template_content
      ) values (
        '${templateIds[2]}', '${organizationId}', 'QA null JSON',
        'reservation_contract', 'json', null
      );`,
      /document_templates_json_content_check/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, name, document_type, template_format, template_content
      ) values (
        '${templateIds[3]}', '${organizationId}', 'QA array JSON',
        'reservation_contract', 'json', '[]'
      );`,
      /document_templates_json_content_check/,
    );

    sql(`
      insert into public.document_templates (
        id, organization_id, name, document_type, template_format, template_content
      ) values
        ('${templateIds[1]}', '${organizationId}', 'QA HTML', 'other', 'html', null),
        ('${templateIds[2]}', '${organizationId}', 'QA Markdown', 'other', 'markdown', 'not json'),
        ('${templateIds[3]}', '${organizationId}', 'QA DOCX', 'other', 'docx', null),
        ('${templateIds[4]}', '${organizationId}', 'QA PDF form', 'other', 'pdf_form', null),
        ('${templateIds[5]}', '${organizationId}', 'QA Other', 'other', 'other', null);
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
