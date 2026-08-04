-- POST-ADOPTION-RESULTS-INTERNAL-READ-01
-- Read-only, organization-scoped contracts for the internal post-adoption results area.
--
-- Inputs:
--   list_post_adoption_questionnaire_results_overview(p_litter_id)
--     p_litter_id is optional; null lists every adopted-animal row visible to the caller.
--   read_post_adoption_questionnaire_individual_results(p_animal_id)
--     p_animal_id is required and limits detailed answers to one animal.
--
-- Identity and organization control:
--   both SECURITY DEFINER functions require auth.uid() to be an active, non-deleted
--   member of the row's organization. row_security is disabled only inside these
--   allowlisted projections so the membership predicate is the authorization boundary.
--
-- Outputs and privacy:
--   the overview exposes litter, animal, journey and questionnaire state only.
--   the individual contract additionally exposes the frozen definition and latest
--   immutable answers for the requested animal. Neither contract joins contacts or
--   returns family names, email addresses, phone numbers or postal addresses.
--
-- Linkage drift:
--   reservation_litter_id and animal_litter_id are returned separately. The caller
--   must surface a mismatch as "rattachement à vérifier" and must not infer equality.
--
-- Privileges and mutation:
--   authenticated receives EXECUTE only. anon and public do not. Both functions are
--   stable SQL SELECT statements and perform no mutation.

begin;

create or replace function public.list_post_adoption_questionnaire_results_overview(
  p_litter_id uuid default null
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
      when instance.id is null then null
      else definition.code is not null
        and definition.milestone = instance.milestone
        and definition.definition->>'code' = instance.questionnaire_code
        and (definition.definition->>'version')::integer = instance.questionnaire_version
        and definition.definition->>'schemaVersion' = '1'
        and definition.definition->'rules'->>'noGlobalScore' = 'true'
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
    select candidate.revision_no, candidate.submitted_at
    from public.post_adoption_questionnaire_response_revisions candidate
    where candidate.organization_id = instance.organization_id
      and candidate.instance_id = instance.id
    order by candidate.revision_no desc
    limit 1
  ) revision on true
  where auth.uid() is not null
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
    and (p_litter_id is null or selected_litter.id = p_litter_id)
  order by
    coalesce(
      selected_litter.actual_birth_date::timestamp at time zone 'UTC',
      selected_litter.expected_birth_date::timestamp at time zone 'UTC',
      selected_litter.created_at
    ) desc,
    selected_litter.id,
    animal.call_name nulls last,
    animal.id,
    instance.milestone nulls last;
$function$;

create or replace function public.read_post_adoption_questionnaire_individual_results(
  p_animal_id uuid
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
  latest_answers jsonb,
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
    revision.answers,
    definition.definition,
    case
      when instance.id is null then null
      else definition.code is not null
        and definition.milestone = instance.milestone
        and definition.definition->>'code' = instance.questionnaire_code
        and (definition.definition->>'version')::integer = instance.questionnaire_version
        and definition.definition->>'schemaVersion' = '1'
        and definition.definition->'rules'->>'noGlobalScore' = 'true'
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
    select candidate.revision_no, candidate.submitted_at, candidate.answers
    from public.post_adoption_questionnaire_response_revisions candidate
    where candidate.organization_id = instance.organization_id
      and candidate.instance_id = instance.id
    order by candidate.revision_no desc
    limit 1
  ) revision on true
  where p_animal_id is not null
    and auth.uid() is not null
    and animal.id = p_animal_id
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
  order by reservation.adoption_completed_at desc, reservation.id, instance.milestone nulls last;
$function$;

revoke execute on function public.list_post_adoption_questionnaire_results_overview(uuid)
  from public, anon;
revoke execute on function public.read_post_adoption_questionnaire_individual_results(uuid)
  from public, anon;
grant execute on function public.list_post_adoption_questionnaire_results_overview(uuid)
  to authenticated;
grant execute on function public.read_post_adoption_questionnaire_individual_results(uuid)
  to authenticated;

commit;
