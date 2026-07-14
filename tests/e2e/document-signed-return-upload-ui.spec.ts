import { createHash } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { storeDocumentPdfCore } from "../../src/features/documents/document-pdf-storage-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "7e180000-0000-4000-8000-000000000001",
  otherOrganization: "7e180000-0000-4000-8000-000000000002",
  ownerMembership: "7e180000-0000-4000-8000-000000000003",
  viewerMembership: "7e180000-0000-4000-8000-000000000004",
  outsiderMembership: "7e180000-0000-4000-8000-000000000005",
  contact: "7e180000-0000-4000-8000-000000000006",
  application: "7e180000-0000-4000-8000-000000000007",
  reservation: "7e180000-0000-4000-8000-000000000008",
  version1: "7e180000-0000-4000-8000-000000000009",
  version2: "7e180000-0000-4000-8000-000000000010",
  compensationDocument: "7e180000-0000-4000-8000-000000000011",
  viewerUser: "7e180000-0000-4000-8000-000000000012",
  viewerIdentity: "7e180000-0000-4000-8000-000000000013",
  outsiderUser: "7e180000-0000-4000-8000-000000000014",
  outsiderIdentity: "7e180000-0000-4000-8000-000000000015",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const viewerEmail = "signed-return-viewer@saasphase1.invalid";
const viewerPassword = "SignedReturnViewer-2026!";
const outsiderEmail = "signed-return-outsider@saasphase1.invalid";
const outsiderPassword = "SignedReturnOutsider-2026!";
const originalV1 = Buffer.from("%PDF-1.4\n% signed return original v1\n%%EOF\n");
const originalV2 = Buffer.from("%PDF-1.4\n% signed return original v2\n%%EOF\n");
const compensationOriginal = Buffer.from("%PDF-1.4\n% compensation original\n%%EOF\n");
const signedV1 = Buffer.from("%PDF-1.7\n% historical signed return\n%%EOF\n");
const signedV2 = Buffer.from("%PDF-1.7\n% current signed return\n%%EOF\n");
const differentSigned = Buffer.from("%PDF-1.7\n% conflicting signed return\n%%EOF\n");

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function payload(documentId: string, bytes: Buffer) {
  return {
    documentId,
    fileSha256: sha256(bytes),
    fileSizeBytes: bytes.byteLength,
  };
}

function storagePaths() {
  const value = sql(`
    select name from storage.objects
    where bucket_id = 'documents'
      and name like 'organizations/${ids.organization}/%'
    order by name;
  `);
  return value ? value.split("\n").filter(Boolean) : [];
}

async function removeStorageObjects(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const paths = storagePaths();
  if (paths.length === 0) return;
  const removed = await supabase.storage.from("documents").remove(paths);
  expect(removed.error, "Storage cleanup must succeed").toBeNull();
}

function cleanupRows() {
  sql(`
    delete from public.document_signed_returns where organization_id = ${q(ids.organization)}::uuid;
    delete from public.documents where organization_id = ${q(ids.organization)}::uuid;
    delete from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.payments where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id = ${q(ids.organization)}::uuid;
    delete from public.applications where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id = ${q(ids.organization)}::uuid;
    set session_replication_role = replica;
    delete from public.memberships where id in (${q(ids.ownerMembership)}::uuid, ${q(ids.viewerMembership)}::uuid, ${q(ids.outsiderMembership)}::uuid);
    set session_replication_role = origin;
    delete from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.otherOrganization)}::uuid);
    delete from auth.identities where user_id in (${q(ids.viewerUser)}::uuid, ${q(ids.outsiderUser)}::uuid);
    delete from auth.users where id in (${q(ids.viewerUser)}::uuid, ${q(ids.outsiderUser)}::uuid);
  `);
}

function seedRows() {
  cleanupRows();
  sql(`
    insert into public.organizations
      (id, name, legal_name, legal_form, slug, email, address_line1, postal_code, city, country)
    values
      (${q(ids.organization)}, 'Retours signés E2E', 'Retours signés E2E', 'company', 'signed-returns-e2e', 'signed@example.invalid', '1 rue E2E', '75001', 'Paris', 'FR'),
      (${q(ids.otherOrganization)}, 'Autre organisation E2E', 'Autre organisation E2E', 'company', 'signed-returns-other-e2e', 'other@example.invalid', '2 rue E2E', '69001', 'Lyon', 'FR');

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.ownerMembership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');

    insert into public.contacts
      (id, organization_id, display_name, first_name, last_name, email)
    values
      (${q(ids.contact)}, ${q(ids.organization)}, 'Adoptant retour signé E2E', 'Adoptant', 'Retour signé', 'adopter-signed@example.invalid');

    insert into public.applications
      (id, organization_id, contact_id, species, breed, status)
    values
      (${q(ids.application)}, ${q(ids.organization)}, ${q(ids.contact)}, 'dog', 'Golden Retriever', 'qualified');

    insert into public.reservations
      (id, organization_id, contact_id, application_id, status, price_cents, currency)
    values
      (${q(ids.reservation)}, ${q(ids.organization)}, ${q(ids.contact)}, ${q(ids.application)}, 'active', 250000, 'EUR');

    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{"display_name":"Viewer retours signés"}', now(), now()),
      (${q(ids.outsiderUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(outsiderEmail)}, extensions.crypt(${q(outsiderPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{"display_name":"Outsider retours signés"}', now(), now());

    insert into auth.identities
      (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values
      (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now()),
      (${q(ids.outsiderIdentity)}, ${q(outsiderEmail)}, ${q(ids.outsiderUser)}, jsonb_build_object('sub', ${q(ids.outsiderUser)}, 'email', ${q(outsiderEmail)}, 'email_verified', true), 'email', now(), now());

    insert into public.memberships (id, organization_id, profile_id, role, status)
    values
      (${q(ids.viewerMembership)}, ${q(ids.organization)}, ${q(ids.viewerUser)}, 'viewer', 'active'),
      (${q(ids.outsiderMembership)}, ${q(ids.otherOrganization)}, ${q(ids.outsiderUser)}, 'member', 'active');
  `);
}

async function login(page: Page, email = E2E_OWNER_EMAIL, password = E2E_OWNER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

async function prepareDocuments(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
) {
  const version1 = await storeDocumentPdfCore(
    {
      organizationId: ids.organization,
      documentId: ids.version1,
      bytes: originalV1,
      documentType: "reservation_contract",
      title: "Contrat signé E2E v1",
      contactId: ids.contact,
      applicationId: ids.application,
      reservationId: ids.reservation,
      signatureRequired: true,
    },
    supabase,
  );
  expect(version1).toMatchObject({ outcome: "created", version: 1 });
  sql(`update public.documents set status = 'sent', sent_at = '2026-07-14T08:00:00Z' where id = ${q(ids.version1)}::uuid;`);

  const version2 = await storeDocumentPdfCore(
    {
      organizationId: ids.organization,
      documentId: ids.version2,
      replacesDocumentId: ids.version1,
      bytes: originalV2,
      documentType: "reservation_contract",
      title: "Contrat signé E2E v2",
      contactId: ids.contact,
      applicationId: ids.application,
      reservationId: ids.reservation,
      signatureRequired: true,
    },
    supabase,
  );
  expect(version2).toMatchObject({ outcome: "created", version: 2 });

  const compensation = await storeDocumentPdfCore(
    {
      organizationId: ids.organization,
      documentId: ids.compensationDocument,
      bytes: compensationOriginal,
      documentType: "commitment_certificate",
      title: "Certificat compensation E2E",
      contactId: ids.contact,
      applicationId: ids.application,
      reservationId: ids.reservation,
      signatureRequired: true,
    },
    supabase,
  );
  expect(compensation).toMatchObject({ outcome: "created", version: 1 });

  sql(`
    update public.documents set status = 'signed', signed_at = '2026-07-14T08:30:00Z' where id = ${q(ids.version1)}::uuid;
    update public.documents set status = 'sent', sent_at = '2026-07-14T09:00:00Z' where id = ${q(ids.version2)}::uuid;
    update public.documents set status = 'sent', sent_at = '2026-07-14T09:30:00Z' where id = ${q(ids.compensationDocument)}::uuid;
  `);
}

async function assertRestrictedUsers(browser: Browser) {
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, viewerEmail, viewerPassword);
  const viewerDocument = await viewerPage.request.get(`/documents/${ids.version2}`);
  expect(viewerDocument.status()).toBe(200);
  expect(await viewerDocument.text()).not.toContain("Archiver le retour signé");
  const viewerDenied = await viewerPage.request.post(
    "/api/document-signed-returns/upload-intention",
    { data: payload(ids.version2, signedV2) },
  );
  expect(viewerDenied.status()).toBe(403);
  await viewerContext.close();

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await login(outsiderPage, outsiderEmail, outsiderPassword);
  const outsiderDenied = await outsiderPage.request.post(
    "/api/document-signed-returns/upload-intention",
    { data: payload(ids.version2, signedV2) },
  );
  expect([403, 404]).toContain(outsiderDenied.status());
  await outsiderContext.close();
}

test("archive les retours signés par TUS sans altérer les originaux", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const supabase = await createAuthenticatedSupabaseClient();
  sql(`delete from public.document_signed_returns where organization_id = ${q(ids.organization)}::uuid;`);
  await removeStorageObjects(supabase);
  cleanupRows();
  seedRows();

  try {
    await prepareDocuments(supabase);
    await login(page);

    for (const role of ["member", "admin", "owner"] as const) {
      sql(`
        set session_replication_role = replica;
        update public.memberships set role = ${q(role)} where id = ${q(ids.ownerMembership)}::uuid;
        set session_replication_role = origin;
      `);
      const response = await page.request.post(
        "/api/document-signed-returns/upload-intention",
        { data: payload(ids.version2, signedV2) },
      );
      expect(response.status(), `${role} must be allowed`).toBe(200);
    }
    await assertRestrictedUsers(browser);

    const firstIntentionResponse = await page.request.post(
      "/api/document-signed-returns/upload-intention",
      { data: payload(ids.version2, signedV2) },
    );
    const secondIntentionResponse = await page.request.post(
      "/api/document-signed-returns/upload-intention",
      { data: payload(ids.version2, signedV2) },
    );
    expect(firstIntentionResponse.status()).toBe(200);
    expect(secondIntentionResponse.status()).toBe(200);
    const firstIntention = await firstIntentionResponse.json();
    const secondIntention = await secondIntentionResponse.json();
    expect(secondIntention.signedReturnId).toBe(firstIntention.signedReturnId);
    expect(secondIntention.objectName).toBe(firstIntention.objectName);

    const wrongObjectName = firstIntention.objectName.replace(
      ids.version2,
      ids.version1,
    );
    const metadata = [
      `bucketName ${Buffer.from("documents").toString("base64")}`,
      `objectName ${Buffer.from(wrongObjectName).toString("base64")}`,
      `contentType ${Buffer.from("application/pdf").toString("base64")}`,
    ].join(",");
    const tokenReuse = await page.request.post(firstIntention.uploadEndpoint, {
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(signedV2.byteLength),
        "Upload-Metadata": metadata,
        "x-signature": firstIntention.uploadToken,
      },
    });
    expect(tokenReuse.status()).toBeGreaterThanOrEqual(400);

    const originalMetadataBefore = sql(`
      select jsonb_build_object(
        'file_path', file_path,
        'file_sha256', file_sha256,
        'file_size_bytes', file_size_bytes,
        'mime_type', mime_type,
        'generation_data', generation_data,
        'replaces_document_id', replaces_document_id,
        'superseded_at', superseded_at
      )::text from public.documents where id = ${q(ids.version2)}::uuid;
    `);
    const reservationBefore = sql(`select to_jsonb(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`);

    await page.goto(`/documents/${ids.version2}`);
    expect(await page.content()).not.toContain(firstIntention.objectName);
    expect(await page.content()).not.toContain(sha256(signedV2));
    expect(await page.content()).not.toContain(firstIntention.uploadToken);
    const currentRow = page.locator("li").filter({ hasText: "Version 2" });
    await currentRow.getByRole("button", { name: "Archiver le retour signé" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "retour-invalide.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a PDF"),
    });
    await dialog.getByRole("button", { name: "Archiver définitivement" }).click();
    await expect(dialog.getByRole("alert")).toContainText("signature PDF valide");

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
    oversized.write("%PDF-1.7\n", 0, "ascii");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "retour-trop-grand.pdf",
      mimeType: "application/pdf",
      buffer: oversized,
    });
    await dialog.getByRole("button", { name: "Archiver définitivement" }).click();
    await expect(dialog.getByRole("alert")).toContainText("maximum 10 Mio");

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "contrat-v2-retour-signe.pdf",
      mimeType: "application/pdf",
      buffer: signedV2,
    });
    await dialog.getByRole("button", { name: "Archiver définitivement" }).click();
    await expect(
      currentRow.getByRole("link", { name: "Ouvrir le retour signé" }),
    ).toBeVisible();

    expect(sql(`select status || '|' || (signed_at is not null)::text from public.documents where id = ${q(ids.version2)}::uuid;`)).toBe("signed|true");
    expect(sql(`select count(*) from public.document_signed_returns where document_id = ${q(ids.version2)}::uuid;`)).toBe("1");
    expect(sql(`
      select jsonb_build_object(
        'file_path', file_path,
        'file_sha256', file_sha256,
        'file_size_bytes', file_size_bytes,
        'mime_type', mime_type,
        'generation_data', generation_data,
        'replaces_document_id', replaces_document_id,
        'superseded_at', superseded_at
      )::text from public.documents where id = ${q(ids.version2)}::uuid;
    `)).toBe(originalMetadataBefore);
    expect(sql(`select to_jsonb(r)::text from public.reservations r where id = ${q(ids.reservation)}::uuid;`)).toBe(reservationBefore);
    expect(sql(`select count(*) from public.payments where organization_id = ${q(ids.organization)}::uuid;`)).toBe("0");
    expect(sql(`select count(*) from public.email_delivery_attempts where organization_id = ${q(ids.organization)}::uuid;`)).toBe("0");

    await expect(currentRow.getByRole("link", { name: "Ouvrir l’original" })).toBeVisible();
    await expect(currentRow.getByRole("link", { name: "Télécharger l’original" })).toBeVisible();
    await expect(currentRow.getByText("Retour signé archivé", { exact: true })).toBeVisible();
    await expect(page.getByText("Le statut “Reçu signé” correspond actuellement", { exact: false })).toHaveCount(1);

    const signedReturnId = sql(`select id::text from public.document_signed_returns where document_id = ${q(ids.version2)}::uuid;`);
    for (const download of [false, true]) {
      const response = await page.request.get(
        `/document-signed-returns/${signedReturnId}/pdf${download ? "?download=1" : ""}`,
        { maxRedirects: 0 },
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("application/pdf");
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["content-disposition"]).toBe(
        `${download ? "attachment" : "inline"}; filename="reservation-contract-v2-retour-signe.pdf"`,
      );
      expect(Buffer.compare(await response.body(), signedV2)).toBe(0);
    }

    const replay = await page.request.post("/api/document-signed-returns/finalize", {
      data: payload(ids.version2, signedV2),
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).outcome).toBe("existing");
    const different = await page.request.post(
      "/api/document-signed-returns/upload-intention",
      { data: payload(ids.version2, differentSigned) },
    );
    expect(different.status()).toBe(409);

    const historicalRow = page.locator("li").filter({ hasText: "Version 1" });
    await historicalRow.getByRole("button", { name: "Archiver le retour signé" }).click();
    const historicalDialog = page.getByRole("dialog");
    await historicalDialog.locator('input[type="file"]').setInputFiles({
      name: "contrat-v1-retour-signe.pdf",
      mimeType: "application/pdf",
      buffer: signedV1,
    });
    await historicalDialog.getByRole("button", { name: "Archiver définitivement" }).click();
    await expect(
      historicalRow.getByRole("link", { name: "Ouvrir le retour signé" }),
    ).toBeVisible();
    await expect(page.getByText("Le statut “Reçu signé” correspond actuellement", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archiver le retour signé" })).toHaveCount(0);

    const compensationPayload = payload(ids.compensationDocument, differentSigned);
    const compensationIntentionResponse = await page.request.post(
      "/api/document-signed-returns/upload-intention",
      { data: compensationPayload },
    );
    expect(compensationIntentionResponse.status()).toBe(200);
    const compensationIntention = await compensationIntentionResponse.json();
    const compensationUpload = await supabase.storage
      .from("documents")
      .upload(compensationIntention.objectName, differentSigned, {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(compensationUpload.error).toBeNull();
    sql(`
      set session_replication_role = replica;
      update public.documents set status = 'uploaded' where id = ${q(ids.compensationDocument)}::uuid;
      set session_replication_role = origin;
    `);
    const failedFinalization = await page.request.post(
      "/api/document-signed-returns/finalize",
      { data: compensationPayload },
    );
    expect(failedFinalization.status()).toBe(409);
    expect(sql(`select count(*) from storage.objects where bucket_id = 'documents' and name = ${q(compensationIntention.objectName)};`)).toBe("0");

    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.request.get(
      `/document-signed-returns/${signedReturnId}/pdf`,
      { maxRedirects: 0 },
    );
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers().location).toMatch(/\/login$/);
    await anonymousContext.close();

    const html = await page.content();
    for (const secret of [
      ...storagePaths(),
      sha256(signedV1),
      sha256(signedV2),
      firstIntention.uploadToken,
      "/storage/v1/upload/resumable/sign",
    ]) {
      expect(html).not.toContain(secret);
    }
  } finally {
    sql(`delete from public.document_signed_returns where organization_id = ${q(ids.organization)}::uuid;`);
    await removeStorageObjects(supabase);
    cleanupRows();

    expect(storagePaths()).toEqual([]);
    for (const table of [
      "document_signed_returns",
      "documents",
      "email_delivery_attempts",
      "payments",
      "reservations",
      "applications",
      "contacts",
    ]) {
      expect(
        sql(`select count(*) from public.${table} where organization_id = ${q(ids.organization)}::uuid;`),
        `${table} fixtures must be hard-deleted`,
      ).toBe("0");
    }
    expect(sql(`select count(*) from public.memberships where id in (${q(ids.ownerMembership)}::uuid, ${q(ids.viewerMembership)}::uuid, ${q(ids.outsiderMembership)}::uuid);`)).toBe("0");
    expect(sql(`select count(*) from public.organizations where id in (${q(ids.organization)}::uuid, ${q(ids.otherOrganization)}::uuid);`)).toBe("0");
    expect(sql(`select count(*) from auth.identities where user_id in (${q(ids.viewerUser)}::uuid, ${q(ids.outsiderUser)}::uuid);`)).toBe("0");
    expect(sql(`select count(*) from auth.users where id in (${q(ids.viewerUser)}::uuid, ${q(ids.outsiderUser)}::uuid);`)).toBe("0");
  }
});
