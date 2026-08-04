import {
  type SqlExecutor,
  createE2eFixtureRegistry,
} from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const uuidList = (values: readonly string[]) =>
  values.map((value) => `${q(value)}::uuid`).join(", ");

export async function registerPostAdoptionQuestionnaireEffects(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    reservationIds: readonly string[];
    clientCommandIds?: readonly string[];
  },
) {
  const commandFilter = input.clientCommandIds?.length
    ? `client_command_id in (${uuidList(input.clientCommandIds)})`
    : "false";
  const rows = JSON.parse(
    await execute(`
      select json_build_object(
        'post_adoption_questionnaire_reconciliation_run_results', coalesce((
          select json_agg(result.id)
          from public.post_adoption_questionnaire_reconciliation_run_results result
          join public.post_adoption_questionnaire_reconciliation_runs run
            on run.organization_id = result.organization_id
           and run.id = result.run_id
          where ${commandFilter}
        ), '[]'::json),
        'post_adoption_questionnaire_reconciliation_attempts', coalesce((
          select json_agg(attempt.id)
          from public.post_adoption_questionnaire_reconciliation_attempts attempt
          left join public.post_adoption_questionnaire_reconciliation_runs run
            on run.organization_id = attempt.organization_id
           and run.id = attempt.run_id
          where attempt.reservation_id in (${uuidList(input.reservationIds)})
             or ${commandFilter}
        ), '[]'::json),
        'post_adoption_questionnaire_reconciliation_runs', coalesce((
          select json_agg(run.id)
          from public.post_adoption_questionnaire_reconciliation_runs run
          where ${commandFilter}
        ), '[]'::json),
        'post_adoption_questionnaire_events', coalesce((
          select json_agg(event.id)
          from public.post_adoption_questionnaire_events event
          join public.post_adoption_questionnaire_instances instance
            on instance.organization_id = event.organization_id
           and instance.id = event.instance_id
          where instance.reservation_id in (${uuidList(input.reservationIds)})
        ), '[]'::json),
        'post_adoption_questionnaire_response_revisions', coalesce((
          select json_agg(revision.id)
          from public.post_adoption_questionnaire_response_revisions revision
          join public.post_adoption_questionnaire_instances instance
            on instance.organization_id = revision.organization_id
           and instance.id = revision.instance_id
          where instance.reservation_id in (${uuidList(input.reservationIds)})
        ), '[]'::json),
        'post_adoption_questionnaire_drafts', coalesce((
          select json_agg(draft.id)
          from public.post_adoption_questionnaire_drafts draft
          join public.post_adoption_questionnaire_instances instance
            on instance.organization_id = draft.organization_id
           and instance.id = draft.instance_id
          where instance.reservation_id in (${uuidList(input.reservationIds)})
        ), '[]'::json),
        'post_adoption_questionnaire_instances', coalesce((
          select json_agg(instance.id)
          from public.post_adoption_questionnaire_instances instance
          where instance.reservation_id in (${uuidList(input.reservationIds)})
        ), '[]'::json)
      )::text
    `),
  ) as Record<
    | "post_adoption_questionnaire_reconciliation_run_results"
    | "post_adoption_questionnaire_reconciliation_attempts"
    | "post_adoption_questionnaire_reconciliation_runs"
    | "post_adoption_questionnaire_events"
    | "post_adoption_questionnaire_response_revisions"
    | "post_adoption_questionnaire_drafts"
    | "post_adoption_questionnaire_instances",
    string[]
  >;

  for (const [table, ids] of Object.entries(rows)) {
    for (const id of ids) {
      if (!registry.has(table as keyof typeof rows, id)) {
        registry.register(table as keyof typeof rows, id);
      }
    }
  }

  return rows;
}
