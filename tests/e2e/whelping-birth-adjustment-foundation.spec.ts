import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  cancelWhelpingBirthCore,
  correctWhelpingBirthCore,
  listWhelpingBirthAdjustmentHistoryCore,
  listWhelpingBirthsForSessionCore,
  recordWhelpingBirthCore,
  recordWhelpingBirthWeightCore,
} from "../../src/features/whelping/whelping-core";
import { createAuthenticatedSupabaseClient, runE2eSqlSync } from "./helpers/supabase";
import type { Database } from "../../src/types/database.types";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f200005-0000-4000-8000-0000000000";
const ids = {
  father: `${prefix}01`, mother: `${prefix}02`, litter: `${prefix}11`, session: `${prefix}21`,
  birthOneCommand: `${prefix}31`, birthTwoCommand: `${prefix}32`, birthThreeCommand: `${prefix}33`,
  correctOne: `${prefix}41`, addWeight: `${prefix}42`, changeWeight: `${prefix}43`,
  removeWeight: `${prefix}44`, restoreWeight: `${prefix}45`, noChange: `${prefix}46`,
  stale: `${prefix}47`, cancelNotLast: `${prefix}48`, cancelTwo: `${prefix}49`,
  cancelBlocked: `${prefix}50`, cancelOne: `${prefix}51`, cancelThree: `${prefix}52`,
  concurrentOne: `${prefix}53`, concurrentTwo: `${prefix}54`, routine: `${prefix}61`,
  admin: `${prefix}71`, member: `${prefix}72`, viewer: `${prefix}73`, outsider: `${prefix}74`,
  adminMembership: `${prefix}81`, memberMembership: `${prefix}82`, viewerMembership: `${prefix}83`,
  foreignOrganization: `${prefix}84`, outsiderMembership: `${prefix}85`,
} as const;
const roleUsers = [
  { id: ids.admin, role: "admin", membership: ids.adminMembership, email: "whelping-adjustment-admin@saasphase1.invalid" },
  { id: ids.member, role: "member", membership: ids.memberMembership, email: "whelping-adjustment-member@saasphase1.invalid" },
  { id: ids.viewer, role: "viewer", membership: ids.viewerMembership, email: "whelping-adjustment-viewer@saasphase1.invalid" },
] as const;
const outsider = { id: ids.outsider, email: "whelping-adjustment-outsider@saasphase1.invalid" } as const;
const password = "LocalE2EOwner-2026!";
const created = { births: [] as string[], animals: [] as string[], events: [] as string[], weights: [] as string[] };

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(value: string) { return runE2eSqlSync(value); }
function uuidList(values: string[]) { return values.length ? values.map((v) => `${q(v)}::uuid`).join(",") : "null::uuid"; }

function cleanup() {
  sql(`
    begin;
    set local session_replication_role = replica;
    delete from public.whelping_birth_adjustment_commands
      where client_command_id::text like '9f200005-%' or birth_id in (${uuidList(created.births)});
    delete from public.whelping_commands where client_command_id::text like '9f200005-%' or session_id=${q(ids.session)}::uuid;
    delete from public.animal_weight_measurements where id::text like '9f200005-%'
      or source_birth_id in (${uuidList(created.births)}) or animal_id in (${uuidList(created.animals)});
    delete from public.whelping_births where id in (${uuidList(created.births)}) or session_id=${q(ids.session)}::uuid;
    delete from public.whelping_events where id in (${uuidList(created.events)}) or session_id=${q(ids.session)}::uuid;
    delete from public.animals where id in (${uuidList(created.animals)});
    delete from public.whelping_sessions where id=${q(ids.session)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like 'E2E birth adjustment 202607200005%';
    delete from public.animals where id in (${q(ids.father)}::uuid,${q(ids.mother)}::uuid);
    delete from public.memberships where id::text like '9f200005-%';
    delete from public.profiles where id::text like '9f200005-%';
    delete from auth.identities where user_id::text like '9f200005-%';
    delete from auth.users where id::text like '9f200005-%';
    delete from public.organizations where id=${q(ids.foreignOrganization)}::uuid;
    commit;
  `);
}

function remaining() {
  return JSON.parse(sql(`select json_build_object(
    'adjustments',(select count(*) from public.whelping_birth_adjustment_commands where client_command_id::text like '9f200005-%'),
    'commands',(select count(*) from public.whelping_commands where client_command_id::text like '9f200005-%'),
    'weights',(select count(*) from public.animal_weight_measurements where id::text like '9f200005-%' or animal_id in (${uuidList(created.animals)})),
    'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
    'events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid),
    'animals',(select count(*) from public.animals where id in (${q(ids.father)}::uuid,${q(ids.mother)}::uuid) or id in (${uuidList(created.animals)})),
    'sessions',(select count(*) from public.whelping_sessions where id=${q(ids.session)}::uuid),
    'litters',(select count(*) from public.litters where id=${q(ids.litter)}::uuid),
    'memberships',(select count(*) from public.memberships where id::text like '9f200005-%'),
    'profiles',(select count(*) from public.profiles where id::text like '9f200005-%'),
    'users',(select count(*) from auth.users where id::text like '9f200005-%'),
    'organizations',(select count(*) from public.organizations where id=${q(ids.foreignOrganization)}::uuid)
  )::text;`)) as Record<string, number>;
}

function fixtures() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by) values
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'E2E birth adjustment 202607200005 father','dog','Golden Retriever','male','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'E2E birth adjustment 202607200005 mother','dog','Golden Retriever','female','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,'E2E birth adjustment 202607200005 litter','dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_expected',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions(id,organization_id,litter_id,mother_id,status,started_at,timezone_name,created_by,updated_by)
      values(${q(ids.session)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,${q(ids.mother)}::uuid,'open','2026-07-20T20:00:00Z','Europe/Paris',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function roleFixtures() {
  const allUsers = [...roleUsers, { ...outsider, role: "member", membership: ids.outsiderMembership }];
  sql(`
    insert into public.organizations(id,name,slug) values(${q(ids.foreignOrganization)}::uuid,'E2E birth adjustment foreign','e2e-birth-adjustment-foreign');
    ${allUsers.map((user) => `
      insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change_token_new,email_change,phone_change,
        phone_change_token,email_change_token_current,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(${q(user.id)}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${q(user.email)},
        (select encrypted_password from auth.users where id=${q(ownerId)}::uuid),now(),'','','','','','','','',
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
      insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
      values(gen_random_uuid(),${q(user.email)},${q(user.id)}::uuid,jsonb_build_object('sub',${q(user.id)},'email',${q(user.email)},'email_verified',true),'email',now(),now());
      insert into public.memberships(id,organization_id,profile_id,role,status,created_by,updated_by)
      values(${q(user.membership)}::uuid,${q(user.id === ids.outsider ? ids.foreignOrganization : organizationId)}::uuid,
        ${q(user.id)}::uuid,${q(user.role)},'active',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    `).join("\n")}
  `);
}

async function roleClient(email: string) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return client;
}

function recordInput(commandId: string, occurredAt: string, sex: "male" | "female" = "male") {
  return { sessionId: ids.session, clientCommandId: commandId, occurredAt, sex, viability: "alive" as const };
}

function correction(birthId: string, commandId: string, revision: number, overrides: Record<string, unknown> = {}) {
  return {
    birthId, clientCommandId: commandId, expectedRevisionNo: revision,
    occurredAt: "2026-07-20T20:30:00.000Z", sex: "female" as const,
    viability: "unknown" as const, initialCollarColor: "Violet", birthNote: "État effectif",
    weightGrams: null, weightMeasuredAt: null, weightNote: null,
    reason: "Rectification vérifiée", ...overrides,
  };
}

test("corrects and cancels births atomically while preserving every source row", async () => {
  cleanup();
  expect(Object.values(remaining()).every((count) => count === 0)).toBe(true);
  try {
    fixtures();
    roleFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const one = await recordWhelpingBirthCore(recordInput(ids.birthOneCommand, "2026-07-20T21:50:00.000Z"), owner);
    const two = await recordWhelpingBirthCore(recordInput(ids.birthTwoCommand, "2026-07-20T22:40:00.000Z", "female"), owner);
    expect(one.outcome).toBe("success"); expect(two.outcome).toBe("success");
    if (one.outcome !== "success" || two.outcome !== "success") throw new Error("birth fixture failed");
    for (const birth of [one, two]) {
      created.births.push(birth.birthId); created.animals.push(birth.animalId); created.events.push(birth.eventId);
      if (birth.weightMeasurementId) created.weights.push(birth.weightMeasurementId);
    }
    const originalEvent = sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(one.eventId)}::uuid;`);

    const firstCorrection = correction(one.birthId, ids.correctOne, 0, {
      occurredAt: "2026-07-20T22:40:00Z",
    });
    const corrected = await correctWhelpingBirthCore(firstCorrection, owner);
    expect(corrected).toMatchObject({ outcome: "success", revisionNo: 1, replayed: false });
    if (corrected.outcome !== "success") throw new Error("correction failed");
    created.events.push(corrected.eventId);
    expect(await correctWhelpingBirthCore(firstCorrection, owner)).toEqual({ ...corrected, replayed: true });
    expect(await correctWhelpingBirthCore({ ...firstCorrection, birthNote: "Conflit" }, owner)).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(sql(`select row_to_json(e)::text from public.whelping_events e where id=${q(one.eventId)}::uuid;`)).toBe(originalEvent);
    expect(JSON.parse(sql(`select json_build_object('sex',sex,'date',birth_date,'time',birth_time,'collar',collar_color_initial,'status',status) from public.animals where id=${q(one.animalId)}::uuid;`))).toEqual({ sex: "female", date: "2026-07-21", time: "00:40:00", collar: "Violet", status: "born" });
    expect(sql(`select actual_birth_date from public.litters where id=${q(ids.litter)}::uuid;`)).toBe("2026-07-21");
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1, { occurredAt: "2026-07-20T19:59:00Z" }), owner)).toMatchObject({ outcome: "error", error: { code: "birth_time_out_of_order" } });
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1, { occurredAt: "2026-07-20T22:41:00Z" }), owner)).toMatchObject({ outcome: "error", error: { code: "birth_time_out_of_order" } });
    for (const user of roleUsers.slice(0, 2)) {
      expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1, { occurredAt: "2026-07-20T22:40:00Z" }), await roleClient(user.email))).toMatchObject({ outcome: "error", error: { code: "no_change" } });
    }
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1, { occurredAt: "2026-07-20T22:40:00Z" }), await roleClient(roleUsers[2].email))).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1, { occurredAt: "2026-07-20T22:40:00Z" }), await roleClient(outsider.email))).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    const anonymous = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 1), anonymous)).toMatchObject({ outcome: "error", error: { code: "unauthenticated" } });

    const completedWeightInput = {
      birthId: one.birthId,
      clientCommandId: ids.addWeight,
      weightGrams: 410,
      measuredAt: "2026-07-20T22:41:00Z",
      note: "Initial",
    };
    const completedWeight = await recordWhelpingBirthWeightCore(completedWeightInput, owner);
    expect(completedWeight).toMatchObject({ outcome: "success", replayed: false });
    if (completedWeight.outcome !== "success") throw new Error("weight completion failed");
    created.weights.push(completedWeight.weightMeasurementId);
    const weightId = completedWeight.weightMeasurementId;
    expect(await recordWhelpingBirthWeightCore(completedWeightInput, owner)).toEqual({ ...completedWeight, replayed: true });

    const changed = await correctWhelpingBirthCore(correction(one.birthId, ids.changeWeight, 1, { weightGrams: 420, weightMeasuredAt: "2026-07-20T22:42:00Z", weightNote: "Corrigé" }), owner);
    expect(changed).toMatchObject({ outcome: "success", weightMeasurementId: weightId, revisionNo: 2 });
    if (changed.outcome === "success") created.events.push(changed.eventId);
    const correctedWeightState = sql(`select json_build_object('measurement',row_to_json(measurement),'animal_birth_weight',animal.birth_weight_grams)::text from public.animal_weight_measurements measurement join public.animals animal on animal.organization_id=measurement.organization_id and animal.id=measurement.animal_id where measurement.id=${q(weightId)}::uuid;`);
    expect(await recordWhelpingBirthWeightCore(completedWeightInput, owner)).toMatchObject({ outcome: "error", error: { code: "birth_weight_inconsistent" } });
    expect(sql(`select json_build_object('measurement',row_to_json(measurement),'animal_birth_weight',animal.birth_weight_grams)::text from public.animal_weight_measurements measurement join public.animals animal on animal.organization_id=measurement.organization_id and animal.id=measurement.animal_id where measurement.id=${q(weightId)}::uuid;`)).toBe(correctedWeightState);

    const removed = await correctWhelpingBirthCore(correction(one.birthId, ids.removeWeight, 2), owner);
    expect(removed).toMatchObject({ outcome: "success", weightMeasurementId: weightId, revisionNo: 3 });
    if (removed.outcome === "success") created.events.push(removed.eventId);
    expect(sql(`select count(*)||':'||(cancelled_at is not null)::text from public.animal_weight_measurements where id=${q(weightId)}::uuid group by cancelled_at;`)).toBe("1:true");
    const removedWeightState = sql(`select json_build_object('measurement',row_to_json(measurement),'animal_birth_weight',animal.birth_weight_grams)::text from public.animal_weight_measurements measurement join public.animals animal on animal.organization_id=measurement.organization_id and animal.id=measurement.animal_id where measurement.id=${q(weightId)}::uuid;`);
    expect(await recordWhelpingBirthWeightCore(completedWeightInput, owner)).toMatchObject({ outcome: "error", error: { code: "birth_weight_inconsistent" } });
    expect(sql(`select json_build_object('measurement',row_to_json(measurement),'animal_birth_weight',animal.birth_weight_grams)::text from public.animal_weight_measurements measurement join public.animals animal on animal.organization_id=measurement.organization_id and animal.id=measurement.animal_id where measurement.id=${q(weightId)}::uuid;`)).toBe(removedWeightState);

    const restored = await correctWhelpingBirthCore(correction(one.birthId, ids.restoreWeight, 3, { weightGrams: 430, weightMeasuredAt: "2026-07-20T22:43:00Z", weightNote: "Réactivé" }), owner);
    expect(restored).toMatchObject({ outcome: "success", weightMeasurementId: weightId, revisionNo: 4 });
    if (restored.outcome === "success") created.events.push(restored.eventId);
    expect(sql(`select count(*)||':'||(cancelled_at is null)::text from public.animal_weight_measurements where id=${q(weightId)}::uuid group by cancelled_at;`)).toBe("1:true");

    expect(await correctWhelpingBirthCore(correction(one.birthId, ids.noChange, 4, { weightGrams: 430, weightMeasuredAt: "2026-07-20T22:43:00Z", weightNote: "Réactivé" }), owner)).toMatchObject({ outcome: "error", error: { code: "no_change" } });
    expect(await correctWhelpingBirthCore(correction(one.birthId, ids.stale, 3, { birthNote: "Ne doit pas passer" }), owner)).toMatchObject({ outcome: "error", error: { code: "stale_revision" } });
    expect(await cancelWhelpingBirthCore({ birthId: one.birthId, clientCommandId: ids.cancelNotLast, expectedRevisionNo: 4, cancelledAt: "2026-07-20T21:00:00Z", reason: "Ordre" }, owner)).toMatchObject({ outcome: "error", error: { code: "later_active_birth_exists" } });

    const cancelledTwo = await cancelWhelpingBirthCore({ birthId: two.birthId, clientCommandId: ids.cancelTwo, expectedRevisionNo: 0, cancelledAt: "2026-07-20T21:01:00Z", reason: "Dernière naissance erronée" }, owner);
    expect(cancelledTwo).toMatchObject({ outcome: "success", revisionNo: 1 });
    if (cancelledTwo.outcome === "success") created.events.push(cancelledTwo.eventId);
    if (cancelledTwo.outcome === "success") {
      expect(await cancelWhelpingBirthCore({ birthId: two.birthId, clientCommandId: ids.cancelTwo, expectedRevisionNo: 0, cancelledAt: "2026-07-20T21:01:00Z", reason: "Dernière naissance erronée" }, owner)).toEqual({ ...cancelledTwo, replayed: true });
    }
    expect(sql(`select count(*) from public.whelping_births where id=${q(two.birthId)}::uuid;`)).toBe("1");
    expect(sql(`select deleted_at is not null from public.animals where id=${q(two.animalId)}::uuid;`)).toBe("t");
    const listedAfterCancellation = await listWhelpingBirthsForSessionCore({ sessionId: ids.session }, owner);
    expect(listedAfterCancellation.outcome).toBe("success");
    if (listedAfterCancellation.outcome === "success") {
      expect(listedAfterCancellation.births.find((birth) => birth.id === two.birthId)).toMatchObject({
        revisionNo: 1,
        cancelledAt: "2026-07-20T21:01:00+00:00",
        cancellationReason: "Dernière naissance erronée",
        birthWeightMeasurement: null,
      });
    }
    expect(await recordWhelpingBirthCore(recordInput(ids.birthTwoCommand, "2026-07-20T22:40:00.000Z", "female"), owner)).toMatchObject({ outcome: "error", error: { code: "birth_cancelled" } });

    sql(`insert into public.animal_weight_measurements(id,organization_id,animal_id,measured_at,grams,measurement_kind,created_by)
      values(${q(ids.routine)}::uuid,${q(organizationId)}::uuid,${q(one.animalId)}::uuid,'2026-07-20T21:02:00Z',500,'clinical',${q(ownerId)}::uuid);`);
    created.weights.push(ids.routine);
    expect(await correctWhelpingBirthCore(correction(one.birthId, crypto.randomUUID(), 4, { viability: "stillborn", weightGrams: 430, weightMeasuredAt: "2026-07-20T22:43:00Z", weightNote: "Réactivé" }), owner)).toMatchObject({ outcome: "error", error: { code: "birth_has_downstream_data" } });
    expect(await cancelWhelpingBirthCore({ birthId: one.birthId, clientCommandId: ids.cancelBlocked, expectedRevisionNo: 4, cancelledAt: "2026-07-20T21:03:00Z", reason: "Donnée ultérieure" }, owner)).toMatchObject({ outcome: "error", error: { code: "birth_has_downstream_data" } });
    sql(`delete from public.animal_weight_measurements where id=${q(ids.routine)}::uuid;`);
    const cancelledOne = await cancelWhelpingBirthCore({ birthId: one.birthId, clientCommandId: ids.cancelOne, expectedRevisionNo: 4, cancelledAt: "2026-07-20T21:04:00Z", reason: "Annulation finale" }, owner);
    expect(cancelledOne).toMatchObject({ outcome: "success", revisionNo: 5 });
    if (cancelledOne.outcome === "success") created.events.push(cancelledOne.eventId);
    const cancelledBirthState = sql(`select json_build_object('birth',row_to_json(birth),'measurement',row_to_json(measurement),'animal',row_to_json(animal))::text from public.whelping_births birth join public.animals animal on animal.organization_id=birth.organization_id and animal.id=birth.animal_id join public.animal_weight_measurements measurement on measurement.organization_id=birth.organization_id and measurement.source_birth_id=birth.id where birth.id=${q(one.birthId)}::uuid;`);
    expect(await recordWhelpingBirthWeightCore(completedWeightInput, owner)).toMatchObject({ outcome: "error", error: { code: "birth_cancelled" } });
    expect(sql(`select json_build_object('birth',row_to_json(birth),'measurement',row_to_json(measurement),'animal',row_to_json(animal))::text from public.whelping_births birth join public.animals animal on animal.organization_id=birth.organization_id and animal.id=birth.animal_id join public.animal_weight_measurements measurement on measurement.organization_id=birth.organization_id and measurement.source_birth_id=birth.id where birth.id=${q(one.birthId)}::uuid;`)).toBe(cancelledBirthState);
    expect(JSON.parse(sql(`select json_build_object('total',born_total_count,'male',born_male_count,'female',born_female_count,'alive',alive_count,'date',actual_birth_date) from public.litters where id=${q(ids.litter)}::uuid;`))).toEqual({ total: 0, male: 0, female: 0, alive: 0, date: "2026-07-20" });

    const three = await recordWhelpingBirthCore(recordInput(ids.birthThreeCommand, "2026-07-21T20:20:00.000Z"), owner);
    expect(three).toMatchObject({ outcome: "success", birthOrder: 1 });
    if (three.outcome !== "success") throw new Error("replacement birth failed");
    created.births.push(three.birthId); created.animals.push(three.animalId); created.events.push(three.eventId);
    expect(JSON.parse(sql(`select json_build_object('total',born_total_count,'male',born_male_count,'female',born_female_count,'alive',alive_count) from public.litters where id=${q(ids.litter)}::uuid;`)))
      .toEqual({ total: 1, male: 1, female: 0, alive: 1 });
    sql(`update public.whelping_sessions set status='closed',ended_at='2026-07-21T22:00:00Z' where id=${q(ids.session)}::uuid;`);
    const concurrent = await Promise.all([
      correctWhelpingBirthCore(correction(three.birthId, ids.concurrentOne, 0, { occurredAt: "2026-07-21T20:21:00Z", sex: "male", viability: "alive", birthNote: "A" }), owner),
      correctWhelpingBirthCore(correction(three.birthId, ids.concurrentTwo, 0, { occurredAt: "2026-07-21T20:22:00Z", sex: "male", viability: "alive", birthNote: "B" }), owner),
    ]);
    expect(concurrent.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(concurrent.filter((result) => result.outcome === "error")).toHaveLength(1);
    for (const result of concurrent) if (result.outcome === "success") created.events.push(result.eventId);
    const currentRevision = Number(sql(`select revision_no from public.whelping_births where id=${q(three.birthId)}::uuid;`));
    const correctionCancellationRace = await Promise.all([
      correctWhelpingBirthCore(correction(three.birthId, crypto.randomUUID(), currentRevision, { occurredAt: "2026-07-21T20:23:00Z", sex: "male", viability: "alive", birthNote: "Course correction" }), owner),
      cancelWhelpingBirthCore({ birthId: three.birthId, clientCommandId: ids.cancelThree, expectedRevisionNo: currentRevision, cancelledAt: "2026-07-21T21:00:00Z", reason: "Course annulation" }, owner),
    ]);
    expect(correctionCancellationRace.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(correctionCancellationRace.filter((result) => result.outcome === "error")).toHaveLength(1);
    for (const result of correctionCancellationRace) if (result.outcome === "success") created.events.push(result.eventId);
    if (sql(`select cancelled_at is null from public.whelping_births where id=${q(three.birthId)}::uuid;`) === "t") {
      const finalRevision = Number(sql(`select revision_no from public.whelping_births where id=${q(three.birthId)}::uuid;`));
      const cancelledThree = await cancelWhelpingBirthCore({ birthId: three.birthId, clientCommandId: crypto.randomUUID(), expectedRevisionNo: finalRevision, cancelledAt: "2026-07-21T21:01:00Z", reason: "Nettoyage fonctionnel" }, owner);
      expect(cancelledThree.outcome).toBe("success");
      if (cancelledThree.outcome === "success") created.events.push(cancelledThree.eventId);
    }

    const audit = JSON.parse(sql(`select json_build_object('count',count(*),'snapshots',bool_and(snapshot_before ? 'birth' and snapshot_after ? 'litter'),'types',array_agg(distinct command_type)) from public.whelping_birth_adjustment_commands where client_command_id::text like '9f200005-%';`));
    expect(audit.count).toBeGreaterThanOrEqual(7); expect(audit.snapshots).toBe(true);
    expect(audit.types.sort()).toEqual(["cancel_birth", "correct_birth"]);
    expect(sql(`select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth';`)).toBe("3");

    const ownerHistory = await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter, limit: 100 }, owner);
    expect(ownerHistory.outcome).toBe("success");
    if (ownerHistory.outcome !== "success") throw new Error("audit history read failed");
    expect(ownerHistory.entries.length).toBeLessThanOrEqual(100);
    expect(ownerHistory.entries.map((entry) => entry.actionAt)).toEqual(
      [...ownerHistory.entries].map((entry) => entry.actionAt).sort().reverse(),
    );
    expect(ownerHistory.entries.some((entry) => entry.weightChangeType === "corrected" && entry.beforeWeightGrams === 410 && entry.afterWeightGrams === 420)).toBe(true);
    expect(ownerHistory.entries.find((entry) => entry.reason === "Rectification vérifiée" && entry.weightChangeType === "removed")?.afterWeightGrams).toBeNull();
    expect(ownerHistory.entries.some((entry) => entry.weightChangeType === "added" && entry.afterWeightGrams === 430)).toBe(true);
    expect(ownerHistory.entries.find((entry) => entry.reason === "Annulation finale")).toMatchObject({
      adjustmentType: "cancellation",
      birthOrder: 1,
      beforeWeightGrams: 430,
      afterWeightGrams: null,
      weightChangeType: "neutralized_on_cancellation",
    });
    const serializedHistory = JSON.stringify(ownerHistory.entries);
    expect(serializedHistory).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serializedHistory).not.toMatch(/snapshot|clientCommand|revision|createdBy|commandId|table|rpc/i);

    for (const user of roleUsers) {
      const result = await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter }, await roleClient(user.email));
      expect(result.outcome).toBe("success");
      if (result.outcome === "success") expect(result.entries).toEqual(ownerHistory.entries);
    }
    expect((await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter }, anonymous)).outcome).toBe("error");
    expect((await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter }, await roleClient(outsider.email))).outcome).toBe("error");
    sql(`update public.memberships set status='disabled' where id=${q(ids.viewerMembership)}::uuid;`);
    expect((await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter }, await roleClient(roleUsers[2].email))).outcome).toBe("error");
    sql(`update public.memberships set status='active' where id=${q(ids.viewerMembership)}::uuid;`);
    expect((await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter, limit: 0 }, owner)).outcome).toBe("error");
    expect((await listWhelpingBirthAdjustmentHistoryCore({ litterId: ids.litter, limit: 101 }, owner)).outcome).toBe("error");
    const directPrivateRead = await owner.from("whelping_birth_adjustment_commands").select("id").limit(1);
    expect(directPrivateRead.error).not.toBeNull();
    expect(directPrivateRead.data).toBeNull();
  } finally {
    cleanup();
    const left = remaining();
    console.info(JSON.stringify({ whelpingBirthAdjustmentFixtureCleanup: { deleted: { prefix, ...created }, remaining: left } }));
    expect(Object.values(left).every((count) => count === 0)).toBe(true);
  }
});

test("classifies every current foreign key to animals", () => {
  const actual = sql(`select json_agg(source order by source)::text from (
    select c.relname||'.'||con.conname source from pg_constraint con
    join pg_class c on c.oid=con.conrelid join unnest(con.confkey) with ordinality target(attnum,ord) on true
    where con.contype='f' and con.confrelid='public.animals'::regclass
    group by c.relname,con.conname
  ) classified;`);
  expect(JSON.parse(actual)).toEqual([
    "animal_weight_measurements.animal_weight_measurements_animal_organization_fk",
    "animals.animals_father_organization_fk", "animals.animals_mother_organization_fk",
    "documents.documents_animal_organization_fk", "events.events_animal_organization_fk",
    "litter_weight_adjustment_commands.litter_weight_adjustment_commands_animal_organization_fk",
    "litters.litters_father_organization_fk", "litters.litters_mother_organization_fk",
    "maternal_observations.maternal_observations_mother_organization_fk",
    "media.media_animal_organization_fk", "notes.notes_animal_organization_fk",
    "reproductive_cycle_matings.reproductive_cycle_matings_father_organization_fk",
    "reproductive_cycles.reproductive_cycles_mother_organization_fk",
    "reservations.reservations_animal_organization_fk",
    "whelping_birth_adjustment_commands.whelping_birth_adjustment_commands_animal_fk",
    "whelping_births.whelping_births_animal_organization_fk",
    "whelping_commands.whelping_commands_animal_organization_fk",
    "whelping_sessions.whelping_sessions_mother_organization_fk",
  ]);
});
