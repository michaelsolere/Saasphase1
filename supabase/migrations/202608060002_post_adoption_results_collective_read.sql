-- POST-ADOPTION-RESULTS-COLLECTIVE-READ-01
-- Read-only, organization-scoped projection for one litter's collective T1/T2 results.
-- It returns only single-choice longitudinal answers; free text and contact data are excluded.

begin;

create or replace function public.read_post_adoption_questionnaire_collective_results(
  p_litter_id uuid
)
returns table (
  litter_id uuid,
  litter_name text,
  litter_date timestamptz,
  reservation_id uuid,
  reservation_litter_id uuid,
  animal_id uuid,
  animal_litter_id uuid,
  animal_name text,
  animal_birth_date date,
  animal_sex text,
  instance_id uuid,
  milestone text,
  questionnaire_code text,
  questionnaire_version integer,
  instance_status text,
  due_at timestamptz,
  response_deadline_at timestamptz,
  latest_revision_no integer,
  latest_submitted_at timestamptz,
  latest_structured_answers jsonb,
  definition jsonb,
  definition_valid boolean
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select
    selected_litter.id,
    selected_litter.name,
    coalesce(
      selected_litter.actual_birth_date::timestamp at time zone 'UTC',
      selected_litter.expected_birth_date::timestamp at time zone 'UTC',
      selected_litter.created_at
    ),
    reservation.id,
    reservation.litter_id,
    animal.id,
    animal.litter_id,
    coalesce(
      nullif(pg_catalog.btrim(animal.call_name), ''),
      nullif(pg_catalog.btrim(animal.official_name), ''),
      'Animal'
    ),
    animal.birth_date,
    animal.sex,
    instance.id,
    instance.milestone,
    instance.questionnaire_code,
    instance.questionnaire_version,
    instance.status,
    instance.due_at,
    instance.response_deadline_at,
    revision.revision_no,
    revision.submitted_at,
    case
      when revision.answers is null
        or pg_catalog.jsonb_typeof(revision.answers) <> 'object' then null
      else coalesce(structured.answers, '{}'::jsonb)
    end,
    definition.definition,
    case
      when instance.id is null then null
      else definition.code is not null
        and definition.milestone = instance.milestone
        and definition.definition->>'code' = instance.questionnaire_code
        and definition.definition->>'version' = instance.questionnaire_version::text
        and definition.definition->>'schemaVersion' = '1'
        and definition.definition->'rules'->>'noGlobalScore' = 'true'
        and (
          revision.revision_no is null
          or revision.definition_sha256 = definition.definition_sha256
        )
    end
  from public.reservations reservation
  join public.animals animal
    on animal.organization_id = reservation.organization_id
   and animal.id = reservation.animal_id
   and animal.deleted_at is null
  join public.litters selected_litter
    on selected_litter.organization_id = reservation.organization_id
   and selected_litter.id = coalesce(reservation.litter_id, animal.litter_id)
  left join public.post_adoption_questionnaire_instances instance
    on instance.organization_id = reservation.organization_id
   and instance.reservation_id = reservation.id
   and instance.animal_id = animal.id
  left join public.post_adoption_questionnaire_definitions definition
    on definition.code = instance.questionnaire_code
   and definition.version = instance.questionnaire_version
  left join lateral (
    select
      candidate.revision_no,
      candidate.submitted_at,
      candidate.answers,
      candidate.definition_sha256
    from public.post_adoption_questionnaire_response_revisions candidate
    where candidate.organization_id = instance.organization_id
      and candidate.instance_id = instance.id
    order by candidate.revision_no desc
    limit 1
  ) revision on true
  left join lateral (
    select pg_catalog.jsonb_object_agg(
      answer.key,
      case
        when pg_catalog.jsonb_typeof(answer.value) = 'string'
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(axis_question.question->'options') = 'array'
                  then axis_question.question->'options'
                else '[]'::jsonb
              end
            ) option
            where option->>'value' = answer.value #>> '{}'
          )
          then answer.value
        else '"__invalid__"'::jsonb
      end
    ) as answers
    from pg_catalog.jsonb_each(
      case
        when pg_catalog.jsonb_typeof(revision.answers) = 'object' then revision.answers
        else '{}'::jsonb
      end
    ) answer
    join lateral (
      select question
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(definition.definition->'questions') = 'array'
            then definition.definition->'questions'
          else '[]'::jsonb
        end
      ) question
      where question->>'type' = 'single_choice'
        and question ? 'longitudinalAxis'
        and question->>'key' = answer.key
      limit 1
    ) axis_question on true
  ) structured on revision.answers is not null
  where p_litter_id is not null
    and auth.uid() is not null
    and selected_litter.id = p_litter_id
    and reservation.status = 'adopted'
    and reservation.adoption_completed_at is not null
    and reservation.deleted_at is null
    and selected_litter.deleted_at is null
    and exists (
      select 1
      from public.memberships membership
      where membership.organization_id = reservation.organization_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
        and membership.deleted_at is null
    )
  order by
    animal.call_name nulls last,
    animal.id,
    instance.milestone nulls last;
$function$;

revoke execute on function public.read_post_adoption_questionnaire_collective_results(uuid)
  from public, anon;
grant execute on function public.read_post_adoption_questionnaire_collective_results(uuid)
  to authenticated;

commit;
