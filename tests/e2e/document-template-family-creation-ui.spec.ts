import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const fixturePrefix = "[E2E document template family creation]";

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup(createdFamilyIds: string[] = [], createdTemplateIds: string[] = []) {
  const familyIds = createdFamilyIds.length > 0
    ? createdFamilyIds.map((id) => `${q(id)}::uuid`).join(", ")
    : "'00000000-0000-0000-0000-000000000000'::uuid";
  const templateIds = createdTemplateIds.length > 0
    ? createdTemplateIds.map((id) => `${q(id)}::uuid`).join(", ")
    : "'00000000-0000-0000-0000-000000000000'::uuid";
  sql(`
    delete from public.document_templates
    where id in (${templateIds})
      or family_id in (${familyIds})
      or family_id in (
      select id from public.document_template_families
      where organization_id = ${q(organizationId)}::uuid
        and name like ${q(`${fixturePrefix}%`)}
    );
    delete from public.document_template_families
    where organization_id = ${q(organizationId)}::uuid
      and name like ${q(`${fixturePrefix}%`)};
    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(membershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function trackFixture(name: string, familyIds: string[], templateIds: string[]) {
  const [familyId, templateId] = sql(`
    select family.id::text || '|' || template.id::text
    from public.document_template_families family
    join public.document_templates template on template.family_id = family.id
    where family.organization_id = ${q(organizationId)}::uuid
      and family.name = ${q(name)}
    order by template.created_at desc
    limit 1;
  `).split("|");

  if (!familyId || !templateId) throw new Error(`Fixture introuvable: ${name}`);
  familyIds.push(familyId);
  templateIds.push(templateId);
}

function remainingFixtureCount() {
  return Number(sql(`
    select
      (select count(*) from public.document_templates template
       join public.document_template_families family on family.id = template.family_id
       where family.organization_id = ${q(organizationId)}::uuid
         and family.name like ${q(`${fixturePrefix}%`)})
      + (select count(*) from public.document_template_families
         where organization_id = ${q(organizationId)}::uuid
           and name like ${q(`${fixturePrefix}%`)})
      + (select count(*) from public.memberships
         where id = ${q(membershipId)}::uuid and role <> 'owner');
  `));
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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 });
}

async function createTemplate(
  page: Page,
  input: { name: string; type: "commitment_certificate" | "reservation_contract" },
) {
  await page.getByRole("button", { name: "Créer un modèle de référence" }).first().click();
  await page.getByLabel("Type documentaire").selectOption(input.type);
  await page.getByLabel("Nom").fill(input.name);
  await expect(page.getByLabel("Espèce")).toHaveValue("dog");
  await expect(page.getByLabel("Race")).toHaveValue("Golden Retriever");
  await page.getByRole("button", { name: "Créer le modèle", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/modeles\/[0-9a-f-]{36}$/, { timeout: 20_000 });
}

test("crée des familles structurées selon le rôle sans publication automatique", async ({ page }) => {
  cleanup();
  expect(remainingFixtureCount()).toBe(0);
  const certificateName = `${fixturePrefix} certificat`;
  const contractName = `${fixturePrefix} contrat`;
  const createdFamilyIds: string[] = [];
  const createdTemplateIds: string[] = [];

  try {
    await login(page);
    await page.goto("/documents/modeles");
    await expect(page.getByRole("button", { name: "Créer un modèle de référence" }).first()).toBeVisible();

    setRole("viewer");
    await page.reload();
    await expect(page.getByRole("button", { name: "Créer un modèle de référence" })).toHaveCount(0);

    setRole("member");
    await page.reload();
    await expect(page.getByRole("button", { name: "Créer un modèle de référence" })).toHaveCount(0);

    setRole("admin");
    await page.reload();
    await expect(page.getByRole("button", { name: "Créer un modèle de référence" }).first()).toBeVisible();

    await createTemplate(page, { name: certificateName, type: "commitment_certificate" });
    trackFixture(certificateName, createdFamilyIds, createdTemplateIds);
    await expect(page.getByText("Aucune version publiée")).toBeVisible();
    await expect(page.getByText("Ce brouillon est à compléter avant validation et publication.")).toBeVisible();
    await expect(page.getByLabel("Titre")).toBeEditable();
    await expect(page.getByText("Introduction", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Signature du détenteur")).toBeEditable();
    expect(sql(`
      select count(*) from public.document_templates template
      join public.document_template_families family on family.id = template.family_id
      where family.name = ${q(certificateName)}
        and template.lifecycle_status = 'draft'
        and template.template_content::jsonb ?& array[
          'schemaVersion', 'locale', 'documentType', 'title', 'introduction',
          'sections', 'acknowledgmentText', 'signatureLabels'
        ];
    `)).toBe("1");

    await page.goto("/documents/modeles");
    await createTemplate(page, { name: contractName, type: "reservation_contract" });
    trackFixture(contractName, createdFamilyIds, createdTemplateIds);
    await expect(page.getByLabel("Titre")).toBeEditable();
    await expect(page.getByLabel("Contenu du contrat")).toContainText("Il a été convenu ce qui suit entre les parties");
    await expect(page.getByLabel("Contenu du contrat")).toContainText("[[reservation.prix_en_lettres]]");
    await expect(page.getByLabel("Contenu du contrat")).toContainText("Couleur : [[animal.couleur]]");
    await expect(page.getByLabel("Insérer une donnée")).toBeEditable();
    await expect(page.getByText("Contenu automatiquement ajouté au document")).toHaveCount(0);
    await expect(page.getByText("Les données entre doubles crochets seront remplacées lors de l’aperçu ou de la génération.")).toBeVisible();
    expect(sql(`
      select count(*) from public.document_templates template
      join public.document_template_families family on family.id = template.family_id
      where family.name = ${q(contractName)}
        and template.lifecycle_status = 'draft'
        and template.template_content::jsonb->>'schemaVersion' = '2'
        and template.template_content::jsonb ?& array[
          'schemaVersion', 'locale', 'documentType', 'title', 'body'
        ]
        and not (template.template_content::jsonb ?| array['preamble', 'clauses', 'signatureLabels']);
    `)).toBe("1");

    const body = page.getByLabel("Contenu du contrat");
    await body.fill("Bonjour monde");
    await body.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(8, 8);
    });
    await page.getByLabel("Insérer une donnée").selectOption("adoptant.prenom");
    await page.getByRole("button", { name: "Insérer", exact: true }).click();
    await expect(body).toHaveValue("Bonjour [[adoptant.prenom]]monde");
    await expect(body).toBeFocused();
    await body.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(8, 27));
    await page.getByLabel("Insérer une donnée").selectOption("animal.nom");
    await page.getByRole("button", { name: "Insérer", exact: true }).click();
    await expect(body).toHaveValue("Bonjour [[animal.nom]]monde");

    await body.fill("Variable erronée : [[adoptant.telephonne]]");
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(page.getByText("Le brouillon a été enregistré.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(page.getByText(/Corrigez les variables du modèle/)).toContainText("[[adoptant.telephonne]]");
    expect(sql(`select count(*) from public.document_templates template join public.document_template_families family on family.id = template.family_id where family.name = ${q(contractName)} and template.lifecycle_status = 'published';`)).toBe("0");

    await body.fill("Bonjour [[adoptant.prenom]], prix : [[reservation.prix_formate]].");
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await page.getByRole("button", { name: "Valider le brouillon" }).click();
    await expect(page.getByText("Le brouillon respecte le schéma documentaire.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publier" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmer la publication" }).click();
    await expect(page.getByRole("heading", { name: /Version publiée · version 1/ })).toBeVisible({ timeout: 20_000 });
    expect(sql(`select count(*) from public.document_templates template join public.document_template_families family on family.id = template.family_id where family.name = ${q(contractName)} and template.lifecycle_status = 'published' and template.template_content::jsonb->>'schemaVersion' = '2';`)).toBe("1");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Contenu du contrat")).toBeVisible();
    await expect(page.getByLabel("Insérer une donnée")).toBeVisible();
    await expect(page.getByRole("button", { name: "Insérer", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/documents/modeles");
    await page.getByRole("button", { name: "Créer un modèle de référence" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom").evaluate((element) => element.removeAttribute("required"));
    await dialog.getByRole("button", { name: "Créer le modèle", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("La création du modèle est impossible");

    const repeatedName = `${fixturePrefix} répétition`;
    await dialog.getByLabel("Nom").fill(repeatedName);
    const submit = dialog.getByRole("button", { name: "Créer le modèle", exact: true });
    await Promise.all([submit.click(), submit.click()]);
    await expect(page).toHaveURL(/\/documents\/modeles\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    trackFixture(repeatedName, createdFamilyIds, createdTemplateIds);
    expect(sql(`
      select count(*) from public.document_template_families
      where organization_id = ${q(organizationId)}::uuid
        and name = ${q(repeatedName)};
    `)).toBe("1");
  } finally {
    console.info(`document-template-family-creation-ui fixture families: ${createdFamilyIds.join(",")}`);
    console.info(`document-template-family-creation-ui fixture templates: ${createdTemplateIds.join(",")}`);
    cleanup(createdFamilyIds, createdTemplateIds);
    expect(remainingFixtureCount()).toBe(0);
  }
});
