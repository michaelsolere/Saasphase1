import { execFileSync } from "node:child_process";

import { expect, type Page, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "22000000-0000-4000-8000-000000000001";
const viewerId = "12000000-0000-4000-8000-000000000001";
const viewerIdentityId = "12000000-0000-4000-8000-000000000002";
const viewerMembershipId = "32000000-0000-4000-8000-000000000001";
const viewerEmail = "viewer-contact-edit@saasphase1.invalid";
const viewerPassword = "LocalDevViewer-2026!";

const qaIds = {
  person: "72000000-0000-4000-8000-000000000001",
  duplicateEmail: "72000000-0000-4000-8000-000000000002",
  duplicatePhone: "72000000-0000-4000-8000-000000000003",
  structure: "72000000-0000-4000-8000-000000000004",
  recalculated: "72000000-0000-4000-8000-000000000005",
  selfOnly: "72000000-0000-4000-8000-000000000006",
  deleted: "72000000-0000-4000-8000-000000000007",
  otherOrganization: "72000000-0000-4000-8000-000000000008",
  role: "73000000-0000-4000-8000-000000000001",
  finalizedApplication: "74000000-0000-4000-8000-000000000001",
  openApplication: "74000000-0000-4000-8000-000000000002",
};

const contactIds = [
  qaIds.person,
  qaIds.duplicateEmail,
  qaIds.duplicatePhone,
  qaIds.structure,
  qaIds.recalculated,
  qaIds.selfOnly,
  qaIds.deleted,
  qaIds.otherOrganization,
];

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

async function login(
  page: Page,
  email = "owner@saasphase1.invalid",
  password = "LocalDevOwner-2026!",
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

function cleanup() {
  runSql(`
    delete from public.applications
    where id in (
      ${sqlQuote(qaIds.finalizedApplication)}::uuid,
      ${sqlQuote(qaIds.openApplication)}::uuid
    );

    delete from public.contact_roles
    where id = ${sqlQuote(qaIds.role)}::uuid;

    delete from public.memberships
    where id = ${sqlQuote(viewerMembershipId)}::uuid;

    delete from public.contacts
    where id in (${contactIds.map((id) => `${sqlQuote(id)}::uuid`).join(", ")});

    delete from public.organizations
    where id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from auth.identities
    where id = ${sqlQuote(viewerIdentityId)}::uuid;

    delete from auth.users
    where id = ${sqlQuote(viewerId)}::uuid;
  `);
}

function expectCleanupDone() {
  const report = JSON.parse(
    runSql(`
      select json_build_object(
        'contacts', (
          select count(*) from public.contacts
          where id in (${contactIds.map((id) => `${sqlQuote(id)}::uuid`).join(", ")})
        ),
        'contact_roles', (
          select count(*) from public.contact_roles
          where id = ${sqlQuote(qaIds.role)}::uuid
        ),
        'applications', (
          select count(*) from public.applications
          where id in (
            ${sqlQuote(qaIds.finalizedApplication)}::uuid,
            ${sqlQuote(qaIds.openApplication)}::uuid
          )
        ),
        'memberships', (
          select count(*) from public.memberships
          where id = ${sqlQuote(viewerMembershipId)}::uuid
        ),
        'profiles', (
          select count(*) from public.profiles
          where id = ${sqlQuote(viewerId)}::uuid
        ),
        'auth_identities', (
          select count(*) from auth.identities
          where id = ${sqlQuote(viewerIdentityId)}::uuid
        ),
        'auth_users', (
          select count(*) from auth.users
          where id = ${sqlQuote(viewerId)}::uuid
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${sqlQuote(otherOrganizationId)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;

  expect(report.contacts).toBe(0);
  expect(report.contact_roles).toBe(0);
  expect(report.applications).toBe(0);
  expect(report.memberships).toBe(0);
  expect(report.profiles).toBe(0);
  expect(report.auth_identities).toBe(0);
  expect(report.auth_users).toBe(0);
  expect(report.organizations).toBe(0);
}

function seedContacts() {
  cleanup();

  runSql(`
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      ${sqlQuote(viewerId)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${sqlQuote(viewerEmail)},
      extensions.crypt(${sqlQuote(viewerPassword)}, extensions.gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Viewer contact edit"}'::jsonb,
      now(),
      now()
    );

    insert into auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      created_at,
      updated_at
    )
    values (
      ${sqlQuote(viewerIdentityId)}::uuid,
      ${sqlQuote(viewerId)},
      ${sqlQuote(viewerId)}::uuid,
      jsonb_build_object(
        'sub', ${sqlQuote(viewerId)},
        'email', ${sqlQuote(viewerEmail)},
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now()
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    )
    values (
      ${sqlQuote(viewerMembershipId)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(viewerId)}::uuid,
      'viewer',
      'active',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.organizations (id, name, slug)
    values (
      ${sqlQuote(otherOrganizationId)}::uuid,
      'Organisation QA Contact Edit',
      'organisation-qa-contact-edit'
    );

    insert into public.contacts (
      id, organization_id, contact_type, first_name, last_name,
      family_or_structure_name, display_name, email, phone, secondary_phone,
      address_line1, address_line2, postal_code, city, country, origin_channel,
      deleted_at, created_by, updated_by
    )
    values
      (
        ${sqlQuote(qaIds.person)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        'Aline',
        'Avant',
        'Famille Avant',
        'Aline personnalisée',
        'aline.before@example.invalid',
        '+33 6 11 22 33 44',
        '+33 6 55 66 77 88',
        '1 rue Initiale',
        'Bâtiment A',
        '33000',
        'Bordeaux',
        'FR',
        'manual',
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.duplicateEmail)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        null,
        null,
        null,
        'Doublon Email',
        'doublon@example.invalid',
        '+33 6 00 00 00 01',
        null,
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.duplicatePhone)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        null,
        null,
        null,
        'Doublon Téléphone',
        'phone-decoy@example.invalid',
        '+33 6 90 90 90 90',
        '+33 6 91 91 91 91',
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.structure)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'organization',
        'Marc',
        'Référent',
        'Association Initiale',
        'Association Initiale',
        'structure.before@example.invalid',
        null,
        null,
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.recalculated)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'family',
        'Lina',
        'Nom',
        'Famille Recalcul',
        'Nom manuel à vider',
        'recalcul@example.invalid',
        null,
        null,
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.selfOnly)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        'Self',
        'Only',
        null,
        'Self Only',
        'self-only@example.invalid',
        '+33 6 12 12 12 12',
        '+33 6 13 13 13 13',
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.deleted)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        null,
        null,
        null,
        'Contact Supprimé QA',
        'deleted-contact-edit@example.invalid',
        null,
        null,
        null,
        null,
        null,
        null,
        'FR',
        null,
        now(),
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(qaIds.otherOrganization)}::uuid,
        ${sqlQuote(otherOrganizationId)}::uuid,
        'person',
        null,
        null,
        null,
        'Contact autre organisation QA',
        'other-org-contact-edit@example.invalid',
        null,
        null,
        null,
        null,
        null,
        null,
        'FR',
        null,
        null,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      );

    insert into public.contact_roles (
      id, organization_id, contact_id, role, is_active, created_by, updated_by
    )
    values (
      ${sqlQuote(qaIds.role)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(qaIds.person)}::uuid,
      'prospect',
      true,
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

function seedApplication({
  id,
  contactId,
  status,
}: {
  id: string;
  contactId: string;
  status: "archived" | "to_review";
}) {
  runSql(`
    insert into public.applications (
      id,
      organization_id,
      contact_id,
      species,
      breed,
      desired_period,
      desired_sex_preference,
      desired_quantity,
      project_description,
      status,
      submitted_at,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(id)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(contactId)}::uuid,
      'dog',
      'Golden Retriever',
      'QA fiche contact',
      'unknown',
      1,
      'Fixture QA pour l’action candidature depuis la fiche contact.',
      ${sqlQuote(status)},
      '2026-07-12 10:00:00+00',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

async function readContact(supabase: SupabaseTestClient, id: string) {
  return expectSupabaseData(
    await supabase
      .from("contacts")
      .select(
        "id, contact_type, first_name, last_name, family_or_structure_name, display_name, email, phone, secondary_phone, address_line1, postal_code, city, country, updated_at, updated_by",
      )
      .eq("id", id)
      .single(),
    "read contact",
  );
}

async function countApplicationsForContact(
  supabase: SupabaseTestClient,
  contactId: string,
) {
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId);

  if (error) {
    throw new Error(`count applications: ${error.message}`);
  }

  return count ?? 0;
}

async function submitForm(page: Page) {
  await page.getByRole("button", { name: /^Enregistrer$/ }).click();
}

test("prefills, cancels, edits a person, confirms e-mail changes and preserves linked rows", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    const before = await readContact(supabase, qaIds.person);
    const roleBefore = expectSupabaseData(
      await supabase.from("contact_roles").select("*").eq("id", qaIds.role).single(),
      "read role before",
    );

    await login(page);
    await page.goto(`/contacts/${qaIds.person}`);
    await expect(page.getByRole("link", { name: "Modifier le contact" })).toHaveAttribute(
      "href",
      `/contacts/${qaIds.person}/edit`,
    );
    await page.goto(`/contacts/${qaIds.person}/edit`);

    await expect(page).toHaveURL(new RegExp(`/contacts/${qaIds.person}/edit$`));
    await expect(page.getByLabel("Prénom")).toHaveValue("Aline");
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Avant");
    await expect(page.getByLabel("Nom de la famille ou de la structure")).toHaveValue(
      "Famille Avant",
    );
    await expect(page.getByLabel("Nom affichable")).toHaveValue(
      "Aline personnalisée",
    );

    await page.getByLabel("Prénom").fill("Mutation annulée");
    await page.getByRole("link", { name: "Annuler" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${qaIds.person}$`));
    expect((await readContact(supabase, qaIds.person)).first_name).toBe("Aline");

    await page.goto(`/contacts/${qaIds.person}/edit`);
    await page.getByLabel("Prénom").fill("Aline");
    await page.getByLabel("Nom", { exact: true }).fill("Après");
    await page.getByLabel("Email").fill("ALINE.AFTER@EXAMPLE.INVALID");
    await page.getByLabel("Téléphone principal").fill("+33 6 22 22 22 22");
    await submitForm(page);

    await expect(
      page.getByRole("alertdialog", {
        name: "Confirmer le changement d’e-mail",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Les futurs envois utiliseront la nouvelle adresse"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "Confirmer le changement d’e-mail",
      }),
    ).toBeHidden();
    expect((await readContact(supabase, qaIds.person)).email).toBe(
      "aline.before@example.invalid",
    );

    await submitForm(page);
    await page
      .getByRole("button", { name: "Confirmer le changement d’e-mail" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.person}\\?contact_status=updated$`),
    );
    await expect(page.getByRole("status")).toContainText(
      "Le contact a bien été mis à jour",
    );
    await expect(page.getByText("Dernière modification le")).toBeVisible();

    const after = await readContact(supabase, qaIds.person);
    expect(after.first_name).toBe("Aline");
    expect(after.last_name).toBe("Après");
    expect(after.display_name).toBe("Aline personnalisée");
    expect(after.email).toBe("aline.after@example.invalid");
    expect(after.updated_by).toBe(ownerId);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updated_at).getTime(),
    );

    expect(
      expectSupabaseData(
        await supabase.from("contact_roles").select("*").eq("id", qaIds.role).single(),
        "read role after",
      ),
    ).toMatchObject(roleBefore);
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("edits a structure and recalculates display_name when it is cleared", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    await login(page);
    await page.goto(`/contacts/${qaIds.structure}/edit`);
    await page.getByLabel("Type de contact").selectOption("professional");
    await page
      .getByLabel("Nom de la famille ou de la structure")
      .fill("Clinique QA");
    await page.getByLabel("Prénom").fill("Julie");
    await page.getByLabel("Nom", { exact: true }).fill("Contact");
    await page.getByLabel("Nom affichable").fill("Clinique QA - Julie");
    await submitForm(page);
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.structure}\\?contact_status=updated$`),
    );

    const structure = await readContact(supabase, qaIds.structure);
    expect(structure.contact_type).toBe("professional");
    expect(structure.family_or_structure_name).toBe("Clinique QA");
    expect(structure.display_name).toBe("Clinique QA - Julie");

    await page.goto(`/contacts/${qaIds.recalculated}/edit`);
    await page.getByLabel("Nom affichable").fill("");
    await submitForm(page);
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.recalculated}\\?contact_status=updated$`),
    );

    const recalculated = await readContact(supabase, qaIds.recalculated);
    expect(recalculated.display_name).toBe("Lina Nom — Famille Recalcul");
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("validates e-mail and handles duplicate warnings without blocking explicit save", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    await login(page);
    await page.goto(`/contacts/${qaIds.person}/edit`);
    await page.getByLabel("Email").fill("adresse-invalide");
    await submitForm(page);
    await expect(page.getByText("L’adresse e-mail est invalide")).toBeVisible();
    expect((await readContact(supabase, qaIds.person)).email).toBe(
      "aline.before@example.invalid",
    );

    await page.getByLabel("Email").fill("doublon@example.invalid");
    await submitForm(page);
    await page
      .getByRole("button", { name: "Confirmer le changement d’e-mail" })
      .click();
    await expect(
      page.getByText("Un doublon potentiel a été détecté"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Doublon Email" })).toBeVisible();
    await page
      .getByRole("button", { name: "Enregistrer malgré l’avertissement" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.person}\\?contact_status=updated$`),
    );
    expect((await readContact(supabase, qaIds.person)).email).toBe(
      "doublon@example.invalid",
    );

    await page.goto(`/contacts/${qaIds.selfOnly}/edit`);
    await page.getByLabel("Téléphone principal").fill("+33 6 12 12 12 12");
    await submitForm(page);
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.selfOnly}\\?contact_status=updated$`),
    );
    await expect(page.getByText("Un doublon potentiel")).toHaveCount(0);

    await page.goto(`/contacts/${qaIds.structure}/edit`);
    await page.getByLabel("Téléphone principal").fill("+33 6 91 91 91 91");
    await submitForm(page);
    await expect(
      page.getByText("Un doublon potentiel a été détecté"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Doublon Téléphone" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Enregistrer malgré l’avertissement" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.structure}\\?contact_status=updated$`),
    );
    expect((await readContact(supabase, qaIds.structure)).phone).toBe(
      "+33 6 91 91 91 91",
    );
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("requires a new e-mail confirmation when the confirmed value changes before saving", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    await login(page);
    await page.goto(`/contacts/${qaIds.person}/edit`);
    await page.getByLabel("Email").fill("doublon@example.invalid");
    await submitForm(page);
    await page
      .getByRole("button", { name: "Confirmer le changement d’e-mail" })
      .click();
    await expect(
      page.getByText("Un doublon potentiel a été détecté"),
    ).toBeVisible();

    await page.getByLabel("Email").fill("phone-decoy@example.invalid");
    await expect(page.getByText("Un doublon potentiel")).toHaveCount(0);
    await submitForm(page);

    await expect(
      page.getByRole("alertdialog", {
        name: "Confirmer le changement d’e-mail",
      }),
    ).toBeVisible();
    expect((await readContact(supabase, qaIds.person)).email).toBe(
      "aline.before@example.invalid",
    );
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("invalidates duplicate confirmation when relevant fields change", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    await login(page);
    await page.goto(`/contacts/${qaIds.structure}/edit`);
    await page.getByLabel("Téléphone principal").fill("+33 6 91 91 91 91");
    await submitForm(page);
    await expect(
      page.getByText("Un doublon potentiel a été détecté"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Enregistrer malgré l’avertissement",
        exact: true,
      }),
    ).toBeVisible();

    await page.getByLabel("Téléphone principal").fill("+33 6 90 90 90 90");
    await expect(page.getByText("Un doublon potentiel")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Enregistrer", exact: true }),
    ).toBeVisible();

    await submitForm(page);
    await expect(
      page.getByText("Un doublon potentiel a été détecté"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Enregistrer malgré l’avertissement",
        exact: true,
      }),
    ).toBeVisible();
    expect((await readContact(supabase, qaIds.structure)).phone).toBeNull();
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("refuses deleted and unknown contacts", async ({ page }) => {
  seedContacts();

  try {
    await login(page);
    await page.goto(`/contacts/${qaIds.deleted}/edit`);
    await expect(
      page.getByRole("heading", {
        name: "Contact introuvable ou inaccessible",
      }),
    ).toBeVisible();

    await page.goto("/contacts/72000000-0000-4000-8000-999999999999/edit");
    await expect(
      page.getByRole("heading", {
        name: "Contact introuvable ou inaccessible",
      }),
    ).toBeVisible();

    await page.goto(`/contacts/${qaIds.otherOrganization}/edit`);
    await expect(
      page.getByRole("heading", {
        name: "Contact introuvable ou inaccessible",
      }),
    ).toBeVisible();
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("moves application creation to linked applications with duplicate confirmation", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();
  seedApplication({
    id: qaIds.finalizedApplication,
    contactId: qaIds.structure,
    status: "archived",
  });
  seedApplication({
    id: qaIds.openApplication,
    contactId: qaIds.duplicatePhone,
    status: "to_review",
  });

  try {
    await login(page);

    await page.goto(`/contacts/${qaIds.person}`);
    const noApplicationHeader = page.locator("header");
    await expect(
      noApplicationHeader.getByRole("link", { name: "Créer une candidature" }),
    ).toHaveCount(0);
    await expect(
      noApplicationHeader.getByRole("link", { name: "Modifier le contact" }),
    ).toHaveAttribute("href", `/contacts/${qaIds.person}/edit`);
    await expect(
      page.getByRole("link", { name: "Créer une candidature" }),
    ).toHaveAttribute("href", `/contacts/${qaIds.person}/applications/new`);

    await page.goto(`/contacts/${qaIds.structure}`);
    await expect(
      page.locator("header").getByRole("link", { name: "Créer une candidature" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "+ Nouvelle candidature" }),
    ).toHaveAttribute("href", `/contacts/${qaIds.structure}/applications/new`);
    await expect(
      page.getByText("Créer un nouveau projet d’adoption pour ce contact."),
    ).toBeVisible();
    await page.getByRole("link", { name: "+ Nouvelle candidature" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.structure}/applications/new$`),
    );

    await page.goto(`/contacts/${qaIds.duplicatePhone}`);
    const beforeCancel = await countApplicationsForContact(
      supabase,
      qaIds.duplicatePhone,
    );
    await page.getByRole("button", { name: "+ Nouvelle candidature" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "Créer une nouvelle candidature ?",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Ce contact possède déjà une candidature en cours. Créer une nouvelle candidature distincte ?",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${qaIds.duplicatePhone}$`));
    await expect(
      page.getByRole("alertdialog", {
        name: "Créer une nouvelle candidature ?",
      }),
    ).toBeHidden();
    const afterCancel = await countApplicationsForContact(
      supabase,
      qaIds.duplicatePhone,
    );
    expect(afterCancel).toBe(beforeCancel);

    await page.getByRole("button", { name: "+ Nouvelle candidature" }).click();
    await page
      .getByRole("link", { name: "Créer une candidature distincte" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/contacts/${qaIds.duplicatePhone}/applications/new$`),
    );
    const afterConfirm = await countApplicationsForContact(
      supabase,
      qaIds.duplicatePhone,
    );
    expect(afterConfirm).toBe(beforeCancel);
  } finally {
    cleanup();
    expectCleanupDone();
  }
});

test("keeps active viewers read-only for contact editing", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  seedContacts();

  try {
    const before = await readContact(supabase, qaIds.person);

    await login(page, viewerEmail, viewerPassword);
    await page.goto(`/contacts/${qaIds.person}`);
    await expect(
      page.getByRole("link", { name: "Modifier le contact" }),
    ).toHaveCount(0);
    await expect(
      page.locator("header").getByRole("link", { name: "Créer une candidature" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Créer une candidature" }),
    ).toBeVisible();

    await page.goto(`/contacts/${qaIds.person}/edit`);
    await expect(
      page.getByRole("heading", {
        name: "Contact introuvable ou inaccessible",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enregistrer", exact: true }),
    ).toHaveCount(0);

    expect(await readContact(supabase, qaIds.person)).toMatchObject(before);
  } finally {
    cleanup();
    expectCleanupDone();
  }
});
