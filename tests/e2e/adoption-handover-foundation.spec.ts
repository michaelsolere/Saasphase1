import { expect, test } from "@playwright/test";

import {
  createTestAdopterFinalizationReadyScenario,
  registerActualFinalizationEffects,
} from "./helpers/fixtures/adopter-finalization-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { registerPostAdoptionQuestionnaireEffects } from "./helpers/fixtures/post-adoption-questionnaire-fixtures";
import { runE2eSql, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(300_000);

const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const ownerId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const commandId = "9f370001-0000-4000-8000-000000000001";
const correctionCommandId = "9f370001-0000-4000-8000-000000000005";
const reversalCommandId = "9f370001-0000-4000-8000-000000000006";
const paymentId = "9f370001-0000-4000-8000-000000000002";
const commitmentId = "9f370001-0000-4000-8000-000000000003";
const contractId = "9f370001-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000002";
const memberBlockedCommandId = "9f370001-0000-4000-8000-000000000007";
const ownerExceptionCommandId = "9f370001-0000-4000-8000-000000000008";
const refinalizationCommandId = "9f370001-0000-4000-8000-000000000009";
const incidentCommandId = "9f370001-0000-4000-8000-000000000010";
const rollbackCommandId = "9f370001-0000-4000-8000-000000000011";
const staleCorrectionCommandId = "9f370001-0000-4000-8000-000000000012";

function jsonSql(statement: string) {
  const line = sql(statement).split(/\r?\n/).find((value) => value.trimStart().startsWith("{"));
  if (!line) throw new Error("Expected a JSON SQL result");
  return JSON.parse(line) as Record<string, unknown>;
}

test("installs the adoption handover ledger and transactional RPCs", () => {
  const installed = JSON.parse(
    sql(`
      select json_build_object(
        'eventTable', to_regclass('public.adoption_handover_events') is not null,
        'finalizeRpc', to_regprocedure(
          'public.finalize_adoption_handover(uuid,uuid,timestamptz,timestamptz,text[],text)'
        ) is not null,
        'correctRpc', to_regprocedure(
          'public.correct_adoption_handover(uuid,uuid,text,timestamptz,timestamptz,text)'
        ) is not null,
        'eventMutationPrivileges', (
          select count(*)::integer
          from unnest(array['anon', 'authenticated', 'service_role']) role_name
          cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) privilege_name
          where has_table_privilege(
            role_name,
            'public.adoption_handover_events',
            privilege_name
          )
        )
      )::text;
    `),
  );

  expect(installed).toEqual({
    eventTable: true,
    finalizeRpc: true,
    correctRpc: true,
    eventMutationPrivileges: 0,
  });
});

test("finalizes a complete handover once and replays the same command", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const scenario = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E adoption handover complete",
        animalCallName: "E2E adoption handover puppy",
        birthDate: "2026-04-01",
      },
    );

    fixtures.register("payments", paymentId);
    fixtures.register("documents", commitmentId);
    fixtures.register("documents", contractId);
    await runE2eSql(`
      update public.animals
      set identification_number = '250269000000001'
      where id = ${q(scenario.animal.id)}::uuid;
      update public.reservations
      set price_cents = 200000
      where id = ${q(scenario.journey.id)}::uuid;
      insert into public.payments (
        id, organization_id, contact_id, reservation_id, amount_cents,
        payment_type, status, payment_method, paid_at, created_by, updated_by
      ) values (
        ${q(paymentId)}::uuid, ${q(organizationId)}::uuid,
        ${q(scenario.contact.id)}::uuid, ${q(scenario.journey.id)}::uuid,
        200000, 'balance', 'paid', 'bank_transfer', statement_timestamp(),
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
      insert into public.documents (
        id, organization_id, contact_id, reservation_id, document_type,
        status, title, signature_required, sent_at, signed_at, created_by, updated_by
      ) values
        (${q(commitmentId)}::uuid, ${q(organizationId)}::uuid,
         ${q(scenario.contact.id)}::uuid, ${q(scenario.journey.id)}::uuid,
         'commitment_certificate', 'signed', 'E2E certificat signé', true,
         statement_timestamp(), statement_timestamp(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
        (${q(contractId)}::uuid, ${q(organizationId)}::uuid,
         ${q(scenario.contact.id)}::uuid, ${q(scenario.journey.id)}::uuid,
         'reservation_contract', 'signed', 'E2E contrat signé', true,
         statement_timestamp(), statement_timestamp(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    `);

    const updatedAt = sql(`select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`);
    const call = () => jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', response.outcome,
        'reason', response.reason,
        'replayed', response.replayed,
        'eventId', response.event_id,
        'exceptionCodes', response.exception_codes,
        'adoptionCompletedAt', response.adoption_completed_at,
        'result', response.result
      )::text
      from public.finalize_adoption_handover(
        ${q(scenario.journey.id)}::uuid,
        ${q(commandId)}::uuid,
        '2026-08-04T14:00:00Z'::timestamptz,
        ${q(updatedAt)}::timestamptz,
        array[]::text[],
        null
      ) response;
      commit;
    `);

    const first = call();
    const eventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(commandId)}::uuid;`);
    fixtures.register("adoption_handover_events", eventId);
    await registerActualFinalizationEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    expect(first).toMatchObject({ outcome: "success", replayed: false });
    const replay = call();
    expect(replay).toMatchObject({ outcome: "success", replayed: true });

    const state = jsonSql(`
      select json_build_object(
        'reservationStatus', (select status from public.reservations where id=${q(scenario.journey.id)}::uuid),
        'animalStatus', (select status from public.animals where id=${q(scenario.animal.id)}::uuid),
        'ownershipStatus', (select ownership_status from public.animals where id=${q(scenario.animal.id)}::uuid),
        'activeAdopterRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='adopter' and is_active and deleted_at is null),
        'activeHolderRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='reservation_holder' and is_active and deleted_at is null),
        'events', (select count(*)::integer from public.adoption_handover_events where client_command_id=${q(commandId)}::uuid),
        'instances', (select count(*)::integer from public.post_adoption_questionnaire_instances where reservation_id=${q(scenario.journey.id)}::uuid)
      )::text;
    `);
    expect(state).toEqual({
      reservationStatus: "adopted",
      animalStatus: "adopted",
      ownershipStatus: "adopted_out",
      activeAdopterRoles: 1,
      activeHolderRoles: 0,
      events: 1,
      instances: 2,
    });

    const correct = (
      clientCommandId: string,
      correctionType: "date" | "reverse",
      newAdoptionCompletedAt: string | null,
      expectedAdoptionCompletedAt: string,
      correctionReason: string,
    ) =>
      jsonSql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        select jsonb_build_object(
          'outcome', response.outcome,
          'reason', response.reason,
          'replayed', response.replayed,
          'eventId', response.event_id,
          'adoptionCompletedAt', response.adoption_completed_at,
          'result', response.result
        )::text
        from public.correct_adoption_handover(
          ${q(scenario.journey.id)}::uuid,
          ${q(clientCommandId)}::uuid,
          ${q(correctionType)},
          ${newAdoptionCompletedAt ? `${q(newAdoptionCompletedAt)}::timestamptz` : "null::timestamptz"},
          ${q(expectedAdoptionCompletedAt)}::timestamptz,
          ${q(correctionReason)}
        ) response;
        commit;
      `);

    const corrected = correct(
      correctionCommandId,
      "date",
      "2026-08-03T14:00:00Z",
      "2026-08-04T14:00:00Z",
      "E2E correction of the effective handover date.",
    );
    const correctionEventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(correctionCommandId)}::uuid;`);
    fixtures.register("adoption_handover_events", correctionEventId);
    expect(corrected).toMatchObject({ outcome: "success", replayed: false });
    expect(
      correct(
        correctionCommandId,
        "date",
        "2026-08-03T14:00:00Z",
        "2026-08-04T14:00:00Z",
        "E2E correction of the effective handover date.",
      ),
    ).toMatchObject({ outcome: "success", replayed: true });
    expect(
      sql(`select adoption_completed_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`),
    ).toContain("2026-08-03 14:00:00");
    expect(
      sql(`select started_at::text from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='adopter' and is_active and deleted_at is null;`),
    ).toBe("2026-08-03");
    expect(
      correct(
        staleCorrectionCommandId,
        "date",
        "2026-08-02T14:00:00Z",
        "2026-08-04T14:00:00Z",
        "E2E stale correction must not replace a newer decision.",
      ),
    ).toMatchObject({ outcome: "error", reason: "correction_stale" });
    expect(
      Number(
        sql(`select count(*)::text from public.adoption_handover_events where client_command_id=${q(staleCorrectionCommandId)}::uuid;`),
      ),
    ).toBe(0);

    const reversed = correct(
      reversalCommandId,
      "reverse",
      null,
      "2026-08-03T14:00:00Z",
      "E2E finalization recorded on the wrong journey.",
    );
    const reversalEventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(reversalCommandId)}::uuid;`);
    fixtures.register("adoption_handover_events", reversalEventId);
    const correctionRoleIds = JSON.parse(
      await runE2eSql(`
        select coalesce(json_agg(id), '[]'::json)::text
        from public.contact_roles
        where organization_id=${q(organizationId)}::uuid
          and contact_id=${q(scenario.contact.id)}::uuid
      `),
    ) as string[];
    for (const roleId of correctionRoleIds) {
      if (!fixtures.has("contact_roles", roleId)) {
        fixtures.register("contact_roles", roleId);
      }
    }
    await registerActualFinalizationEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    expect(reversed).toMatchObject({ outcome: "success", replayed: false });

    const reversedState = jsonSql(`
      select json_build_object(
        'reservationStatus', (select status from public.reservations where id=${q(scenario.journey.id)}::uuid),
        'adoptionCompletedAt', (select adoption_completed_at from public.reservations where id=${q(scenario.journey.id)}::uuid),
        'animalStatus', (select status from public.animals where id=${q(scenario.animal.id)}::uuid),
        'ownershipStatus', (select ownership_status from public.animals where id=${q(scenario.animal.id)}::uuid),
        'activeAdopterRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='adopter' and is_active and deleted_at is null),
        'activeHolderRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='reservation_holder' and is_active and deleted_at is null),
        'suspendedInstances', (select count(*)::integer from public.post_adoption_questionnaire_instances where reservation_id=${q(scenario.journey.id)}::uuid and status='suspended'),
        'handoverEvents', (select count(*)::integer from public.adoption_handover_events where reservation_id=${q(scenario.journey.id)}::uuid)
      )::text;
    `);
    expect(reversedState).toEqual({
      reservationStatus: "animal_assigned",
      adoptionCompletedAt: null,
      animalStatus: "reserved",
      ownershipStatus: "produced",
      activeAdopterRoles: 0,
      activeHolderRoles: 1,
      suspendedInstances: 2,
      handoverEvents: 3,
    });

    const refinalizationUpdatedAt = sql(`select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`);
    const refinalized = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', response.outcome,
        'reason', response.reason,
        'eventId', response.event_id
      )::text
      from public.finalize_adoption_handover(
        ${q(scenario.journey.id)}::uuid,
        ${q(refinalizationCommandId)}::uuid,
        '2026-06-01T14:00:00Z'::timestamptz,
        ${q(refinalizationUpdatedAt)}::timestamptz,
        array[]::text[],
        null
      ) response;
      commit;
    `);
    const refinalizationEventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(refinalizationCommandId)}::uuid;`);
    fixtures.register("adoption_handover_events", refinalizationEventId);
    await registerActualFinalizationEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    expect(refinalized).toMatchObject({ outcome: "success" });

    const t1InstanceId = sql(`select id from public.post_adoption_questionnaire_instances where reservation_id=${q(scenario.journey.id)}::uuid and milestone='t1';`);
    const publicAccess = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select json_build_object(
        'outcome', response.outcome,
        'accessId', response.access_id
      )::text
      from public.create_or_rotate_post_adoption_questionnaire_public_access(
        ${q(t1InstanceId)}::uuid,
        repeat('a', 64),
        'e2e010'
      ) response;
      commit;
    `);
    expect(publicAccess.outcome).toBe("success");
    const publicAccessId = publicAccess.accessId as string;
    fixtures.register("post_adoption_questionnaire_public_accesses", publicAccessId);
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });

    const incident = correct(
      incidentCommandId,
      "date",
      "2026-05-31T14:00:00Z",
      "2026-06-01T14:00:00Z",
      "E2E correction requested after the family invitation.",
    );
    const incidentEventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(incidentCommandId)}::uuid;`);
    fixtures.register("adoption_handover_events", incidentEventId);
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    expect(incident).toMatchObject({ outcome: "incident_opened" });
    expect(
      jsonSql(`
        select json_build_object(
          'reservationStatus', (select status from public.reservations where id=${q(scenario.journey.id)}::uuid),
          'adoptionCompletedAt', (select adoption_completed_at from public.reservations where id=${q(scenario.journey.id)}::uuid),
          'suspendedInstances', (select count(*)::integer from public.post_adoption_questionnaire_instances where reservation_id=${q(scenario.journey.id)}::uuid and status='suspended'),
          'accessRevoked', (select revoked_at is not null from public.post_adoption_questionnaire_public_accesses where id=${q(publicAccessId)}::uuid)
        )::text
      `),
    ).toEqual({
      reservationStatus: "adopted",
      adoptionCompletedAt: "2026-06-01T14:00:00+00:00",
      suspendedInstances: 2,
      accessRevoked: true,
    });
  }));

test("requires a responsible role and an exact justification for sensitive exceptions", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const scenario = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E adoption handover exception",
        animalCallName: "E2E adoption handover exception puppy",
        birthDate: "2026-04-01",
      },
    );
    const updatedAt = sql(`select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`);
    const call = ({
      actorId,
      clientCommandId,
      exceptionCodes,
      exceptionReason,
    }: {
      actorId: string;
      clientCommandId: string;
      exceptionCodes: string[];
      exceptionReason: string | null;
    }) =>
      jsonSql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(actorId)};
        select jsonb_build_object(
          'outcome', response.outcome,
          'reason', response.reason,
          'replayed', response.replayed,
          'eventId', response.event_id,
          'blockerCodes', response.blocker_codes,
          'exceptionCodes', response.exception_codes
        )::text
        from public.finalize_adoption_handover(
          ${q(scenario.journey.id)}::uuid,
          ${q(clientCommandId)}::uuid,
          '2026-08-04T14:00:00Z'::timestamptz,
          ${q(updatedAt)}::timestamptz,
          array[${exceptionCodes.map(q).join(",")} ]::text[],
          ${exceptionReason ? q(exceptionReason) : "null"}
        ) response;
        commit;
      `);

    const memberAttempt = call({
      actorId: memberId,
      clientCommandId: memberBlockedCommandId,
      exceptionCodes: [],
      exceptionReason: null,
    });
    expect(memberAttempt).toMatchObject({
      outcome: "blocked",
      reason: "exception_authorization_required",
      exceptionCodes: [
        "animal_identification_missing",
        "commitment_certificate_missing",
        "price_missing",
        "reservation_contract_missing",
      ],
    });

    const exceptionCodes = memberAttempt.exceptionCodes as string[];
    const ownerAttempt = call({
      actorId: ownerId,
      clientCommandId: ownerExceptionCommandId,
      exceptionCodes,
      exceptionReason: "E2E manager accepts the documented incomplete handover.",
    });
    const eventId = sql(`select id from public.adoption_handover_events where client_command_id=${q(ownerExceptionCommandId)}::uuid;`);
    fixtures.register("adoption_handover_events", eventId);
    await registerActualFinalizationEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });
    await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
      reservationIds: [scenario.journey.id],
    });

    expect(ownerAttempt).toMatchObject({ outcome: "success", replayed: false });
    expect(
      jsonSql(`
        select json_build_object(
          'actor', actor_profile_id,
          'actorRole', actor_role,
          'reason', reason,
          'exceptions', exceptions
        )::text
        from public.adoption_handover_events
        where id=${q(eventId)}::uuid
      `),
    ).toEqual({
      actor: ownerId,
      actorRole: "owner",
      reason: "E2E manager accepts the documented incomplete handover.",
      exceptions: exceptionCodes,
    });
  }));

test("rolls every adoption write back when the immutable history cannot be written", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const scenario = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E adoption handover rollback",
        animalCallName: "E2E adoption handover rollback puppy",
        birthDate: "2026-04-01",
      },
    );
    const updatedAt = sql(`select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`);

    await runE2eSql(`
      create or replace function public.e2e_force_adoption_handover_event_failure()
      returns trigger
      language plpgsql
      set search_path = ''
      as $function$
      begin
        raise exception 'E2E forced adoption handover history failure';
      end;
      $function$;
      create trigger e2e_force_adoption_handover_event_failure
      before insert on public.adoption_handover_events
      for each row execute function public.e2e_force_adoption_handover_event_failure();
    `);

    try {
      expect(() =>
        sql(`
          begin;
          set local role authenticated;
          set local request.jwt.claim.sub = ${q(ownerId)};
          select *
          from public.finalize_adoption_handover(
            ${q(scenario.journey.id)}::uuid,
            ${q(rollbackCommandId)}::uuid,
            '2026-08-04T14:00:00Z'::timestamptz,
            ${q(updatedAt)}::timestamptz,
            array[
              'animal_identification_missing',
              'commitment_certificate_missing',
              'price_missing',
              'reservation_contract_missing'
            ]::text[],
            'E2E exercise the all-or-nothing rollback.'
          );
          commit;
        `),
      ).toThrow(/forced adoption handover history failure/);
    } finally {
      await runE2eSql(`
        drop trigger if exists e2e_force_adoption_handover_event_failure
          on public.adoption_handover_events;
        drop function if exists public.e2e_force_adoption_handover_event_failure();
      `);
    }

    expect(
      jsonSql(`
        select json_build_object(
          'reservationStatus', (select status from public.reservations where id=${q(scenario.journey.id)}::uuid),
          'adoptionCompletedAt', (select adoption_completed_at from public.reservations where id=${q(scenario.journey.id)}::uuid),
          'animalStatus', (select status from public.animals where id=${q(scenario.animal.id)}::uuid),
          'ownershipStatus', (select ownership_status from public.animals where id=${q(scenario.animal.id)}::uuid),
          'activeAdopterRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='adopter' and is_active and deleted_at is null),
          'activeHolderRoles', (select count(*)::integer from public.contact_roles where contact_id=${q(scenario.contact.id)}::uuid and role='reservation_holder' and is_active and deleted_at is null),
          'events', (select count(*)::integer from public.adoption_handover_events where reservation_id=${q(scenario.journey.id)}::uuid),
          'instances', (select count(*)::integer from public.post_adoption_questionnaire_instances where reservation_id=${q(scenario.journey.id)}::uuid)
        )::text
      `),
    ).toEqual({
      reservationStatus: "animal_assigned",
      adoptionCompletedAt: null,
      animalStatus: "reserved",
      ownershipStatus: "produced",
      activeAdopterRoles: 0,
      activeHolderRoles: 1,
      events: 0,
      instances: 0,
    });
  }));
