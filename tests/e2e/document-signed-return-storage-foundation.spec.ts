import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  archiveDocumentSignedReturnCore,
  buildDocumentSignedReturnPath,
  DOCUMENT_SIGNED_RETURN_MAX_BYTES,
  parseDocumentSignedReturnPath,
  readDocumentSignedReturnCore,
  validateAndHashSignedReturnPdf,
} from "../../src/features/documents/document-signed-return-storage-core";
import {
  readDocumentPdfCore,
  storeDocumentPdfCore,
} from "../../src/features/documents/document-pdf-storage-core";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const bucket = "documents";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "f3000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const contactIds = [
  "73000000-0000-4000-8000-000000000001",
  "73000000-0000-4000-8000-000000000002",
] as const;
const reservationIds = [
  "93000000-0000-4000-8000-000000000001",
  "93000000-0000-4000-8000-000000000002",
  "93000000-0000-4000-8000-000000000003",
  "93000000-0000-4000-8000-000000000004",
] as const;
const documentIds = {
  sent: "d3000000-0000-4000-8000-000000000001",
  historical: "d3000000-0000-4000-8000-000000000002",
  successor: "d3000000-0000-4000-8000-000000000003",
  manualSigned: "d3000000-0000-4000-8000-000000000004",
  notSent: "d3000000-0000-4000-8000-000000000005",
  wrongType: "d3000000-0000-4000-8000-000000000006",
  otherOrganization: "d3000000-0000-4000-8000-000000000007",
} as const;
const signedReturnIds = {
  sent: "a3000000-0000-4000-8000-000000000001",
  different: "a3000000-0000-4000-8000-000000000002",
  historical: "a3000000-0000-4000-8000-000000000003",
  manualSigned: "a3000000-0000-4000-8000-000000000004",
  notSent: "a3000000-0000-4000-8000-000000000005",
  wrongType: "a3000000-0000-4000-8000-000000000006",
  wrongOrganization: "a3000000-0000-4000-8000-000000000007",
  invalid: "a3000000-0000-4000-8000-000000000008",
  oversized: "a3000000-0000-4000-8000-000000000009",
  rpcConflict: "a3000000-0000-4000-8000-000000000010",
} as const;

const sentOriginalPdf = Buffer.from("%PDF-1.7\nsent original immutable bytes\n%%EOF\n");
const historicalOriginalPdf = Buffer.from("%PDF-1.7\nhistorical original bytes\n%%EOF\n");
const successorPdf = Buffer.from("%PDF-1.7\ncurrent successor bytes\n%%EOF\n");
const manualOriginalPdf = Buffer.from("%PDF-1.7\nmanual signed original bytes\n%%EOF\n");
const notSentOriginalPdf = Buffer.from("%PDF-1.7\nnot sent original bytes\n%%EOF\n");
const wrongTypeOriginalPdf = Buffer.from("%PDF-1.7\nwrong type original bytes\n%%EOF\n");
const signedPdf = Buffer.from("%PDF-1.7\nsigned return exact bytes\n%%EOF\n");
const differentSignedPdf = Buffer.from("%PDF-1.7\ndifferent signed return bytes\n%%EOF\n");
const historicalSignedPdf = Buffer.from("%PDF-2.0\nhistorical signed return\n%%EOF\n");
const manualSignedPdf = Buffer.from("%PDF-1.6\nmanual status signed return\n%%EOF\n");

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureStoragePaths() {
  const output = runE2eSqlSync(`
    select name
    from storage.objects
    where bucket_id = 'documents'
      and (
        name like 'organizations/${organizationId}/documents/d3000000-%'
        or name like 'organizations/${otherOrganizationId}/documents/d3000000-%'
      )
    order by name;
  `);
  return output ? output.split("\n").filter(Boolean) : [];
}

async function cleanup(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = fixtureStoragePaths();
  runE2eSqlSync(`
    delete from public.document_signed_returns
    where id::text like 'a3000000-%' or document_id::text like 'd3000000-%';
    delete from public.documents
    where id::text like 'd3000000-%' and replaces_document_id is not null;
    delete from public.documents where id::text like 'd3000000-%';
    delete from public.reservations where id::text like '93000000-%';
    delete from public.contacts where id::text like '73000000-%';
    delete from public.organizations where id = '${otherOrganizationId}';
  `);
  if (paths.length > 0) {
    const removed = await supabase.storage.from(bucket).remove(paths);
    if (removed.error) throw new Error(`remove signed-return fixtures: ${removed.error.message}`);
  }
}

function countAllFixtures() {
  return Number(runE2eSqlSync(`
    select
      (select count(*) from public.document_signed_returns
       where id::text like 'a3000000-%' or document_id::text like 'd3000000-%')
      + (select count(*) from public.documents where id::text like 'd3000000-%')
      + (select count(*) from public.reservations where id::text like '93000000-%')
      + (select count(*) from public.contacts where id::text like '73000000-%')
      + (select count(*) from public.organizations where id = '${otherOrganizationId}')
      + (select count(*) from storage.objects
         where bucket_id = 'documents'
           and name like 'organizations/%/documents/d3000000-%');
  `));
}

function insertRelationalFixtures() {
  runE2eSqlSync(`
    insert into public.contacts (id, organization_id, display_name)
    values
      ('${contactIds[0]}', '${organizationId}', 'QA signed return contact'),
      ('${contactIds[1]}', '${organizationId}', 'QA signed return second contact');
    insert into public.reservations (id, organization_id, contact_id)
    values
      ('${reservationIds[0]}', '${organizationId}', '${contactIds[0]}'),
      ('${reservationIds[1]}', '${organizationId}', '${contactIds[0]}'),
      ('${reservationIds[2]}', '${organizationId}', '${contactIds[1]}'),
      ('${reservationIds[3]}', '${organizationId}', '${contactIds[1]}');
    insert into public.organizations (id, name, slug)
    values ('${otherOrganizationId}', 'QA signed return other organization', 'qa-signed-return-other');
    insert into public.contacts (id, organization_id, display_name)
    values ('73000000-0000-4000-8000-000000000099', '${otherOrganizationId}', 'QA other org contact');
    insert into public.reservations (id, organization_id, contact_id)
    values (
      '93000000-0000-4000-8000-000000000099',
      '${otherOrganizationId}',
      '73000000-0000-4000-8000-000000000099'
    );
    insert into public.documents (
      id, organization_id, contact_id, reservation_id, document_type, status,
      title, file_path, file_name, mime_type, file_size_bytes, file_sha256,
      sent_at, signature_required, created_by, updated_by
    ) values (
      '${documentIds.otherOrganization}', '${otherOrganizationId}',
      '73000000-0000-4000-8000-000000000099',
      '93000000-0000-4000-8000-000000000099',
      'reservation_contract', 'sent', 'QA other organization contract',
      'organizations/${otherOrganizationId}/documents/${documentIds.otherOrganization}/v1/${"f".repeat(64)}.pdf',
      '${"f".repeat(64)}.pdf', 'application/pdf', 42, '${"f".repeat(64)}',
      '2026-07-13 08:00:00+00', true, '${userId}', '${userId}'
    );
  `);
}

async function storeOriginals(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const inputs = [
    {
      documentId: documentIds.sent,
      bytes: sentOriginalPdf,
      documentType: "reservation_contract",
      title: "QA sent original",
      contactId: contactIds[0],
      reservationId: reservationIds[0],
      generationData: { immutable: "sent-original" },
      signatureRequired: true,
    },
    {
      documentId: documentIds.historical,
      bytes: historicalOriginalPdf,
      documentType: "reservation_contract",
      title: "QA historical original",
      contactId: contactIds[0],
      reservationId: reservationIds[1],
      generationData: { immutable: "historical-original" },
      signatureRequired: true,
    },
    {
      documentId: documentIds.manualSigned,
      bytes: manualOriginalPdf,
      documentType: "commitment_certificate",
      title: "QA manually signed original",
      contactId: contactIds[1],
      reservationId: reservationIds[2],
      signatureRequired: true,
    },
    {
      documentId: documentIds.notSent,
      bytes: notSentOriginalPdf,
      documentType: "reservation_contract",
      title: "QA not sent original",
      contactId: contactIds[1],
      reservationId: reservationIds[3],
      signatureRequired: true,
    },
    {
      documentId: documentIds.wrongType,
      bytes: wrongTypeOriginalPdf,
      documentType: "other",
      title: "QA wrong type original",
    },
  ] as const;

  for (const input of inputs) {
    const result = await storeDocumentPdfCore({ organizationId, ...input }, supabase);
    expect(result.outcome).toBe("created");
    if (result.outcome === "error") throw new Error(result.error.message);
  }

  runE2eSqlSync(`
    update public.documents
    set status = 'sent', sent_at = '2026-07-13 09:00:00+00'
    where id in ('${documentIds.sent}', '${documentIds.historical}');
    update public.documents
    set status = 'sent', sent_at = '2026-07-13 09:10:00+00'
    where id = '${documentIds.manualSigned}';
    update public.documents
    set status = 'signed', signed_at = '2026-07-13 09:15:00+00'
    where id = '${documentIds.manualSigned}';
  `);

  const successor = await storeDocumentPdfCore(
    {
      organizationId,
      documentId: documentIds.successor,
      replacesDocumentId: documentIds.historical,
      bytes: successorPdf,
      documentType: "reservation_contract",
      title: "QA historical successor",
      contactId: contactIds[0],
      reservationId: reservationIds[1],
      generationData: { immutable: "historical-successor" },
      signatureRequired: true,
    },
    supabase,
  );
  expect(successor.outcome).toBe("created");
}

test("validates signed-return PDF signatures and strict dedicated paths", () => {
  expect(validateAndHashSignedReturnPdf(Buffer.from("not a PDF"))).toBeNull();
  expect(validateAndHashSignedReturnPdf(Buffer.from("%PDF-1.7\nmissing eof"))).toBeNull();
  expect(validateAndHashSignedReturnPdf(signedPdf)?.fileSha256).toBe(sha256(signedPdf));
  expect(
    validateAndHashSignedReturnPdf(Buffer.alloc(DOCUMENT_SIGNED_RETURN_MAX_BYTES + 1)),
  ).toBeNull();

  const path = buildDocumentSignedReturnPath(
    organizationId,
    documentIds.sent,
    signedReturnIds.sent,
    sha256(signedPdf),
  );
  expect(path).toBe(
    `organizations/${organizationId}/documents/${documentIds.sent}/signed-returns/${signedReturnIds.sent}/${sha256(signedPdf)}.pdf`,
  );
  expect(parseDocumentSignedReturnPath(path!)).toEqual({
    organizationId,
    documentId: documentIds.sent,
    signedReturnId: signedReturnIds.sent,
    fileSha256: sha256(signedPdf),
  });
  expect(parseDocumentSignedReturnPath(path!.replace("signed-returns", "v1"))).toBeNull();
});

test("compensates a new upload when a thrown RPC reconciles to a conflicting row", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanup(supabase);

  try {
    insertRelationalFixtures();
    await storeOriginals(supabase);

    const conflictPath = buildDocumentSignedReturnPath(
      organizationId,
      documentIds.manualSigned,
      signedReturnIds.rpcConflict,
      sha256(differentSignedPdf),
    )!;
    const conflictUpload = await supabase.storage
      .from(bucket)
      .upload(conflictPath, differentSignedPdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(conflictUpload.error).toBeNull();

    runE2eSqlSync(`
      insert into public.document_signed_returns (
        id, organization_id, document_id, file_path, file_sha256,
        file_size_bytes, mime_type, created_by
      ) values (
        '${signedReturnIds.rpcConflict}',
        '${organizationId}',
        '${documentIds.manualSigned}',
        ${quote(conflictPath)},
        '${sha256(differentSignedPdf)}',
        ${differentSignedPdf.byteLength},
        'application/pdf',
        '${userId}'
      );
    `);

    const conflictRowBefore = runE2eSqlSync(`
      select to_jsonb(r)::text
      from public.document_signed_returns r
      where id = '${signedReturnIds.rpcConflict}';
    `);
    const originalBefore = runE2eSqlSync(`
      select to_jsonb(d)::text
      from public.documents d
      where id = '${documentIds.sent}';
    `);
    const attemptedPath = buildDocumentSignedReturnPath(
      organizationId,
      documentIds.sent,
      signedReturnIds.rpcConflict,
      sha256(signedPdf),
    )!;
    const throwingRpcSupabase = new Proxy(supabase, {
      get(target, property) {
        if (property === "rpc") {
          return async () => {
            throw new Error("simulated RPC transport failure");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const result = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.rpcConflict,
        bytes: signedPdf,
      },
      throwingRpcSupabase,
      { error() {} },
    );

    expect(result).toMatchObject({ outcome: "error", error: { code: "database_error" } });
    expect(Number(runE2eSqlSync(`
      select count(*)
      from storage.objects
      where bucket_id = 'documents' and name = ${quote(attemptedPath)};
    `))).toBe(0);
    expect(Number(runE2eSqlSync(`
      select count(*)
      from storage.objects
      where bucket_id = 'documents' and name = ${quote(conflictPath)};
    `))).toBe(1);
    expect(runE2eSqlSync(`
      select to_jsonb(r)::text
      from public.document_signed_returns r
      where id = '${signedReturnIds.rpcConflict}';
    `)).toBe(conflictRowBefore);
    expect(runE2eSqlSync(`
      select to_jsonb(d)::text
      from public.documents d
      where id = '${documentIds.sent}';
    `)).toBe(originalBefore);
  } finally {
    await cleanup(supabase);
    expect(countAllFixtures()).toBe(0);
  }
});

test("archives, signs atomically, preserves originals, rejects conflicts and cleans every fixture", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanup(supabase);

  try {
    insertRelationalFixtures();
    await storeOriginals(supabase);

    const originalBefore = runE2eSqlSync(`
      select jsonb_build_object(
        'file_path', file_path,
        'file_sha256', file_sha256,
        'file_size_bytes', file_size_bytes,
        'mime_type', mime_type,
        'template_id', template_id,
        'generation_data', generation_data,
        'generated_at', generated_at,
        'generated_from_template', generated_from_template,
        'source_template_version', source_template_version,
        'replaces_document_id', replaces_document_id,
        'superseded_at', superseded_at
      )::text
      from public.documents where id = '${documentIds.sent}';
    `);

    const created = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.sent,
        bytes: signedPdf,
      },
      supabase,
    );
    expect(created.outcome).toBe("created");
    if (created.outcome === "error") throw new Error(created.error.message);
    expect(created.fileSha256).toBe(sha256(signedPdf));

    const sentStatus = runE2eSqlSync(`
      select status || '|' || (signed_at is not null)::text
      from public.documents where id = '${documentIds.sent}';
    `);
    expect(sentStatus).toBe("signed|true");
    const originalAfter = runE2eSqlSync(`
      select jsonb_build_object(
        'file_path', file_path,
        'file_sha256', file_sha256,
        'file_size_bytes', file_size_bytes,
        'mime_type', mime_type,
        'template_id', template_id,
        'generation_data', generation_data,
        'generated_at', generated_at,
        'generated_from_template', generated_from_template,
        'source_template_version', source_template_version,
        'replaces_document_id', replaces_document_id,
        'superseded_at', superseded_at
      )::text
      from public.documents where id = '${documentIds.sent}';
    `);
    expect(originalAfter).toBe(originalBefore);
    const originalRead = await readDocumentPdfCore(organizationId, documentIds.sent, supabase);
    expect(originalRead.outcome).toBe("success");
    if (originalRead.outcome === "success") {
      expect(Buffer.from(originalRead.bytes)).toEqual(sentOriginalPdf);
    }

    const replay = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.sent,
        bytes: signedPdf,
      },
      supabase,
    );
    expect(replay.outcome).toBe("existing");
    expect(Number(runE2eSqlSync(`
      select count(*) from public.document_signed_returns
      where document_id = '${documentIds.sent}';
    `))).toBe(1);

    const conflictPath = buildDocumentSignedReturnPath(
      organizationId,
      documentIds.sent,
      signedReturnIds.different,
      sha256(differentSignedPdf),
    )!;
    const conflict = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.different,
        bytes: differentSignedPdf,
      },
      supabase,
    );
    expect(conflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(Number(runE2eSqlSync(`
      select count(*) from storage.objects
      where bucket_id = 'documents' and name = ${quote(conflictPath)};
    `))).toBe(0);

    const read = await readDocumentSignedReturnCore(
      organizationId,
      signedReturnIds.sent,
      supabase,
    );
    expect(read.outcome).toBe("success");
    if (read.outcome === "success") {
      expect(Buffer.from(read.bytes)).toEqual(signedPdf);
      expect(sha256(read.bytes)).toBe(read.signedReturn.file_sha256);
    }

    const historical = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.historical,
        signedReturnId: signedReturnIds.historical,
        bytes: historicalSignedPdf,
      },
      supabase,
    );
    expect(historical.outcome).toBe("created");
    expect(runE2eSqlSync(`
      select status || '|' || (superseded_at is not null)::text
      from public.documents where id = '${documentIds.historical}';
    `)).toBe("signed|true");

    const manualSignedAt = runE2eSqlSync(`
      select signed_at::text from public.documents where id = '${documentIds.manualSigned}';
    `);
    const manual = await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.manualSigned,
        signedReturnId: signedReturnIds.manualSigned,
        bytes: manualSignedPdf,
      },
      supabase,
    );
    expect(manual.outcome).toBe("created");
    expect(runE2eSqlSync(`
      select signed_at::text from public.documents where id = '${documentIds.manualSigned}';
    `)).toBe(manualSignedAt);

    const rejectedCases = [
      {
        documentId: documentIds.notSent,
        signedReturnId: signedReturnIds.notSent,
        bytes: signedPdf,
      },
      {
        documentId: documentIds.wrongType,
        signedReturnId: signedReturnIds.wrongType,
        bytes: signedPdf,
      },
      {
        documentId: documentIds.otherOrganization,
        signedReturnId: signedReturnIds.wrongOrganization,
        bytes: signedPdf,
      },
    ] as const;
    for (const rejected of rejectedCases) {
      const result = await archiveDocumentSignedReturnCore(
        { organizationId, ...rejected },
        supabase,
      );
      expect(result).toMatchObject({ outcome: "error" });
    }

    expect(await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.invalid,
        bytes: Buffer.from("not a signed PDF"),
      },
      supabase,
    )).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    const oversizedPdf = Buffer.alloc(DOCUMENT_SIGNED_RETURN_MAX_BYTES + 1, 0x20);
    oversizedPdf.write("%PDF-1.7\n", 0, "ascii");
    oversizedPdf.write("%%EOF\n", oversizedPdf.byteLength - 6, "ascii");
    expect(await archiveDocumentSignedReturnCore(
      {
        organizationId,
        documentId: documentIds.sent,
        signedReturnId: signedReturnIds.oversized,
        bytes: oversizedPdf,
      },
      supabase,
    )).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    expect(Number(runE2eSqlSync(`
      select count(*) from storage.objects
      where bucket_id = 'documents'
        and name like 'organizations/${organizationId}/documents/d3000000-%/signed-returns/%'
        and name not in (
          select file_path from public.document_signed_returns
          where document_id::text like 'd3000000-%'
        );
    `))).toBe(0);
  } finally {
    await cleanup(supabase);
    expect(countAllFixtures()).toBe(0);
  }
});
