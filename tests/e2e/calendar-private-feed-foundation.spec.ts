import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f260002-0000-4000-8000-000000000";
const otherOrganizationId = `${prefix}090`;
const fixturePrefix = "9f260002-%";

const users = {
  admin: {
    id: `${prefix}010`,
    identityId: `${prefix}011`,
    membershipId: `${prefix}012`,
    email: "calendar-feed-admin@saasphase1.invalid",
    password: "CalendarFeedAdmin-2026!",
    role: "admin",
  },
  member: {
    id: `${prefix}020`,
    identityId: `${prefix}021`,
    membershipId: `${prefix}022`,
    email: "calendar-feed-member@saasphase1.invalid",
    password: "CalendarFeedMember-2026!",
    role: "member",
  },
  viewer: {
    id: `${prefix}030`,
    identityId: `${prefix}031`,
    membershipId: `${prefix}032`,
    email: "calendar-feed-viewer@saasphase1.invalid",
    password: "CalendarFeedViewer-2026!",
    role: "viewer",
  },
  foreignOwner: {
    id: `${prefix}040`,
    identityId: `${prefix}041`,
    membershipId: `${prefix}042`,
    email: "calendar-feed-foreign@saasphase1.invalid",
    password: "CalendarFeedForeign-2026!",
    role: "admin",
  },
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function tokenPair() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, hash, hint: token.slice(-4) };
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    delete from public.organization_calendar_feeds
    where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
       or id::text like ${q(fixturePrefix)};
    delete from public.memberships where id::text like ${q(fixturePrefix)};
    delete from auth.identities where user_id::text like ${q(fixturePrefix)};
    delete from auth.users where id::text like ${q(fixturePrefix)};
    delete from public.profiles where id::text like ${q(fixturePrefix)};
    delete from public.organizations where id = ${q(otherOrganizationId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'feeds', (
          select count(*) from public.organization_calendar_feeds
          where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
             or id::text like ${q(fixturePrefix)}
        ),
        'memberships', (select count(*) from public.memberships where id::text like ${q(fixturePrefix)}),
        'profiles', (select count(*) from public.profiles where id::text like ${q(fixturePrefix)}),
        'auth_identities', (select count(*) from auth.identities where user_id::text like ${q(fixturePrefix)}),
        'auth_users', (select count(*) from auth.users where id::text like ${q(fixturePrefix)}),
        'organizations', (
          select count(*) from public.organizations where id = ${q(otherOrganizationId)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createRoleFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(otherOrganizationId)}::uuid,
      'Organisation E2E calendar feed isolée',
      'e2e-calendar-feed-isolee'
    );
  `);

  for (const user of Object.values(users)) {
    const orgId = user.id === users.foreignOwner.id ? otherOrganizationId : organizationId;
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
        jsonb_build_object('display_name', ${q(`Calendar feed ${user.role}`)}),
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
        ${q(user.membershipId)}::uuid, ${q(orgId)}::uuid,
        ${q(user.id)}::uuid, ${q(user.role)}, 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

async function clientFor(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

test.beforeEach(() => {
  cleanup();
  expect(remainingCounts().feeds).toBe(0);
  createRoleFixtures();
});

test.afterEach(() => {
  cleanup();
  const remaining = remainingCounts();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `${table} must be hard-deleted`).toBe(0);
  }
});

test("RPC calendar feed: rôles, unicité, rotation, révocation, RLS", async () => {
  const owner = await createAuthenticatedSupabaseClient();
  const admin = await clientFor(users.admin.email, users.admin.password);
  const member = await clientFor(users.member.email, users.member.password);
  const viewer = await clientFor(users.viewer.email, users.viewer.password);
  const foreign = await clientFor(users.foreignOwner.email, users.foreignOwner.password);
  const anonymous = createAnonymousSupabaseClient();

  const first = tokenPair();
  const created = await owner.rpc("create_or_rotate_organization_calendar_feed", {
    p_token_hash: first.hash,
    p_token_hint: first.hint,
    p_include_litter_care: true,
    p_include_reproductive_cycle: true,
    p_include_adopter_appointment: true,
  });
  expect(created.error).toBeNull();
  expect(created.data?.[0]).toMatchObject({
    outcome: "success",
    token_hint: first.hint,
    revision_no: 1,
  });
  const feedId = created.data![0].feed_id;
  expect(feedId).toBeTruthy();

  const stored = sql(`
    select coalesce(
      (select token_hash from public.organization_calendar_feeds where id = ${q(feedId)}::uuid),
      ''
    );
  `);
  expect(stored).toBe(first.hash);
  expect(stored).not.toBe(first.token);
  expect(
    sql(`
      select count(*)::text from public.organization_calendar_feeds
      where organization_id = ${q(organizationId)}::uuid
        and revoked_at is null
    `),
  ).toBe("1");

  const memberCreate = await member.rpc("create_or_rotate_organization_calendar_feed", {
    p_token_hash: tokenPair().hash,
    p_token_hint: "abcd",
    p_include_litter_care: true,
    p_include_reproductive_cycle: false,
    p_include_adopter_appointment: false,
  });
  expect(memberCreate.error).toBeNull();
  expect(memberCreate.data?.[0]?.outcome).toBe("error");
  expect(memberCreate.data?.[0]?.reason).toBe("forbidden");

  const viewerCreate = await viewer.rpc("create_or_rotate_organization_calendar_feed", {
    p_token_hash: tokenPair().hash,
    p_token_hint: "efgh",
    p_include_litter_care: true,
    p_include_reproductive_cycle: false,
    p_include_adopter_appointment: false,
  });
  expect(viewerCreate.error).toBeNull();
  expect(viewerCreate.data?.[0]?.reason).toBe("forbidden");

  const zeroSources = await owner.rpc("update_organization_calendar_feed_sources", {
    p_feed_id: feedId,
    p_expected_revision_no: 1,
    p_include_litter_care: false,
    p_include_reproductive_cycle: false,
    p_include_adopter_appointment: false,
  });
  expect(zeroSources.data?.[0]?.reason).toBe("no_sources_selected");

  const stale = await owner.rpc("update_organization_calendar_feed_sources", {
    p_feed_id: feedId,
    p_expected_revision_no: 99,
    p_include_litter_care: true,
    p_include_reproductive_cycle: false,
    p_include_adopter_appointment: false,
  });
  expect(stale.data?.[0]?.reason).toBe("stale_revision");

  const updated = await admin.rpc("update_organization_calendar_feed_sources", {
    p_feed_id: feedId,
    p_expected_revision_no: 1,
    p_include_litter_care: true,
    p_include_reproductive_cycle: false,
    p_include_adopter_appointment: false,
  });
  expect(updated.error).toBeNull();
  expect(updated.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    include_litter_care: true,
    include_reproductive_cycle: false,
    include_adopter_appointment: false,
    token_hint: first.hint,
  });

  const rotatedToken = tokenPair();
  const rotated = await admin.rpc("create_or_rotate_organization_calendar_feed", {
    p_token_hash: rotatedToken.hash,
    p_token_hint: rotatedToken.hint,
    p_include_litter_care: true,
    p_include_reproductive_cycle: true,
    p_include_adopter_appointment: false,
  });
  expect(rotated.data?.[0]?.outcome).toBe("success");
  const newFeedId = rotated.data![0].feed_id;
  expect(newFeedId).not.toBe(feedId);
  expect(
    sql(`
      select count(*)::text from public.organization_calendar_feeds
      where organization_id = ${q(organizationId)}::uuid and revoked_at is null
    `),
  ).toBe("1");
  expect(
    sql(`
      select count(*)::text from public.organization_calendar_feeds
      where id = ${q(feedId)}::uuid and revoked_at is not null
    `),
  ).toBe("1");

  const foreignTouch = await foreign.rpc("update_organization_calendar_feed_sources", {
    p_feed_id: newFeedId,
    p_expected_revision_no: 1,
    p_include_litter_care: false,
    p_include_reproductive_cycle: true,
    p_include_adopter_appointment: false,
  });
  expect(foreignTouch.data?.[0]?.reason).toBe("forbidden");

  const revoked = await owner.rpc("revoke_organization_calendar_feed", {
    p_feed_id: newFeedId,
    p_expected_revision_no: 1,
  });
  expect(revoked.data?.[0]?.outcome).toBe("success");
  expect(
    sql(`
      select count(*)::text from public.organization_calendar_feeds
      where id = ${q(newFeedId)}::uuid and revoked_at is not null
    `),
  ).toBe("1");

  const idempotent = await owner.rpc("revoke_organization_calendar_feed", {
    p_feed_id: newFeedId,
    p_expected_revision_no: 1,
  });
  expect(idempotent.data?.[0]).toMatchObject({
    outcome: "success",
    reason: "already_revoked",
  });

  const directInsert = await owner.from("organization_calendar_feeds").insert({
    organization_id: organizationId,
    token_hash: tokenPair().hash,
    token_hint: "zzzz",
    include_litter_care: true,
    include_reproductive_cycle: true,
    include_adopter_appointment: true,
    created_by: ownerId,
    updated_by: ownerId,
  });
  expect(directInsert.error).toBeTruthy();

  const anonSelect = await anonymous
    .from("organization_calendar_feeds")
    .select("id")
    .limit(1);
  expect(anonSelect.data ?? []).toEqual([]);

  const memberSelect = await member
    .from("organization_calendar_feeds")
    .select("id, token_hint")
    .eq("organization_id", organizationId);
  expect(memberSelect.error).toBeNull();
  expect(memberSelect.data ?? []).toEqual([]);

  const tokenLeak = sql(`
    select coalesce(string_agg(token_hash || token_hint, ','), '')
    from public.organization_calendar_feeds
    where organization_id = ${q(organizationId)}::uuid
  `);
  expect(tokenLeak).not.toContain(first.token);
  expect(tokenLeak).not.toContain(rotatedToken.token);
});
