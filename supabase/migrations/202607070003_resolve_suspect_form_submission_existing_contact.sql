create or replace function public.resolve_suspect_form_submission_existing_contact(
  p_form_submission_id uuid,
  p_contact_id uuid
)
returns table (
  application_id uuid,
  contact_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.form_submissions%rowtype;
  v_contact public.contacts%rowtype;
  v_application_id uuid;
  v_desired_litter_group_id uuid;
  v_desired_litter_id uuid;
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

  if v_submission.status <> 'duplicate_suspected'
    or v_submission.duplicate_resolution <> 'pending_human_review'
  then
    raise exception 'Form submission is not pending duplicate review'
      using errcode = '23514';
  end if;

  if v_submission.application_id is not null then
    raise exception 'Form submission already has an application'
      using errcode = '23505';
  end if;

  if v_submission.contact_id is not null then
    raise exception 'Form submission already has a linked contact'
      using errcode = '23505';
  end if;

  select c.*
  into v_contact
  from public.contacts c
  where c.id = p_contact_id
    and c.organization_id = v_submission.organization_id
    and c.deleted_at is null;

  if not found then
    raise exception 'Target contact not found in current organization'
      using errcode = 'P0002';
  end if;

  select pf.litter_group_id, pf.litter_id
  into v_desired_litter_group_id, v_desired_litter_id
  from public.public_forms pf
  where pf.organization_id = v_submission.organization_id
    and pf.id = v_submission.public_form_id
    and pf.deleted_at is null;

  insert into public.applications (
    organization_id,
    contact_id,
    form_submission_id,
    species,
    breed,
    desired_litter_group_id,
    desired_litter_id,
    desired_sex_preference,
    project_description,
    form_data,
    status,
    submitted_at,
    reviewed_at,
    reviewed_by,
    created_by,
    updated_by
  )
  values (
    v_submission.organization_id,
    v_contact.id,
    v_submission.id,
    v_submission.species,
    v_submission.breed,
    v_desired_litter_group_id,
    v_desired_litter_id,
    v_submission.desired_sex_preference,
    v_submission.project_description,
    v_submission.raw_data,
    'to_review',
    v_submission.submitted_at,
    now(),
    v_user_id,
    v_user_id,
    v_user_id
  )
  returning id into v_application_id;

  insert into public.contact_roles (
    organization_id,
    contact_id,
    role,
    started_at,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_submission.organization_id,
    v_contact.id,
    'candidate',
    current_date,
    true,
    v_user_id,
    v_user_id
  )
  on conflict (organization_id, contact_id, role)
    where is_active and deleted_at is null
  do nothing;

  update public.contact_roles
  set
    is_active = false,
    ended_at = current_date,
    updated_at = now(),
    updated_by = v_user_id
  where organization_id = v_submission.organization_id
    and contact_id = v_contact.id
    and role in (
      'prospect',
      'pre_reservation_holder',
      'reservation_holder',
      'adopter',
      'former_adopter'
    )
    and is_active
    and deleted_at is null;

  update public.form_submissions
  set
    contact_id = v_contact.id,
    application_id = v_application_id,
    status = 'application_created',
    duplicate_resolution = 'resolved_existing_contact',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now(),
    updated_by = v_user_id
  where id = v_submission.id;

  return query
  select v_application_id, v_contact.id;
end;
$$;

revoke all on function public.resolve_suspect_form_submission_existing_contact(uuid, uuid)
  from public;

grant execute on function public.resolve_suspect_form_submission_existing_contact(uuid, uuid)
  to authenticated;
