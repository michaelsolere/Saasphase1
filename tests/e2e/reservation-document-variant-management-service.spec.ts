import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createNextReservationDocumentVariantVersionCore,
  createReservationDocumentVariantDraftCore,
  listReservationDocumentVariantsCore,
  listReservationDocumentVariantVersionsCore,
  publishReservationDocumentVariantVersionCore,
  saveReservationDocumentVariantDraftCore,
  validateReservationDocumentVariantDraftCore,
} from "../../src/features/documents/reservation-document-variant-management-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

type Supabase = SupabaseClient<Database>;

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9e160001-0000-4000-8000-0000000000";

const ids = {
  adminUser: `${prefix}01`, adminIdentity: `${prefix}02`, adminMembership: `${prefix}03`,
  memberUser: `${prefix}04`, memberIdentity: `${prefix}05`, memberMembership: `${prefix}06`,
  viewerUser: `${prefix}07`, viewerIdentity: `${prefix}08`, viewerMembership: `${prefix}09`,
  inactiveUser: `${prefix}10`, inactiveIdentity: `${prefix}11`, inactiveMembership: `${prefix}12`,
  otherOrganization: `${prefix}13`, contact: `${prefix}14`, litter: `${prefix}15`,
  reservationOwner: `${prefix}16`, reservationAdmin: `${prefix}17`,
  reservationMember: `${prefix}18`, reservationViewer: `${prefix}19`,
  reservationSecond: `${prefix}20`,
  family: `${prefix}21`, unsupportedFamily: `${prefix}22`, mismatchFamily: `${prefix}23`,
  noPublicationFamily: `${prefix}24`, sourceV1: `${prefix}25`, sourceV2: `${prefix}26`,
  variantOwner: `${prefix}30`, variantOwnerV1: `${prefix}31`,
  variantAdmin: `${prefix}32`, variantAdminV1: `${prefix}33`,
  variantMember: `${prefix}34`, variantMemberV1: `${prefix}35`,
  variantSecond: `${prefix}36`, variantSecondV1: `${prefix}37`,
  variantOwnerV2A: `${prefix}38`, variantOwnerV2B: `${prefix}39`,
} as const;

const users = {
  admin: { id: ids.adminUser, identityId: ids.adminIdentity, membershipId: ids.adminMembership, email: "variant-service-admin@saasphase1.invalid", password: "VariantServiceAdmin-2026!", role: "admin", status: "active" },
  member: { id: ids.memberUser, identityId: ids.memberIdentity, membershipId: ids.memberMembership, email: "variant-service-member@saasphase1.invalid", password: "VariantServiceMember-2026!", role: "member", status: "active" },
  viewer: { id: ids.viewerUser, identityId: ids.viewerIdentity, membershipId: ids.viewerMembership, email: "variant-service-viewer@saasphase1.invalid", password: "VariantServiceViewer-2026!", role: "viewer", status: "active" },
  inactive: { id: ids.inactiveUser, identityId: ids.inactiveIdentity, membershipId: ids.inactiveMembership, email: "variant-service-inactive@saasphase1.invalid", password: "VariantServiceInactive-2026!", role: "member", status: "disabled" },
} as const;

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

function cleanup() {
  sql(`
    delete from public.reservation_document_variant_versions
    where id::text like '9e160001-%' or variant_id::text like '9e160001-%';
    delete from public.reservation_document_variants where id::text like '9e160001-%';
    delete from public.document_templates where id::text like '9e160001-%';
    delete from public.document_template_families where id::text like '9e160001-%';
    delete from public.reservations where id::text like '9e160001-%';
    delete from public.litters where id::text like '9e160001-%';
    delete from public.contacts where id::text like '9e160001-%';
    delete from public.memberships where id::text like '9e160001-%';
    delete from auth.identities where user_id::text like '9e160001-%';
    delete from auth.users where id::text like '9e160001-%';
    delete from public.organizations where id::text like '9e160001-%';
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'variant_versions', (select count(*) from public.reservation_document_variant_versions where id::text like '9e160001-%' or variant_id::text like '9e160001-%'),
      'variants', (select count(*) from public.reservation_document_variants where id::text like '9e160001-%'),
      'templates', (select count(*) from public.document_templates where id::text like '9e160001-%'),
      'families', (select count(*) from public.document_template_families where id::text like '9e160001-%'),
      'reservations', (select count(*) from public.reservations where id::text like '9e160001-%'),
      'litters', (select count(*) from public.litters where id::text like '9e160001-%'),
      'contacts', (select count(*) from public.contacts where id::text like '9e160001-%'),
      'memberships', (select count(*) from public.memberships where id::text like '9e160001-%'),
      'profiles', (select count(*) from public.profiles where id::text like '9e160001-%'),
      'identities', (select count(*) from auth.identities where user_id::text like '9e160001-%'),
      'users', (select count(*) from auth.users where id::text like '9e160001-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9e160001-%')
    )::text;
  `)) as Record<string, number>;
}

function expectClean() {
  expect(fixtureCounts()).toEqual({
    variant_versions: 0, variants: 0, templates: 0, families: 0,
    reservations: 0, litters: 0, contacts: 0, memberships: 0,
    profiles: 0, identities: 0, users: 0, organizations: 0,
  });
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.otherOrganization)}::uuid, 'Organisation variante service étrangère', 'variant-service-other-e2e');

    ${Object.values(users).map((user) => `
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current,
        reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${q(user.id)}::uuid, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')), now(),
        '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`Variant service ${user.role}`)}), now(), now()
      );
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
      values (${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object('sub', ${q(user.id)}, 'email', ${q(user.email)}, 'email_verified', true, 'phone_verified', false),
        'email', now(), now());
      insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
      values (${q(user.membershipId)}::uuid, ${q(organizationId)}::uuid, ${q(user.id)}::uuid,
        ${q(user.role)}, ${q(user.status)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    `).join("\n")}

    insert into public.contacts (id, organization_id, display_name)
    values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Contact variante service E2E');
    insert into public.litters (id, organization_id, name)
    values (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'Portée variante service E2E');
    insert into public.reservations (id, organization_id, contact_id, litter_id, species, breed)
    values
      (${q(ids.reservationOwner)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationAdmin)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationMember)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationViewer)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationSecond)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, 'dog', 'Golden Retriever');

    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed, created_by, updated_by)
    values
      (${q(ids.family)}::uuid, ${q(organizationId)}::uuid, 'Contrat variante service', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.unsupportedFamily)}::uuid, ${q(organizationId)}::uuid, 'Facture variante service', 'invoice', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mismatchFamily)}::uuid, ${q(organizationId)}::uuid, 'Contrat chat variante service', 'reservation_contract', 'cat', 'British Shorthair', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noPublicationFamily)}::uuid, ${q(organizationId)}::uuid, 'Contrat sans publication', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.document_templates (
      id, organization_id, family_id, name, document_type, species, breed,
      template_format, template_content, version, lifecycle_status, is_active,
      published_at, published_by, created_by, updated_by
    ) values
      (${q(ids.sourceV1)}::uuid, ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
       'Contrat variante service', 'reservation_contract', 'dog', 'Golden Retriever',
       'json', ${q(content("Publication commune V1"))}, 1, 'published', true,
       now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.sourceV2)}::uuid, ${q(organizationId)}::uuid, ${q(ids.family)}::uuid,
       'Contrat variante service', 'reservation_contract', 'dog', 'Golden Retriever',
       'json', ${q(content("Publication commune V2"))}, 2, 'draft', false,
       null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
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

function deterministicClient(
  client: Supabase,
  initialIds: Array<{ variantId: string; versionId: string }> = [],
  nextVersionIds: string[] = [],
): Supabase {
  const initialQueue = [...initialIds];
  const nextQueue = [...nextVersionIds];
  return new Proxy(client, {
    get(target, property) {
      if (property === "rpc") {
        return (name: string, args: Record<string, unknown>) => {
          if (name === "create_reservation_document_variant_draft") {
            const deterministic = initialQueue.shift();
            return target.rpc(name, deterministic ? {
              ...args,
              p_variant_id: deterministic.variantId,
              p_version_id: deterministic.versionId,
            } : args);
          }
          if (name === "create_reservation_document_variant_version") {
            const versionId = nextQueue.shift();
            return target.rpc(name, versionId ? { ...args, p_version_id: versionId } : args);
          }
          return target.rpc(name as never, args as never);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Supabase;
}

test("manages reservation document variants with authoritative origins and safe concurrency", async () => {
  cleanup();
  expectClean();

  try {
    createFixtures();
    const ownerBase = await createAuthenticatedSupabaseClient();
    const adminBase = await clientFor(users.admin);
    const memberBase = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);
    const inactive = await clientFor(users.inactive);
    const owner = deterministicClient(ownerBase, [
      { variantId: ids.variantOwner, versionId: ids.variantOwnerV1 },
      { variantId: ids.variantSecond, versionId: ids.variantSecondV1 },
    ], [ids.variantOwnerV2A]);
    const admin = deterministicClient(adminBase, [
      { variantId: ids.variantAdmin, versionId: ids.variantAdminV1 },
    ]);
    const member = deterministicClient(memberBase, [
      { variantId: ids.variantMember, versionId: ids.variantMemberV1 },
    ], [ids.variantOwnerV2B]);

    for (const [client, role] of [[owner, "owner"], [admin, "admin"], [member, "member"], [viewer, "viewer"]] as const) {
      const listed = await listReservationDocumentVariantsCore(
        { organizationId, reservationId: ids.reservationOwner }, client,
      );
      expect(listed.outcome).toBe("success");
      if (listed.outcome === "success") expect(listed.role).toBe(role);
    }
    expect(await listReservationDocumentVariantsCore(
      { organizationId, reservationId: ids.reservationOwner }, inactive,
    )).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(await listReservationDocumentVariantsCore(
      { organizationId: ids.otherOrganization, reservationId: ids.reservationOwner }, owner,
    )).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(await listReservationDocumentVariantsCore(
      { organizationId, reservationId: `${prefix}99` }, owner,
    )).toMatchObject({ outcome: "error", error: { code: "reservation_not_found" } });

    expect(await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationViewer, templateFamilyId: ids.family }, viewer,
    )).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationViewer, templateFamilyId: ids.unsupportedFamily }, owner,
    )).toMatchObject({ outcome: "error", error: { code: "unsupported_document_type" } });
    expect(await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationViewer, templateFamilyId: ids.mismatchFamily }, owner,
    )).toMatchObject({ outcome: "error", error: { code: "incompatible_taxonomy" } });
    expect(await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationViewer, templateFamilyId: ids.noPublicationFamily }, owner,
    )).toMatchObject({ outcome: "error", error: { code: "source_publication_not_found" } });

    const createdOwner = await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationOwner, templateFamilyId: ids.family }, owner,
    );
    const createdAdmin = await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationAdmin, templateFamilyId: ids.family }, admin,
    );
    const createdMember = await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationMember, templateFamilyId: ids.family }, member,
    );
    expect(createdOwner).toMatchObject({ outcome: "success", variantId: ids.variantOwner, versionId: ids.variantOwnerV1, sourceTemplateId: ids.sourceV1, sourceTemplateVersion: 1 });
    expect(createdAdmin).toMatchObject({ outcome: "success", variantId: ids.variantAdmin, versionId: ids.variantAdminV1 });
    expect(createdMember).toMatchObject({ outcome: "success", variantId: ids.variantMember, versionId: ids.variantMemberV1 });
    expect(Number(sql(`select count(distinct variant.id) from public.reservation_document_variants variant join public.reservations reservation on reservation.id = variant.reservation_id where reservation.litter_id = ${q(ids.litter)}::uuid and variant.id::text like '9e160001-%';`))).toBe(3);
    expect(sql(`select template_content from public.reservation_document_variant_versions where id = ${q(ids.variantOwnerV1)}::uuid;`)).toBe(content("Publication commune V1"));

    const ownerList = await listReservationDocumentVariantsCore(
      { organizationId, reservationId: ids.reservationOwner }, viewer,
    );
    expect(ownerList.outcome === "success" && ownerList.variants[0]?.draft?.id).toBe(ids.variantOwnerV1);
    if (ownerList.outcome !== "success" || !ownerList.variants[0]?.draft) {
      throw new Error("Expected the initial reservation variant draft");
    }

    const initialUpdatedAt = ownerList.variants[0].draft.updatedAt;
    const invalidSave = await saveReservationDocumentVariantDraftCore({
      organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1,
      templateContent: "{contenu temporairement invalide", expectedUpdatedAt: initialUpdatedAt,
    }, member);
    expect(invalidSave.outcome).toBe("success");
    expect(await validateReservationDocumentVariantDraftCore(
      { organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1 }, viewer,
    )).toMatchObject({ outcome: "error", error: { code: "invalid_template" } });
    const validSave = await saveReservationDocumentVariantDraftCore({
      organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1,
      templateContent: content("Variante propriétaire validée"),
      expectedUpdatedAt: invalidSave.outcome === "success" ? invalidSave.updatedAt : "",
    }, member);
    expect(validSave.outcome).toBe("success");
    expect(await saveReservationDocumentVariantDraftCore({
      organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1,
      templateContent: content("Écrasement concurrent"),
      expectedUpdatedAt: invalidSave.outcome === "success" ? invalidSave.updatedAt : "",
    }, member)).toMatchObject({ outcome: "error", error: { code: "stale_draft" } });
    expect(await validateReservationDocumentVariantDraftCore(
      { organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1 }, viewer,
    )).toMatchObject({ outcome: "success" });

    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1 }, member,
    )).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantOwner, versionId: ids.variantOwnerV1 }, admin,
    )).toEqual({ outcome: "success", versionId: ids.variantOwnerV1 });
    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantAdmin, versionId: ids.variantAdminV1 }, owner,
    )).toEqual({ outcome: "success", versionId: ids.variantAdminV1 });

    sql(`
      update public.document_templates set lifecycle_status = 'retired', is_active = false, updated_at = now(), updated_by = ${q(ownerId)}::uuid where id = ${q(ids.sourceV1)}::uuid;
      update public.document_templates set lifecycle_status = 'published', is_active = true, published_at = now(), published_by = ${q(ownerId)}::uuid, updated_at = now(), updated_by = ${q(ownerId)}::uuid where id = ${q(ids.sourceV2)}::uuid;
    `);
    const existingAfterNewPublication = await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationOwner, templateFamilyId: ids.family }, owner,
    );
    expect(existingAfterNewPublication).toMatchObject({ outcome: "success", variantId: ids.variantOwner, versionId: ids.variantOwnerV1, sourceTemplateId: ids.sourceV1, sourceTemplateVersion: 1 });
    const secondReservation = await createReservationDocumentVariantDraftCore(
      { organizationId, reservationId: ids.reservationSecond, templateFamilyId: ids.family }, owner,
    );
    expect(secondReservation).toMatchObject({ outcome: "success", variantId: ids.variantSecond, versionId: ids.variantSecondV1, sourceTemplateId: ids.sourceV2, sourceTemplateVersion: 2 });
    expect(sql(`select source_template_id::text || '|' || source_template_version::text || '|' || template_content from public.reservation_document_variant_versions where id = ${q(ids.variantSecondV1)}::uuid;`)).toBe(`${ids.sourceV2}|2|${content("Publication commune V2")}`);

    const concurrentNext = await Promise.all([
      createNextReservationDocumentVariantVersionCore({ organizationId, variantId: ids.variantOwner }, owner),
      createNextReservationDocumentVariantVersionCore({ organizationId, variantId: ids.variantOwner }, member),
    ]);
    expect(concurrentNext.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(concurrentNext.filter((result) => result.outcome === "error")).toHaveLength(1);
    expect(concurrentNext.find((result) => result.outcome === "error")).toMatchObject({ outcome: "error", error: { code: "draft_already_exists" } });
    const next = concurrentNext.find((result) => result.outcome === "success");
    if (!next || next.outcome !== "success") throw new Error("Expected one next variant version");
    expect([ids.variantOwnerV2A, ids.variantOwnerV2B]).toContain(next.versionId);
    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantOwner, versionId: next.versionId }, member,
    )).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    const originalRpc = ownerBase.rpc.bind(ownerBase);
    const racingOwner = new Proxy(ownerBase, {
      get(target, property) {
        if (property === "rpc") {
          return async (name: string, args: Record<string, unknown>) => {
            if (name === "publish_reservation_document_variant_version") {
              const concurrentEdit = await memberBase
                .from("reservation_document_variant_versions")
                .update({ template_content: content("Modification entre validation et publication") })
                .eq("id", next.versionId);
              if (concurrentEdit.error) throw concurrentEdit.error;
            }
            return originalRpc(name as never, args as never);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Supabase;
    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantOwner, versionId: next.versionId }, racingOwner,
    )).toMatchObject({ outcome: "error", error: { code: "stale_draft" } });
    expect(await publishReservationDocumentVariantVersionCore(
      { organizationId, variantId: ids.variantOwner, versionId: next.versionId }, admin,
    )).toEqual({ outcome: "success", versionId: next.versionId });

    const versions = await listReservationDocumentVariantVersionsCore(
      { organizationId, variantId: ids.variantOwner }, viewer,
    );
    expect(versions.outcome).toBe("success");
    if (versions.outcome === "success") {
      expect(versions.versions.map((version) => version.version)).toEqual([1, 2]);
      expect(versions.versions.map((version) => version.lifecycleStatus)).toEqual(["retired", "published"]);
      expect(versions.versions.every((version) => version.sourceTemplateId === ids.sourceV1)).toBe(true);
    }

    const rawDatabaseMessage = "raw SQL secret should never leave the service";
    const consoleError = console.error;
    console.error = () => undefined;
    try {
      const failingClient = new Proxy(ownerBase, {
        get(target, property) {
          if (property === "from") {
            return (table: string) => {
              if (table !== "reservations") return target.from(table as never);
              const query = {
                select: () => query,
                eq: () => query,
                is: () => query,
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "XX000", message: rawDatabaseMessage },
                }),
              };
              return query;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Supabase;
      const databaseError = await listReservationDocumentVariantsCore(
        { organizationId, reservationId: ids.reservationOwner }, failingClient,
      );
      expect(databaseError).toMatchObject({ outcome: "error", error: { code: "database_error" } });
      expect(JSON.stringify(databaseError)).not.toContain(rawDatabaseMessage);
    } finally {
      console.error = consoleError;
    }

    console.info(`reservation-document-variant-service fixtures: ${Object.values(ids).join(",")}`);
  } finally {
    cleanup();
    expectClean();
  }
});
