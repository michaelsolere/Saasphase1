import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { discardDocumentTemplateDraftCore } from "../../src/features/documents/document-template-management-core";
import type { Database } from "../../src/types/database.types";
import { createAuthenticatedSupabaseClient, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f150001-0000-4000-8000-000000000";
const otherOrganizationId = `${prefix}090`;
const fixtureNamePrefix = "E2E discard service ";

const users = {
  admin: { id: `${prefix}010`, identityId: `${prefix}011`, membershipId: `${prefix}012`, email: "discard-admin@saasphase1.invalid", password: "DiscardAdmin-2026!", role: "admin" },
  member: { id: `${prefix}020`, identityId: `${prefix}021`, membershipId: `${prefix}022`, email: "discard-member@saasphase1.invalid", password: "DiscardMember-2026!", role: "member" },
  viewer: { id: `${prefix}030`, identityId: `${prefix}031`, membershipId: `${prefix}032`, email: "discard-viewer@saasphase1.invalid", password: "DiscardViewer-2026!", role: "viewer" },
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.documents where title like ${q(`${fixtureNamePrefix}%`)};
    delete from public.document_templates
    where family_id in (
      select id from public.document_template_families
      where name like ${q(`${fixtureNamePrefix}%`)}
    );
    delete from public.document_template_families
    where name like ${q(`${fixtureNamePrefix}%`)};
    delete from public.memberships where id::text like '9f150001-%';
    delete from auth.identities where user_id::text like '9f150001-%';
    delete from auth.users where id::text like '9f150001-%';
    delete from public.organizations where id = ${q(otherOrganizationId)}::uuid;
  `);
}

function remainingFixtureCount() {
  return Number(sql(`
    select
      (select count(*) from public.documents where title like ${q(`${fixtureNamePrefix}%`)})
      + (select count(*) from public.document_templates
         where family_id in (
           select id from public.document_template_families
           where name like ${q(`${fixtureNamePrefix}%`)}
         ))
      + (select count(*) from public.document_template_families
         where name like ${q(`${fixtureNamePrefix}%`)})
      + (select count(*) from public.memberships where id::text like '9f150001-%')
      + (select count(*) from public.profiles where id::text like '9f150001-%')
      + (select count(*) from auth.identities where user_id::text like '9f150001-%')
      + (select count(*) from auth.users where id::text like '9f150001-%')
      + (select count(*) from public.organizations where id = ${q(otherOrganizationId)}::uuid);
  `));
}

function createRoleFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(otherOrganizationId)}::uuid, 'Organisation E2E discard isolée', 'e2e-discard-isolee');
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
        ${q(user.id)}::uuid, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')),
        now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`Discard ${user.role}`)}), now(), now()
      );
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object('sub', ${q(user.id)}, 'email', ${q(user.email)}, 'email_verified', true, 'phone_verified', false),
        'email', now(), now()
      );
      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(user.membershipId)}::uuid, ${q(organizationId)}::uuid,
        ${q(user.id)}::uuid, ${q(user.role)}, 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

async function clientFor(user: (typeof users)[keyof typeof users]) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (signedIn.error) throw signedIn.error;
  return client;
}

function seedFamily(input: {
  suffix: string;
  organizationId?: string;
  published?: boolean;
  retired?: boolean;
}) {
  const familyId = `${prefix}${input.suffix}1`;
  const draftId = `${prefix}${input.suffix}2`;
  const publishedId = `${prefix}${input.suffix}3`;
  const retiredId = `${prefix}${input.suffix}4`;
  const orgId = input.organizationId ?? organizationId;
  const name = `${fixtureNamePrefix}${input.suffix}`;
  sql(`
    insert into public.document_template_families (
      id, organization_id, name, document_type, species, breed, created_by, updated_by
    ) values (
      ${q(familyId)}::uuid, ${q(orgId)}::uuid, ${q(name)}, 'reservation_contract',
      'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
    insert into public.document_templates (
      id, organization_id, family_id, name, document_type, species, breed,
      template_format, template_content, version, lifecycle_status, is_active,
      published_at, published_by, created_by, updated_by
    ) values (
      ${q(draftId)}::uuid, ${q(orgId)}::uuid, ${q(familyId)}::uuid, ${q(name)},
      'reservation_contract', 'dog', 'Golden Retriever', 'json', '{}',
      ${input.published || input.retired ? 2 : 1}, 'draft', false, null, null,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    )
    ${input.published ? `,(
      ${q(publishedId)}::uuid, ${q(orgId)}::uuid, ${q(familyId)}::uuid, ${q(name)},
      'reservation_contract', 'dog', 'Golden Retriever', 'json', '{}',
      1, 'published', true, now(), ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    )` : ""}
    ${input.retired ? `,(
      ${q(retiredId)}::uuid, ${q(orgId)}::uuid, ${q(familyId)}::uuid, ${q(name)},
      'reservation_contract', 'dog', 'Golden Retriever', 'json', '{}',
      1, 'retired', false, now(), ${q(ownerId)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    )` : ""};
  `);
  const updatedAt = sql(`select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.document_templates where id = ${q(draftId)}::uuid;`);
  return {
    familyId,
    templateId: draftId,
    draftId,
    publishedId,
    retiredId,
    expectedUpdatedAt: updatedAt,
    organizationId: orgId,
  };
}

test("abandonne ou retire les brouillons avec autorisation, protection et concurrence", async () => {
  cleanup();
  expect(remainingFixtureCount()).toBe(0);

  try {
    createRoleFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const admin = await clientFor(users.admin);
    const member = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);

    const neverPublishedOwner = seedFamily({ suffix: "40" });
    const ownerResult = await discardDocumentTemplateDraftCore(neverPublishedOwner, owner);
    expect(ownerResult, JSON.stringify(ownerResult)).toMatchObject({ outcome: "success", result: "family_deleted" });
    expect(sql(`select deleted_at is not null from public.document_template_families where id = ${q(neverPublishedOwner.familyId)}::uuid;`)).toBe("t");
    expect(sql(`select deleted_at is not null from public.document_templates where id = ${q(neverPublishedOwner.draftId)}::uuid;`)).toBe("t");

    const postPublicationAdmin = seedFamily({ suffix: "41", published: true });
    const publicationBefore = sql(`select updated_at::text from public.document_templates where id = ${q(postPublicationAdmin.publishedId)}::uuid;`);
    const adminResult = await discardDocumentTemplateDraftCore(postPublicationAdmin, admin);
    expect(adminResult).toMatchObject({ outcome: "success", result: "draft_discarded" });
    expect(sql(`select deleted_at is null from public.document_templates where id = ${q(postPublicationAdmin.publishedId)}::uuid and lifecycle_status = 'published' and is_active;`)).toBe("t");
    expect(sql(`select updated_at::text from public.document_templates where id = ${q(postPublicationAdmin.publishedId)}::uuid;`)).toBe(publicationBefore);

    for (const [client, suffix] of [[member, "42"], [viewer, "43"]] as const) {
      const protectedByRole = seedFamily({ suffix });
      const result = await discardDocumentTemplateDraftCore(protectedByRole, client);
      expect(result).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
      const directRpc = await client.rpc("discard_document_template_draft", {
        p_organization_id: protectedByRole.organizationId,
        p_family_id: protectedByRole.familyId,
        p_template_id: protectedByRole.templateId,
        p_expected_updated_at: protectedByRole.expectedUpdatedAt,
      });
      expect(directRpc.error?.code).toBe("42501");
      expect(sql(`select deleted_at is null from public.document_templates where id = ${q(protectedByRole.draftId)}::uuid;`)).toBe("t");
    }

    const immutablePublished = seedFamily({ suffix: "44", published: true });
    const publishedAttempt = await discardDocumentTemplateDraftCore({ ...immutablePublished, templateId: immutablePublished.publishedId }, owner);
    expect(publishedAttempt).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(sql(`select deleted_at is null from public.document_templates where id = ${q(immutablePublished.publishedId)}::uuid;`)).toBe("t");

    const immutableRetired = seedFamily({ suffix: "45", retired: true });
    const retiredAttempt = await discardDocumentTemplateDraftCore({ ...immutableRetired, templateId: immutableRetired.retiredId }, owner);
    expect(retiredAttempt).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(sql(`select deleted_at is null from public.document_templates where id = ${q(immutableRetired.retiredId)}::uuid;`)).toBe("t");

    const used = seedFamily({ suffix: "46" });
    sql(`insert into public.documents (id, organization_id, template_id, source_template_version, document_type, title, created_by, updated_by)
      values (${q(`${prefix}469`)}::uuid, ${q(organizationId)}::uuid, ${q(used.draftId)}::uuid, 1, 'other', ${q(`${fixtureNamePrefix}used`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);`);
    const usedResult = await discardDocumentTemplateDraftCore(used, owner);
    expect(usedResult).toMatchObject({ outcome: "error", error: { code: "protected_family" } });

    const stale = seedFamily({ suffix: "47" });
    sql(`update public.document_templates set template_content = '{"changed":true}' where id = ${q(stale.draftId)}::uuid;`);
    const staleResult = await discardDocumentTemplateDraftCore(stale, owner);
    expect(staleResult).toMatchObject({ outcome: "error", error: { code: "stale_draft" } });

    const concurrent = seedFamily({ suffix: "48", published: true });
    const concurrentResults = await Promise.all([
      discardDocumentTemplateDraftCore(concurrent, owner),
      discardDocumentTemplateDraftCore(concurrent, admin),
    ]);
    expect(concurrentResults.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(sql(`select count(*) from public.document_templates where family_id = ${q(concurrent.familyId)}::uuid and lifecycle_status = 'published' and is_active and deleted_at is null;`)).toBe("1");

    const isolated = seedFamily({ suffix: "49", organizationId: otherOrganizationId });
    const isolationResult = await discardDocumentTemplateDraftCore({ ...isolated, organizationId }, owner);
    expect(isolationResult).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(sql(`select deleted_at is null from public.document_templates where id = ${q(isolated.draftId)}::uuid;`)).toBe("t");

    console.info(`document-template-discard-service fixture prefix: ${prefix}`);
  } finally {
    cleanup();
    expect(remainingFixtureCount()).toBe(0);
  }
});
