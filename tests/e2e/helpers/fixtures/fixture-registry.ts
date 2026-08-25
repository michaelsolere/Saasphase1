export const fixtureTables = [
  "departure_public_sessions",
  "departure_public_accesses",
  "departure_finalization_authorizations",
  "departure_signature_events",
  "departure_commands",
  "departure_events",
  "departure_slots",
  "departure_plan_litters",
  "departure_plans",
  "choice_appointment_sessions",
  "choice_appointment_accesses",
  "animal_assignment_commands",
  "choice_appointment_commands",
  "choice_appointment_events",
  "animal_assignment_events",
  "choice_appointment_ranked_preferences",
  "choice_appointment_slots",
  "choice_appointment_plans",
  "direct_late_sale_commands",
  "direct_late_sale_events",
  "direct_late_sale_email_drafts",
  "direct_late_sales",
  "post_birth_positioning_commands",
  "post_birth_positioning_events",
  "post_birth_position_decisions",
  "post_birth_positioning_lines",
  "post_birth_positions",
  "post_birth_positioning_waves",
  "post_birth_positioning_drafts",
  "post_birth_capacity_revisions",
  "post_birth_incidents",
  "post_birth_capacity_states",
  "adopter_profile_questionnaire_sessions",
  "adopter_profile_questionnaire_accesses",
  "adopter_profile_questionnaire_events",
  "adopter_profile_questionnaire_commands",
  "adopter_profile_questionnaire_instances",
  "adopter_profile_questionnaire_reconciliation_attempts",
  "email_delivery_attempts",
  "candidate_journey_events",
  "adopter_manual_contacts",
  "pre_reservation_proposals",
  "adopter_financial_resolution_events",
  "adoption_handover_events",
  "post_adoption_questionnaire_public_sessions",
  "post_adoption_questionnaire_public_accesses",
  "post_adoption_questionnaire_reconciliation_run_results",
  "post_adoption_questionnaire_reconciliation_attempts",
  "post_adoption_questionnaire_reconciliation_runs",
  "post_adoption_questionnaire_events",
  "post_adoption_questionnaire_response_revisions",
  "post_adoption_questionnaire_drafts",
  "post_adoption_questionnaire_instances",
  "notes",
  "calendar_reminder_commands",
  "calendar_reminders",
  "events",
  "media",
  "document_signed_returns",
  "documents",
  "payments",
  "contact_roles",
  "reservations",
  "applications",
  "contacts",
  "maternal_observation_task_links",
  "maternal_observation_commands",
  "maternal_observations",
  "litter_plan_actual_birth_reconciliation_task_changes",
  "litter_plan_actual_birth_reconciliations",
  "litter_plan_series_actual_birth_reconciliation_changes",
  "litter_plan_series_actual_birth_reconciliation_commands",
  "litter_plan_actual_birth_plan_reversal_changes",
  "litter_plan_actual_birth_plan_reversals",
  "litter_plan_actual_birth_activation_reversal_changes",
  "litter_plan_actual_birth_activation_reversal_snapshots",
  "litter_plan_actual_birth_activation_deactivations",
  "litter_plan_actual_birth_activation_states",
  "litter_plan_actual_birth_activations",
  "litter_care_tasks",
  "litter_plan_series_time_slots",
  "litter_plan_series_materialization_commands",
  "litter_plan_series_state_commands",
  "litter_plan_anchor_recalculation_commands",
  "litter_plan_series",
  "litter_plan_application_commands",
  "litter_plan_items",
  "litter_plans",
  "litter_planning_model_item_time_slots",
  "litter_planning_model_commands",
  "litter_planning_model_items",
  "litter_planning_models",
  "litter_care_task_templates",
  "form_submissions",
  "public_forms",
  "whelping_birth_adjustment_commands",
  "whelping_commands",
  "litter_weight_adjustment_commands",
  "litter_weight_commands",
  "animal_weight_measurements",
  "litter_weighing_sessions",
  "whelping_births",
  "whelping_events",
  "whelping_sessions",
  "reproductive_cycle_matings",
  "progesterone_measurements",
  "reproductive_cycles",
  "organization_calendar_feeds",
  "litters",
  "litter_groups",
  "animals",
  "memberships",
  "organizations",
] as const;
export type FixtureTable = (typeof fixtureTables)[number];
export type SqlExecutor = (sql: string) => string | Promise<string>;

const cleanupOrder: FixtureTable[] = [
  "departure_public_sessions",
  "departure_public_accesses",
  "departure_finalization_authorizations",
  "departure_signature_events",
  "departure_commands",
  "departure_events",
  "departure_slots",
  "departure_plan_litters",
  "departure_plans",
  "choice_appointment_sessions",
  "choice_appointment_accesses",
  "animal_assignment_commands",
  "choice_appointment_commands",
  "choice_appointment_events",
  "animal_assignment_events",
  "choice_appointment_ranked_preferences",
  "choice_appointment_slots",
  "choice_appointment_plans",
  "direct_late_sale_commands",
  "direct_late_sale_events",
  "direct_late_sale_email_drafts",
  "direct_late_sales",
  "post_birth_positioning_commands",
  "post_birth_positioning_events",
  "post_birth_position_decisions",
  "post_birth_positioning_lines",
  "post_birth_positions",
  "post_birth_positioning_waves",
  "post_birth_positioning_drafts",
  "post_birth_capacity_revisions",
  "post_birth_incidents",
  "post_birth_capacity_states",
  "adopter_profile_questionnaire_sessions",
  "adopter_profile_questionnaire_accesses",
  "adopter_profile_questionnaire_events",
  "adopter_profile_questionnaire_commands",
  "adopter_profile_questionnaire_instances",
  "adopter_profile_questionnaire_reconciliation_attempts",
  "email_delivery_attempts",
  "candidate_journey_events",
  "adopter_manual_contacts",
  "pre_reservation_proposals",
  "adopter_financial_resolution_events",
  "adoption_handover_events",
  "post_adoption_questionnaire_public_sessions",
  "post_adoption_questionnaire_public_accesses",
  "post_adoption_questionnaire_reconciliation_run_results",
  "post_adoption_questionnaire_reconciliation_attempts",
  "post_adoption_questionnaire_reconciliation_runs",
  "post_adoption_questionnaire_events",
  "post_adoption_questionnaire_response_revisions",
  "post_adoption_questionnaire_drafts",
  "post_adoption_questionnaire_instances",
  "notes",
  "calendar_reminder_commands",
  "calendar_reminders",
  "events",
  "media",
  "document_signed_returns",
  "documents",
  "payments",
  "contact_roles",
  "reservations",
  "applications",
  "contacts",
  "maternal_observation_task_links",
  "maternal_observation_commands",
  "maternal_observations",
  "litter_plan_actual_birth_reconciliation_task_changes",
  "litter_plan_actual_birth_reconciliations",
  "litter_plan_series_actual_birth_reconciliation_changes",
  "litter_plan_series_actual_birth_reconciliation_commands",
  "litter_plan_actual_birth_plan_reversal_changes",
  "litter_plan_actual_birth_plan_reversals",
  "litter_plan_actual_birth_activation_reversal_changes",
  "litter_plan_actual_birth_activation_reversal_snapshots",
  "litter_plan_actual_birth_activation_deactivations",
  "litter_plan_actual_birth_activation_states",
  "litter_plan_actual_birth_activations",
  "litter_care_tasks",
  "litter_plan_series_time_slots",
  "litter_plan_series_materialization_commands",
  "litter_plan_series_state_commands",
  "litter_plan_anchor_recalculation_commands",
  "litter_plan_series",
  "litter_plan_application_commands",
  "litter_plan_items",
  "litter_plans",
  "litter_planning_model_item_time_slots",
  "litter_planning_model_commands",
  "litter_planning_model_items",
  "litter_planning_models",
  "litter_care_task_templates",
  "form_submissions",
  "public_forms",
  "whelping_birth_adjustment_commands",
  "whelping_commands",
  "litter_weight_adjustment_commands",
  "litter_weight_commands",
  "animal_weight_measurements",
  "litter_weighing_sessions",
  "whelping_births",
  "whelping_events",
  "whelping_sessions",
  "reproductive_cycle_matings",
  "progesterone_measurements",
  "reproductive_cycles",
  "organization_calendar_feeds",
  "litters",
  "litter_groups",
  "animals",
  "memberships",
  "organizations",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idsSql(ids: string[]) { return ids.map((id) => `'${id}'::uuid`).join(", "); }

export function extractFixtureDeleteOrder(statements: readonly string[]) {
  return statements.flatMap((statement) =>
    [...statement.matchAll(/delete\s+from\s+public\.([a-z_]+)/gi)].map(
      (match) => match[1],
    ),
  );
}

export function createE2eFixtureRegistry(execute: SqlExecutor, namespace = `e2e-${crypto.randomUUID()}`) {
  const ids = new Map<FixtureTable, Set<string>>(fixtureTables.map((table) => [table, new Set()]));
  const register = (table: FixtureTable, id: string) => {
    if (!fixtureTables.includes(table)) throw new Error(`Unsupported E2E fixture table: ${table}`);
    if (!uuid.test(id)) throw new Error(`Invalid E2E fixture UUID for ${table}: ${id}`);
    const tableIds = ids.get(table)!;
    if (tableIds.has(id)) throw new Error(`Duplicate E2E fixture ${table}:${id}`);
    tableIds.add(id);
    return id;
  };
  const has = (table: FixtureTable, id: string) => ids.get(table)?.has(id) ?? false;
  const counts = async () => Object.fromEntries(await Promise.all(fixtureTables.map(async (table) => {
    const tableIds = [...ids.get(table)!];
    if (tableIds.length === 0) return [table, 0];
    return [table, Number(await execute(`select count(*)::text from public.${table} where id in (${idsSql(tableIds)})`))];
  }))) as Record<FixtureTable, number>;
  const cleanup = async () => {
    const animalIds = [...ids.get("animals")!];
    const reservationIds = [...ids.get("reservations")!];
    const contactIds = [...ids.get("contacts")!];
    const positionIds = [...ids.get("post_birth_positions")!];
    const directSaleIds = [...ids.get("direct_late_sales")!];
    const choiceSlotIds = [...ids.get("choice_appointment_slots")!];
    const documentIds = [...ids.get("documents")!];
    if (documentIds.length) {
      await execute(`begin; set local app.qa_hard_delete='on'; delete from public.departure_signature_events where document_id in (${idsSql(documentIds)}); delete from public.document_signed_returns where document_id in (${idsSql(documentIds)}); commit;`);
    }
    const departurePlanIds = [...ids.get("departure_plans")!];
    if (departurePlanIds.length) {
      const discovered = JSON.parse(await execute(`select json_build_object(
        'departure_commands', coalesce((select json_agg(id) from public.departure_commands where target_id in (select id from public.departure_slots where plan_id in (${idsSql(departurePlanIds)})) or target_id in (${idsSql(departurePlanIds)})), '[]'::json),
        'departure_events', coalesce((select json_agg(id) from public.departure_events where plan_id in (${idsSql(departurePlanIds)})), '[]'::json),
        'events', coalesce((select json_agg(id) from public.events where departure_slot_id in (select id from public.departure_slots where plan_id in (${idsSql(departurePlanIds)}))), '[]'::json),
        'departure_public_accesses', coalesce((select json_agg(id) from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})), '[]'::json),
        'departure_public_sessions', coalesce((select json_agg(session.id) from public.departure_public_sessions session join public.departure_public_accesses access on access.id=session.access_id where access.plan_id in (${idsSql(departurePlanIds)})), '[]'::json),
        'email_delivery_attempts', coalesce((select json_agg(attempt_id) from (select invitation_delivery_attempt_id attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)}) union select confirmation_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)}) union select response_reminder_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)}) union select appointment_reminder_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)}) union select move_confirmation_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})) attempts where attempt_id is not null), '[]'::json)
      )::text`)) as Partial<Record<FixtureTable, string[]>>;
      for (const [table, discoveredIds] of Object.entries(discovered) as Array<[FixtureTable, string[]]>) {
        for (const id of discoveredIds) if (!has(table, id)) register(table, id);
      }
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         set local app.departure_calendar_projection = 'on';
         create temporary table e2e_departure_attempt_ids on commit drop as
           select invitation_delivery_attempt_id as id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})
           union select confirmation_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})
           union select response_reminder_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})
           union select appointment_reminder_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})
           union select move_confirmation_delivery_attempt_id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)});
         update public.departure_public_accesses set invitation_delivery_attempt_id=null,confirmation_delivery_attempt_id=null,response_reminder_delivery_attempt_id=null,appointment_reminder_delivery_attempt_id=null,move_confirmation_delivery_attempt_id=null where plan_id in (${idsSql(departurePlanIds)});
         delete from public.email_delivery_attempts where id in (select id from e2e_departure_attempt_ids where id is not null);
         delete from public.departure_commands where public_session_id in (
           select session.id from public.departure_public_sessions session
           join public.departure_public_accesses access on access.id=session.access_id
           where access.plan_id in (${idsSql(departurePlanIds)})
         );
         delete from public.departure_public_sessions where access_id in (
           select id from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)})
         );
         delete from public.departure_public_accesses where plan_id in (${idsSql(departurePlanIds)});
         delete from public.departure_events where plan_id in (${idsSql(departurePlanIds)});
         delete from public.departure_commands where target_id in (
           select id from public.departure_slots where plan_id in (${idsSql(departurePlanIds)})
           union select unnest(array[${idsSql(departurePlanIds)}])
         );
         delete from public.events where departure_slot_id in (
           select id from public.departure_slots where plan_id in (${idsSql(departurePlanIds)})
         );
         delete from public.departure_slots where plan_id in (${idsSql(departurePlanIds)});
         delete from public.departure_plan_litters where plan_id in (${idsSql(departurePlanIds)});
         delete from public.departure_plans where id in (${idsSql(departurePlanIds)});
         commit;`,
      );
    }
    const departureSlotIds = [...ids.get("departure_slots")!];
    if (departureSlotIds.length) {
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         set local app.departure_calendar_projection = 'on';
         delete from public.events where departure_slot_id in (${idsSql(departureSlotIds)});
         delete from public.departure_commands where public_session_id in (
           select session.id from public.departure_public_sessions session
           join public.departure_public_accesses access on access.id=session.access_id
           join public.departure_slots slot on slot.plan_id=access.plan_id and slot.reservation_id=access.reservation_id
           where slot.id in (${idsSql(departureSlotIds)})
         );
         delete from public.departure_public_sessions where access_id in (
           select access.id from public.departure_public_accesses access
           join public.departure_slots slot on slot.plan_id=access.plan_id and slot.reservation_id=access.reservation_id
           where slot.id in (${idsSql(departureSlotIds)})
         );
         delete from public.departure_public_accesses where exists(
           select 1 from public.departure_slots slot where slot.plan_id=departure_public_accesses.plan_id
             and slot.reservation_id=departure_public_accesses.reservation_id
             and slot.id in (${idsSql(departureSlotIds)})
         );
         commit;`,
      );
    }
    if (choiceSlotIds.length) {
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         delete from public.choice_appointment_sessions
         where slot_id in (${idsSql(choiceSlotIds)});
         delete from public.choice_appointment_accesses
         where slot_id in (${idsSql(choiceSlotIds)});
         update public.choice_appointment_slots
         set invitation_delivery_attempt_id=null,
             invitation_sent_at=null,
             reminder_due_at=null,
             reminder_delivery_attempt_id=null,
             reminder_sent_at=null
         where id in (${idsSql(choiceSlotIds)});
         delete from public.email_delivery_attempts
         where reservation_id in (
           select reservation_id from public.choice_appointment_slots
           where id in (${idsSql(choiceSlotIds)})
         ) and message_type in (
           'choice_appointment_adoption_booklet',
           'choice_assignment_confirmation'
         );
         delete from public.animal_assignment_commands command
         where command.result->>'assignmentEventId' in (
           select event.id::text from public.animal_assignment_events event
           where event.slot_id in (${idsSql(choiceSlotIds)})
         );
         update public.choice_appointment_slots
         set assignment_event_id = null
         where id in (${idsSql(choiceSlotIds)});
         delete from public.animal_assignment_events
         where slot_id in (${idsSql(choiceSlotIds)});
         delete from public.choice_appointment_events
         where slot_id in (${idsSql(choiceSlotIds)});
         delete from public.choice_appointment_commands
         where target_id in (${idsSql(choiceSlotIds)});
         delete from public.choice_appointment_ranked_preferences
         where slot_id in (${idsSql(choiceSlotIds)});
         commit;`,
      );
    }
    if (positionIds.length) {
      await execute(`update public.post_birth_positions set current_decision_id = null where id in (${idsSql(positionIds)})`);
    }
    if (directSaleIds.length) {
      await execute(`begin;
        set local session_replication_role = replica;
        update public.direct_late_sales set email_draft_id = null where id in (${idsSql(directSaleIds)});
        delete from public.direct_late_sale_commands where target_id in (${idsSql(directSaleIds)});
        delete from public.direct_late_sale_events where direct_sale_id in (${idsSql(directSaleIds)});
        delete from public.direct_late_sale_email_drafts where direct_sale_id in (${idsSql(directSaleIds)});
        delete from public.direct_late_sales where id in (${idsSql(directSaleIds)});
        commit;`);
    }
    if (reservationIds.length) {
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         update public.reservations
         set current_financial_resolution_event_id = null
         where id in (${idsSql(reservationIds)});
         delete from public.departure_signature_events where reservation_id in (${idsSql(reservationIds)});
         delete from public.document_signed_returns where document_id in (select id from public.documents where reservation_id in (${idsSql(reservationIds)}));
         delete from public.documents where reservation_id in (${idsSql(reservationIds)});
         delete from public.adoption_handover_events where reservation_id in (${idsSql(reservationIds)});
         delete from public.adopter_financial_resolution_events
         where reservation_id in (${idsSql(reservationIds)});
         delete from public.candidate_journey_events
         where reservation_id in (${idsSql(reservationIds)})
            or proposal_id in (
              select proposal.id
              from public.pre_reservation_proposals proposal
              where proposal.reservation_id in (${idsSql(reservationIds)})
            );
         delete from public.pre_reservation_proposals
         where reservation_id in (${idsSql(reservationIds)});
         delete from public.adopter_profile_questionnaire_sessions
         where instance_id in (
           select id from public.adopter_profile_questionnaire_instances
           where reservation_id in (${idsSql(reservationIds)})
         );
         delete from public.adopter_profile_questionnaire_accesses
         where instance_id in (
           select id from public.adopter_profile_questionnaire_instances
           where reservation_id in (${idsSql(reservationIds)})
         );
         delete from public.adopter_profile_questionnaire_events
         where reservation_id in (${idsSql(reservationIds)});
         delete from public.adopter_profile_questionnaire_commands
         where instance_id in (
           select id from public.adopter_profile_questionnaire_instances
           where reservation_id in (${idsSql(reservationIds)})
         );
         delete from public.adopter_profile_questionnaire_reconciliation_attempts
         where reservation_id in (${idsSql(reservationIds)});
         delete from public.adopter_profile_questionnaire_instances
         where reservation_id in (${idsSql(reservationIds)});
         delete from public.departure_commands where target_id in (${idsSql(reservationIds)});
         delete from public.payments
         where reservation_id in (${idsSql(reservationIds)});
         commit;`,
      );
    }
    if (contactIds.length) {
      await execute(
        `delete from public.contact_roles
         where contact_id in (${idsSql(contactIds)})`,
      );
    }
    for (const table of cleanupOrder) { const tableIds = [...ids.get(table)!]; if (tableIds.length) {
    if (table === "animals" || table === "organizations") continue;
    if (table === "departure_slots") {
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         set local app.departure_calendar_projection = 'on';
         delete from public.events where departure_slot_id in (${idsSql(tableIds)});
         delete from public.departure_slots where id in (${idsSql(tableIds)});
         commit;`,
      );
      continue;
    }
    if (table === "litter_care_tasks") {
      await execute(`delete from public.litter_care_task_schedule_changes where task_id in (${idsSql(tableIds)})`);
      await execute(`delete from public.litter_care_task_schedule_commands where task_id in (${idsSql(tableIds)})`);
    }
    if (table === "reproductive_cycles") {
      await execute(`update public.reproductive_cycles set litter_id = null where id in (${idsSql(tableIds)})`);
    }
    if (table === "adopter_financial_resolution_events") {
      await execute(
        `begin;
         set local app.qa_hard_delete = 'on';
         update public.reservations
         set current_financial_resolution_event_id = null
         where current_financial_resolution_event_id in (${idsSql(tableIds)});
         commit;`,
      );
    }
    if (table === "litters" && animalIds.length) await execute(`delete from public.animals where id in (${idsSql(animalIds)}) and litter_id is not null`);
    const statement = `delete from public.${table} where id in (${idsSql(tableIds)})`;
    const requiresAppendOnlyBypass =
      table === "direct_late_sale_commands"
      || table === "direct_late_sale_events"
      || table === "post_birth_positioning_commands"
      || table === "post_birth_positioning_events"
      || table === "post_birth_position_decisions"
      || table === "post_birth_capacity_revisions"
      || table === "litter_plan_actual_birth_reconciliation_task_changes"
      || table === "litter_plan_actual_birth_reconciliations"
      || table === "litter_plan_series_actual_birth_reconciliation_changes"
      || table === "litter_plan_series_actual_birth_reconciliation_commands"
      || table === "litter_plan_actual_birth_plan_reversal_changes"
      || table === "litter_plan_actual_birth_plan_reversals"
      || table === "litter_plan_actual_birth_activation_reversal_changes"
      || table === "litter_plan_actual_birth_activation_reversal_snapshots"
      || table === "whelping_birth_adjustment_commands"
      || table === "litter_plan_actual_birth_activation_deactivations"
      || table === "litter_plan_actual_birth_activations";
    const requiresPostAdoptionBypass =
      table === "animal_assignment_commands"
      || table === "departure_commands"
      || table === "departure_events"
      || table === "departure_signature_events"
      || table === "animal_assignment_events"
      || table === "choice_appointment_commands"
      || table === "choice_appointment_events"
      || table === "adopter_profile_questionnaire_sessions"
      || table === "adopter_profile_questionnaire_accesses"
      || table === "adopter_profile_questionnaire_events"
      || table === "adopter_profile_questionnaire_commands"
      || table === "candidate_journey_events"
      || table === "adopter_manual_contacts"
      || table === "adopter_financial_resolution_events"
      || table === "adoption_handover_events"
      || table === "post_adoption_questionnaire_public_sessions"
      || table === "post_adoption_questionnaire_public_accesses"
      || table === "post_adoption_questionnaire_reconciliation_run_results"
      || table === "post_adoption_questionnaire_reconciliation_attempts"
      || table === "post_adoption_questionnaire_reconciliation_runs"
      || table === "post_adoption_questionnaire_events"
      || table === "post_adoption_questionnaire_response_revisions";
    await execute(
      requiresPostAdoptionBypass
        ? `begin; set local app.qa_hard_delete = 'on'; ${statement}; commit;`
        : requiresAppendOnlyBypass
          ? `begin; set local session_replication_role = replica; set local app.fixture_cleanup = 'on'; ${statement}; commit;`
          : statement,
    );
  } }
    if (animalIds.length) await execute(`delete from public.animals where id in (${idsSql(animalIds)})`);
    const organizationIds = [...ids.get("organizations")!];
    if (organizationIds.length) await execute(`delete from public.organizations where id in (${idsSql(organizationIds)})`);
  };
  const assertEmpty = async () => {
    const remaining = await counts();
    const taskIds = [...ids.get("litter_care_tasks")!];
    const scheduleRemaining = taskIds.length === 0
      ? { schedule_changes: 0, schedule_commands: 0 }
      : {
          schedule_changes: Number(await execute(`select count(*)::text from public.litter_care_task_schedule_changes where task_id in (${idsSql(taskIds)})`)),
          schedule_commands: Number(await execute(`select count(*)::text from public.litter_care_task_schedule_commands where task_id in (${idsSql(taskIds)})`)),
        };
    const allRemaining = { ...remaining, ...scheduleRemaining };
    const dirty = Object.entries(allRemaining).filter(([, count]) => count !== 0);
    if (dirty.length) throw new Error(`E2E fixture cleanup left rows: ${dirty.map(([table, count]) => `${table}=${count}`).join(", ")}`);
    return allRemaining;
  };
  return { namespace, register, has, cleanup, assertEmpty, counts, cleanupOrder: [...cleanupOrder] };
}

export async function withE2eFixtures<T>(execute: SqlExecutor, scenario: (fixtures: ReturnType<typeof createE2eFixtureRegistry>) => Promise<T>, namespace?: string) {
  const fixtures = createE2eFixtureRegistry(execute, namespace);
  let scenarioError: unknown;
  try { return await scenario(fixtures); } catch (error) { scenarioError = error; throw error; } finally {
    try { await fixtures.cleanup(); await fixtures.assertEmpty(); } catch (cleanupError) {
      if (scenarioError instanceof Error) { (scenarioError as Error & { cleanupError?: unknown }).cleanupError = cleanupError; }
      else throw cleanupError;
    }
  }
}
