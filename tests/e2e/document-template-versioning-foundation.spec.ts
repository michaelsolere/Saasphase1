import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  parseDocumentTemplateDefinition,
  type ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9d140000-0000-4000-8000-0000000000";
const otherOrganizationId = "30000000-0000-4000-8000-000000000099";
const ids = {
  family: `${prefix}01`,
  adminFamily: `${prefix}02`,
  duplicateDraft: `${prefix}03`,
  duplicatePublished: `${prefix}04`,
  invalidActiveDraft: `${prefix}05`,
  missingPublicationMetadata: `${prefix}07`,
  inactivePublication: `${prefix}08`,
  adminUser: `${prefix}10`,
  adminIdentity: `${prefix}11`,
  adminMembership: `${prefix}12`,
  memberUser: `${prefix}20`,
  memberIdentity: `${prefix}21`,
  memberMembership: `${prefix}22`,
  viewerUser: `${prefix}30`,
  viewerIdentity: `${prefix}31`,
  viewerMembership: `${prefix}32`,
  contact: `${prefix}40`,
  reservation: `${prefix}41`,
  otherReservation: `${prefix}42`,
  exactDocument: `${prefix}50`,
  mismatchDocument: `${prefix}51`,
  draftGeneratedDocument: `${prefix}52`,
  draftReferenceDocument: `${prefix}53`,
} as const;

const reservationContractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de référence",
  preamble: ["Préambule du contrat de référence."],
  clauses: {
    reservationPurpose: ["Objet de la réservation."],
    priceAndPayments: ["Prix et modalités de paiement."],
    deposit: ["Conditions relatives aux arrhes."],
    cancellationAndRefund: ["Conditions d’annulation et de remboursement."],
    postponementAndCredit: ["Conditions de report et d’avoir."],
    potentialWithholding: ["Conditions d’une éventuelle retenue."],
    finalConditions: ["Conditions finales de la réservation."],
  },
  signatureLabels: {
    breeder: "L’éleveur",
    reservingParty: "Le réservant",
  },
};

function reservationContractContent(title: string) {
  return JSON.stringify({ ...reservationContractDefinition, title });
}

const users = {
  admin: {
    id: ids.adminUser,
    identityId: ids.adminIdentity,
    membershipId: ids.adminMembership,
    email: "template-admin@saasphase1.invalid",
    password: "TemplateAdmin-2026!",
    role: "admin",
  },
  member: {
    id: ids.memberUser,
    identityId: ids.memberIdentity,
    membershipId: ids.memberMembership,
    email: "template-member@saasphase1.invalid",
    password: "TemplateMember-2026!",
    role: "member",
  },
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    email: "template-viewer@saasphase1.invalid",
    password: "TemplateViewer-2026!",
    role: "viewer",
  },
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function publishArgs(templateId: string) {
  return JSON.parse(sql(`
    select json_build_object(
      'p_template_id', id,
      'p_expected_updated_at', updated_at,
      'p_expected_template_format', template_format,
      'p_expected_template_content', template_content
    )::text
    from public.document_templates
    where id = ${q(templateId)}::uuid;
  `)) as {
    p_template_id: string;
    p_expected_updated_at: string;
    p_expected_template_format: string;
    p_expected_template_content: string;
  };
}

function expectSqlFailure(value: string, expected: RegExp) {
  expect(() => sql(value)).toThrow(expected);
}

function cleanup() {
  sql(`
    delete from public.documents where id::text like '9d140000-%';
    delete from public.reservations where id::text like '9d140000-%';
    delete from public.contacts where id::text like '9d140000-%';
    delete from public.document_templates
    where family_id in (${q(ids.family)}::uuid, ${q(ids.adminFamily)}::uuid);
    delete from public.document_template_families where id::text like '9d140000-%';
    delete from public.memberships where id::text like '9d140000-%';
    delete from auth.identities where user_id::text like '9d140000-%';
    delete from auth.users where id::text like '9d140000-%';
  `);
}

function remainingFixtureCount() {
  return Number(sql(`
    select
      (select count(*) from public.documents where id::text like '9d140000-%')
      + (select count(*) from public.reservations where id::text like '9d140000-%')
      + (select count(*) from public.contacts where id::text like '9d140000-%')
      + (select count(*) from public.document_templates
         where family_id in (${q(ids.family)}::uuid, ${q(ids.adminFamily)}::uuid))
      + (select count(*) from public.document_template_families where id::text like '9d140000-%')
      + (select count(*) from public.memberships where id::text like '9d140000-%')
      + (select count(*) from public.profiles where id::text like '9d140000-%')
      + (select count(*) from auth.identities where user_id::text like '9d140000-%')
      + (select count(*) from auth.users where id::text like '9d140000-%');
  `));
}

function createRoleFixtures() {
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
        jsonb_build_object('display_name', ${q(`Template ${user.role}`)}),
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
        ${q(user.id)}::uuid, ${q(user.role)}, 'active',
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

function createInitialFamilyAndPublication() {
  sql(`
    insert into public.document_template_families (
      id, organization_id, name, description, document_type, species, breed,
      created_by, updated_by
    ) values (
      ${q(ids.family)}::uuid, ${q(organizationId)}::uuid,
      'Contrat de référence', 'Famille E2E stable',
      'reservation_contract', 'dog', 'Golden Retriever',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.document_templates (
      id, organization_id, family_id, name, description, document_type,
      species, breed, template_format, template_content, version,
      lifecycle_status, is_active, published_at, published_by,
      created_by, updated_by
    ) values (
      gen_random_uuid(), ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
      'Contrat de référence', 'Famille E2E stable',
      'reservation_contract', 'dog', 'Golden Retriever', 'json',
      ${q(reservationContractContent("Version 1"))},
      1, 'published', true, now(), ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

test("versions document templates atomically, enforces permissions and cleans fixtures", async () => {
  cleanup();
  expect(remainingFixtureCount()).toBe(0);
  expect(Number(sql("select count(*) from public.document_templates;"))).toBe(0);
  expect(Number(sql("select count(*) from public.document_template_families;"))).toBe(0);

  const draftIds: string[] = [];

  try {
    createRoleFixtures();
    createInitialFamilyAndPublication();

    const owner = await createAuthenticatedSupabaseClient();
    const admin = await clientFor(users.admin);
    const member = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);

    sql(`
      insert into public.document_template_families (
        id, organization_id, name, document_type, species, breed,
        created_by, updated_by
      ) values (
        ${q(ids.adminFamily)}::uuid, ${q(organizationId)}::uuid,
        'Famille créée par admin', 'other', 'dog', 'Golden Retriever',
        ${q(users.admin.id)}::uuid, ${q(users.admin.id)}::uuid
      );
    `);

    const familyAuditUpdate = await admin
      .from("document_template_families")
      .update({
        description: "Description modifiée par admin",
        updated_by: users.viewer.id,
      })
      .eq("id", ids.adminFamily);
    expect(familyAuditUpdate.error).toBeNull();
    expect(sql(`
      select updated_by::text from public.document_template_families
      where id = ${q(ids.adminFamily)}::uuid;
    `)).toBe(users.admin.id);

    for (const mutation of [
      { id: `${prefix}09` },
      { organization_id: otherOrganizationId },
      { created_at: "2000-01-01T00:00:00.000Z" },
      { created_by: users.member.id },
    ]) {
      const immutableFamilyIdentity = await admin
        .from("document_template_families")
        .update(mutation)
        .eq("id", ids.adminFamily);
      expect(immutableFamilyIdentity.error?.message).toMatch(
        /family identity and creation audit are immutable/,
      );
    }

    const immutableFamilyTaxonomy = await admin
      .from("document_template_families")
      .update({ species: "cat" })
      .eq("id", ids.family);
    expect(immutableFamilyTaxonomy.error?.message).toMatch(
      /family taxonomy is immutable/,
    );

    const memberFamily = await member.from("document_template_families").insert({
      id: `${prefix}06`,
      organization_id: organizationId,
      name: "Famille refusée au membre",
      document_type: "other",
    });
    expect(memberFamily.error).not.toBeNull();

    const missingInitialDraftContent = await admin.rpc(
      "create_document_template_draft",
      { p_family_id: ids.adminFamily },
    );
    expect(missingInitialDraftContent.error?.message).toMatch(
      /requires explicit format and content when no publication exists/,
    );

    const explicitInitialDraft = await admin.rpc(
      "create_document_template_draft",
      {
        p_family_id: ids.adminFamily,
        p_template_content: "{}",
        p_template_format: "json",
      },
    );
    expect(explicitInitialDraft.error).toBeNull();
    draftIds.push(explicitInitialDraft.data!);

    const renamedFamily = await admin
      .from("document_template_families")
      .update({ name: "Contrat de référence renommé" })
      .eq("id", ids.family);
    expect(renamedFamily.error).toBeNull();
    expect(sql(`
      select name from public.document_templates
      where family_id = ${q(ids.family)}::uuid and version = 1;
    `)).toBe("Contrat de référence renommé");

    const viewerDraft = await viewer.rpc("create_document_template_draft", {
      p_family_id: ids.family,
      p_template_content: '{"viewer":true}',
      p_template_format: "json",
    });
    expect(viewerDraft.error?.message).toMatch(/Insufficient organization permissions/);

    const createdByMember = await member.rpc("create_document_template_draft", {
      p_family_id: ids.family,
    });
    expect(createdByMember.error).toBeNull();
    expect(createdByMember.data).toEqual(expect.any(String));
    const version2Id = createdByMember.data!;
    draftIds.push(version2Id);
    expect(sql(`
      select template_format || ':' || (template_content = ${q(reservationContractContent("Version 1"))})::text
      from public.document_templates where id = ${q(version2Id)}::uuid;
    `)).toBe("json:true");

    const memberEdit = await member
      .from("document_templates")
      .update({
        template_content: reservationContractContent("Version 2"),
        updated_by: users.admin.id,
      })
      .eq("id", version2Id);
    expect(memberEdit.error).toBeNull();
    expect(sql(`
      select updated_by::text from public.document_templates
      where id = ${q(version2Id)}::uuid;
    `)).toBe(users.member.id);

    for (const mutation of [
      { id: `${prefix}09` },
      { created_at: "2000-01-01T00:00:00.000Z" },
      { created_by: users.admin.id },
    ]) {
      const immutableDraftIdentity = await member
        .from("document_templates")
        .update(mutation)
        .eq("id", version2Id);
      expect(immutableDraftIdentity.error?.message).toMatch(
        /identity and creation audit are immutable/,
      );
    }

    const directLifecycleChange = await member
      .from("document_templates")
      .update({ lifecycle_status: "published", is_active: true })
      .eq("id", version2Id);
    expect(directLifecycleChange.error?.message).toMatch(/require a lifecycle function/);

    const memberPublish = await member.rpc(
      "publish_document_template_version",
      publishArgs(version2Id),
    );
    expect(memberPublish.error?.message).toMatch(/Insufficient organization permissions/);

    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, species, breed,
        template_format, template_content, version, lifecycle_status, is_active
      ) values (
        ${q(ids.duplicateDraft)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.family)}::uuid, 'duplicate', 'reservation_contract', 'dog',
        'Golden Retriever', 'json',
        ${q(reservationContractContent("Duplicate draft"))}, 20, 'draft', false
      );`,
      /document_templates_one_draft_per_family_idx/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, species, breed,
        template_format, template_content, version, lifecycle_status, is_active,
        published_at, published_by
      ) values (
        ${q(ids.duplicatePublished)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.family)}::uuid, 'duplicate', 'reservation_contract', 'dog',
        'Golden Retriever', 'json',
        ${q(reservationContractContent("Duplicate publication"))},
        21, 'published', true,
        now(), ${q(ownerId)}::uuid
      );`,
      /document_templates_one_published_per_family_idx/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, species, breed,
        template_format, template_content, version, lifecycle_status, is_active
      ) values (
        ${q(ids.invalidActiveDraft)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.adminFamily)}::uuid, 'invalid', 'other', 'dog',
        'Golden Retriever', 'json', '{}', 1, 'draft', true
      );`,
      /document_templates_lifecycle_active_check/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, species, breed,
        template_format, template_content, version, lifecycle_status, is_active
      ) values (
        ${q(ids.missingPublicationMetadata)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.adminFamily)}::uuid, 'missing metadata', 'other', 'dog',
        'Golden Retriever', 'json', '{}', 2, 'published', true
      );`,
      /document_templates_publication_metadata_check/,
    );
    expectSqlFailure(
      `insert into public.document_templates (
        id, organization_id, family_id, name, document_type, species, breed,
        template_format, template_content, version, lifecycle_status, is_active,
        published_at, published_by
      ) values (
        ${q(ids.inactivePublication)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.adminFamily)}::uuid, 'inactive publication', 'other', 'dog',
        'Golden Retriever', 'json', '{}', 3, 'published', false,
        now(), ${q(ownerId)}::uuid
      );`,
      /document_templates_lifecycle_active_check/,
    );

    const adminPublish = await admin.rpc(
      "publish_document_template_version",
      publishArgs(version2Id),
    );
    expect(adminPublish.error).toBeNull();
    expect(adminPublish.data).toBe(version2Id);

    const publicationState = sql(`
      select string_agg(
        version::text || ':' || lifecycle_status || ':' || is_active::text,
        ',' order by version
      )
      from public.document_templates where family_id = ${q(ids.family)}::uuid;
    `);
    expect(publicationState).toBe("1:retired:false,2:published:true");
    expect(sql(`
      select published_by::text from public.document_templates where id = ${q(version2Id)}::uuid;
    `)).toBe(users.admin.id);
    expect(sql(`
      select published_at is not null from public.document_templates where id = ${q(version2Id)}::uuid;
    `)).toBe("t");

    const publishedAuditBeforeDirectUpdate = sql(`
      select updated_by::text || '|' || updated_at::text
      from public.document_templates where id = ${q(version2Id)}::uuid;
    `);
    const publishedNoOpUpdate = await admin
      .from("document_templates")
      .update({ name: "Contrat de référence renommé" })
      .eq("id", version2Id);
    expect(publishedNoOpUpdate.error?.message).toMatch(
      /immutable to direct authenticated updates/,
    );
    expect(sql(`
      select updated_by::text || '|' || updated_at::text
      from public.document_templates where id = ${q(version2Id)}::uuid;
    `)).toBe(publishedAuditBeforeDirectUpdate);

    const familySyncAfterPublication = await admin
      .from("document_template_families")
      .update({
        name: "Contrat synchronisé sans audit version",
        description: "Description synchronisée sans audit version",
      })
      .eq("id", ids.family);
    expect(familySyncAfterPublication.error).toBeNull();
    expect(sql(`
      select name || '|' || description from public.document_templates
      where id = ${q(version2Id)}::uuid;
    `)).toBe(
      "Contrat synchronisé sans audit version|Description synchronisée sans audit version",
    );
    expect(sql(`
      select updated_by::text || '|' || updated_at::text
      from public.document_templates where id = ${q(version2Id)}::uuid;
    `)).toBe(publishedAuditBeforeDirectUpdate);

    const retiredCreationAuthorTamper = await admin
      .from("document_templates")
      .update({ created_by: users.member.id })
      .eq("family_id", ids.family)
      .eq("version", 1);
    expect(retiredCreationAuthorTamper.error?.message).toMatch(
      /identity and creation audit are immutable/,
    );

    const retiredUpdateAuthorTamper = await admin
      .from("document_templates")
      .update({ updated_by: users.member.id })
      .eq("family_id", ids.family)
      .eq("version", 1);
    expect(retiredUpdateAuthorTamper.error?.message).toMatch(
      /immutable to direct authenticated updates/,
    );

    const publishedAuthorTamper = await admin
      .from("document_templates")
      .update({ published_by: users.member.id })
      .eq("id", version2Id);
    expect(publishedAuthorTamper.error?.message).toMatch(
      /immutable to direct authenticated updates/,
    );

    const publishedUpdateAuthorTamper = await member
      .from("document_templates")
      .update({ updated_by: users.member.id })
      .eq("id", version2Id);
    expect(publishedUpdateAuthorTamper.error?.message).toMatch(
      /immutable to direct authenticated updates/,
    );

    const retiredEdit = await admin
      .from("document_templates")
      .update({ template_content: '{"changed":true}' })
      .eq("family_id", ids.family)
      .eq("version", 1);
    expect(retiredEdit.error?.message).toMatch(/immutable/);

    const retiredSoftDelete = await admin
      .from("document_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("family_id", ids.family)
      .eq("version", 1);
    expect(retiredSoftDelete.error?.message).toMatch(
      /cannot be soft-deleted|deletion state requires a lifecycle function/,
    );

    const concurrentDrafts = await Promise.all([
      owner.rpc("create_document_template_draft", {
        p_family_id: ids.family,
      }),
      member.rpc("create_document_template_draft", {
        p_family_id: ids.family,
      }),
    ]);
    const createdDrafts = concurrentDrafts.filter((result) => !result.error);
    const rejectedDrafts = concurrentDrafts.filter((result) => result.error);
    expect(createdDrafts).toHaveLength(1);
    expect(rejectedDrafts).toHaveLength(1);
    expect(rejectedDrafts[0].error?.message).toMatch(/draft already exists/);
    const version3Id = createdDrafts[0].data!;
    draftIds.push(version3Id);
    expect(Number(sql(`
      select version from public.document_templates where id = ${q(version3Id)}::uuid;
    `))).toBe(3);
    expect(sql(`
      select (template_content = ${q(reservationContractContent("Version 2"))})::text
      from public.document_templates where id = ${q(version3Id)}::uuid;
    `)).toBe("true");

    const version3PublishArgs = publishArgs(version3Id);
    const concurrentPublications = await Promise.all([
      owner.rpc("publish_document_template_version", version3PublishArgs),
      admin.rpc("publish_document_template_version", version3PublishArgs),
    ]);
    expect(concurrentPublications.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrentPublications.filter((result) => result.error)).toHaveLength(1);
    expect(concurrentPublications.find((result) => result.error)?.error?.message).toMatch(
      /stale/,
    );
    expect(sql(`
      select string_agg(
        version::text || ':' || lifecycle_status || ':' || is_active::text,
        ',' order by version
      )
      from public.document_templates where family_id = ${q(ids.family)}::uuid;
    `)).toBe("1:retired:false,2:retired:false,3:published:true");

    const publishedContent = sql(`
      select template_content from public.document_templates
      where id = ${q(version3Id)}::uuid;
    `);
    expect(
      parseDocumentTemplateDefinition({
        templateFormat: "json",
        documentType: "reservation_contract",
        templateContent: publishedContent,
      }),
    ).toMatchObject({ success: true });

    sql(`
      insert into public.contacts (id, organization_id, display_name)
      values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Template QA contact');
      insert into public.reservations (id, organization_id, contact_id)
      values
        (${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid),
        (${q(ids.otherReservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid);

      insert into public.documents (
        id, organization_id, contact_id, reservation_id, template_id,
        source_template_version, generated_from_template, generated_at,
        document_type, status, title
      ) values (
        ${q(ids.exactDocument)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid,
        ${q(version3Id)}::uuid, 3, true, now(),
        'reservation_contract', 'generated', 'Exact template version'
      );
    `);

    expectSqlFailure(
      `insert into public.documents (
        id, organization_id, contact_id, reservation_id, template_id,
        source_template_version, generated_from_template, generated_at,
        document_type, status, title
      ) values (
        ${q(ids.mismatchDocument)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.contact)}::uuid, ${q(ids.otherReservation)}::uuid,
        ${q(version3Id)}::uuid, 2, true, now(),
        'reservation_contract', 'generated', 'Mismatched template version'
      );`,
      /exact document template version|documents_template_exact_fk/,
    );

    const version4 = await member.rpc("create_document_template_draft", {
      p_family_id: ids.family,
    });
    expect(version4.error).toBeNull();
    const version4Id = version4.data!;
    draftIds.push(version4Id);
    expect(sql(`
      select (template_content = ${q(publishedContent)})::text
      from public.document_templates where id = ${q(version4Id)}::uuid;
    `)).toBe("true");

    expectSqlFailure(
      `insert into public.documents (
        id, organization_id, contact_id, reservation_id, template_id,
        source_template_version, generated_from_template, generated_at,
        document_type, status, title, superseded_at
      ) values (
        ${q(ids.draftGeneratedDocument)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.contact)}::uuid, ${q(ids.otherReservation)}::uuid,
        ${q(version4Id)}::uuid, 4, true, now(),
        'reservation_contract', 'generated', 'Draft generation refused', now()
      );`,
      /active published document template version/,
    );

    sql(`
      insert into public.documents (
        id, organization_id, template_id, source_template_version,
        document_type, status, title
      ) values (
        ${q(ids.draftReferenceDocument)}::uuid, ${q(organizationId)}::uuid,
        ${q(version4Id)}::uuid, 4, 'other', 'uploaded',
        'Reference proving draft use'
      );
    `);

    const usedDraftEdit = await member
      .from("document_templates")
      .update({ template_content: reservationContractContent("Version 4 modifiée") })
      .eq("id", version4Id);
    expect(usedDraftEdit.error?.message).toMatch(/immutable/);

    const usedDraftAuthorTamper = await member
      .from("document_templates")
      .update({ updated_by: users.admin.id })
      .eq("id", version4Id);
    expect(usedDraftAuthorTamper.error?.message).toMatch(
      /immutable to direct authenticated updates/,
    );

    const usedDraftSoftDelete = await member
      .from("document_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", version4Id);
    expect(usedDraftSoftDelete.error?.message).toMatch(
      /cannot be soft-deleted|deletion state requires a lifecycle function/,
    );

    const publishedDelete = await owner
      .from("document_templates")
      .delete()
      .eq("id", version3Id);
    expect(publishedDelete.error).not.toBeNull();

    console.info(`document-template-versioning fixture drafts: ${draftIds.join(",")}`);
  } finally {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
  }
});
