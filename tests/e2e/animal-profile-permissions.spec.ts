import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createAnonymousSupabaseClient,
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const memberMembershipId = "30000000-0000-4000-8000-000000000002";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

async function authenticatedClient(email: string, password: string) {
  const client = createAnonymousSupabaseClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

async function resetAnimal(animalId: string) {
  sql(`
    update public.animals
    set status = 'born', is_breeder = false, updated_by = ${q(ownerId)}::uuid
    where id = ${q(animalId)}::uuid;
  `);
}

test("réserve les décisions animales sensibles à owner/admin et accepte health_other", async () => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const animalId = fixtures.register("animals", randomUUID());
    const otherOrganizationId = fixtures.register("organizations", randomUUID());
    const otherAnimalId = fixtures.register("animals", randomUUID());
    const healthEventId = fixtures.register("events", randomUUID());

    sql(`
      insert into public.animals (
        id, organization_id, call_name, species, breed, sex, status,
        ownership_status, is_breeder, is_external, is_retired, created_by, updated_by
      ) values (
        ${q(animalId)}::uuid, ${q(organizationId)}::uuid, 'Permission animal E2E',
        'dog', 'Golden Retriever', 'female', 'born', 'produced', false, false, false,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.organizations (id, name, slug)
      values (${q(otherOrganizationId)}::uuid, 'Organisation étrangère E2E', ${q(`animal-profile-${otherOrganizationId}`)});

      insert into public.animals (
        id, organization_id, call_name, species, breed, sex, status,
        ownership_status, is_breeder, is_external, is_retired, created_by, updated_by
      ) values (
        ${q(otherAnimalId)}::uuid, ${q(otherOrganizationId)}::uuid, 'Animal autre organisation E2E',
        'dog', 'Golden Retriever', 'female', 'born', 'produced', false, false, false,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);

    const owner = await authenticatedClient(E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    const member = await authenticatedClient(E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    const viewer = await authenticatedClient(E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD);

    try {
      const ownerKeep = await owner.from("animals").update({ status: "kept" }).eq("id", animalId).select("id").maybeSingle();
      expect(ownerKeep.error).toBeNull();
      expect(ownerKeep.data?.id).toBe(animalId);
      await resetAnimal(animalId);

      const memberKeep = await member.from("animals").update({ status: "kept" }).eq("id", animalId).select("id").maybeSingle();
      expect(memberKeep.error).toBeTruthy();
      await resetAnimal(animalId);

      sql(`update public.animals set status = 'active' where id = ${q(animalId)}::uuid;`);
      const memberAvailable = await member.from("animals").update({ status: "available" }).eq("id", animalId).select("id").maybeSingle();
      expect(memberAvailable.error).toBeTruthy();
      expect(sql(`select status from public.animals where id = ${q(animalId)}::uuid`)).toBe("active");
      await resetAnimal(animalId);

      const viewerKeep = await viewer.from("animals").update({ status: "kept" }).eq("id", animalId).select("id").maybeSingle();
      expect(viewerKeep.error).toBeNull();
      expect(viewerKeep.data).toBeNull();
      expect(sql(`select status from public.animals where id = ${q(animalId)}::uuid`)).toBe("born");
      await resetAnimal(animalId);

      sql(`update public.memberships set role = 'admin' where id = ${q(memberMembershipId)}::uuid;`);
      const adminKeep = await member.from("animals").update({ status: "kept" }).eq("id", animalId).select("id").maybeSingle();
      expect(adminKeep.error).toBeNull();
      expect(adminKeep.data?.id).toBe(animalId);
      await resetAnimal(animalId);
      sql(`update public.memberships set role = 'member' where id = ${q(memberMembershipId)}::uuid;`);

      const memberBreeder = await member.from("animals").update({ is_breeder: true }).eq("id", animalId).select("id").maybeSingle();
      expect(memberBreeder.error).toBeTruthy();
      await resetAnimal(animalId);

      sql(`update public.memberships set status = 'disabled' where id = ${q(memberMembershipId)}::uuid;`);
      const disabledKeep = await member.from("animals").update({ status: "kept" }).eq("id", animalId).select("id").maybeSingle();
      expect(disabledKeep.error).toBeNull();
      expect(disabledKeep.data).toBeNull();
      expect(sql(`select status from public.animals where id = ${q(animalId)}::uuid`)).toBe("born");
      sql(`update public.memberships set status = 'active' where id = ${q(memberMembershipId)}::uuid;`);

      const crossOrganizationKeep = await owner.from("animals").update({ status: "kept" }).eq("id", otherAnimalId).select("id").maybeSingle();
      expect(crossOrganizationKeep.error).toBeNull();
      expect(crossOrganizationKeep.data).toBeNull();

      const healthOther = await owner.from("events").insert({
        id: healthEventId,
        organization_id: organizationId,
        animal_id: animalId,
        event_type: "health_other",
        title: "Autre événement de santé E2E",
        planned_date: "2026-08-20",
        status: "done",
        priority: "normal",
        is_task: false,
        created_by: ownerId,
        updated_by: ownerId,
      }).select("id").maybeSingle();
      expect(healthOther.error).toBeNull();
      expect(healthOther.data?.id).toBe(healthEventId);
    } finally {
      sql(`
        update public.memberships
        set role = 'member', status = 'active', deleted_at = null
        where id = ${q(memberMembershipId)}::uuid;
      `);
    }
  });
});
