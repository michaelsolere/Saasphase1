import { expect, test, type Page } from "@playwright/test";

import { createAuthenticatedSupabaseClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

const prefix = "9c1f0000";
const id = (value: number) => `${prefix}-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ownerId = "10000000-0000-4000-8000-000000000001";
const ids = {
  organization: id(1),
  group: id(2),
  otherGroup: id(3),
  member: id(4),
  litterA: id(5),
  litterB: id(6),
  moved: id(7),
  removed: id(8),
  labLitter: id(9),
  incompleteLitter: id(10),
  missingLitter: id(11),
  goldenCertificateFamily: id(20),
  goldenCertificate: id(21),
  goldenContractFamily: id(22),
  goldenContract: id(23),
  labCertificateFamily: id(24),
  labCertificate: id(25),
  labContractFamily: id(26),
  labContract: id(27),
  incompleteFamily: id(28),
  incomplete: id(29),
  draftFamily: id(40),
  draft: id(30),
  retiredFamily: id(41),
  retired: id(31),
  inactiveFamily: id(42),
  inactive: id(32),
  incompatibleFamily: id(43),
  incompatible: id(33),
  viewerUser: id(50),
  viewerIdentity: id(51),
  viewerMembership: id(52),
  documentSettings: id(53),
  goldenContact: id(60),
  goldenApplication: id(61),
  goldenReservation: id(62),
  labContact: id(63),
  labApplication: id(64),
  labReservation: id(65),
};
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const eligible = Array.from({ length: 31 }, (_, index) => ({
  contact: id(100 + index),
  application: id(200 + index),
  reservation: id(300 + index),
  name: `Membre éligible ${String(index + 1).padStart(2, "0")}`,
  litter: index % 2 ? ids.litterA : ids.litterB,
}));
const viewerEmail = "groupe-ui-viewer@saasphase1.invalid";
const viewerPassword = "GroupeUiViewer-2026!";

function storagePaths() {
  const raw = sql(
    `select name from storage.objects where bucket_id='documents' and name like 'organizations/${ids.organization}/%' order by name;`,
  );
  return raw ? raw.split("\n").filter(Boolean) : [];
}

async function removeStorage(supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>) {
  const paths = storagePaths();
  if (paths.length === 0) return;
  const removed = await supabase.storage.from("documents").remove(paths);
  expect(removed.error, "Storage cleanup must succeed").toBeNull();
}

function cleanup() {
  sql(`
    delete from public.documents where organization_id=${q(ids.organization)}::uuid;
    delete from public.email_delivery_attempts where organization_id=${q(ids.organization)}::uuid;
    delete from public.payments where organization_id=${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id=${q(ids.organization)}::uuid;
    delete from public.document_templates where organization_id=${q(ids.organization)}::uuid;
    delete from public.document_template_families where organization_id=${q(ids.organization)}::uuid;
    delete from public.organization_document_settings where organization_id=${q(ids.organization)}::uuid;
    delete from public.litters where organization_id=${q(ids.organization)}::uuid;
    delete from public.litter_groups where organization_id=${q(ids.organization)}::uuid;
    delete from public.applications where organization_id=${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id=${q(ids.organization)}::uuid;
    delete from public.memberships where id::text like ${q(`${prefix}-%`)};
    delete from public.organizations where id=${q(ids.organization)}::uuid;
    delete from auth.identities where user_id=${q(ids.viewerUser)}::uuid;
    delete from auth.users where id=${q(ids.viewerUser)}::uuid;
  `);
}
function count(table: string) {
  return Number(sql(`select count(*) from public.${table} where organization_id=${q(ids.organization)}::uuid;`));
}
function fixtureCount(table: string) {
  return Number(sql(`select count(*) from public.${table} where id::text like ${q(`${prefix}-%`)};`));
}
function assertCleanup() {
  for (const table of [
    "reservations",
    "contacts",
    "applications",
    "litters",
    "litter_groups",
    "document_templates",
    "document_template_families",
    "organization_document_settings",
    "memberships",
  ]) {
    expect(fixtureCount(table), `${table} cleanup`).toBe(0);
  }
  expect(count("documents")).toBe(0);
  expect(count("payments")).toBe(0);
  expect(count("email_delivery_attempts")).toBe(0);
  expect(Number(sql(`select count(*) from public.organizations where id::text like ${q(`${prefix}-%`)};`))).toBe(0);
  expect(Number(sql(`select count(*) from auth.identities where user_id=${q(ids.viewerUser)}::uuid;`))).toBe(0);
  expect(Number(sql(`select count(*) from auth.users where id=${q(ids.viewerUser)}::uuid;`))).toBe(0);
  expect(storagePaths()).toEqual([]);
}

const certificateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat groupe UI QA",
  introduction: ["Introduction."],
  sections: {
    animalNeeds: ["Besoins."],
    health: ["Santé."],
    educationAndBehavior: ["Éducation."],
    costsAndConstraints: ["Contraintes."],
    holderObligations: ["Obligations."],
  },
  acknowledgmentText: ["Reconnaissance."],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

const contractDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat groupe UI QA",
  body: "Adoptant : [[adoptant.nom_complet]]\nRace : [[projet.race]]\nPrix : [[reservation.prix_formate]]\nFait à [[document.lieu_signature]] le [[document.date_generation]].",
};

function seedGeneration() {
  cleanup();
  const cert = JSON.stringify(certificateDefinition);
  const contract = JSON.stringify(contractDefinition);
  sql(`
    insert into public.organizations(id,name,legal_name,legal_form,slug,email,address_line1,postal_code,city,country)
    values(${q(ids.organization)},'Élevage Groupe UI','Élevage Groupe UI','company','groupe-ui-qa','groupe-ui@invalid.test','1 rue QA','75001','Paris','FR');
    insert into public.memberships(id,organization_id,profile_id,role,status)
    values(${q(ids.member)},${q(ids.organization)},${q(ownerId)},'member','active');
    insert into public.organization_document_settings(id,organization_id,signature_city_default)
    values(${q(ids.documentSettings)},${q(ids.organization)},'Paris');
    insert into public.litter_groups(id,organization_id,name,species,status)
    values(${q(ids.group)},${q(ids.organization)},'Groupe UI QA','dog','born');
    insert into public.litters(id,organization_id,litter_group_id,name,species,breed,actual_birth_date,available_from,deleted_at)
    values
      (${q(ids.litterA)},${q(ids.organization)},${q(ids.group)},'Portée A','dog','Golden Retriever','2026-06-01','2026-08-01',null),
      (${q(ids.labLitter)},${q(ids.organization)},${q(ids.group)},'Portée Labrador','dog','Labrador Retriever','2026-06-05','2026-08-05',null);
    insert into public.contacts(id,organization_id,display_name,first_name,last_name,email,address_line1,postal_code,city,country)
    values
      (${q(ids.goldenContact)},${q(ids.organization)},'Dossier Golden éligible','Golden','Éligible','golden-gen@invalid.test','1 rue QA','75001','Paris','FR'),
      (${q(ids.labContact)},${q(ids.organization)},'Dossier Labrador','QA','QA','labrador-gen@invalid.test','1 rue QA','75001','Paris','FR');
    insert into public.applications(id,organization_id,contact_id,species,breed,desired_sex_preference,status)
    values
      (${q(ids.goldenApplication)},${q(ids.organization)},${q(ids.goldenContact)},'dog','Golden Retriever','no_preference','qualified'),
      (${q(ids.labApplication)},${q(ids.organization)},${q(ids.labContact)},'dog','Labrador Retriever','no_preference','qualified');
    insert into public.reservations(id,organization_id,contact_id,application_id,litter_id,litter_group_id,status,price_cents,currency,created_at)
    values
      (${q(ids.goldenReservation)},${q(ids.organization)},${q(ids.goldenContact)},${q(ids.goldenApplication)},${q(ids.litterA)},${q(ids.group)},'pre_reservation_paid',250000,'EUR','2026-07-17T09:00:00Z'),
      (${q(ids.labReservation)},${q(ids.organization)},${q(ids.labContact)},${q(ids.labApplication)},${q(ids.labLitter)},${q(ids.group)},'pre_reservation_paid',250000,'EUR','2026-07-17T09:01:00Z');
    insert into public.document_template_families(id,organization_id,name,document_type,species,breed)
    values
      (${q(ids.goldenCertificateFamily)},${q(ids.organization)},'Certificat Golden','commitment_certificate','dog','Golden Retriever'),
      (${q(ids.goldenContractFamily)},${q(ids.organization)},'Contrat Golden','reservation_contract','dog','Golden Retriever'),
      (${q(ids.labCertificateFamily)},${q(ids.organization)},'Certificat Labrador','commitment_certificate','dog','Labrador Retriever'),
      (${q(ids.labContractFamily)},${q(ids.organization)},'Contrat Labrador','reservation_contract','dog','Labrador Retriever');
    insert into public.document_templates(id,organization_id,family_id,name,document_type,species,breed,template_format,template_content,version,lifecycle_status,is_active,published_at,published_by)
    values
      (${q(ids.goldenCertificate)},${q(ids.organization)},${q(ids.goldenCertificateFamily)},'Certificat Golden','commitment_certificate','dog','Golden Retriever','json',${q(cert)},1,'published',true,now(),${q(ownerId)}),
      (${q(ids.goldenContract)},${q(ids.organization)},${q(ids.goldenContractFamily)},'Contrat Golden','reservation_contract','dog','Golden Retriever','json',${q(contract)},1,'published',true,now(),${q(ownerId)}),
      (${q(ids.labCertificate)},${q(ids.organization)},${q(ids.labCertificateFamily)},'Certificat Labrador','commitment_certificate','dog','Labrador Retriever','json',${q(cert)},1,'published',true,now(),${q(ownerId)}),
      (${q(ids.labContract)},${q(ids.organization)},${q(ids.labContractFamily)},'Contrat Labrador','reservation_contract','dog','Labrador Retriever','json',${q(contract)},1,'published',true,now(),${q(ownerId)});
  `);
}

function documentFingerprint(reservationId: string) {
  return sql(`
    select string_agg(
      id::text || '|' || document_type || '|' || coalesce(file_path, '') || '|' || coalesce(file_sha256, '') || '|' || coalesce(generation_data::text, ''),
      E'\\n' order by document_type, created_at, id
    )
    from public.documents
    where organization_id = ${q(ids.organization)}::uuid
      and reservation_id = ${q(reservationId)}::uuid
      and deleted_at is null
      and superseded_at is null;
  `);
}
function seed() {
  cleanup();
  const contacts = eligible
    .map(
      (item) =>
        `(${q(item.contact)},${q(ids.organization)},${q(item.name)},'Membre',${q(item.name)},${q(`${item.contact}@invalid.test`)},'1 rue QA','75001','Paris','FR')`,
    )
    .join(",");
  const applications = eligible
    .map(
      (item) =>
        `(${q(item.application)},${q(ids.organization)},${q(item.contact)},'dog','Golden Retriever','no_preference','qualified')`,
    )
    .join(",");
  const reservations = eligible
    .map(
      (item, index) =>
        `(${q(item.reservation)},${q(ids.organization)},${q(item.contact)},${q(item.application)},${q(item.litter)},${q(ids.group)},'pre_reservation_paid',250000,'EUR','2026-07-17T09:${String(index).padStart(2, "0")}:00Z')`,
    )
    .join(",");
  const cert = JSON.stringify({
    schemaVersion: 1,
    locale: "fr-FR",
    documentType: "commitment_certificate",
    title: "Certificat",
    introduction: ["x"],
    sections: {
      animalNeeds: ["x"],
      health: ["x"],
      educationAndBehavior: ["x"],
      costsAndConstraints: ["x"],
      holderObligations: ["x"],
    },
    acknowledgmentText: ["x"],
    signatureLabels: { holder: "x", issuer: "x" },
  });
  const contract = JSON.stringify({
    schemaVersion: 2,
    locale: "fr-FR",
    documentType: "reservation_contract",
    title: "Contrat",
    body: "x",
  });
  sql(`
    insert into public.organizations(id,name,legal_name,legal_form,slug,email,address_line1,postal_code,city,country)
    values(${q(ids.organization)},'Élevage Groupe UI','Élevage Groupe UI','company','groupe-ui-qa','groupe-ui@invalid.test','1 rue QA','75001','Paris','FR');
    insert into public.memberships(id,organization_id,profile_id,role,status)
    values(${q(ids.member)},${q(ids.organization)},${q(ownerId)},'member','active');
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${q(ids.viewerUser)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(viewerEmail)}, extensions.crypt(${q(viewerPassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{"display_name":"Viewer Groupe UI"}', now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}, ${q(viewerEmail)}, ${q(ids.viewerUser)}, jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewerEmail)}, 'email_verified', true), 'email', now(), now());
    insert into public.memberships(id,organization_id,profile_id,role,status)
    values(${q(ids.viewerMembership)},${q(ids.organization)},${q(ids.viewerUser)},'viewer','active');
    insert into public.litter_groups(id,organization_id,name,species,status)
    values(${q(ids.group)},${q(ids.organization)},'Groupe UI QA','dog','born'),(${q(ids.otherGroup)},${q(ids.organization)},'Autre groupe UI QA','dog','born');
    insert into public.litters(id,organization_id,litter_group_id,name,species,breed,actual_birth_date,available_from,deleted_at)
    values(${q(ids.litterA)},${q(ids.organization)},${q(ids.group)},'Portée A','dog','Golden Retriever','2026-06-01','2026-08-01',null),(${q(ids.litterB)},${q(ids.organization)},${q(ids.group)},'Portée B','dog','Golden Retriever','2026-06-02','2026-08-02',null),(${q(ids.moved)},${q(ids.organization)},${q(ids.otherGroup)},'Portée déplacée','dog','Golden Retriever','2026-06-03','2026-08-03',null),(${q(ids.removed)},${q(ids.organization)},${q(ids.group)},'Portée supprimée','dog','Golden Retriever','2026-06-04','2026-08-04',now()),(${q(ids.labLitter)},${q(ids.organization)},${q(ids.group)},'Portée Labrador','dog','Labrador Retriever','2026-06-05','2026-08-05',null),(${q(ids.incompleteLitter)},${q(ids.organization)},${q(ids.group)},'Portée incomplète','dog','Berger Australien','2026-06-06','2026-08-06',null),(${q(ids.missingLitter)},${q(ids.organization)},${q(ids.group)},'Portée sans taxonomie','', '', '2026-06-07','2026-08-07',null);
    insert into public.contacts(id,organization_id,display_name,first_name,last_name,email,address_line1,postal_code,city,country) values ${contacts};
    insert into public.applications(id,organization_id,contact_id,species,breed,desired_sex_preference,status) values ${applications};
    insert into public.reservations(id,organization_id,contact_id,application_id,litter_id,litter_group_id,status,price_cents,currency,created_at) values ${reservations};
  `);
  const special = [
    [400, "Dossier groupe seul", null, ids.group, "pre_reservation_paid", "dog", "Golden Retriever"],
    [401, "Dossier groupe divergent", ids.litterA, ids.otherGroup, "pre_reservation_paid", "dog", "Golden Retriever"],
    [402, "Dossier portée déplacée", ids.moved, ids.group, "pre_reservation_paid", "dog", "Golden Retriever"],
    [403, "Dossier portée supprimée", ids.removed, ids.group, "pre_reservation_paid", "dog", "Golden Retriever"],
    [404, "Dossier mauvais statut", ids.litterA, ids.group, "active", "dog", "Golden Retriever"],
    [405, "Dossier sans taxonomie", ids.missingLitter, ids.group, "pre_reservation_paid", "", ""],
    [406, "Dossier Labrador", ids.labLitter, ids.group, "pre_reservation_paid", "dog", "Labrador Retriever"],
    [407, "Dossier sans paire", ids.incompleteLitter, ids.group, "pre_reservation_paid", "dog", "Berger Australien"],
  ] as const;
  for (const [n, name, litter, reservationGroup, status, species, breed] of special) {
    sql(`
      insert into public.contacts(id,organization_id,display_name,first_name,last_name,email,address_line1,postal_code,city,country)
      values(${q(id(n + 1000))},${q(ids.organization)},${q(name)},'QA','QA',${q(`${n}@invalid.test`)},'1 rue QA','75001','Paris','FR');
      insert into public.applications(id,organization_id,contact_id,species,breed,desired_sex_preference,status)
      values(${q(id(n + 1100))},${q(ids.organization)},${q(id(n + 1000))},${q(species)},${q(breed)},'no_preference','qualified');
      insert into public.reservations(id,organization_id,contact_id,application_id,litter_id,litter_group_id,status,price_cents,currency)
      values(${q(id(n + 1200))},${q(ids.organization)},${q(id(n + 1000))},${q(id(n + 1100))},${litter ? q(litter) : "null"},${q(reservationGroup)},${q(status)},250000,'EUR');
    `);
  }
  sql(`
    insert into public.document_template_families(id,organization_id,name,document_type,species,breed)
    values(${q(ids.goldenCertificateFamily)},${q(ids.organization)},'Certificat Golden','commitment_certificate','dog','Golden Retriever'),(${q(ids.goldenContractFamily)},${q(ids.organization)},'Contrat Golden','reservation_contract','dog','Golden Retriever'),(${q(ids.labCertificateFamily)},${q(ids.organization)},'Certificat Labrador','commitment_certificate','dog','Labrador Retriever'),(${q(ids.labContractFamily)},${q(ids.organization)},'Contrat Labrador','reservation_contract','dog','Labrador Retriever'),(${q(ids.incompleteFamily)},${q(ids.organization)},'Certificat incomplet','commitment_certificate','dog','Berger Australien'),(${q(ids.draftFamily)},${q(ids.organization)},'Modèle brouillon','reservation_contract','dog','Golden Retriever'),(${q(ids.retiredFamily)},${q(ids.organization)},'Modèle retiré','reservation_contract','dog','Golden Retriever'),(${q(ids.inactiveFamily)},${q(ids.organization)},'Modèle inactif','reservation_contract','dog','Golden Retriever'),(${q(ids.incompatibleFamily)},${q(ids.organization)},'Modèle incompatible','reservation_contract','dog','Cocker Spaniel');
    insert into public.document_templates(id,organization_id,family_id,name,document_type,species,breed,template_format,template_content,version,lifecycle_status,is_active,published_at,published_by)
    values(${q(ids.goldenCertificate)},${q(ids.organization)},${q(ids.goldenCertificateFamily)},'Certificat Golden','commitment_certificate','dog','Golden Retriever','json',${q(cert)},1,'published',true,now(),${q(ownerId)}),(${q(ids.goldenContract)},${q(ids.organization)},${q(ids.goldenContractFamily)},'Contrat Golden','reservation_contract','dog','Golden Retriever','json',${q(contract)},1,'published',true,now(),${q(ownerId)}),(${q(ids.labCertificate)},${q(ids.organization)},${q(ids.labCertificateFamily)},'Certificat Labrador','commitment_certificate','dog','Labrador Retriever','json',${q(cert)},1,'published',true,now(),${q(ownerId)}),(${q(ids.labContract)},${q(ids.organization)},${q(ids.labContractFamily)},'Contrat Labrador','reservation_contract','dog','Labrador Retriever','json',${q(contract)},1,'published',true,now(),${q(ownerId)}),(${q(ids.incomplete)},${q(ids.organization)},${q(ids.incompleteFamily)},'Certificat incomplet','commitment_certificate','dog','Berger Australien','json',${q(cert)},1,'published',true,now(),${q(ownerId)}),(${q(ids.draft)},${q(ids.organization)},${q(ids.draftFamily)},'Modèle brouillon','reservation_contract','dog','Golden Retriever','json',${q(contract)},1,'draft',false,null,null),(${q(ids.retired)},${q(ids.organization)},${q(ids.retiredFamily)},'Modèle retiré','reservation_contract','dog','Golden Retriever','json',${q(contract)},1,'retired',false,now(),${q(ownerId)}),(${q(ids.inactive)},${q(ids.organization)},${q(ids.inactiveFamily)},'Modèle inactif','reservation_contract','dog','Golden Retriever','json',${q(contract)},1,'draft',false,null,null),(${q(ids.incompatible)},${q(ids.organization)},${q(ids.incompatibleFamily)},'Modèle incompatible','reservation_contract','dog','Cocker Spaniel','json',${q(contract)},1,'published',true,now(),${q(ownerId)});
  `);
}
async function login(page: Page, email = E2E_OWNER_EMAIL, password = E2E_OWNER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("membre : périmètre, taxonomie, limite et annulation sans mutation", async ({ page }) => {
  test.setTimeout(120_000);
  const supabase = await createAuthenticatedSupabaseClient();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    expect(user?.id).toBe(ownerId);
    seed();
    await login(page);
    await page.goto(`/litter-groups/${ids.group}`);
    const section = page.locator("#generation-documents-groupes");
    expect(
      await page.locator("#reservations-liees").evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(document.querySelector("#generation-documents-groupes")) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    expect(
      await section.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(
            [...document.querySelectorAll("h2")].find((heading) => heading.textContent?.includes("Campagnes d’e-mails"))!
              .parentElement!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await expect(section.getByRole("button", { name: "Générer les documents sélectionnés" })).toBeVisible();
    for (const name of [
      "Dossier groupe seul",
      "Dossier groupe divergent",
      "Dossier portée déplacée",
      "Dossier portée supprimée",
      "Dossier mauvais statut",
      "Dossier sans taxonomie",
      "Dossier sans paire",
    ]) {
      await expect(section).toContainText(name);
    }
    await expect(section).toContainText("Une portée précise doit être attribuée");
    await expect(section).toContainText("Le rattachement de ce dossier doit être vérifié");
    await expect(section).toContainText("La taxonomie documentaire doit être complétée");
    for (const name of [
      "Dossier groupe seul",
      "Dossier groupe divergent",
      "Dossier portée déplacée",
      "Dossier portée supprimée",
      "Dossier mauvais statut",
      "Dossier sans taxonomie",
      "Dossier sans paire",
    ]) {
      await expect(section.getByLabel(`Sélectionner ${name}`)).toBeDisabled();
    }
    await expect(section).toContainText("Dossier Labrador");
    await expect(section.getByRole("option", { name: "Certificat Golden — version 1" })).toHaveCount(1);
    await expect(section.getByRole("option", { name: "Certificat Labrador — version 1" })).toHaveCount(1);
    for (const name of ["Modèle brouillon", "Modèle retiré", "Modèle inactif", "Modèle incompatible"]) {
      await expect(section).not.toContainText(name);
    }
    expect(await section.locator('input[name="reservation_ids[]"]:checked').count()).toBe(30);
    await section.getByLabel("Sélectionner Membre éligible 01").uncheck();
    await section.getByLabel("Sélectionner Membre éligible 31").check();
    await section.getByLabel("Sélectionner Membre éligible 02").uncheck();
    await section.getByLabel("Sélectionner Dossier Labrador").check();
    const form = section.locator("form");
    for (const name of [
      "organization_id",
      "litter_group_id",
      "operation_id",
      "captured_at",
      "litter_id",
      "species",
      "breed",
      "document_id",
      "variant_id",
      "storage_path",
    ]) {
      await expect(form.locator(`[name="${name}"]`)).toHaveCount(0);
    }
    await section.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Dossiers");
    await expect(page.getByRole("alertdialog")).toContainText("Portées concernées");
    await expect(page.getByRole("alertdialog")).toContainText("Golden Retriever");
    await expect(page.getByRole("alertdialog")).toContainText("Labrador Retriever");
    await page.getByRole("button", { name: "Annuler" }).click();
    expect(count("documents")).toBe(0);
    expect(count("payments")).toBe(0);
    expect(count("email_delivery_attempts")).toBe(0);
    await expect(section.getByLabel("Sélectionner Membre éligible 31")).toBeChecked();
    await expect(section.getByLabel("Sélectionner Dossier Labrador")).toBeChecked();
  } finally {
    cleanup();
    assertCleanup();
  }
});

test("viewer : lecture seule sans mutation ni contrôles d’action", async ({ page }) => {
  test.setTimeout(120_000);
  try {
    seed();
    await login(page, viewerEmail, viewerPassword);
    await page.goto(`/litter-groups/${ids.group}`);
    const section = page.locator("#generation-documents-groupes");
    await expect(section).toContainText("Génération groupée des documents");
    await expect(section).toContainText("Cette fonctionnalité est disponible en lecture seule pour votre rôle.");
    for (const name of [
      "Dossier groupe seul",
      "Dossier groupe divergent",
      "Dossier portée déplacée",
      "Dossier portée supprimée",
      "Dossier mauvais statut",
      "Dossier sans taxonomie",
      "Dossier sans paire",
      "Dossier Labrador",
      "Membre éligible 01",
    ]) {
      await expect(section).toContainText(name);
    }
    await expect(section).toContainText("dog — Golden Retriever");
    await expect(section).toContainText("dog — Labrador Retriever");
    await expect(section).toContainText("Portée A");
    await expect(section).toContainText("Portée Labrador");
    await expect(section).toContainText("Absent");
    await expect(section).toContainText("Une portée précise doit être attribuée");
    await expect(section).toContainText("Le rattachement de ce dossier doit être vérifié");
    await expect(section).toContainText("La taxonomie documentaire doit être complétée");
    await expect(section).toContainText("Ce dossier ne remplit pas les conditions préalables.");
    await expect(section).toContainText("Les deux modèles publiés compatibles doivent être disponibles.");
    await expect(section.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(section.locator("select")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Générer les documents sélectionnés" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Sélectionner les dossiers éligibles" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Tout désélectionner" })).toHaveCount(0);
    await expect(section.locator("form")).toHaveCount(0);
    expect(count("documents")).toBe(0);
    expect(count("payments")).toBe(0);
    expect(count("email_delivery_attempts")).toBe(0);
  } finally {
    cleanup();
    assertCleanup();
  }
});

test("membre : génération réelle et idempotence sur intention verrouillée", async ({ page }) => {
  test.setTimeout(180_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await removeStorage(supabase);
  try {
    seedGeneration();
    await login(page);
    await page.goto(`/litter-groups/${ids.group}`);
    const section = page.locator("#generation-documents-groupes");
    await section.getByRole("button", { name: "Tout désélectionner" }).click();
    await section.getByLabel("Sélectionner Dossier Golden éligible").check();
    await section.getByLabel("Sélectionner Dossier Labrador").check();
    await expect(section).toContainText("2 dossier(s) sélectionné(s) sur 30");
    await section.getByRole("button", { name: "Générer les documents sélectionnés" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("2");
    await expect(page.getByRole("alertdialog")).toContainText("Golden Retriever");
    await expect(page.getByRole("alertdialog")).toContainText("Labrador Retriever");
    await page.getByRole("button", { name: "Confirmer la génération" }).click();
    await expect(section).toContainText("Génération terminée", { timeout: 90_000 });
    await expect(section).toContainText("Générés");
    await expect(section.locator("dd").filter({ hasText: /^4$/ }).first()).toBeVisible();
    await expect(section).toContainText("Dossiers planifiés");
    await expect(section).toContainText("2");
    await expect(section.getByRole("link", { name: "Portée concernée" })).toHaveCount(2);
    await expect(section.locator("article").filter({ hasText: "Dossier Golden éligible" })).toContainText("Généré");
    await expect(section.locator("article").filter({ hasText: "Dossier Labrador" })).toContainText("Généré");
    expect(count("documents")).toBe(4);
    expect(count("payments")).toBe(0);
    expect(count("email_delivery_attempts")).toBe(0);
    const pathsAfterCreate = storagePaths();
    expect(pathsAfterCreate).toHaveLength(4);
    expect(
      Number(
        sql(`
          select count(*) from storage.objects
          where bucket_id = 'documents'
            and name like 'organizations/${ids.organization}/%'
            and coalesce((metadata->>'size')::int, 0) > 0;
        `),
      ),
    ).toBe(4);
    expect(
      sql(`
        select string_agg(document_type, ',' order by document_type)
        from public.documents
        where reservation_id = ${q(ids.goldenReservation)}::uuid
          and deleted_at is null and superseded_at is null;
      `),
    ).toBe("commitment_certificate,reservation_contract");
    expect(
      sql(`
        select string_agg(document_type, ',' order by document_type)
        from public.documents
        where reservation_id = ${q(ids.labReservation)}::uuid
          and deleted_at is null and superseded_at is null;
      `),
    ).toBe("commitment_certificate,reservation_contract");
    expect(
      Number(
        sql(`
          select count(*) from public.documents
          where organization_id = ${q(ids.organization)}::uuid
            and deleted_at is null and superseded_at is null
            and reservation_id = ${q(ids.goldenReservation)}::uuid
            and contact_id = ${q(ids.goldenContact)}::uuid
            and application_id = ${q(ids.goldenApplication)}::uuid
            and litter_id = ${q(ids.litterA)}::uuid
            and litter_group_id is null
            and (
              (document_type = 'commitment_certificate' and template_id = ${q(ids.goldenCertificate)}::uuid)
              or (document_type = 'reservation_contract' and template_id = ${q(ids.goldenContract)}::uuid)
            );
        `),
      ),
    ).toBe(2);
    expect(
      Number(
        sql(`
          select count(*) from public.documents
          where organization_id = ${q(ids.organization)}::uuid
            and deleted_at is null and superseded_at is null
            and reservation_id = ${q(ids.labReservation)}::uuid
            and contact_id = ${q(ids.labContact)}::uuid
            and application_id = ${q(ids.labApplication)}::uuid
            and litter_id = ${q(ids.labLitter)}::uuid
            and litter_group_id is null
            and (
              (document_type = 'commitment_certificate' and template_id = ${q(ids.labCertificate)}::uuid)
              or (document_type = 'reservation_contract' and template_id = ${q(ids.labContract)}::uuid)
            );
        `),
      ),
    ).toBe(2);
    expect(
      Number(
        sql(`
          select count(*) from public.documents
          where organization_id = ${q(ids.organization)}::uuid
            and deleted_at is null and superseded_at is null
            and reservation_id = ${q(ids.goldenReservation)}::uuid
            and generation_data #>> '{sources,reservationId}' = ${q(ids.goldenReservation)}
            and generation_data #>> '{sources,contactId}' = ${q(ids.goldenContact)}
            and generation_data #>> '{sources,applicationId}' = ${q(ids.goldenApplication)}
            and generation_data #>> '{sources,litterId}' = ${q(ids.litterA)}
            and generation_data #>> '{template,templateId}' in (${q(ids.goldenCertificate)}, ${q(ids.goldenContract)});
        `),
      ),
    ).toBe(2);
    expect(
      Number(
        sql(`
          select count(*) from public.documents
          where organization_id = ${q(ids.organization)}::uuid
            and deleted_at is null and superseded_at is null
            and reservation_id = ${q(ids.labReservation)}::uuid
            and generation_data #>> '{sources,reservationId}' = ${q(ids.labReservation)}
            and generation_data #>> '{sources,contactId}' = ${q(ids.labContact)}
            and generation_data #>> '{sources,applicationId}' = ${q(ids.labApplication)}
            and generation_data #>> '{sources,litterId}' = ${q(ids.labLitter)}
            and generation_data #>> '{template,templateId}' in (${q(ids.labCertificate)}, ${q(ids.labContract)});
        `),
      ),
    ).toBe(2);
    expect(
      Number(
        sql(`
          select count(*) from public.documents
          where organization_id = ${q(ids.organization)}::uuid
            and deleted_at is null and superseded_at is null
            and generation_data ? 'snapshotVersion'
            and generation_data ? 'template'
            and coalesce(file_path, '') <> ''
            and coalesce(file_sha256, '') ~ '^[0-9a-f]{64}$';
        `),
      ),
    ).toBe(4);
    await expect(section.getByLabel("Sélectionner Dossier Golden éligible")).toBeDisabled();
    await expect(section.getByLabel("Sélectionner Dossier Labrador")).toBeDisabled();
    await expect(section.getByLabel("Certificat d’engagement").first()).toBeDisabled();
    await expect(section.getByLabel("Contrat de réservation").first()).toBeDisabled();
    await expect(section.getByRole("button", { name: "Générer les documents sélectionnés" })).toHaveCount(0);
    await expect(section.getByRole("link", { name: "Nouvelle opération" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Rejouer exactement cette opération" })).toHaveCount(0);

    const fingerprintGolden = documentFingerprint(ids.goldenReservation);
    const fingerprintLab = documentFingerprint(ids.labReservation);
    const reservationIdsLocked = await section
      .locator('input[name="reservation_ids[]"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value).sort());
    expect(reservationIdsLocked).toEqual([ids.goldenReservation, ids.labReservation].sort());

    await section.locator("form").evaluate((form) => {
      const confirmation = form.querySelector('input[name="batch_confirmation"]') as HTMLInputElement | null;
      if (confirmation) confirmation.value = "confirmed";
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(section).toContainText("Génération terminée", { timeout: 90_000 });
    await expect(section).toContainText("Déjà générés");
    await expect(section.locator("article").filter({ hasText: "Dossier Golden éligible" })).toContainText(
      "Déjà généré par cette opération",
    );
    await expect(section.locator("article").filter({ hasText: "Dossier Labrador" })).toContainText(
      "Déjà généré par cette opération",
    );
    expect(count("documents")).toBe(4);
    expect(storagePaths()).toEqual(pathsAfterCreate);
    expect(documentFingerprint(ids.goldenReservation)).toBe(fingerprintGolden);
    expect(documentFingerprint(ids.labReservation)).toBe(fingerprintLab);
    expect(count("payments")).toBe(0);
    expect(count("email_delivery_attempts")).toBe(0);
  } finally {
    await removeStorage(supabase);
    cleanup();
    assertCleanup();
  }
});
