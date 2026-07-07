alter table public.applications
  add column if not exists source_channel text;

alter table public.applications
  drop constraint if exists applications_source_channel_check;

alter table public.applications
  add constraint applications_source_channel_check
    check (
      source_channel is null
      or source_channel in (
        'sms_link', 'email_link', 'facebook_link', 'instagram_link',
        'whatsapp_link', 'leboncoin_link', 'website', 'manual', 'other', 'unknown'
      )
    );

create or replace function public.resolve_suspect_form_submission_new_contact(
  p_form_submission_id uuid
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
  v_form public.public_forms%rowtype;
  v_contact_id uuid;
  v_application_id uuid;
  v_display_name text;
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

  if v_submission.contact_id is not null then
    raise exception 'Form submission already has a linked contact'
      using errcode = '23505';
  end if;

  if v_submission.application_id is not null then
    raise exception 'Form submission already has an application'
      using errcode = '23505';
  end if;

  select pf.*
  into v_form
  from public.public_forms pf
  where pf.organization_id = v_submission.organization_id
    and pf.id = v_submission.public_form_id
    and pf.deleted_at is null;

  if not found then
    raise exception 'Public form not found for submission'
      using errcode = 'P0002';
  end if;

  v_display_name := public.build_contact_display_name(
    v_submission.first_name,
    v_submission.last_name,
    v_submission.family_or_structure_name,
    coalesce(v_submission.email, v_submission.phone, 'Contact sans nom')
  );

  insert into public.contacts (
    organization_id,
    first_name,
    last_name,
    family_or_structure_name,
    display_name,
    email,
    phone,
    address_line1,
    address_line2,
    postal_code,
    city,
    country,
    origin_channel,
    origin_details,
    last_interaction_at,
    created_by,
    updated_by
  )
  values (
    v_submission.organization_id,
    nullif(btrim(v_submission.first_name), ''),
    nullif(btrim(v_submission.last_name), ''),
    nullif(btrim(v_submission.family_or_structure_name), ''),
    v_display_name,
    lower(nullif(btrim(v_submission.email), '')),
    nullif(btrim(v_submission.phone), ''),
    nullif(btrim(v_submission.address_line1), ''),
    nullif(btrim(v_submission.address_line2), ''),
    nullif(btrim(v_submission.postal_code), ''),
    nullif(btrim(v_submission.city), ''),
    coalesce(nullif(upper(btrim(v_submission.country)), ''), 'FR'),
    v_submission.source_channel,
    'public_form:' || v_form.slug || ':suspect_resolution',
    coalesce(v_submission.submitted_at, now()),
    v_user_id,
    v_user_id
  )
  returning id into v_contact_id;

  insert into public.applications (
    organization_id,
    contact_id,
    form_submission_id,
    species,
    breed,
    desired_litter_group_id,
    desired_litter_id,
    desired_sex_preference,
    desired_quantity,
    project_description,
    form_data,
    source_channel,
    status,
    submitted_at,
    reviewed_at,
    reviewed_by,
    created_by,
    updated_by
  )
  values (
    v_submission.organization_id,
    v_contact_id,
    v_submission.id,
    v_submission.species,
    v_submission.breed,
    v_form.litter_group_id,
    v_form.litter_id,
    v_submission.desired_sex_preference,
    1,
    v_submission.project_description,
    v_submission.raw_data,
    v_submission.source_channel,
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
    v_contact_id,
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
    and contact_id = v_contact_id
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
    contact_id = v_contact_id,
    application_id = v_application_id,
    status = 'application_created',
    duplicate_resolution = 'created_new_contact',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now(),
    updated_by = v_user_id
  where id = v_submission.id;

  return query
  select v_application_id, v_contact_id;
end;
$$;

revoke all on function public.resolve_suspect_form_submission_new_contact(uuid)
  from public;

grant execute on function public.resolve_suspect_form_submission_new_contact(uuid)
  to authenticated;
