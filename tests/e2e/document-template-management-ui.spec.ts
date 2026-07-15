import { expect, test, type Page } from "@playwright/test";

import { decodeDocumentTemplateDraft } from "../../src/features/documents/decode-document-template-draft";
import type {
  CommitmentCertificateTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const ids = {
  reservationFamily: "9f140003-0000-4000-8000-000000000001",
  commitmentFamily: "9f140003-0000-4000-8000-000000000002",
  unsupportedFamily: "9f140003-0000-4000-8000-000000000003",
  reservationPublication: "9f140003-0000-4000-8000-000000000011",
  commitmentPublication: "9f140003-0000-4000-8000-000000000012",
  commitmentDraft: "9f140003-0000-4000-8000-000000000013",
  unsupportedDraft: "9f140003-0000-4000-8000-000000000014",
} as const;

const familyIds = [
  ids.reservationFamily,
  ids.commitmentFamily,
  ids.unsupportedFamily,
];

const reservationDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat UI E2E publié",
  preamble: ["Préambule du contrat UI E2E."],
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

const commitmentDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat UI E2E",
  introduction: ["Introduction du certificat UI E2E."],
  sections: {
    animalNeeds: ["Besoins de l’animal."],
    health: ["Santé de l’animal."],
    educationAndBehavior: ["Éducation et comportement."],
    costsAndConstraints: ["Coûts et contraintes."],
    holderObligations: ["Obligations du détenteur."],
  },
  acknowledgmentText: ["Je reconnais avoir pris connaissance de ces informations."],
  signatureLabels: {
    holder: "Le détenteur",
    issuer: "L’émetteur",
  },
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function familyIdList() {
  return familyIds.map((id) => `${q(id)}::uuid`).join(", ");
}

function cleanup() {
  sql(`
    delete from public.document_templates
    where family_id in (${familyIdList()});
    delete from public.document_template_families
    where id in (${familyIdList()});
    set session_replication_role = replica;
    update public.memberships
    set role = 'owner'
    where id = ${q(membershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingFixtureCount() {
  return Number(sql(`
    select
      (select count(*) from public.document_templates
       where family_id in (${familyIdList()}))
      + (select count(*) from public.document_template_families
         where id in (${familyIdList()}))
      + (select count(*) from public.memberships
         where id = ${q(membershipId)}::uuid and role <> 'owner');
  `));
}

function seedFixtures() {
  const familyRows = [
    `(${q(ids.reservationFamily)}, ${q(organizationId)}, 'Contrat UI E2E', 'Famille avec publication sans brouillon', 'reservation_contract')`,
    `(${q(ids.commitmentFamily)}, ${q(organizationId)}, 'Certificat UI E2E', 'Famille avec publication et brouillon', 'commitment_certificate')`,
    `(${q(ids.unsupportedFamily)}, ${q(organizationId)}, 'Document libre UI E2E', 'Type volontairement sans éditeur structuré', 'other')`,
  ].join(",\n");

  sql(`
    insert into public.document_template_families (
      id, organization_id, name, description, document_type,
      species, breed, created_by, updated_by
    ) values
      ${familyRows.replaceAll(")", `, 'dog', 'Golden Retriever', ${q(ownerId)}, ${q(ownerId)})`)};

    insert into public.document_templates (
      id, organization_id, family_id, name, description, document_type,
      species, breed, template_format, template_content, version,
      lifecycle_status, is_active, published_at, published_by,
      created_by, updated_by
    ) values
      (${q(ids.reservationPublication)}, ${q(organizationId)}, ${q(ids.reservationFamily)},
       'Contrat UI E2E', 'Publication du contrat', 'reservation_contract',
       'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(reservationDefinition))},
       1, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.commitmentPublication)}, ${q(organizationId)}, ${q(ids.commitmentFamily)},
       'Certificat UI E2E', 'Publication du certificat', 'commitment_certificate',
       'dog', 'Golden Retriever', 'json', ${q(JSON.stringify({ ...commitmentDefinition, title: "Certificat UI E2E publié" }))},
       1, 'published', true, now(), ${q(ownerId)}, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.commitmentDraft)}, ${q(organizationId)}, ${q(ids.commitmentFamily)},
       'Certificat UI E2E', 'Brouillon du certificat', 'commitment_certificate',
       'dog', 'Golden Retriever', 'json', ${q(JSON.stringify(commitmentDefinition))},
       2, 'draft', false, null, null, ${q(ownerId)}, ${q(ownerId)}),
      (${q(ids.unsupportedDraft)}, ${q(organizationId)}, ${q(ids.unsupportedFamily)},
       'Document libre UI E2E', 'Brouillon sans éditeur', 'other',
       'dog', 'Golden Retriever', 'json', '{}',
       1, 'draft', false, null, null, ${q(ownerId)}, ${q(ownerId)});
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function setRole(role: "viewer" | "member" | "admin" | "owner") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(membershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function draftSection(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: /Brouillon actuel/ }),
  });
}

test("reconstruit une forme éditable sans valider le brouillon", () => {
  const commitment = decodeDocumentTemplateDraft({
    documentType: "commitment_certificate",
    templateContent: JSON.stringify({
      documentType: "commitment_certificate",
      title: "",
      introduction: [],
      sections: { health: ["Santé conservée."] },
    }),
  });
  expect(commitment.documentType).toBe("commitment_certificate");
  if (commitment.documentType !== "commitment_certificate") return;
  expect(commitment.title).toBe("");
  expect(commitment.introduction).toEqual([]);
  expect(commitment.sections.health).toEqual(["Santé conservée."]);
  expect(commitment.sections.animalNeeds).toEqual([]);
  expect(commitment.signatureLabels).toEqual({ holder: "", issuer: "" });

  const reservation = decodeDocumentTemplateDraft({
    documentType: "reservation_contract",
    templateContent: "{}",
  });
  expect(reservation.documentType).toBe("reservation_contract");
  if (reservation.documentType !== "reservation_contract") return;
  expect(reservation.preamble).toEqual([]);
  expect(reservation.clauses.finalConditions).toEqual([]);
  expect(reservation.signatureLabels).toEqual({ breeder: "", reservingParty: "" });
});

test("gère les modèles documentaires avec permissions, validation et concurrence", async ({ page }) => {
  await page.addInitScript(() => {
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const revokedUrls: string[] = [];
    Object.defineProperty(window, "__revokedBlobUrls", { value: revokedUrls });
    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
      originalRevokeObjectUrl(url);
    };
  });
  const createdTemplateIds = [
    ids.reservationPublication,
    ids.commitmentPublication,
    ids.commitmentDraft,
    ids.unsupportedDraft,
  ];

  try {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
    seedFixtures();
    await login(page);

    await page.goto("/documents");
    const documentTemplatesLink = page.getByRole("main").getByRole("link", {
      name: "Modèles de référence",
    });
    await expect(documentTemplatesLink).toBeVisible();
    await documentTemplatesLink.click();
    await expect(page).toHaveURL(/\/documents\/modeles$/);
    await expect(page.getByRole("heading", { name: "Modèles de référence" })).toBeVisible();
    await expect(page.getByText("Contrat UI E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("Certificat UI E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("Document libre UI E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Version 1", { exact: true }).first()).toBeVisible();

    await page.goto(`/documents/modeles/${ids.unsupportedFamily}`);
    await expect(page.getByText("Éditeur non encore disponible")).toBeVisible();
    await expect(page.getByText("Ce type documentaire reste consultable")).toBeVisible();

    setRole("viewer");
    await page.goto(`/documents/modeles/${ids.commitmentFamily}`);
    const viewerDraft = draftSection(page);
    await expect(viewerDraft.getByRole("button", { name: "Valider le brouillon" })).toBeVisible();
    await expect(viewerDraft.getByRole("button", { name: "Enregistrer le brouillon" })).toHaveCount(0);
    await expect(viewerDraft.getByRole("button", { name: "Publier" })).toHaveCount(0);
    await expect(viewerDraft.getByLabel("Titre")).toBeDisabled();
    await viewerDraft.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(viewerDraft.getByRole("status")).toContainText("respecte le schéma documentaire");

    setRole("member");
    await page.reload();
    const memberDraft = draftSection(page);
    await expect(memberDraft.getByRole("button", { name: "Enregistrer le brouillon" })).toBeVisible();
    await expect(memberDraft.getByRole("button", { name: "Valider le brouillon" })).toBeVisible();
    await expect(memberDraft.getByRole("button", { name: "Publier" })).toHaveCount(0);
    await memberDraft.getByLabel("Titre").fill("Certificat UI E2E modifié par membre");
    await memberDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(memberDraft.getByRole("status")).toContainText("a été enregistré");
    expect(sql(`select template_content::jsonb->>'title' from public.document_templates where id = ${q(ids.commitmentDraft)}::uuid;`))
      .toBe("Certificat UI E2E modifié par membre");

    await page.goto(`/documents/modeles/${ids.reservationFamily}`);
    await expect(page.getByRole("button", { name: "Créer le prochain brouillon" })).toBeVisible();
    await page.getByRole("button", { name: "Créer le prochain brouillon" }).click();
    await expect(page.getByRole("heading", { name: /Brouillon actuel · version 2/ })).toBeVisible({ timeout: 20_000 });
    const reservationDraftId = sql(`select id::text from public.document_templates where family_id = ${q(ids.reservationFamily)}::uuid and lifecycle_status = 'draft';`);
    expect(reservationDraftId).toMatch(/^[0-9a-f-]{36}$/);
    createdTemplateIds.push(reservationDraftId);

    let reservationDraft = draftSection(page);
    await reservationDraft.getByLabel("Titre").fill("Contrat UI E2E sauvegardé");
    await reservationDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("a été enregistré");
    await reservationDraft.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("respecte le schéma documentaire");

    sql(`select pg_sleep(0.05); update public.document_templates set template_content = jsonb_set(template_content::jsonb, '{title}', '"Contrat UI E2E concurrent"')::text where id = ${q(reservationDraftId)}::uuid;`);
    await reservationDraft.getByLabel("Titre").fill("Écrasement UI E2E refusé");
    await reservationDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("Rechargez-le avant de réessayer");
    await expect(reservationDraft.getByText("Modifications non enregistrées")).toBeVisible();

    await page.reload();
    reservationDraft = draftSection(page);
    const preamble = reservationDraft.locator('[data-paragraph-list$="preamble"]');
    await preamble.getByRole("button", { name: "Supprimer le paragraphe 1" }).click();
    await reservationDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect.poll(() => sql(`select jsonb_array_length(template_content::jsonb->'preamble') from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe("0");
    await page.reload();
    reservationDraft = draftSection(page);
    await expect(reservationDraft.getByLabel("Titre")).toBeVisible();
    const emptyPreamble = reservationDraft.locator('[data-paragraph-list$="preamble"]');
    await expect(emptyPreamble.getByText("Aucun paragraphe")).toBeVisible();
    await reservationDraft.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("ne respecte pas le schéma documentaire attendu");

    await emptyPreamble.getByRole("button", { name: "Ajouter un paragraphe" }).click();
    await emptyPreamble.getByRole("textbox", { name: "Paragraphe 1" }).fill("Préambule UI E2E réparé.");
    await reservationDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("a été enregistré");
    await reservationDraft.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(reservationDraft.getByRole("status")).toContainText("respecte le schéma documentaire");

    setRole("admin");
    await page.reload();
    const adminDraft = draftSection(page);
    const editorPane = adminDraft.locator("[data-template-editor-pane]");
    const previewPane = adminDraft.locator("[data-template-preview-pane]");
    await expect(editorPane).toBeVisible();
    await expect(previewPane).toBeVisible();
    await expect(previewPane.getByText(
      "Aperçu avec données fictives et identité visuelle actuelle — aucune réservation ni aucun document n’est créé ou modifié.",
    )).toBeVisible();
    await expect(previewPane.locator('iframe[data-document-pdf-preview="ready"]'))
      .toBeVisible({ timeout: 30_000 });
    const fullSizeLink = previewPane.getByRole("link", { name: "Ouvrir l’aperçu en grand" });
    await expect(fullSizeLink).toBeVisible();
    await expect(fullSizeLink).toHaveAttribute("target", "_blank");
    await expect(fullSizeLink).toHaveAttribute("rel", "noopener noreferrer");
    const initialBlobUrl = await fullSizeLink.getAttribute("href");
    expect(initialBlobUrl).toMatch(/^blob:/);
    const savedTitle = sql(`select template_content::jsonb->>'title' from public.document_templates where id = ${q(reservationDraftId)}::uuid;`);
    const savedUpdatedAt = sql(`select updated_at::text from public.document_templates where id = ${q(reservationDraftId)}::uuid;`);
    const initialDocumentCount = sql(`select count(*) from public.documents where organization_id = ${q(organizationId)}::uuid;`);
    const initialDocumentObjectCount = sql("select count(*) from storage.objects where bucket_id = 'documents';");
    await adminDraft.getByLabel("Titre").fill("Contrat UI E2E prêt à publier");
    await expect(adminDraft.getByText("Modifications non enregistrées")).toBeVisible();
    await expect(adminDraft.getByRole("button", { name: "Publier" })).toBeDisabled();
    await expect(previewPane.locator('iframe[data-document-pdf-preview="ready"]'))
      .toHaveAttribute("title", "Aperçu PDF — Contrat UI E2E prêt à publier", {
        timeout: 30_000,
      });
    await expect(fullSizeLink).toHaveAttribute("href", /^blob:/);
    const localDraftBlobUrl = await fullSizeLink.getAttribute("href");
    expect(localDraftBlobUrl).not.toBe(initialBlobUrl);
    await expect.poll(() => page.evaluate((url) =>
      (window as Window & { __revokedBlobUrls: string[] }).__revokedBlobUrls.includes(url),
    initialBlobUrl!)).toBe(true);
    const localPdf = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const title = "Contrat UI E2E prêt à publier";
      const utf16Title = new Uint8Array([
        0xfe,
        0xff,
        ...Array.from(title).flatMap((character) => {
          const codePoint = character.charCodeAt(0);
          return [codePoint >> 8, codePoint & 0xff];
        }),
      ]);
      const includesBytes = (needle: Uint8Array) => bytes.some((_, index) =>
        index + needle.length <= bytes.length
          && needle.every((value, offset) => bytes[index + offset] === value));
      return {
        prefix: String.fromCharCode(...bytes.slice(0, 5)),
        size: bytes.byteLength,
        containsLocalTitle: new TextDecoder("latin1")
          .decode(bytes)
          .includes(title) || includesBytes(utf16Title),
      };
    }, localDraftBlobUrl!);
    expect(localPdf).toMatchObject({ prefix: "%PDF-", containsLocalTitle: true });
    expect(localPdf.size).toBeGreaterThan(4_000);
    const popupPromise = page.waitForEvent("popup");
    await fullSizeLink.click();
    const popup = await popupPromise;
    expect(await fullSizeLink.getAttribute("href")).toBe(localDraftBlobUrl);
    expect(popup.isClosed()).toBe(false);
    await popup.close();
    expect(sql(`select template_content::jsonb->>'title' from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe(savedTitle);
    expect(sql(`select updated_at::text from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe(savedUpdatedAt);
    expect(sql(`select lifecycle_status from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe("draft");
    expect(sql(`select count(*) from public.documents where organization_id = ${q(organizationId)}::uuid;`)).toBe(initialDocumentCount);
    expect(sql("select count(*) from storage.objects where bucket_id = 'documents';")).toBe(initialDocumentObjectCount);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(adminDraft.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(adminDraft.getByRole("button", { name: "Aperçu" })).toBeVisible();
    await adminDraft.getByRole("button", { name: "Aperçu" }).click();
    await expect(previewPane).toBeVisible();
    await expect(previewPane.getByRole("link", { name: "Ouvrir l’aperçu en grand" })).toBeVisible();
    await expect(previewPane.locator('iframe[data-document-pdf-preview="ready"]')).toBeVisible();
    await adminDraft.getByRole("button", { name: "Modifier" }).click();
    await expect(editorPane).toBeVisible();
    await expect(adminDraft.getByLabel("Titre")).toHaveValue("Contrat UI E2E prêt à publier");
    await page.setViewportSize({ width: 1280, height: 900 });

    await adminDraft.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(adminDraft.getByText("Toutes les modifications affichées sont enregistrées")).toBeVisible();
    await expect(adminDraft.getByRole("button", { name: "Publier" })).toBeEnabled();
    expect(sql(`select template_content::jsonb->>'title' from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe("Contrat UI E2E prêt à publier");

    await adminDraft.getByRole("button", { name: "Publier" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Publier la version 2 ?")).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect(sql(`select lifecycle_status from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe("draft");
    await adminDraft.getByRole("button", { name: "Publier" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.getByRole("heading", { name: /Version publiée · version 2/ })).toBeVisible({ timeout: 20_000 });
    expect(sql(`select lifecycle_status from public.document_templates where id = ${q(reservationDraftId)}::uuid;`)).toBe("published");

    setRole("owner");
    await page.reload();
    await expect(page.getByRole("button", { name: "Créer le prochain brouillon" })).toBeVisible();

    console.info(`document-template-management-ui fixture families: ${familyIds.join(",")}`);
    console.info(`document-template-management-ui fixture templates: ${createdTemplateIds.join(",")}`);
  } finally {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
  }
});
