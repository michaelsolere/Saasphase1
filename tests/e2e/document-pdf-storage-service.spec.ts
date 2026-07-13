import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildDocumentPdfPath,
  createDocumentPdfSignedUrlCore,
  isDocumentPdfMetadataCoherent,
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
const allDocumentIds = [
  firstDocumentId,
  secondDocumentId,
  ...concurrentDocumentIds,
  identicalReplacementInitialId,
  identicalReplacementSuccessorId,
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
      mime_type: "application/pdf",
    }),
  ).toBe(false);
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
    ).toBe(1);
  } finally {
    await cleanup(supabase);
    expect(countDocumentFixtures()).toBe(0);
    expect(countStorageFixtures()).toBe(0);
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
