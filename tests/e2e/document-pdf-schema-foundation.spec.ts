import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "99000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const contactId = "99000000-0000-4000-8000-000000000010";
const reservationId = "99000000-0000-4000-8000-000000000020";
const templateId = "99000000-0000-4000-8000-000000000030";
const activeGroupId = "99000000-0000-4000-8000-000000000040";
const cancelledGroupId = "99000000-0000-4000-8000-000000000041";
const otherGroupId = "99000000-0000-4000-8000-000000000042";
const activeLitterId = "99000000-0000-4000-8000-000000000050";
const archivedLitterId = "99000000-0000-4000-8000-000000000051";
const deletedLitterId = "99000000-0000-4000-8000-000000000052";
const documentPrefix = "99000000-0000-4000-8000-0000000001";
const ownDocumentId = `${documentPrefix}01`;
const sha256 = "a".repeat(64);
const ownPath = `organizations/${organizationId}/documents/${ownDocumentId}/v1/${sha256}.pdf`;
const otherPath = `organizations/${otherOrganizationId}/documents/${ownDocumentId}/v1/${sha256}.pdf`;

function sql(sqlText: string) {
  return runE2eSqlSync(sqlText);
}

function expectSqlFailure(sqlText: string, expected: RegExp) {
  expect(() => sql(sqlText)).toThrow(expected);
}

function insertDocument(
  id: string,
  fields: string,
  values: string,
  type = "welcome_booklet",
) {
  return `
    insert into public.documents (
      id, organization_id, document_type, title, created_by, updated_by${fields}
    ) values (
      '${id}', '${organizationId}', '${type}', 'QA PDF schema ${id}',
      '${userId}', '${userId}'${values}
    );
  `;
}

function cleanupSql() {
  sql(`
    delete from public.documents where id::text like '99000000-%';
    delete from public.document_templates where id = '${templateId}';
    delete from public.reservations where id = '${reservationId}';
    delete from public.contacts where id = '${contactId}';
    delete from public.litters where id::text like '99000000-%';
    delete from public.litter_groups where id::text like '99000000-%';
    delete from public.organizations where id = '${otherOrganizationId}';
  `);
}

function assertNoFixtures() {
  const count = Number(sql(`
    select
      (select count(*) from storage.objects
       where bucket_id = 'documents' and name like '%99000000-%')
      + (select count(*) from public.documents where id::text like '99000000-%')
      + (select count(*) from public.document_templates where id::text like '99000000-%')
      + (select count(*) from public.reservations where id::text like '99000000-%')
      + (select count(*) from public.contacts where id::text like '99000000-%')
      + (select count(*) from public.litters where id::text like '99000000-%')
      + (select count(*) from public.litter_groups where id::text like '99000000-%')
      + (select count(*) from public.organizations where id::text like '99000000-%');
  `));
  expect(count).toBe(0);
}

test("validates document PDF schema and authenticated Storage policies", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const initialStorageCleanup = await supabase.storage
    .from("documents")
    .remove([ownPath, otherPath]);
  if (initialStorageCleanup.error) {
    throw new Error(`initial Storage cleanup: ${initialStorageCleanup.error.message}`);
  }
  cleanupSql();

  try {
    sql(`
      insert into public.organizations (id, name, slug)
      values ('${otherOrganizationId}', 'QA other organization', 'qa-document-pdf-other');
      insert into public.litter_groups (id, organization_id, name, status)
      values
        ('${activeGroupId}', '${organizationId}', 'QA active group', 'planned'),
        ('${cancelledGroupId}', '${organizationId}', 'QA cancelled group', 'cancelled'),
        ('${otherGroupId}', '${otherOrganizationId}', 'QA other group', 'planned');
      insert into public.litters (id, organization_id, name, status, deleted_at)
      values
        ('${activeLitterId}', '${organizationId}', 'QA active litter', 'planned', null),
        ('${archivedLitterId}', '${organizationId}', 'QA archived litter', 'archived', null),
        ('${deletedLitterId}', '${organizationId}', 'QA deleted litter', 'planned', now());
      insert into public.contacts (id, organization_id, display_name)
      values ('${contactId}', '${organizationId}', 'QA PDF contact');
      insert into public.reservations (id, organization_id, contact_id)
      values ('${reservationId}', '${organizationId}', '${contactId}');
      insert into public.document_templates (
        id, organization_id, name, document_type, version
      ) values (
        '${templateId}', '${organizationId}', 'QA PDF template', 'reservation_contract', 1
      );
    `);

    sql(insertDocument(`${documentPrefix}10`, ", litter_id", `, '${activeLitterId}'`));
    sql(insertDocument(`${documentPrefix}11`, ", litter_group_id", `, '${activeGroupId}'`));

    expectSqlFailure(
      insertDocument(
        `${documentPrefix}12`,
        ", litter_id, litter_group_id",
        `, '${activeLitterId}', '${activeGroupId}'`,
      ),
      /documents_welcome_booklet_scope_check/,
    );
    expectSqlFailure(
      insertDocument(`${documentPrefix}13`, "", ""),
      /documents_welcome_booklet_scope_check/,
    );
    expectSqlFailure(
      insertDocument(`${documentPrefix}14`, ", litter_group_id", `, '${otherGroupId}'`),
      /documents_litter_group_organization_fk|active litter group/,
    );
    expectSqlFailure(
      insertDocument(`${documentPrefix}15`, ", litter_id", `, '${archivedLitterId}'`),
      /active litter/,
    );
    expectSqlFailure(
      insertDocument(`${documentPrefix}16`, ", litter_id", `, '${deletedLitterId}'`),
      /active litter/,
    );
    expectSqlFailure(
      insertDocument(`${documentPrefix}17`, ", litter_group_id", `, '${cancelledGroupId}'`),
      /active litter group/,
    );

    for (const type of ["reservation_contract", "commitment_certificate"]) {
      expectSqlFailure(
        insertDocument(`${documentPrefix}${type === "reservation_contract" ? "20" : "21"}`, "", "", type),
        /documents_individual_pdf_scope_check/,
      );
      expectSqlFailure(
        insertDocument(
          `${documentPrefix}${type === "reservation_contract" ? "22" : "23"}`,
          ", reservation_id",
          `, '${reservationId}'`,
          type,
        ),
        /documents_individual_pdf_scope_check/,
      );
    }

    expectSqlFailure(
      insertDocument(`${documentPrefix}30`, ", litter_id", `, '${activeLitterId}'`),
      /documents_current_welcome_booklet_litter_idx/,
    );
    sql(`update public.documents set superseded_at = now() where id = '${documentPrefix}10';`);
    sql(insertDocument(
      `${documentPrefix}30`,
      ", litter_id, replaces_document_id",
      `, '${activeLitterId}', '${documentPrefix}10'`,
    ));
    expectSqlFailure(
      insertDocument(
        `${documentPrefix}31`,
        ", litter_id, replaces_document_id, superseded_at",
        `, '${activeLitterId}', '${documentPrefix}10', now()`,
      ),
      /documents_one_active_successor_idx/,
    );

    expectSqlFailure(
      insertDocument(
        `${documentPrefix}40`,
        ", litter_group_id, file_sha256, superseded_at",
        `, '${activeGroupId}', 'ABC', now()`,
      ),
      /documents_file_sha256_check/,
    );
    expectSqlFailure(
      insertDocument(
        `${documentPrefix}41`,
        ", reservation_id, contact_id, generated_from_template, generated_at, superseded_at",
        `, '${reservationId}', '${contactId}', true, now(), now()`,
        "reservation_contract",
      ),
      /documents_generation_check/,
    );
    expectSqlFailure(
      insertDocument(
        `${documentPrefix}42`,
        ", reservation_id, contact_id, generated_from_template, template_id, superseded_at",
        `, '${reservationId}', '${contactId}', true, '${templateId}', now()`,
        "reservation_contract",
      ),
      /documents_generation_check/,
    );

    sql(insertDocument(
      `${documentPrefix}50`,
      ", reservation_id, contact_id, status, sent_at, file_name",
      `, '${reservationId}', '${contactId}', 'sent', now(), 'immutable.pdf'`,
      "reservation_contract",
    ));
    expectSqlFailure(
      `update public.documents set status = 'to_generate' where id = '${documentPrefix}50';`,
      /sent document status/,
    );
    expectSqlFailure(
      `update public.documents set sent_at = null where id = '${documentPrefix}50';`,
      /sent document proof/,
    );
    expectSqlFailure(
      `update public.documents set sent_at = sent_at + interval '1 second' where id = '${documentPrefix}50';`,
      /sent document proof/,
    );
    expectSqlFailure(
      `update public.documents set file_name = 'changed-after-downgrade.pdf' where id = '${documentPrefix}50';`,
      /immutable/,
    );
    expectSqlFailure(
      `update public.documents set deleted_at = now() where id = '${documentPrefix}50';`,
      /cannot be soft-deleted/,
    );
    const originalSentAt = sql(`
      select sent_at::text from public.documents where id = '${documentPrefix}50';
    `);
    sql(`
      update public.documents
      set status = 'signed', signed_at = now()
      where id = '${documentPrefix}50';
    `);
    expect(sql(`select status from public.documents where id = '${documentPrefix}50';`)).toBe("signed");
    expect(sql(`select sent_at::text from public.documents where id = '${documentPrefix}50';`)).toBe(originalSentAt);
    expect(sql(`select signed_at is not null from public.documents where id = '${documentPrefix}50';`)).toBe("t");
    expectSqlFailure(
      `update public.documents set status = 'sent' where id = '${documentPrefix}50';`,
      /signed document status/,
    );
    expectSqlFailure(
      `update public.documents set signed_at = null where id = '${documentPrefix}50';`,
      /signed document proof/,
    );
    expectSqlFailure(
      `update public.documents set signed_at = signed_at + interval '1 second' where id = '${documentPrefix}50';`,
      /signed document proof/,
    );
    expectSqlFailure(
      `update public.documents set deleted_at = now() where id = '${documentPrefix}50';`,
      /cannot be soft-deleted/,
    );
    sql(`update public.documents set superseded_at = now() where id = '${documentPrefix}50';`);
    expect(sql(`select superseded_at is not null from public.documents where id = '${documentPrefix}50';`)).toBe("t");
    expectSqlFailure(
      `update public.documents set superseded_at = null where id = '${documentPrefix}50';`,
      /replacement proof/,
    );
    expectSqlFailure(
      `update public.documents set superseded_at = superseded_at + interval '1 second' where id = '${documentPrefix}50';`,
      /replacement proof/,
    );

    sql(insertDocument(
      `${documentPrefix}60`,
      ", status, file_name",
      ", 'sent', 'historical-sent.pdf'",
      "other",
    ));
    expectSqlFailure(
      `update public.documents set status = 'to_generate' where id = '${documentPrefix}60';`,
      /sent document status/,
    );
    expectSqlFailure(
      `update public.documents set file_name = 'historical-sent-changed.pdf' where id = '${documentPrefix}60';`,
      /immutable/,
    );
    sql(`update public.documents set sent_at = now() where id = '${documentPrefix}60';`);
    expect(sql(`select sent_at is not null from public.documents where id = '${documentPrefix}60';`)).toBe("t");

    sql(insertDocument(
      `${documentPrefix}61`,
      ", status, sent_at, file_name",
      ", 'signed', now(), 'historical-signed.pdf'",
      "other",
    ));
    expectSqlFailure(
      `update public.documents set status = 'sent' where id = '${documentPrefix}61';`,
      /signed document status/,
    );
    sql(`update public.documents set signed_at = now() where id = '${documentPrefix}61';`);
    expect(sql(`select signed_at is not null from public.documents where id = '${documentPrefix}61';`)).toBe("t");

    sql(insertDocument(
      `${documentPrefix}62`,
      ", status, sent_at",
      ", 'sent', now()",
      "other",
    ));
    expectSqlFailure(
      `update public.documents set signed_at = now() where id = '${documentPrefix}62';`,
      /signed_at requires signed document status/,
    );

    sql(insertDocument(`${documentPrefix}63`, "", "", "other"));
    expectSqlFailure(
      `update public.documents set status = 'signed' where id = '${documentPrefix}63';`,
      /signed document status requires sent_at proof/,
    );

    const bucket = JSON.parse(sql(`
      select json_build_object('public', public) from storage.buckets where id = 'documents';
    `)) as { public: boolean };
    expect(bucket.public).toBe(false);

    const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: "application/pdf",
    });
    expect((await supabase.storage.from("documents").upload(ownPath, pdf)).error).toBeNull();
    expect((await supabase.storage.from("documents").download(ownPath)).error).toBeNull();
    expect((await supabase.storage.from("documents").upload(ownPath, pdf, { upsert: true })).error).toBeNull();
    expect((await supabase.storage.from("documents").upload(otherPath, pdf)).error).not.toBeNull();
    expect((await supabase.storage.from("documents").download(otherPath)).error).not.toBeNull();
    expect((await supabase.storage.from("documents").remove([ownPath])).error).toBeNull();
    expect(Number(sql(`select count(*) from storage.objects where bucket_id = 'documents' and name = '${ownPath}';`))).toBe(0);
  } finally {
    const storageCleanup = await supabase.storage
      .from("documents")
      .remove([ownPath, otherPath]);
    if (storageCleanup.error) {
      throw new Error(`final Storage cleanup: ${storageCleanup.error.message}`);
    }
    cleanupSql();
    assertNoFixtures();
  }
});
