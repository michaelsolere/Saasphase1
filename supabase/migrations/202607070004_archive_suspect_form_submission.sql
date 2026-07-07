create or replace function public.archive_suspect_form_submission_without_application(
  p_form_submission_id uuid,
  p_internal_comment text default null
)
returns table (
  form_submission_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.form_submissions%rowtype;
  v_internal_comment text := nullif(btrim(p_internal_comment), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  select fs.*
  into v_submission
  from public.form_submissions fs
  where fs.id = p_form_submission_id
    and fs.deleted_at is null
  for update;

  if not found then
    raise exception 'Form submission not found'
      using errcode = 'P0002';
  end if;

  if not public.has_organization_role(
    v_submission.organization_id,
    array['owner', 'admin', 'member']
  ) then
    raise exception 'Form submission is outside current organization'
      using errcode = '42501';
  end if;

  if v_submission.application_id is not null then
    raise exception 'Form submission already has an application'
      using errcode = '23505';
  end if;

  if v_submission.status <> 'duplicate_suspected'
    and coalesce(v_submission.duplicate_resolution, '') <> 'pending_human_review'
  then
    raise exception 'Form submission is not pending duplicate review'
      using errcode = '23514';
  end if;

  update public.form_submissions
  set
    status = 'archived',
    duplicate_resolution = 'archived',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    internal_comment = coalesce(v_internal_comment, internal_comment),
    updated_at = now(),
    updated_by = v_user_id
  where id = v_submission.id;

  return query
  select v_submission.id;
end;
$$;

revoke all on function public.archive_suspect_form_submission_without_application(uuid, text)
  from public;

grant execute on function public.archive_suspect_form_submission_without_application(uuid, text)
  to authenticated;
