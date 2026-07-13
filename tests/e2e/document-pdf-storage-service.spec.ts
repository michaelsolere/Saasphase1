import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildDocumentPdfPath,
  createDocumentPdfSignedUrlCore,
  isDocumentPdfMetadataCoherent,
  isLegacyDocumentWithoutStoredPdf,
  readDocumentPdfCore,
  storeDocumentPdfCore,
  validateAndHashPdf,
} from "../../src/features/documents/document-pdf-storage-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const bucket = "documents";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000099";
const versionLitterId = "c0000000-0000-4000-8000-000000000002";
const concurrentLitterId = "c0000000-0000-4000-8000-000000000001";
const firstDocumentId = "e1000000-0000-4000-8000-000000000001";
const secondDocumentId = "e1000000-0000-4000-8000-000000000002";
const concurrentDocumentIds = [
  "e1000000-0000-4000-8000-000000000003",
  "e1000000-0000-4000-8000-000000000004",
];
const identicalReplacementInitialId = "e1000000-0000-4000-8000-000000000005";
const identicalReplacementSuccessorId = "e1000000-0000-4000-8000-000000000006";
const legacyContactIds = [
  "72000000-0000-4000-8000-000000000001",
  "72000000-0000-4000-8000-000000000002",
];
const legacyReservationIds = [
  "92000000-0000-4000-8000-000000000001",
  "92000000-0000-4000-8000-000000000002",
  "92000000-0000-4000-8000-000000000003",
];
const legacyDocumentIds = {
  historical: "e2000000-0000-4000-8000-000000000001",
  successor: "e2000000-0000-4000-8000-000000000002",
  concurrentHistorical: "e2000000-0000-4000-8000-000000000003",
  concurrentSuccessor: "e2000000-0000-4000-8000-000000000004",
  pathOnly: "e2000000-0000-4000-8000-000000000005",
  hashOnly: "e2000000-0000-4000-8000-000000000006",
  sizeOnly: "e2000000-0000-4000-8000-000000000007",
  typeMismatch: "e2000000-0000-4000-8000-000000000008",
  scopeMismatch: "e2000000-0000-4000-8000-000000000009",
  rejectedSuccessor: "e2000000-0000-4000-8000-000000000010",
} as const;
const allDocumentIds = [
  firstDocumentId,
  secondDocumentId,
  ...concurrentDocumentIds,
  identicalReplacementInitialId,
  identicalReplacementSuccessorId,
  ...Object.values(legacyDocumentIds),
];

const firstPdf = new TextEncoder().encode("%PDF-1.7\nfirst private document\n%%EOF");
const secondPdf = Buffer.from("%PDF-1.7\nsecond private document\n%%EOF");
const conflictingPdf = Buffer.from("%PDF-1.7\nconflicting intention\n%%EOF");

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function documentIdSqlList() {
  return allDocumentIds.map((id) => `${sqlQuote(id)}::uuid`).join(",");
}

function countDocumentFixtures() {
  return Number(
    runE2eSqlSync(`select count(*) from public.documents where id in (${documentIdSqlList()});`),
  );
}

function countStorageFixtures() {
  const patterns = allDocumentIds
    .map((id) => `name like ${sqlQuote(`organizations/${organizationId}/documents/${id}/%`)}`)
    .join(" or ");
  return Number(
    runE2eSqlSync(`select count(*) from storage.objects where bucket_id = 'documents' and (${patterns});`),
  );
}

function countLegacyRelationalFixtures() {
  return Number(
    runE2eSqlSync(`
      select
        (select count(*) from public.documents where id::text like 'e2000000-%')
        + (select count(*) from public.reservations where id::text like '92000000-%')
        + (select count(*) from public.contacts where id::text like '72000000-%');
    `),
  );
}

async function cleanup(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const objects = await supabase.storage.from(bucket).list(`organizations/${organizationId}/documents`, {
    limit: 1000,
  });
  if (objects.error) throw new Error(`list document fixture roots: ${objects.error.message}`);

  const paths: string[] = [];
  for (const documentId of allDocumentIds) {
    for (let version = 1; version <= 2; version += 1) {
      const folder = `organizations/${organizationId}/documents/${documentId}/v${version}`;
      const listed = await supabase.storage.from(bucket).list(folder, { limit: 100 });
      if (listed.error) throw new Error(`list ${folder}: ${listed.error.message}`);
      paths.push(...listed.data.map((item) => `${folder}/${item.name}`));
    }
  }
  if (paths.length > 0) {
    const removed = await supabase.storage.from(bucket).remove(paths);
    if (removed.error) throw new Error(`remove document fixture objects: ${removed.error.message}`);
  }

  runE2eSqlSync(`
    delete from public.documents
    where id in (${documentIdSqlList()}) and replaces_document_id is not null;
    delete from public.documents where id in (${documentIdSqlList()});
    delete from public.reservations where id::text like '92000000-%';
    delete from public.contacts where id::text like '72000000-%';
  `);
}

function insertLegacyFixtures() {
  const [contactId, otherContactId] = legacyContactIds;
  const [reservationId, concurrentReservationId, otherReservationId] = legacyReservationIds;
  const partialHash = "a".repeat(64);

  runE2eSqlSync(`
    insert into public.contacts (id, organization_id, display_name)
    values
      (${sqlQuote(contactId)}::uuid, ${sqlQuote(organizationId)}::uuid, 'QA legacy PDF contact'),
      (${sqlQuote(otherContactId)}::uuid, ${sqlQuote(organizationId)}::uuid, 'QA legacy PDF other contact');

    insert into public.reservations (id, organization_id, contact_id)
    values
      (${sqlQuote(reservationId)}::uuid, ${sqlQuote(organizationId)}::uuid, ${sqlQuote(contactId)}::uuid),
      (${sqlQuote(concurrentReservationId)}::uuid, ${sqlQuote(organizationId)}::uuid, ${sqlQuote(contactId)}::uuid),
      (${sqlQuote(otherReservationId)}::uuid, ${sqlQuote(organizationId)}::uuid, ${sqlQuote(otherContactId)}::uuid);

    insert into public.documents (
      id, organization_id, contact_id, reservation_id, document_type, status,
      title, file_path, file_name, mime_type, file_size_bytes, file_sha256,
      sent_at, signed_at, signature_required
    ) values
      (
        ${sqlQuote(legacyDocumentIds.historical)}::uuid, ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(contactId)}::uuid, ${sqlQuote(reservationId)}::uuid,
        'reservation_contract', 'signed', 'QA ancien contrat signé', null,
        'ancien-contrat-signe.pdf', 'application/pdf', null, null,
        '2026-07-01 10:00:00+00', '2026-07-02 11:00:00+00', true
      ),
      (
        ${sqlQuote(legacyDocumentIds.concurrentHistorical)}::uuid, ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(contactId)}::uuid, ${sqlQuote(concurrentReservationId)}::uuid,
        'reservation_contract', 'sent', 'QA ancien contrat concurrent', null,
        'ancien-contrat-concurrent.pdf', 'application/pdf', null, null,
        '2026-07-03 10:00:00+00', null, true
      ),
      (${sqlQuote(legacyDocumentIds.pathOnly)}::uuid, ${sqlQuote(organizationId)}::uuid, null, null,
        'other', 'uploaded', 'QA chemin seul', 'legacy/path-only.pdf', null, null, null, null, null, null, false),
      (${sqlQuote(legacyDocumentIds.hashOnly)}::uuid, ${sqlQuote(organizationId)}::uuid, null, null,
        'other', 'uploaded', 'QA hash seul', null, null, null, null, ${sqlQuote(partialHash)}, null, null, false),
      (${sqlQuote(legacyDocumentIds.sizeOnly)}::uuid, ${sqlQuote(organizationId)}::uuid, null, null,
        'other', 'uploaded', 'QA taille seule', null, null, null, 123, null, null, null, false),
      (${sqlQuote(legacyDocumentIds.typeMismatch)}::uuid, ${sqlQuote(organizationId)}::uuid, null, null,
        'other', 'uploaded', 'QA type différent', null, 'legacy-other.pdf', 'application/pdf', null, null, null, null, false),
      (
        ${sqlQuote(legacyDocumentIds.scopeMismatch)}::uuid, ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(contactId)}::uuid, ${sqlQuote(otherReservationId)}::uuid,
        'reservation_contract', 'uploaded', 'QA périmètre différent', null,
        'legacy-scope.pdf', 'application/pdf', null, null, null, null, false
      );
  `);
}

test("validates PDF bytes, identifiers, versions, paths and checksums", () => {
  expect(validateAndHashPdf(new Uint8Array())).toBeNull();
  expect(validateAndHashPdf(Buffer.from("not a pdf"))).toBeNull();
  const validated = validateAndHashPdf(firstPdf);
  expect(validated?.fileSha256).toBe(sha256(firstPdf));
  expect(validated?.fileSha256).toMatch(/^[0-9a-f]{64}$/);

  expect(buildDocumentPdfPath("invalid", firstDocumentId, 1, sha256(firstPdf))).toBeNull();
  expect(buildDocumentPdfPath(organizationId, "invalid", 1, sha256(firstPdf))).toBeNull();
  expect(buildDocumentPdfPath(organizationId, firstDocumentId, 0, sha256(firstPdf))).toBeNull();
  expect(buildDocumentPdfPath(organizationId, firstDocumentId, 1, "BAD")).toBeNull();
  expect(buildDocumentPdfPath(organizationId, firstDocumentId, 1, sha256(firstPdf))).toBe(
    `organizations/${organizationId}/documents/${firstDocumentId}/v1/${sha256(firstPdf)}.pdf`,
  );
  expect(
    isDocumentPdfMetadataCoherent({
      organization_id: organizationId,
      id: firstDocumentId,
      file_path: buildDocumentPdfPath(organizationId, firstDocumentId, 1, sha256(firstPdf)),
      file_sha256: sha256(secondPdf),
      file_size_bytes: firstPdf.byteLength,
      mime_type: "application/pdf",
    }),
  ).toBe(false);

  expect(
    isLegacyDocumentWithoutStoredPdf(
      {
        organization_id: organizationId,
        document_type: "other",
        contact_id: null,
        application_id: null,
        reservation_id: null,
        litter_id: null,
        litter_group_id: null,
        animal_id: null,
        payment_id: null,
        file_path: null,
        file_sha256: null,
        file_size_bytes: null,
        deleted_at: null,
        superseded_at: null,
      },
      {
        organizationId,
        documentType: "other",
        contactId: null,
        applicationId: null,
        reservationId: null,
        litterId: null,
        litterGroupId: null,
        animalId: null,
        paymentId: null,
      },
    ),
  ).toBe(true);
});

test("stores, replays, versions, arbitrates concurrency, reads and cleans private PDFs", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanup(supabase);
  const expectedPaths = new Set<string>();

  try {
    const firstInput = {
      organizationId,
      documentId: firstDocumentId,
      bytes: firstPdf,
      documentType: "welcome_booklet",
      title: "QA private PDF v1",
      litterId: versionLitterId,
    } as const;
    const initial = await storeDocumentPdfCore(firstInput, supabase);
    expect(initial.outcome).toBe("created");
    if (initial.outcome === "error") throw new Error(initial.error.message);
    expectedPaths.add(initial.filePath);
    expect(initial.version).toBe(1);

    const replay = await storeDocumentPdfCore(firstInput, supabase);
    expect(replay.outcome).toBe("existing");
    if (replay.outcome === "error") throw new Error(replay.error.message);
    expect(replay.filePath).toBe(initial.filePath);

    const conflictPath = buildDocumentPdfPath(
      organizationId,
      firstDocumentId,
      1,
      sha256(conflictingPdf),
    )!;
    const conflict = await storeDocumentPdfCore(
      { ...firstInput, bytes: conflictingPdf },
      supabase,
    );
    expect(conflict).toMatchObject({ outcome: "error", error: { code: "database_error" } });
    expect(
      Number(
        runE2eSqlSync(
          `select count(*) from storage.objects where bucket_id = 'documents' and name = ${sqlQuote(conflictPath)};`,
        ),
      ),
    ).toBe(0);

    const replacement = await storeDocumentPdfCore(
      {
        ...firstInput,
        documentId: secondDocumentId,
        replacesDocumentId: firstDocumentId,
        bytes: secondPdf,
        title: "QA private PDF v2",
      },
      supabase,
    );
    expect(replacement.outcome).toBe("created");
    if (replacement.outcome === "error") throw new Error(replacement.error.message);
    expectedPaths.add(replacement.filePath);
    expect(replacement.version).toBe(2);

    const versionRows = await supabase
      .from("documents")
      .select("id, file_path, superseded_at, replaces_document_id")
      .in("id", [firstDocumentId, secondDocumentId]);
    expect(versionRows.error).toBeNull();
    expect(versionRows.data).toHaveLength(2);
    expect(versionRows.data?.find((row) => row.id === firstDocumentId)?.superseded_at).not.toBeNull();
    expect(versionRows.data?.find((row) => row.id === secondDocumentId)?.replaces_document_id).toBe(firstDocumentId);
    expect(
      Number(
        runE2eSqlSync(
          `select count(*) from storage.objects where bucket_id = 'documents' and name in (${[...expectedPaths]
            .map(sqlQuote)
            .join(",")});`,
        ),
      ),
    ).toBe(2);

    const concurrentResults = await Promise.all(
      concurrentDocumentIds.map((documentId, index) =>
        storeDocumentPdfCore(
          {
            organizationId,
            documentId,
            bytes: index === 0 ? firstPdf : secondPdf,
            documentType: "welcome_booklet",
            title: `QA concurrent PDF ${index + 1}`,
            litterId: concurrentLitterId,
          },
          supabase,
        ),
      ),
    );
    expect(concurrentResults.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(concurrentResults.filter((result) => result.outcome === "error")).toHaveLength(1);
    const concurrentWinner = concurrentResults.find((result) => result.outcome === "created");
    if (concurrentWinner?.outcome === "created") expectedPaths.add(concurrentWinner.filePath);
    expect(
      Number(
        runE2eSqlSync(
          `select count(*) from public.documents where id in (${concurrentDocumentIds
            .map((id) => `${sqlQuote(id)}::uuid`)
            .join(",")});`,
        ),
      ),
    ).toBe(1);

    const read = await readDocumentPdfCore(organizationId, secondDocumentId, supabase);
    expect(read.outcome).toBe("success");
    if (read.outcome === "success") expect(Buffer.from(read.bytes)).toEqual(secondPdf);
    const signed = await createDocumentPdfSignedUrlCore(
      organizationId,
      secondDocumentId,
      60,
      supabase,
    );
    expect(signed.outcome).toBe("success");
    expect(await createDocumentPdfSignedUrlCore(organizationId, secondDocumentId, 61, supabase)).toMatchObject({
      outcome: "error",
      error: { code: "invalid_input" },
    });
    expect(await readDocumentPdfCore(otherOrganizationId, secondDocumentId, supabase)).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });
    expect(
      await createDocumentPdfSignedUrlCore(otherOrganizationId, secondDocumentId, 60, supabase),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
  } finally {
    await cleanup(supabase);
    expect(countDocumentFixtures()).toBe(0);
    expect(countStorageFixtures()).toBe(0);
  }
});

test("returns created and existing for two strictly identical concurrent replacements", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanup(supabase);

  try {
    const initial = await storeDocumentPdfCore(
      {
        organizationId,
        documentId: identicalReplacementInitialId,
        bytes: firstPdf,
        documentType: "other",
        title: "QA identical replacement initial PDF",
      },
      supabase,
    );
    expect(initial.outcome).toBe("created");
    if (initial.outcome === "error") throw new Error(initial.error.message);

    const replacementInput = {
      organizationId,
      documentId: identicalReplacementSuccessorId,
      replacesDocumentId: identicalReplacementInitialId,
      bytes: secondPdf,
      documentType: "other",
      title: "QA identical concurrent replacement PDF",
      generationData: { source: "identical-concurrency-e2e" },
      signatureRequired: true,
    } as const;
    const results = await Promise.all([
      storeDocumentPdfCore(replacementInput, supabase),
      storeDocumentPdfCore(replacementInput, supabase),
    ]);

    expect(results.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "existing")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "error")).toHaveLength(0);

    const successorPath = buildDocumentPdfPath(
      organizationId,
      identicalReplacementSuccessorId,
      2,
      sha256(secondPdf),
    )!;
    const successorObjectCountBeforeReplay = Number(
      runE2eSqlSync(`
        select count(*) from storage.objects
        where bucket_id = 'documents'
          and name like ${sqlQuote(
            `organizations/${organizationId}/documents/${identicalReplacementSuccessorId}/%`,
          )};
      `),
    );
    expect(successorObjectCountBeforeReplay).toBe(1);

    const sequentialReplay = await storeDocumentPdfCore(replacementInput, supabase);
    expect(sequentialReplay.outcome).toBe("existing");

    expect(
      Number(
        runE2eSqlSync(`
          select count(*) from public.documents
          where id = ${sqlQuote(identicalReplacementSuccessorId)}::uuid
            and replaces_document_id = ${sqlQuote(identicalReplacementInitialId)}::uuid;
        `),
      ),
    ).toBe(1);
    expect(
      Number(
        runE2eSqlSync(`
          select count(*) from public.documents
          where id = ${sqlQuote(identicalReplacementInitialId)}::uuid
            and superseded_at is not null;
        `),
      ),
    ).toBe(1);
    expect(
      Number(
        runE2eSqlSync(`
          select count(*) from storage.objects
          where bucket_id = 'documents'
            and name = ${sqlQuote(successorPath)};
        `),
      ),
    ).toBe(1);
    expect(
      Number(
        runE2eSqlSync(`
          select count(*) from storage.objects
          where bucket_id = 'documents'
            and name like ${sqlQuote(
              `organizations/${organizationId}/documents/${identicalReplacementSuccessorId}/%`,
            )};
        `),
      ),
    ).toBe(successorObjectCountBeforeReplay);
  } finally {
    await cleanup(supabase);
    expect(countDocumentFixtures()).toBe(0);
    expect(countStorageFixtures()).toBe(0);
  }
});

test("replaces strict legacy contracts atomically with a first stored PDF version", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await cleanup(supabase);
  insertLegacyFixtures();

  const [contactId] = legacyContactIds;
  const [reservationId, concurrentReservationId] = legacyReservationIds;

  try {
    const replacementInput = {
      organizationId,
      documentId: legacyDocumentIds.successor,
      replacesDocumentId: legacyDocumentIds.historical,
      bytes: firstPdf,
      documentType: "reservation_contract",
      title: "QA premier PDF stocké du contrat",
      contactId,
      reservationId,
    } as const;
    const created = await storeDocumentPdfCore(replacementInput, supabase);
    expect(created.outcome).toBe("created");
    if (created.outcome === "error") throw new Error(created.error.message);
    expect(created.version).toBe(1);
    expect(created.filePath).toContain(`/${legacyDocumentIds.successor}/v1/`);

    const rows = await supabase
      .from("documents")
      .select(
        "id, status, title, file_name, sent_at, signed_at, file_path, file_sha256, file_size_bytes, replaces_document_id, superseded_at",
      )
      .in("id", [legacyDocumentIds.historical, legacyDocumentIds.successor]);
    expect(rows.error).toBeNull();
    const historical = rows.data?.find((row) => row.id === legacyDocumentIds.historical);
    const successor = rows.data?.find((row) => row.id === legacyDocumentIds.successor);
    expect(historical).toMatchObject({
      status: "signed",
      title: "QA ancien contrat signé",
      file_name: "ancien-contrat-signe.pdf",
      sent_at: "2026-07-01T10:00:00+00:00",
      signed_at: "2026-07-02T11:00:00+00:00",
      file_path: null,
      file_sha256: null,
      file_size_bytes: null,
    });
    expect(historical?.superseded_at).not.toBeNull();
    expect(successor?.superseded_at).toBeNull();
    expect(successor?.replaces_document_id).toBe(legacyDocumentIds.historical);
    expect(successor?.file_path).toBe(created.filePath);

    const replay = await storeDocumentPdfCore(replacementInput, supabase);
    expect(replay.outcome).toBe("existing");
    if (replay.outcome === "error") throw new Error(replay.error.message);
    expect(replay.version).toBe(1);

    const concurrentInput = {
      organizationId,
      documentId: legacyDocumentIds.concurrentSuccessor,
      replacesDocumentId: legacyDocumentIds.concurrentHistorical,
      bytes: secondPdf,
      documentType: "reservation_contract",
      title: "QA premier PDF concurrent du contrat",
      contactId,
      reservationId: concurrentReservationId,
    } as const;
    const concurrent = await Promise.all([
      storeDocumentPdfCore(concurrentInput, supabase),
      storeDocumentPdfCore(concurrentInput, supabase),
    ]);
    expect(concurrent.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(concurrent.filter((result) => result.outcome === "existing")).toHaveLength(1);
    expect(concurrent.filter((result) => result.outcome === "error")).toHaveLength(0);
    expect(concurrent.every((result) => "version" in result && result.version === 1)).toBe(true);

    for (const predecessorId of [
      legacyDocumentIds.pathOnly,
      legacyDocumentIds.hashOnly,
      legacyDocumentIds.sizeOnly,
    ]) {
      const refused = await storeDocumentPdfCore(
        {
          organizationId,
          documentId: legacyDocumentIds.rejectedSuccessor,
          replacesDocumentId: predecessorId,
          bytes: firstPdf,
          documentType: "other",
          title: "QA métadonnées techniques partielles refusées",
        },
        supabase,
      );
      expect(refused).toMatchObject({
        outcome: "error",
        error: { code: "incoherent_metadata" },
      });
    }

    const typeMismatch = await storeDocumentPdfCore(
      {
        organizationId,
        documentId: legacyDocumentIds.rejectedSuccessor,
        replacesDocumentId: legacyDocumentIds.typeMismatch,
        bytes: firstPdf,
        documentType: "reservation_contract",
        title: "QA type différent refusé",
        contactId,
        reservationId,
      },
      supabase,
    );
    expect(typeMismatch).toMatchObject({
      outcome: "error",
      error: { code: "incoherent_metadata" },
    });

    const scopeMismatch = await storeDocumentPdfCore(
      {
        organizationId,
        documentId: legacyDocumentIds.rejectedSuccessor,
        replacesDocumentId: legacyDocumentIds.scopeMismatch,
        bytes: firstPdf,
        documentType: "reservation_contract",
        title: "QA périmètre différent refusé",
        contactId,
        reservationId,
      },
      supabase,
    );
    expect(scopeMismatch).toMatchObject({
      outcome: "error",
      error: { code: "incoherent_metadata" },
    });
  } finally {
    await cleanup(supabase);
    expect(countDocumentFixtures()).toBe(0);
    expect(countStorageFixtures()).toBe(0);
    expect(countLegacyRelationalFixtures()).toBe(0);
  }
});

test("reports an orphan when SQL fails and compensating Storage deletion fails", async () => {
  const logged: Array<{ event: string; details: Record<string, unknown> }> = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({ data: { role: "owner" }, error: null }),
  };
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } }, error: null }) },
    from: () => chain,
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "uploaded" }, error: null }),
        remove: async () => ({ data: null, error: { message: "simulated delete failure" } }),
      }),
    },
    rpc: async () => ({ data: null, error: { message: "simulated SQL failure" } }),
  } as unknown as SupabaseClient<Database>;

  const result = await storeDocumentPdfCore(
    {
      organizationId,
      documentId: firstDocumentId,
      bytes: firstPdf,
      documentType: "other",
      title: "QA orphan compensation",
    },
    fakeSupabase,
    { error: (event, details) => logged.push({ event, details }) },
  );
  expect(result).toMatchObject({
    outcome: "error",
    error: { code: "orphaned_storage_object" },
  });
  expect(logged).toHaveLength(1);
  expect(logged[0].event).toBe("document_pdf_storage_orphan");
  expect(logged[0].details.path).toMatch(
    new RegExp(`^organizations/${organizationId}/documents/${firstDocumentId}/v1/`),
  );
});
