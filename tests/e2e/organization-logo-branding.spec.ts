import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { validateOrganizationLogoBytes } from "../../src/features/settings/organization-logo-image";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000099";
const userId = "10000000-0000-4000-8000-000000000001";
const assetA = "9f150002-0000-4000-8000-000000000001";
const assetB = "9f150002-0000-4000-8000-000000000002";
const assetOther = "9f150002-0000-4000-8000-000000000003";
const assetCompensation = "9f150002-0000-4000-8000-000000000004";
const previewFamilyId = "9f150002-0000-4000-8000-000000000010";
const previewTemplateId = "9f150002-0000-4000-8000-000000000011";
const previewDefinition = JSON.stringify({
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat aperçu branding E2E",
  preamble: ["Préambule E2E."],
  clauses: {
    reservationPurpose: ["Objet E2E."], priceAndPayments: ["Prix E2E."],
    deposit: ["Arrhes E2E."], cancellationAndRefund: ["Annulation E2E."],
    postponementAndCredit: ["Report E2E."], potentialWithholding: ["Retenue E2E."],
    finalConditions: ["Conditions E2E."],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
});

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function setRole(role: "owner" | "admin" | "member" | "viewer") {
  sql(`set session_replication_role = replica; update public.memberships set role = ${sqlQuote(role)}, updated_at = now() where organization_id = ${sqlQuote(organizationId)}::uuid and profile_id = ${sqlQuote(userId)}::uuid; set session_replication_role = origin;`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

async function imageFixtures() {
  const pngA = await sharp({
    create: { width: 320, height: 100, channels: 4, background: "#14532d" },
  }).png().toBuffer();
  const jpegB = await sharp({
    create: { width: 180, height: 300, channels: 3, background: "#1d4ed8" },
  }).jpeg({ quality: 90 }).toBuffer();
  return { pngA, jpegB };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetPath(assetId: string, hash: string, extension: "png" | "jpg", org = organizationId) {
  return `organizations/${org}/branding/logos/${assetId}/${hash}.${extension}`;
}

async function uploadThroughUi(page: Page, input: {
  assetId: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
}, expectedStatus: "success" | "error" = "success") {
  const fileInput = page.locator('#visual-identity input[type="file"]');
  const form = fileInput.locator("xpath=ancestor::form");
  await form.evaluate((element, deterministicAssetId) => {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "asset_id";
    hidden.value = deterministicAssetId;
    element.appendChild(hidden);
  }, input.assetId);
  const actionResponse = page.waitForResponse((response) =>
    response.request().method() === "POST"
      && response.url().includes("/settings/organization"),
  );
  await fileInput.setInputFiles({
    name: input.name,
    mimeType: input.mimeType,
    buffer: input.bytes,
  });
  await actionResponse;
  await expect(page).toHaveURL(
    new RegExp(`branding_status=${expectedStatus}`),
    { timeout: 30_000 },
  );
}

async function expectTemplatePreview(page: Page, familyId: string) {
  await page.goto(`/documents/modeles/${familyId}`);
  const mobilePreviewButton = page.getByRole("button", { name: "Aperçu", exact: true }).first();
  if (await mobilePreviewButton.isVisible()) await mobilePreviewButton.click();
  await expect(page.getByText(
    "Aperçu avec données fictives et identité visuelle actuelle — aucune réservation ni aucun document n’est créé ou modifié.",
  ).first()).toBeVisible();
  await expect(page.locator('iframe[data-document-pdf-preview="ready"]').first())
    .toBeVisible({ timeout: 30_000 });
  expect(await page.locator("body").textContent()).not.toContain("organizations/");
}

test("valide les octets PNG/JPEG et refuse les formats falsifiés ou invalides", async () => {
  const { pngA, jpegB } = await imageFixtures();
  const png = await validateOrganizationLogoBytes({ bytes: pngA, declaredMimeType: "image/png" });
  const jpeg = await validateOrganizationLogoBytes({ bytes: jpegB, declaredMimeType: "image/jpeg" });
  expect(png).toMatchObject({ ok: true, logo: { widthPx: 320, heightPx: 100, mimeType: "image/png" } });
  expect(jpeg).toMatchObject({ ok: true, logo: { widthPx: 180, heightPx: 300, mimeType: "image/jpeg" } });
  expect(await validateOrganizationLogoBytes({ bytes: pngA, declaredMimeType: "image/jpeg" })).toEqual({ ok: false, code: "invalid_type" });
  expect(await validateOrganizationLogoBytes({ bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") , declaredMimeType: "image/svg+xml" })).toEqual({ ok: false, code: "invalid_type" });
  expect(await validateOrganizationLogoBytes({ bytes: Buffer.from("GIF89a"), declaredMimeType: "image/gif" })).toEqual({ ok: false, code: "invalid_type" });
  expect(await validateOrganizationLogoBytes({ bytes: Buffer.from([1, 2, 3]), declaredMimeType: "image/png" })).toEqual({ ok: false, code: "unreadable" });
  expect(await validateOrganizationLogoBytes({ bytes: Buffer.alloc(512 * 1024 + 1), declaredMimeType: "image/png" })).toEqual({ ok: false, code: "too_large" });
  const tooSmall = await sharp({ create: { width: 15, height: 16, channels: 4, background: "red" } }).png().toBuffer();
  expect(await validateOrganizationLogoBytes({ bytes: tooSmall, declaredMimeType: "image/png" })).toEqual({ ok: false, code: "invalid_dimensions" });
});

test("versionne le logo, protège Storage/RPC et conserve toutes les versions après retrait", async ({ page }) => {
  test.setTimeout(180_000);
  const supabase = await createAuthenticatedSupabaseClient();
  const { pngA, jpegB } = await imageFixtures();
  const hashA = sha256(pngA);
  const hashB = sha256(jpegB);
  const pathA = assetPath(assetA, hashA, "png");
  const pathB = assetPath(assetB, hashB, "jpg");
  const otherPath = assetPath(assetOther, hashA, "png", otherOrganizationId);
  const compensationPath = assetPath(assetCompensation, hashA, "png");
  const paths = [pathA, pathB, otherPath, compensationPath];

  sql(`delete from public.document_templates where id = ${sqlQuote(previewTemplateId)}::uuid; delete from public.document_template_families where id = ${sqlQuote(previewFamilyId)}::uuid;`);
  sql(`delete from public.organization_brand_assets where id in (${sqlQuote(assetA)}::uuid, ${sqlQuote(assetB)}::uuid, ${sqlQuote(assetOther)}::uuid, ${sqlQuote(assetCompensation)}::uuid);`);
  const initialRemoval = await supabase.storage.from("organization-assets").remove(paths);
  if (initialRemoval.error) throw new Error(`initial Storage cleanup: ${initialRemoval.error.message}`);
  setRole("owner");
  sql(`
    insert into public.document_template_families (
      id, organization_id, name, description, document_type, species, breed, created_by, updated_by
    ) values (
      ${sqlQuote(previewFamilyId)}::uuid, ${sqlQuote(organizationId)}::uuid,
      'Aperçu branding E2E', 'Fixture temporaire branding', 'reservation_contract',
      'dog', 'Golden Retriever', ${sqlQuote(userId)}::uuid, ${sqlQuote(userId)}::uuid
    );
    insert into public.document_templates (
      id, organization_id, family_id, name, description, document_type, species, breed,
      template_format, template_content, version, lifecycle_status, is_active,
      published_at, published_by, created_by, updated_by
    ) values (
      ${sqlQuote(previewTemplateId)}::uuid, ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(previewFamilyId)}::uuid, 'Aperçu branding E2E', 'Fixture temporaire branding',
      'reservation_contract', 'dog', 'Golden Retriever', 'json', ${sqlQuote(previewDefinition)},
      1, 'published', true, now(), ${sqlQuote(userId)}::uuid,
      ${sqlQuote(userId)}::uuid, ${sqlQuote(userId)}::uuid
    );
  `);

  try {
    expect(Number(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = 'organization_brand_assets' and cmd = 'SELECT';`))).toBe(1);
    expect(Number(sql(`select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'organization_assets_objects_%';`))).toBe(3);
    expect(sql(`select has_table_privilege('authenticated', 'public.organization_brand_assets', 'SELECT')::text || ',' || has_table_privilege('authenticated', 'public.organization_brand_assets', 'INSERT')::text || ',' || has_table_privilege('authenticated', 'public.organization_brand_assets', 'UPDATE')::text || ',' || has_table_privilege('authenticated', 'public.organization_brand_assets', 'DELETE')::text;`)).toBe("true,false,false,false");

    await test.step("connexion et ouverture des réglages", async () => {
      await login(page);
      await page.goto("/settings/organization#visual-identity");
    });
    await expect(page.getByRole("heading", { name: "Identité visuelle" })).toBeVisible();
    await expect(page.getByText("Aucun logo actif")).toBeVisible();
    await test.step("import PNG A par l’interface", async () => {
      await uploadThroughUi(page, { assetId: assetA, name: "logo-a.png", mimeType: "image/png", bytes: pngA });
    });
    await expect(page.getByAltText("Logo actif de l’organisation")).toBeVisible({ timeout: 15_000 });
    expect(sql(`select id::text from public.organization_brand_assets where organization_id = ${sqlQuote(organizationId)}::uuid and retired_at is null;`)).toBe(assetA);
    const idempotentActivation = await supabase.rpc("activate_organization_logo", {
      p_organization_id: organizationId,
      p_asset_id: assetA,
      p_file_path: pathA,
      p_file_sha256: hashA,
      p_file_size_bytes: pngA.byteLength,
      p_mime_type: "image/png",
      p_width_px: 320,
      p_height_px: 100,
    });
    expect(idempotentActivation.error).toBeNull();
    expect(idempotentActivation.data?.[0]?.outcome).toBe("existing");
    await test.step("compensation d’un upload dont l’activation SQL échoue", async () => {
      await uploadThroughUi(page, {
        assetId: assetCompensation,
        name: "logo-a-duplique.png",
        mimeType: "image/png",
        bytes: pngA,
      }, "error");
      expect(Number(sql(`select count(*) from storage.objects where bucket_id = 'organization-assets' and name = ${sqlQuote(compensationPath)};`))).toBe(0);
      expect(Number(sql(`select count(*) from public.organization_brand_assets where id = ${sqlQuote(assetCompensation)}::uuid;`))).toBe(0);
    });
    await test.step("aperçu PDF avec le logo A", async () => {
      await expectTemplatePreview(page, previewFamilyId);
      await page.goto("/settings/organization#visual-identity");
    });

    const privateResponse = await page.request.get(`/api/organization-logo/${assetA}`);
    expect(privateResponse.status()).toBe(200);
    expect(privateResponse.headers()["cache-control"]).toContain("private");
    expect(privateResponse.headers()["cache-control"]).toContain("no-store");
    expect(Buffer.from(await privateResponse.body())).toEqual(pngA);
    expect(await page.locator("body").textContent()).not.toContain("organizations/");

    const directInsert = await supabase.from("organization_brand_assets").insert({
      id: assetOther,
      organization_id: organizationId,
      asset_type: "logo",
      file_path: otherPath,
      file_sha256: hashA,
      file_size_bytes: pngA.byteLength,
      mime_type: "image/png",
      width_px: 320,
      height_px: 100,
      created_by: userId,
    });
    expect(directInsert.error).not.toBeNull();
    const isolatedUpload = await supabase.storage.from("organization-assets").upload(otherPath, pngA, { contentType: "image/png", upsert: false });
    expect(isolatedUpload.error).not.toBeNull();

    await test.step("remplacement JPEG B par un admin", async () => {
      setRole("admin");
      await page.reload();
      await uploadThroughUi(page, { assetId: assetB, name: "logo-b.jpg", mimeType: "image/jpeg", bytes: jpegB });
    });
    expect(sql(`select id::text from public.organization_brand_assets where organization_id = ${sqlQuote(organizationId)}::uuid and retired_at is null;`)).toBe(assetB);
    expect(sql(`select (retired_at is not null and retired_by = ${sqlQuote(userId)}::uuid)::text from public.organization_brand_assets where id = ${sqlQuote(assetA)}::uuid;`)).toBe("true");
    await test.step("aperçu PDF actualisé avec le logo B", async () => {
      await expectTemplatePreview(page, previewFamilyId);
      await page.goto("/settings/organization#visual-identity");
    });

    const upsertAttempt = await supabase.storage.from("organization-assets").upload(pathB, jpegB, { contentType: "image/jpeg", upsert: true });
    expect(upsertAttempt.error).not.toBeNull();

    await test.step("consultation seule member et viewer", async () => {
      for (const role of ["member", "viewer"] as const) {
        setRole(role);
        await page.reload();
        await expect(page.getByRole("button", { name: "Retirer le logo" })).toHaveCount(0);
        await expect(page.getByText(/Votre rôle permet de consulter/)).toBeVisible();
        const rpc = await supabase.rpc("retire_active_organization_logo", { p_organization_id: organizationId });
        expect(rpc.error).not.toBeNull();
      }
    });

    await test.step("retrait confirmé sur mobile", async () => {
      setRole("owner");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.locator("#visual-identity")).toBeVisible();
      await page.getByRole("button", { name: "Retirer le logo" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: "Confirmer le retrait" }).click();
      await expect(page).toHaveURL(/branding_status=removed/, { timeout: 30_000 });
      await expect(page.getByText("Aucun logo actif")).toBeVisible();
    });
    await test.step("aperçu PDF sans logo après retrait", async () => {
      await expectTemplatePreview(page, previewFamilyId);
    });

    expect(Number(sql(`select count(*) from public.organization_brand_assets where id in (${sqlQuote(assetA)}::uuid, ${sqlQuote(assetB)}::uuid);`))).toBe(2);
    expect(Number(sql(`select count(*) from public.organization_brand_assets where id in (${sqlQuote(assetA)}::uuid, ${sqlQuote(assetB)}::uuid) and retired_at is not null;`))).toBe(2);
    expect(Number(sql(`select count(*) from storage.objects where bucket_id = 'organization-assets' and name in (${sqlQuote(pathA)}, ${sqlQuote(pathB)});`))).toBe(2);
  } finally {
    setRole("owner");
    sql(`delete from public.document_templates where id = ${sqlQuote(previewTemplateId)}::uuid; delete from public.document_template_families where id = ${sqlQuote(previewFamilyId)}::uuid;`);
    sql(`delete from public.organization_brand_assets where id in (${sqlQuote(assetA)}::uuid, ${sqlQuote(assetB)}::uuid, ${sqlQuote(assetOther)}::uuid, ${sqlQuote(assetCompensation)}::uuid);`);
    const removal = await supabase.storage.from("organization-assets").remove(paths);
    if (removal.error) throw new Error(`final Storage cleanup: ${removal.error.message}`);
    expect(Number(sql(`select count(*) from public.organization_brand_assets where id in (${sqlQuote(assetA)}::uuid, ${sqlQuote(assetB)}::uuid, ${sqlQuote(assetOther)}::uuid, ${sqlQuote(assetCompensation)}::uuid) or file_sha256 in (${sqlQuote(hashA)}, ${sqlQuote(hashB)});`))).toBe(0);
    expect(Number(sql(`select count(*) from storage.objects where bucket_id = 'organization-assets' and (name in (${paths.map(sqlQuote).join(",")}) or name like 'organizations/${organizationId}/branding/logos/9f150002-%');`))).toBe(0);
    expect(Number(sql(`select (select count(*) from public.document_templates where id = ${sqlQuote(previewTemplateId)}::uuid) + (select count(*) from public.document_template_families where id = ${sqlQuote(previewFamilyId)}::uuid);`))).toBe(0);
  }
});
