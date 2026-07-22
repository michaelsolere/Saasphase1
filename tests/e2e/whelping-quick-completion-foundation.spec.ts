import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  correctWhelpingBirthCore,
  isRoutineQuickCompletionEvent,
  QUICK_WHELPING_COMPLETION_REASON,
  quickCompleteWhelpingBirthCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import { createAuthenticatedSupabaseClient, runE2eSqlSync } from "./helpers/supabase";
import type { Database } from "../../src/types/database.types";

test.setTimeout(240_000);

test("classe uniquement le complément rapide exact comme événement de routine", () => {
  expect(isRoutineQuickCompletionEvent({
    eventType: "birth_corrected",
    note: QUICK_WHELPING_COMPLETION_REASON,
  })).toBe(true);
  expect(isRoutineQuickCompletionEvent({
    eventType: "birth_corrected",
    note: "Correction manuelle du poids",
  })).toBe(false);
  expect(isRoutineQuickCompletionEvent({
    eventType: "birth_cancelled",
    note: QUICK_WHELPING_COMPLETION_REASON,
  })).toBe(false);
  expect(isRoutineQuickCompletionEvent({
    eventType: "birth_corrected",
    note: `${QUICK_WHELPING_COMPLETION_REASON} `,
  })).toBe(false);
});

const fixturePrefix = "WHELPING_QUICK_COMPLETION_V1_20260722_01";
const ids = {
  mother: "9f270101-0000-4000-8000-000000000001",
  father: "9f270101-0000-4000-8000-000000000002",
  litter: "9f270102-0000-4000-8000-000000000001",
  session: "9f270103-0000-4000-8000-000000000001",
  foreignOrganization: "9f270104-0000-4000-8000-000000000001",
  foreignMother: "9f270101-0000-4000-8000-000000000003",
  foreignLitter: "9f270102-0000-4000-8000-000000000002",
  foreignSession: "9f270103-0000-4000-8000-000000000002",
  birthCommands: [
    "9f270105-0000-4000-8000-000000000001",
    "9f270105-0000-4000-8000-000000000002",
    "9f270105-0000-4000-8000-000000000003",
    "9f270105-0000-4000-8000-000000000004",
  ],
  quickBoth: "9f270106-0000-4000-8000-000000000001",
  quickWeight: "9f270106-0000-4000-8000-000000000002",
  quickColor: "9f270106-0000-4000-8000-000000000003",
  overwrite: "9f270106-0000-4000-8000-000000000004",
  stale: "9f270106-0000-4000-8000-000000000005",
  concurrentCorrection: "9f270106-0000-4000-8000-000000000006",
} as const;

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }

const organizationId = sql("select id from public.organizations where slug='elevage-e2e';");
const ownerId = sql("select id from public.profiles where email='e2e-owner@saasphase1.invalid';");
const ownerMembershipId = sql(`select id from public.memberships where organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;`);

function cleanup() {
  sql(`
    begin;
    set local session_replication_role=replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f270106-%';
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f270105-%';
    delete from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid);
    delete from public.whelping_births where session_id=${q(ids.session)}::uuid;
    delete from public.whelping_events where session_id=${q(ids.session)}::uuid;
    delete from public.animals where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_sessions where id in (${q(ids.session)}::uuid,${q(ids.foreignSession)}::uuid);
    delete from public.litters where id in (${q(ids.litter)}::uuid,${q(ids.foreignLitter)}::uuid) or name like ${q(`${fixturePrefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid,${q(ids.foreignMother)}::uuid) or notes like ${q(`${fixturePrefix}%`)};
    delete from public.organizations where id=${q(ids.foreignOrganization)}::uuid or name like ${q(`${fixturePrefix}%`)};
    commit;
  `);
}

function counts() {
  return JSON.parse(sql(`select json_build_object(
    'organisations',(select count(*) from public.organizations where id=${q(ids.foreignOrganization)}::uuid or name like ${q(`${fixturePrefix}%`)}),
    'animaux',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid,${q(ids.foreignMother)}::uuid) or litter_id=${q(ids.litter)}::uuid or notes like ${q(`${fixturePrefix}%`)}),
    'portees',(select count(*) from public.litters where id in (${q(ids.litter)}::uuid,${q(ids.foreignLitter)}::uuid) or name like ${q(`${fixturePrefix}%`)}),
    'sessions',(select count(*) from public.whelping_sessions where id in (${q(ids.session)}::uuid,${q(ids.foreignSession)}::uuid)),
    'evenements',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid),
    'naissances',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
    'commandes',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f270105-%'),
    'rectifications',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid or client_command_id::text like '9f270106-%'),
    'mesures',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),
    'changements_role',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectClean() {
  const remaining = counts();
  for (const [table, count] of Object.entries(remaining)) expect(count, `${table} cleanup`).toBe(0);
  return remaining;
}

function fixtures() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Aube quick','dog','Golden Retriever','female','breeding','owned',true,${q(`${fixturePrefix} mother`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'Atlas quick','dog','Golden Retriever','male','breeding','owned',true,${q(`${fixturePrefix} father`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${fixturePrefix} litter`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_in_progress',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions(id,organization_id,litter_id,mother_id,status,started_at,timezone_name,created_by,updated_by)
      values(${q(ids.session)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,${q(ids.mother)}::uuid,'open','2026-07-22T01:00:00Z','Europe/Paris',${q(ownerId)}::uuid,${q(ownerId)}::uuid);

    insert into public.organizations(id,name,slug) values(${q(ids.foreignOrganization)}::uuid,${q(`${fixturePrefix} foreign`)},'whelping-quick-foreign-20260722');
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by)
      values(${q(ids.foreignMother)}::uuid,${q(ids.foreignOrganization)}::uuid,'Foreign mother','dog','Golden Retriever','female','breeding','owned',true,${q(`${fixturePrefix} foreign`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,status,created_by,updated_by)
      values(${q(ids.foreignLitter)}::uuid,${q(ids.foreignOrganization)}::uuid,${q(`${fixturePrefix} foreign litter`)},'dog','Golden Retriever',${q(ids.foreignMother)}::uuid,'birth_in_progress',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions(id,organization_id,litter_id,mother_id,status,started_at,timezone_name,created_by,updated_by)
      values(${q(ids.foreignSession)}::uuid,${q(ids.foreignOrganization)}::uuid,${q(ids.foreignLitter)}::uuid,${q(ids.foreignMother)}::uuid,'open','2026-07-22T01:00:00Z','Europe/Paris',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function quickInput(birth: { birthId: string; animalId: string }, commandId: string, overrides: Record<string, unknown> = {}) {
  return {
    litterId: ids.litter,
    sessionId: ids.session,
    birthId: birth.birthId,
    animalId: birth.animalId,
    expectedRevisionNo: 0,
    clientCommandId: commandId,
    initialCollarColor: null,
    birthWeightGrams: null,
    weightMeasuredAt: null,
    allowDuplicateColor: false,
    ...overrides,
  };
}

test("complète rapidement via la rectification auditée sans doublon ni écrasement", async () => {
  cleanup();
  expectClean();
  const createdIds: Record<string, string[]> = { births: [], animals: [], events: [], measurements: [], commands: [] };
  try {
    fixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const births = [];
    births.push(await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.birthCommands[0], occurredAt: "2026-07-22T01:10:00Z", sex: "male", viability: "unknown" }, owner));
    births.push(await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.birthCommands[1], occurredAt: "2026-07-22T01:20:00Z", sex: "female", viability: "unknown", initialCollarColor: "Bleu" }, owner));
    births.push(await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.birthCommands[2], occurredAt: "2026-07-22T01:30:00Z", sex: "male", viability: "unknown", birthWeightGrams: 390, measuredAt: "2026-07-22T01:31:00Z" }, owner));
    births.push(await recordWhelpingBirthCore({ sessionId: ids.session, clientCommandId: ids.birthCommands[3], occurredAt: "2026-07-22T01:40:00Z", sex: "female", viability: "alive", initialCollarColor: "Vert", birthWeightGrams: 410, measuredAt: "2026-07-22T01:41:00Z" }, owner));
    expect(births.every((birth) => birth.outcome === "success")).toBe(true);
    if (births.some((birth) => birth.outcome === "error")) throw new Error("fixture birth failed");
    const [missingBoth, colorOnly, weightOnly, complete] = births;
    for (const birth of births) {
      createdIds.births.push(birth.birthId); createdIds.animals.push(birth.animalId);
      createdIds.events.push(birth.eventId); createdIds.commands.push(ids.birthCommands[birth.birthOrder - 1]);
      if (birth.weightMeasurementId) createdIds.measurements.push(birth.weightMeasurementId);
    }

    expect((await quickCompleteWhelpingBirthCore({} as never, owner)).outcome).toBe("error");
    const anonymous = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    expect(await quickCompleteWhelpingBirthCore(quickInput(missingBoth, crypto.randomUUID(), { initialCollarColor: "Orange" }), anonymous)).toMatchObject({ outcome: "error", error: { code: "unauthenticated" } });

    sql(`set session_replication_role=replica; update public.memberships set role='viewer' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    expect(await quickCompleteWhelpingBirthCore(quickInput(missingBoth, crypto.randomUUID(), { initialCollarColor: "Orange" }), owner)).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    sql(`set session_replication_role=replica; update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);

    const foreign = await quickCompleteWhelpingBirthCore({
      ...quickInput(missingBoth, crypto.randomUUID(), { initialCollarColor: "Orange" }),
      litterId: ids.foreignLitter,
      sessionId: ids.foreignSession,
      animalId: ids.foreignMother,
    }, owner);
    expect(foreign).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    expect(await quickCompleteWhelpingBirthCore(quickInput(missingBoth, crypto.randomUUID(), {
      birthWeightGrams: 420, weightMeasuredAt: "2026-07-22T01:09:00Z",
    }), owner)).toMatchObject({ outcome: "error", error: { code: "measured_before_birth" } });

    const duplicate = await quickCompleteWhelpingBirthCore(quickInput(missingBoth, ids.quickBoth, {
      initialCollarColor: " bleu ", birthWeightGrams: 430, weightMeasuredAt: "2026-07-22T01:12:00Z",
    }), owner);
    expect(duplicate).toMatchObject({ outcome: "error", error: { code: "duplicate_color_confirmation_required" }, duplicateColorBirthOrder: 2 });
    expect(sql(`select count(*) from public.whelping_birth_adjustment_commands where client_command_id=${q(ids.quickBoth)}::uuid;`)).toBe("0");

    const bothInput = quickInput(missingBoth, ids.quickBoth, {
      initialCollarColor: "Bleu", birthWeightGrams: 430, weightMeasuredAt: "2026-07-22T01:12:00Z", allowDuplicateColor: true,
    });
    const [bothA, bothB] = await Promise.all([
      quickCompleteWhelpingBirthCore(bothInput, owner),
      quickCompleteWhelpingBirthCore(bothInput, owner),
    ]);
    expect(bothA.outcome).toBe("success"); expect(bothB.outcome).toBe("success");
    expect([bothA, bothB].filter((result) => result.outcome === "success" && result.replayed)).toHaveLength(1);

    const weightAdded = await quickCompleteWhelpingBirthCore(quickInput(colorOnly, ids.quickWeight, {
      birthWeightGrams: 435, weightMeasuredAt: "2026-07-22T01:22:00Z",
    }), owner);
    expect(weightAdded).toMatchObject({ outcome: "success", birthOrder: 2, initialCollarColor: "Bleu", birthWeightGrams: 435 });

    sql(`set session_replication_role=replica; update public.animals set collar_color_current='Sauge' where id=${q(weightOnly.animalId)}::uuid; set session_replication_role=origin;`);
    const colorAdded = await quickCompleteWhelpingBirthCore(quickInput(weightOnly, ids.quickColor, {
      initialCollarColor: "Orange",
    }), owner);
    expect(colorAdded).toMatchObject({ outcome: "success", birthOrder: 3, initialCollarColor: "Orange", birthWeightGrams: 390 });

    expect(await quickCompleteWhelpingBirthCore(quickInput(complete, crypto.randomUUID(), { initialCollarColor: "Noir" }), owner)).toMatchObject({ outcome: "error", error: { code: "birth_color_already_recorded" } });
    expect(await quickCompleteWhelpingBirthCore(quickInput(complete, ids.overwrite, { birthWeightGrams: 999, weightMeasuredAt: "2026-07-22T01:45:00Z" }), owner)).toMatchObject({ outcome: "error", error: { code: "birth_weight_already_recorded" } });
    expect(await quickCompleteWhelpingBirthCore(quickInput(complete, crypto.randomUUID(), { initialCollarColor: null, birthWeightGrams: null }), owner)).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    const beforeConcurrent = JSON.parse(sql(`select json_build_object('occurred_at',occurred_at,'sex',sex,'viability',viability,'note',note,'revision',revision_no) from public.whelping_births where id=${q(complete.birthId)}::uuid;`));
    const corrected = await correctWhelpingBirthCore({
      birthId: complete.birthId, clientCommandId: ids.concurrentCorrection, expectedRevisionNo: 0,
      occurredAt: beforeConcurrent.occurred_at, sex: beforeConcurrent.sex, viability: beforeConcurrent.viability,
      initialCollarColor: "Vert", birthNote: "Concurrent", weightGrams: 410,
      weightMeasuredAt: "2026-07-22T01:41:00Z", weightNote: null, reason: "Modification concurrente",
    }, owner);
    expect(corrected.outcome).toBe("success");
    expect(await quickCompleteWhelpingBirthCore(quickInput(complete, ids.stale, { initialCollarColor: "Noir" }), owner)).toMatchObject({ outcome: "error", error: { code: "stale_revision" } });

    const state = JSON.parse(sql(`select json_build_object(
      'births',(select count(*) from public.whelping_births where session_id=${q(ids.session)}::uuid),
      'birth_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth'),
      'quick_events',(select count(*) from public.whelping_events where session_id=${q(ids.session)}::uuid and event_type='birth_corrected' and note=${q(QUICK_WHELPING_COMPLETION_REASON)}),
      'quick_commands',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid and reason=${q(QUICK_WHELPING_COMPLETION_REASON)}),
      'active_birth_measurements',(select count(*) from public.animal_weight_measurements where source_birth_id in (${q(missingBoth.birthId)}::uuid,${q(colorOnly.birthId)}::uuid,${q(weightOnly.birthId)}::uuid,${q(complete.birthId)}::uuid) and measurement_kind='birth' and cancelled_at is null),
      'duplicate_measurements',(select count(*) from (select source_birth_id from public.animal_weight_measurements where source_birth_id is not null and measurement_kind='birth' and cancelled_at is null group by source_birth_id having count(*)>1) duplicate),
      'preserved',(select json_build_object('sex',b.sex,'viability',b.viability,'occurred_at',b.occurred_at,'note',b.note,'animal_id',b.animal_id,'birth_order',b.birth_order,'animal_initial',a.collar_color_initial,'animal_current',a.collar_color_current,'animal_weight',a.birth_weight_grams) from public.whelping_births b join public.animals a on a.id=b.animal_id where b.id=${q(missingBoth.birthId)}::uuid),
      'weight_only',(select json_build_object('grams',m.grams,'measured_at',m.measured_at,'note',m.note) from public.animal_weight_measurements m where m.source_birth_id=${q(weightOnly.birthId)}::uuid and m.cancelled_at is null),
      'weight_only_animal',(select json_build_object('initial',collar_color_initial,'current',collar_color_current,'weight',birth_weight_grams) from public.animals where id=${q(weightOnly.animalId)}::uuid)
    )::text;`));
    expect(state).toMatchObject({ births: 4, birth_events: 4, quick_events: 3, quick_commands: 3, active_birth_measurements: 4, duplicate_measurements: 0 });
    expect(state.preserved).toMatchObject({ sex: "male", viability: "unknown", occurred_at: "2026-07-22T01:10:00+00:00", note: null, animal_id: missingBoth.animalId, birth_order: 1, animal_initial: "Bleu", animal_current: "Bleu", animal_weight: 430 });
    expect(state.weight_only).toEqual({ grams: 390, measured_at: "2026-07-22T01:31:00+00:00", note: null });
    expect(state.weight_only_animal).toEqual({ initial: "Orange", current: "Sauge", weight: 390 });

    console.info(JSON.stringify({ quickCompletionCreatedIds: createdIds }));
  } finally {
    cleanup();
    console.info(JSON.stringify({ quickCompletionCleanup: { prefix: fixturePrefix, remaining: expectClean() } }));
  }
});
