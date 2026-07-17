import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentTemplateFamilyWithDraftCore,
  createNextDocumentTemplateDraftCore,
  getDocumentTemplateValidationMessage,
  listDocumentTemplateFamiliesCore,
  publishDocumentTemplateDraftCore,
  saveDocumentTemplateDraftCore,
  updateDocumentTemplateFamilyMetadataCore,
  validateDocumentTemplateDraftCore,
} from "../../src/features/documents/document-template-management-core";
import type { ReservationContractTemplateDefinition } from "../../src/features/documents/document-template-definitions";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9e140002-0000-4000-8000-0000000000";
const otherOrganizationId = `${prefix}90`;
const directFamilyId = `${prefix}91`;
const fixtureNamePrefix = "E2E DTM ";

const users = {
  admin: {
    id: `${prefix}10`,
    identityId: `${prefix}11`,
    membershipId: `${prefix}12`,
    email: "dtm-admin@saasphase1.invalid",
    password: "DtmAdmin-2026!",
    role: "admin",
    status: "active",
  },
  member: {
    id: `${prefix}20`,
    identityId: `${prefix}21`,
    membershipId: `${prefix}22`,
    email: "dtm-member@saasphase1.invalid",
    password: "DtmMember-2026!",
    role: "member",
    status: "active",
  },
  viewer: {
    id: `${prefix}30`,
    identityId: `${prefix}31`,
    membershipId: `${prefix}32`,
    email: "dtm-viewer@saasphase1.invalid",
    password: "DtmViewer-2026!",
    role: "viewer",
    status: "active",
  },
  inactive: {
    id: `${prefix}40`,
    identityId: `${prefix}41`,
    membershipId: `${prefix}42`,
    email: "dtm-inactive@saasphase1.invalid",
    password: "DtmInactive-2026!",
    role: "member",
    status: "disabled",
  },
} as const;

const baseDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat E2E",
  body: "Contenu E2E du contrat.\nAdoptant : [[adoptant.nom_complet]]",
};

type Supabase = SupabaseClient<Database>;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function content(title: string) {
  return JSON.stringify({ ...baseDefinition, title });
}

function cleanup() {
  sql(`
    delete from public.document_templates
    where family_id in (
      select id from public.document_template_families
      where name like ${q(`${fixtureNamePrefix}%`)}
    );
    delete from public.document_template_families
    where name like ${q(`${fixtureNamePrefix}%`)}
       or id = ${q(directFamilyId)}::uuid;
    delete from public.memberships where id::text like '9e140002-%';
    delete from auth.identities where user_id::text like '9e140002-%';
    delete from auth.users where id::text like '9e140002-%';
    delete from public.organizations where id = ${q(otherOrganizationId)}::uuid;
  `);
}

function remainingFixtureCount() {
  return Number(sql(`
    select
      (select count(*) from public.document_templates
       where family_id in (
         select id from public.document_template_families
         where name like ${q(`${fixtureNamePrefix}%`)}
       ))
      + (select count(*) from public.document_template_families
         where name like ${q(`${fixtureNamePrefix}%`)}
            or id = ${q(directFamilyId)}::uuid)
      + (select count(*) from public.memberships where id::text like '9e140002-%')
      + (select count(*) from public.profiles where id::text like '9e140002-%')
      + (select count(*) from auth.identities where user_id::text like '9e140002-%')
      + (select count(*) from auth.users where id::text like '9e140002-%')
      + (select count(*) from public.organizations
         where id = ${q(otherOrganizationId)}::uuid);
  `));
}

function createRoleFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(otherOrganizationId)}::uuid,
      'Organisation E2E DTM isolée',
      'e2e-dtm-isolee'
    );
  `);

  for (const user of Object.values(users)) {
    sql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, phone_change,
        phone_change_token, email_change_token_current,
        reauthentication_token, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${q(user.id)}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')),
        now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`DTM ${user.role}`)}),
        now(), now()
      );

      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object(
          'sub', ${q(user.id)}, 'email', ${q(user.email)},
          'email_verified', true, 'phone_verified', false
        ),
        'email', now(), now()
      );

      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(user.membershipId)}::uuid, ${q(organizationId)}::uuid,
        ${q(user.id)}::uuid, ${q(user.role)}, ${q(user.status)},
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

async function clientFor(user: (typeof users)[keyof typeof users]) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signedIn.error) throw signedIn.error;
  return client;
}

async function callOldPublishSignature(
  supabase: Supabase,
  templateId: string,
) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Missing authenticated E2E session");

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/publish_document_template_version`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_template_id: templateId }),
    },
  );
  return { ok: response.ok, body: await response.text() };
}

async function readPublishArgs(supabase: Supabase, templateId: string) {
  const draft = await supabase
    .from("document_templates")
    .select("id, updated_at, template_format, template_content")
    .eq("id", templateId)
    .single();
  if (draft.error) throw draft.error;
  return {
    p_template_id: draft.data.id,
    p_expected_updated_at: draft.data.updated_at,
    p_expected_template_format: draft.data.template_format,
    p_expected_template_content: draft.data.template_content,
  };
}

test("manages document template families and drafts with safe concurrency", async () => {
  cleanup();
  expect(remainingFixtureCount()).toBe(0);

  const createdFamilyIds: string[] = [];
  const createdTemplateIds: string[] = [];

  try {
    createRoleFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const admin = await clientFor(users.admin);
    const member = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);
    const inactive = await clientFor(users.inactive);

    for (const [client, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      const listed = await listDocumentTemplateFamiliesCore(
        { organizationId },
        client,
      );
      expect(listed.outcome).toBe("success");
      if (listed.outcome === "success") expect(listed.role).toBe(role);
    }

    const inactiveList = await listDocumentTemplateFamiliesCore(
      { organizationId },
      inactive,
    );
    expect(inactiveList).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });
    const crossOrganization = await listDocumentTemplateFamiliesCore(
      { organizationId: otherOrganizationId },
      owner,
    );
    expect(crossOrganization).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });

    const viewerCreate = await createDocumentTemplateFamilyWithDraftCore(
      {
        organizationId,
        name: `${fixtureNamePrefix}viewer refusé`,
        description: null,
        documentType: "reservation_contract",
        species: "dog",
        breed: "Golden Retriever",
        templateFormat: "json",
        templateContent: content("Viewer"),
      },
      viewer,
    );
    expect(viewerCreate).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });

    const created = await createDocumentTemplateFamilyWithDraftCore(
      {
        organizationId,
        name: `${fixtureNamePrefix}contrat principal`,
        description: "Famille de test du service",
        documentType: "reservation_contract",
        species: "dog",
        breed: "Golden Retriever",
        templateFormat: "json",
        templateContent: content("Version 1"),
      },
      admin,
    );
    expect(created.outcome).toBe("success");
    if (created.outcome !== "success") return;
    createdFamilyIds.push(created.familyId);
    createdTemplateIds.push(created.templateId);
    expect(created.version).toBe(1);
    expect(Number(sql(`
      select count(*)
      from public.document_template_families family
      join public.document_templates template on template.family_id = family.id
      where family.id = ${q(created.familyId)}::uuid
        and template.id = ${q(created.templateId)}::uuid
        and template.version = 1
        and template.lifecycle_status = 'draft';
    `))).toBe(1);

    const rollbackName = `${fixtureNamePrefix}rollback`;
    const rolledBack = await createDocumentTemplateFamilyWithDraftCore(
      {
        organizationId,
        name: rollbackName,
        description: null,
        documentType: "reservation_contract",
        species: "dog",
        breed: "Golden Retriever",
        templateFormat: "json",
        templateContent: "{invalid",
      },
      admin,
    );
    expect(rolledBack).toMatchObject({
      outcome: "error",
      error: { code: "invalid_input" },
    });
    expect(Number(sql(`
      select count(*) from public.document_template_families
      where name = ${q(rollbackName)};
    `))).toBe(0);

    const directInsert = await admin.from("document_template_families").insert({
      id: directFamilyId,
      organization_id: organizationId,
      name: `${fixtureNamePrefix}insert direct refusé`,
      document_type: "reservation_contract",
    });
    expect(directInsert.error?.code).toBe("42501");

    const memberUpdate = await updateDocumentTemplateFamilyMetadataCore(
      {
        organizationId,
        familyId: created.familyId,
        name: `${fixtureNamePrefix}modification membre`,
        description: null,
      },
      member,
    );
    expect(memberUpdate).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });
    const adminUpdate = await updateDocumentTemplateFamilyMetadataCore(
      {
        organizationId,
        familyId: created.familyId,
        name: `${fixtureNamePrefix}contrat renommé`,
        description: "Description synchronisée",
      },
      admin,
    );
    expect(adminUpdate.outcome).toBe("success");

    const viewerValidation = await validateDocumentTemplateDraftCore(
      { organizationId, templateId: created.templateId },
      viewer,
    );
    expect(viewerValidation.outcome).toBe("success");

    const initialPublication = await publishDocumentTemplateDraftCore(
      { organizationId, templateId: created.templateId },
      admin,
    );
    expect(initialPublication).toEqual({
      outcome: "success",
      templateId: created.templateId,
    });

    const concurrentDrafts = await Promise.all([
      createNextDocumentTemplateDraftCore(
        { organizationId, familyId: created.familyId },
        owner,
      ),
      createNextDocumentTemplateDraftCore(
        { organizationId, familyId: created.familyId },
        member,
      ),
    ]);
    expect(concurrentDrafts.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(concurrentDrafts.filter((result) => result.outcome === "error")).toHaveLength(1);
    const draftResult = concurrentDrafts.find(
      (result) => result.outcome === "success",
    );
    const rejectedDraft = concurrentDrafts.find(
      (result) => result.outcome === "error",
    );
    expect(rejectedDraft).toMatchObject({
      outcome: "error",
      error: { code: "draft_already_exists" },
    });
    if (!draftResult || draftResult.outcome !== "success") return;
    createdTemplateIds.push(draftResult.templateId);

    const viewerSave = await saveDocumentTemplateDraftCore(
      {
        organizationId,
        templateId: draftResult.templateId,
        templateContent: "{}",
        expectedUpdatedAt: draftResult.updatedAt,
      },
      viewer,
    );
    expect(viewerSave).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });

    const incompleteSave = await saveDocumentTemplateDraftCore(
      {
        organizationId,
        templateId: draftResult.templateId,
        templateContent: "{}",
        expectedUpdatedAt: draftResult.updatedAt,
      },
      member,
    );
    expect(incompleteSave.outcome).toBe("success");
    if (incompleteSave.outcome !== "success") return;

    const staleSave = await saveDocumentTemplateDraftCore(
      {
        organizationId,
        templateId: draftResult.templateId,
        templateContent: content("Écrasement refusé"),
        expectedUpdatedAt: draftResult.updatedAt,
      },
      member,
    );
    expect(staleSave).toMatchObject({
      outcome: "error",
      error: { code: "stale_draft" },
    });

    const invalidValidation = await validateDocumentTemplateDraftCore(
      { organizationId, templateId: draftResult.templateId },
      viewer,
    );
    expect(invalidValidation).toMatchObject({
      outcome: "error",
      error: { code: "invalid_template" },
    });
    const invalidPublication = await publishDocumentTemplateDraftCore(
      { organizationId, templateId: draftResult.templateId },
      admin,
    );
    expect(invalidPublication).toMatchObject({
      outcome: "error",
      error: { code: "invalid_template" },
    });

    const translatedMessages = {
      invalid_format: "Le format du brouillon doit être JSON.",
      invalid_json: "Le contenu du brouillon n’est pas un JSON valide.",
      unsupported_schema_version:
        "La version du schéma documentaire n’est pas prise en charge.",
      document_type_mismatch:
        "Le type de document du contenu ne correspond pas à celui de la famille.",
      invalid_template_content:
        "Le contenu du brouillon ne respecte pas le schéma documentaire attendu.",
    } as const;
    for (const [code, message] of Object.entries(translatedMessages)) {
      expect(
        getDocumentTemplateValidationMessage(
          code as keyof typeof translatedMessages,
        ),
      ).toBe(message);
    }

    const validSave = await saveDocumentTemplateDraftCore(
      {
        organizationId,
        templateId: draftResult.templateId,
        templateContent: content("Version 2 validée"),
        expectedUpdatedAt: incompleteSave.updatedAt,
      },
      member,
    );
    expect(validSave.outcome).toBe("success");
    if (validSave.outcome !== "success") return;
    const validated = await validateDocumentTemplateDraftCore(
      { organizationId, templateId: draftResult.templateId },
      viewer,
    );
    expect(validated.outcome).toBe("success");

    const stalePublishArgs = await readPublishArgs(admin, draftResult.templateId);
    const postValidationSave = await saveDocumentTemplateDraftCore(
      {
        organizationId,
        templateId: draftResult.templateId,
        templateContent: content("Version 2 modifiée après validation"),
        expectedUpdatedAt: validSave.updatedAt,
      },
      member,
    );
    expect(postValidationSave.outcome).toBe("success");
    const stalePublication = await admin.rpc(
      "publish_document_template_version",
      stalePublishArgs,
    );
    expect(stalePublication.error).toMatchObject({
      code: "P0001",
      message: "Document template draft is stale",
    });

    const oldSignature = await callOldPublishSignature(
      admin,
      draftResult.templateId,
    );
    expect(oldSignature.ok).toBe(false);
    expect(oldSignature.body).toMatch(/function|schema cache/i);

    const publication = await publishDocumentTemplateDraftCore(
      { organizationId, templateId: draftResult.templateId },
      admin,
    );
    expect(publication.outcome).toBe("success");

    const thirdDraft = await createNextDocumentTemplateDraftCore(
      { organizationId, familyId: created.familyId },
      member,
    );
    expect(thirdDraft.outcome).toBe("success");
    if (thirdDraft.outcome !== "success") return;
    createdTemplateIds.push(thirdDraft.templateId);
    const concurrentPublishArgs = await readPublishArgs(admin, thirdDraft.templateId);
    const concurrentPublications = await Promise.all([
      owner.rpc("publish_document_template_version", concurrentPublishArgs),
      admin.rpc("publish_document_template_version", concurrentPublishArgs),
    ]);
    expect(concurrentPublications.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrentPublications.filter((result) => result.error)).toHaveLength(1);
    expect(
      concurrentPublications.find((result) => result.error)?.error,
    ).toMatchObject({
      code: "P0001",
      message: "Document template draft is stale",
    });

    const fourthDraft = await createNextDocumentTemplateDraftCore(
      { organizationId, familyId: created.familyId },
      member,
    );
    expect(fourthDraft.outcome).toBe("success");
    if (fourthDraft.outcome !== "success") return;
    createdTemplateIds.push(fourthDraft.templateId);
    const listed = await listDocumentTemplateFamiliesCore(
      { organizationId },
      viewer,
    );
    expect(listed.outcome).toBe("success");
    if (listed.outcome !== "success") return;
    const listedFamily = listed.families.find(
      (family) => family.id === created.familyId,
    );
    expect(listedFamily?.draft?.id).toBe(fourthDraft.templateId);
    expect(listedFamily?.publication?.id).toBe(thirdDraft.templateId);

    console.info(
      `document-template-management fixture families: ${createdFamilyIds.join(",")}`,
    );
    console.info(
      `document-template-management fixture templates: ${createdTemplateIds.join(",")}`,
    );
  } finally {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
  }
});
