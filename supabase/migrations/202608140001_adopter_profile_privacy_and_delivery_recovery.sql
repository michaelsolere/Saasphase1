-- Late-audit corrective migration for PROFILE-REVIEW-01.
-- Detailed family answers are restricted to owner/admin. Other internal roles
-- receive only the milestone state and dates through a narrow projection.

begin;

alter table public.email_delivery_attempts
  add column if not exists provider_call_started_at timestamptz;

drop policy if exists adopter_profile_instances_read
  on public.adopter_profile_questionnaire_instances;
create policy adopter_profile_instances_read
  on public.adopter_profile_questionnaire_instances
  for select to authenticated
  using (
    public.has_organization_role(organization_id, array['owner', 'admin'])
  );

drop policy if exists adopter_profile_events_read
  on public.adopter_profile_questionnaire_events;
create policy adopter_profile_events_read
  on public.adopter_profile_questionnaire_events
  for select to authenticated
  using (
    public.has_organization_role(organization_id, array['owner', 'admin'])
  );

create or replace function public.read_adopter_profile_questionnaire_summaries(
  p_reservation_ids uuid[] default null
)
returns table (
  instance_id uuid,
  reservation_id uuid,
  created_at timestamptz,
  due_at timestamptz,
  draft_updated_at timestamptz,
  final_submitted_at timestamptz,
  reviewed_at timestamptz,
  waived_at timestamptz,
  invitation_delivery_attempt_id uuid,
  invitation_last_failed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    instance.id,
    instance.reservation_id,
    instance.created_at,
    instance.due_at,
    instance.draft_updated_at,
    instance.final_submitted_at,
    instance.reviewed_at,
    instance.waived_at,
    instance.invitation_delivery_attempt_id,
    instance.invitation_last_failed_at
  from public.adopter_profile_questionnaire_instances instance
  where public.has_organization_role(
    instance.organization_id,
    array['owner', 'admin', 'member', 'viewer']
  )
    and (
      p_reservation_ids is null
      or instance.reservation_id = any(p_reservation_ids)
    );
$$;

revoke all on function public.read_adopter_profile_questionnaire_summaries(uuid[]) from public;
revoke all on function public.read_adopter_profile_questionnaire_summaries(uuid[]) from anon;
grant execute on function public.read_adopter_profile_questionnaire_summaries(uuid[]) to authenticated;
grant execute on function public.read_adopter_profile_questionnaire_summaries(uuid[]) to service_role;

commit;
