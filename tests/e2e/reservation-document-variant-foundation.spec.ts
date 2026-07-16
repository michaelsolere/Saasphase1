import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9e160000-0000-4000-8000-0000000000";

const ids = {
  memberUser: `${prefix}01`,
  memberIdentity: `${prefix}02`,
  memberMembership: `${prefix}03`,
  inactiveUser: `${prefix}04`,
  inactiveIdentity: `${prefix}05`,
  inactiveMembership: `${prefix}06`,
  otherOrganization: `${prefix}07`,
  contact: `${prefix}10`,
  litter: `${prefix}11`,
  reservationOne: `${prefix}12`,
  reservationTwo: `${prefix}13`,
  deletedReservation: `${prefix}14`,
  family: `${prefix}20`,
  deletedFamily: `${prefix}21`,
  mismatchFamily: `${prefix}22`,
  sourcePublishedV1: `${prefix}30`,
  sourceDraft: `${prefix}31`,
  sourceRetired: `${prefix}32`,
  mismatchSource: `${prefix}35`,
  variantOne: `${prefix}40`,
  variantOneV1: `${prefix}41`,
  variantOneV2A: `${prefix}42`,
  variantOneV2B: `${prefix}43`,
  variantOneV3: `${prefix}44`,
  variantTwo: `${prefix}45`,
  variantTwoV1: `${prefix}46`,
  invalidVariant: `${prefix}47`,
} as const;

const member = {
  email: "variant-member@saasphase1.invalid",
  password: "VariantMember-2026!",
};

const inactive = {
  email: "variant-inactive@saasphase1.invalid",
  password: "VariantInactive-2026!",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function content(title: string) {
  return JSON.stringify({
    schemaVersion: 2,
    locale: "fr-FR",
    documentType: "reservation_contract",
    title,
    body: `Corps ${title}`,
  });
}

function expectSqlFailure(value: string, expected: RegExp) {
  expect(() => sql(value)).toThrow(expected);
}

function cleanup() {
  sql(`
    delete from public.reservation_document_variant_versions
    where id::text like '9e160000-%'
       or variant_id::text like '9e160000-%';
    delete from public.reservation_document_variants where id::text like '9e160000-%';
    delete from public.document_templates where id::text like '9e160000-%';
    delete from public.document_template_families where id::text like '9e160000-%';
    delete from public.reservations where id::text like '9e160000-%';
    delete from public.litters where id::text like '9e160000-%';
    delete from public.contacts where id::text like '9e160000-%';
    delete from public.memberships where id::text like '9e160000-%';
    delete from auth.identities where user_id::text like '9e160000-%';
    delete from auth.users where id::text like '9e160000-%';
    delete from public.organizations where id::text like '9e160000-%';
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'variant_versions', (select count(*) from public.reservation_document_variant_versions
        where id::text like '9e160000-%' or variant_id::text like '9e160000-%'),
      'variants', (select count(*) from public.reservation_document_variants where id::text like '9e160000-%'),
      'templates', (select count(*) from public.document_templates where id::text like '9e160000-%'),
      'families', (select count(*) from public.document_template_families where id::text like '9e160000-%'),
      'reservations', (select count(*) from public.reservations where id::text like '9e160000-%'),
      'litters', (select count(*) from public.litters where id::text like '9e160000-%'),
      'contacts', (select count(*) from public.contacts where id::text like '9e160000-%'),
      'memberships', (select count(*) from public.memberships where id::text like '9e160000-%'),
      'profiles', (select count(*) from public.profiles where id::text like '9e160000-%'),
      'identities', (select count(*) from auth.identities where user_id::text like '9e160000-%'),
      'users', (select count(*) from auth.users where id::text like '9e160000-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9e160000-%')
    )::text;
  `)) as Record<string, number>;
}

function expectClean() {
  expect(fixtureCounts()).toEqual({
    variant_versions: 0,
    variants: 0,
    templates: 0,
    families: 0,
    reservations: 0,
    litters: 0,
    contacts: 0,
    memberships: 0,
    profiles: 0,
    identities: 0,
    users: 0,
    organizations: 0,
  });
}

function insertAuthUser(
  userId: string,
  identityId: string,
  membershipId: string,
  email: string,
  password: string,
  status: "active" | "disabled",
) {
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(userId)}::uuid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${q(email)},
      extensions.crypt(${q(password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', ${q(`Variant ${status}`)}), now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object('sub', ${q(userId)}, 'email', ${q(email)},
        'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );
    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(membershipId)}::uuid, ${q(organizationId)}::uuid, ${q(userId)}::uuid,
      'member', ${q(status)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function createFixtures() {
  insertAuthUser(
    ids.memberUser,
    ids.memberIdentity,
    ids.memberMembership,
    member.email,
    member.password,
    "active",
  );
  insertAuthUser(
    ids.inactiveUser,
    ids.inactiveIdentity,
    ids.inactiveMembership,
    inactive.email,
    inactive.password,
    "disabled",
  );

  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.otherOrganization)}::uuid, 'Organisation variante étrangère', 'variant-other-e2e');

    insert into public.contacts (id, organization_id, display_name)
    values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Contact variantes E2E');

    insert into public.litters (id, organization_id, name)
    values (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'Portée variantes E2E');

    insert into public.reservations (
      id, organization_id, contact_id, litter_id, species, breed, deleted_at
    ) values
      (${q(ids.reservationOne)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever', null),
      (${q(ids.reservationTwo)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever', null),
      (${q(ids.deletedReservation)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever', now());

    insert into public.document_template_families (
      id, organization_id, name, document_type, species, breed, deleted_at,
      created_by, updated_by
    ) values
      (${q(ids.family)}::uuid, ${q(organizationId)}::uuid, 'Contrat variante E2E',
       'reservation_contract', 'dog', 'Golden Retriever', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.deletedFamily)}::uuid, ${q(organizationId)}::uuid, 'Famille supprimée E2E',
       'reservation_contract', 'dog', 'Golden Retriever', now(),
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mismatchFamily)}::uuid, ${q(organizationId)}::uuid, 'Famille chat E2E',
       'reservation_contract', 'cat', 'British Shorthair', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.document_templates (
      id, organization_id, family_id, name, document_type, species, breed,
      template_format, template_content, version, lifecycle_status, is_active,
      published_at, published_by, created_by, updated_by
    ) values
      (${q(ids.sourcePublishedV1)}::uuid, ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
       'Contrat variante E2E', 'reservation_contract', 'dog', 'Golden Retriever',
       'json', ${q(content("Modèle commun V1"))}, 1, 'published', true,
       now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.sourceDraft)}::uuid, ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
       'Contrat variante E2E', 'reservation_contract', 'dog', 'Golden Retriever',
       'json', ${q(content("Modèle brouillon"))}, 2, 'draft', false,
       null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.sourceRetired)}::uuid, ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
       'Contrat variante E2E', 'reservation_contract', 'dog', 'Golden Retriever',
       'json', ${q(content("Modèle retiré"))}, 3, 'retired', false,
       now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mismatchSource)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mismatchFamily)}::uuid,
       'Famille chat E2E', 'reservation_contract', 'cat', 'British Shorthair',
       'json', ${q(content("Famille incompatible"))}, 1, 'published', true,
       now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function clientFor(credentials: { email: string; password: string }) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const result = await client.auth.signInWithPassword(credentials);
  if (result.error) throw result.error;
  return client;
}

function initialArgs(reservationId: string, variantId: string, versionId: string) {
  return {
    p_organization_id: organizationId,
    p_reservation_id: reservationId,
    p_template_family_id: ids.family,
    p_source_template_id: ids.sourcePublishedV1,
    p_source_template_version: 1,
    p_document_type: "reservation_contract",
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_variant_id: variantId,
    p_version_id: versionId,
  };
}

function publishArgs(variantId: string, versionId: string) {
  return JSON.parse(sql(`
    select json_build_object(
      'p_organization_id', organization_id,
      'p_variant_id', variant_id,
      'p_version_id', id,
      'p_expected_updated_at', updated_at,
      'p_expected_template_format', template_format,
      'p_expected_template_content', template_content
    )::text
    from public.reservation_document_variant_versions
    where id = ${q(versionId)}::uuid and variant_id = ${q(variantId)}::uuid;
  `));
}

test("versions reservation document variants safely and cleans every fixture", async () => {
  cleanup();
  expectClean();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const memberClient = await clientFor(member);
    const inactiveClient = await clientFor(inactive);

    const inactiveCreation = await inactiveClient.rpc(
      "create_reservation_document_variant_draft",
      initialArgs(ids.reservationOne, ids.variantOne, ids.variantOneV1),
    );
    expect(inactiveCreation.error?.message).toMatch(/Insufficient organization permissions/);

    const interOrganization = await owner.rpc("create_reservation_document_variant_draft", {
      ...initialArgs(ids.reservationOne, ids.variantOne, ids.variantOneV1),
      p_organization_id: ids.otherOrganization,
    });
    expect(interOrganization.error?.message).toMatch(/Insufficient organization permissions/);

    const invalidReservation = await memberClient.rpc(
      "create_reservation_document_variant_draft",
      initialArgs(ids.deletedReservation, ids.invalidVariant, `${prefix}48`),
    );
    expect(invalidReservation.error?.message).toMatch(/Active reservation not found/);

    const invalidFamily = await memberClient.rpc("create_reservation_document_variant_draft", {
      ...initialArgs(ids.reservationOne, ids.invalidVariant, `${prefix}48`),
      p_template_family_id: ids.deletedFamily,
    });
    expect(invalidFamily.error?.message).toMatch(/Active document template family not found/);

    for (const [sourceId, sourceVersion] of [
      [`${prefix}99`, 1],
      [ids.sourcePublishedV1, 99],
      [ids.sourceDraft, 2],
      [ids.sourceRetired, 3],
      [ids.mismatchSource, 1],
    ] as const) {
      const invalidSource = await memberClient.rpc(
        "create_reservation_document_variant_draft",
        {
          ...initialArgs(ids.reservationOne, ids.invalidVariant, `${prefix}48`),
          p_source_template_id: sourceId,
          p_source_template_version: sourceVersion,
        },
      );
      expect(invalidSource.error?.message).toMatch(/active published matching template version/);
    }

    for (const taxonomy of [
      { p_document_type: "other" },
      { p_species: "cat" },
      { p_breed: "Labrador Retriever" },
    ]) {
      const mismatch = await memberClient.rpc("create_reservation_document_variant_draft", {
        ...initialArgs(ids.reservationOne, ids.invalidVariant, `${prefix}48`),
        ...taxonomy,
      });
      expect(mismatch.error?.message).toMatch(/taxonomy must match exactly/);
    }

    const concurrentInitial = await Promise.all([
      owner.rpc(
        "create_reservation_document_variant_draft",
        initialArgs(ids.reservationOne, ids.variantOne, ids.variantOneV1),
      ),
      memberClient.rpc(
        "create_reservation_document_variant_draft",
        initialArgs(ids.reservationOne, ids.variantOne, ids.variantOneV1),
      ),
    ]);
    expect(concurrentInitial.every((result) => result.error === null)).toBe(true);
    expect(concurrentInitial.map((result) => result.data)).toEqual([
      [{ variant_id: ids.variantOne, version_id: ids.variantOneV1, version: 1 }],
      [{ variant_id: ids.variantOne, version_id: ids.variantOneV1, version: 1 }],
    ]);
    expect(Number(sql(`select count(*) from public.reservation_document_variants
      where reservation_id = ${q(ids.reservationOne)}::uuid and template_family_id = ${q(ids.family)}::uuid;`))).toBe(1);
    expect(sql(`select template_format || '|' || template_content
      from public.reservation_document_variant_versions where id = ${q(ids.variantOneV1)}::uuid;`))
      .toBe(`json|${content("Modèle commun V1")}`);

    expectSqlFailure(`
      insert into public.reservation_document_variant_versions (
        id, organization_id, variant_id, version,
        source_template_id, source_template_version,
        template_format, template_content, lifecycle_status,
        published_at, published_by
      ) values (
        ${q(ids.invalidVariant)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.variantOne)}::uuid, 0,
        ${q(ids.sourcePublishedV1)}::uuid, 1,
        'json', ${q(content("Version zéro"))}, 'retired',
        now(), ${q(ownerId)}::uuid
      );
    `, /reservation_document_variant_versions_version_check/);

    const secondReservationVariant = await memberClient.rpc(
      "create_reservation_document_variant_draft",
      initialArgs(ids.reservationTwo, ids.variantTwo, ids.variantTwoV1),
    );
    expect(secondReservationVariant.error).toBeNull();
    expect(sql(`select count(distinct variant.id)
      from public.reservation_document_variants variant
      join public.reservations reservation on reservation.id = variant.reservation_id
      where reservation.litter_id = ${q(ids.litter)}::uuid
        and variant.template_family_id = ${q(ids.family)}::uuid;`)).toBe("2");

    expectSqlFailure(`
      insert into public.reservation_document_variants (
        id, organization_id, reservation_id, template_family_id,
        document_type, species, breed
      ) values (
        ${q(ids.invalidVariant)}::uuid, ${q(ids.otherOrganization)}::uuid,
        ${q(ids.reservationOne)}::uuid, ${q(ids.family)}::uuid,
        'reservation_contract', 'dog', 'Golden Retriever'
      );
    `, /active reservation|foreign key/);

    const variantIdentityMutation = await memberClient
      .from("reservation_document_variants")
      .update({ reservation_id: ids.reservationTwo })
      .eq("id", ids.variantOne);
    expect(variantIdentityMutation.error).not.toBeNull();

    const versionIdentityMutation = await memberClient
      .from("reservation_document_variant_versions")
      .update({ version: 99 })
      .eq("id", ids.variantOneV1);
    expect(versionIdentityMutation.error).not.toBeNull();

    const versionAuditMutation = await memberClient
      .from("reservation_document_variant_versions")
      .update({ updated_by: ownerId })
      .eq("id", ids.variantOneV1);
    expect(versionAuditMutation.error).not.toBeNull();

    const lifecycleMutation = await memberClient
      .from("reservation_document_variant_versions")
      .update({ lifecycle_status: "published" })
      .eq("id", ids.variantOneV1);
    expect(lifecycleMutation.error).not.toBeNull();

    const customizedV1 = content("Contrat individualisé réservation 1");
    const edited = await memberClient
      .from("reservation_document_variant_versions")
      .update({ template_content: customizedV1 })
      .eq("id", ids.variantOneV1);
    expect(edited.error).toBeNull();

    const memberPublish = await memberClient.rpc(
      "publish_reservation_document_variant_version",
      publishArgs(ids.variantOne, ids.variantOneV1),
    );
    expect(memberPublish.error?.message).toMatch(/Insufficient organization permissions/);

    const publishV1 = await owner.rpc(
      "publish_reservation_document_variant_version",
      publishArgs(ids.variantOne, ids.variantOneV1),
    );
    expect(publishV1.error).toBeNull();
    expect(sql(`select lifecycle_status || '|' || (published_at is not null)::text
      from public.reservation_document_variant_versions where id = ${q(ids.variantOneV1)}::uuid;`))
      .toBe("published|true");

    const publishedEdit = await memberClient
      .from("reservation_document_variant_versions")
      .update({ template_content: content("Mutation publiée") })
      .eq("id", ids.variantOneV1);
    expect(publishedEdit.error?.message).toMatch(/immutable|row-level security/);

    sql(`
      update public.document_templates
      set lifecycle_status = 'retired', is_active = false, updated_at = now(), updated_by = ${q(ownerId)}::uuid
      where id = ${q(ids.sourcePublishedV1)}::uuid;
      update public.document_templates
      set template_content = ${q(content("Modèle commun V2"))}
      where id = ${q(ids.sourceDraft)}::uuid;
    `);
    const commonV2Publish = await owner.rpc("publish_document_template_version", {
      p_template_id: ids.sourceDraft,
      p_expected_updated_at: sql(`select updated_at::text from public.document_templates where id = ${q(ids.sourceDraft)}::uuid;`),
      p_expected_template_format: "json",
      p_expected_template_content: content("Modèle commun V2"),
    });
    expect(commonV2Publish.error).toBeNull();

    const concurrentNext = await Promise.all([
      owner.rpc("create_reservation_document_variant_version", {
        p_organization_id: organizationId,
        p_variant_id: ids.variantOne,
        p_version_id: ids.variantOneV2A,
      }),
      memberClient.rpc("create_reservation_document_variant_version", {
        p_organization_id: organizationId,
        p_variant_id: ids.variantOne,
        p_version_id: ids.variantOneV2B,
      }),
    ]);
    expect(concurrentNext.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrentNext.filter((result) => result.error)).toHaveLength(1);
    expect(concurrentNext.find((result) => result.error)?.error?.message).toMatch(/draft already exists/);
    const versionTwoId = concurrentNext.find((result) => !result.error)!.data![0].version_id;
    expect(concurrentNext.find((result) => !result.error)!.data![0].version).toBe(2);
    expect(sql(`select (template_content = ${q(customizedV1)})::text || '|'
        || source_template_id::text || '|' || source_template_version::text
      from public.reservation_document_variant_versions where id = ${q(versionTwoId)}::uuid;`))
      .toBe(`true|${ids.sourcePublishedV1}|1`);

    const publishV2 = await owner.rpc(
      "publish_reservation_document_variant_version",
      publishArgs(ids.variantOne, versionTwoId),
    );
    expect(publishV2.error).toBeNull();
    expect(sql(`select string_agg(version::text || ':' || lifecycle_status, ',' order by version)
      from public.reservation_document_variant_versions where variant_id = ${q(ids.variantOne)}::uuid;`))
      .toBe("1:retired,2:published");

    const retiredEdit = await memberClient
      .from("reservation_document_variant_versions")
      .update({ template_content: content("Mutation retirée") })
      .eq("id", ids.variantOneV1);
    expect(retiredEdit.error?.message).toMatch(/immutable|row-level security/);

    const versionThree = await memberClient.rpc("create_reservation_document_variant_version", {
      p_organization_id: organizationId,
      p_variant_id: ids.variantOne,
      p_version_id: ids.variantOneV3,
    });
    expect(versionThree.error).toBeNull();
    expect(versionThree.data).toEqual([{ version_id: ids.variantOneV3, version: 3 }]);
    const stalePublishArgs = publishArgs(ids.variantOne, ids.variantOneV3);
    const staleEdit = await memberClient
      .from("reservation_document_variant_versions")
      .update({ template_content: content("Modification concurrente") })
      .eq("id", ids.variantOneV3);
    expect(staleEdit.error).toBeNull();
    const stalePublish = await owner.rpc(
      "publish_reservation_document_variant_version",
      stalePublishArgs,
    );
    expect(stalePublish.error?.message).toMatch(/draft is stale/);

    console.info(`reservation-document-variant fixtures: ${Object.values(ids).join(",")}`);
  } finally {
    cleanup();
    expectClean();
  }
});
