create unique index if not exists applications_form_submission_id_unique_idx
  on public.applications (form_submission_id)
  where form_submission_id is not null;

create or replace function public.submit_public_application(
  p_organization_slug text,
  p_form_slug text,
  p_first_name text default null,
  p_last_name text default null,
  p_family_or_structure_name text default null,
  p_email text default null,
  p_phone text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_postal_code text default null,
  p_city text default null,
  p_country text default 'FR',
  p_desired_sex_preference text default 'unknown',
  p_project_description text default null,
  p_source_channel text default 'unknown',
  p_consent_data_processing boolean default false,
  p_consent_contact boolean default false,
  p_raw_data jsonb default '{}'::jsonb,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns table (
  status text,
  public_submission_reference uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_form public.public_forms%rowtype;
  v_submission_id uuid;
  v_public_submission_reference uuid;
  v_contact_id uuid;
  v_application_id uuid;
  v_candidate_contact_id uuid;
  v_email_matches uuid[];
  v_phone_matches uuid[];
  v_internal_status text;
  v_first_name text := nullif(btrim(p_first_name), '');
  v_last_name text := nullif(btrim(p_last_name), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_raw_phone text := nullif(btrim(p_phone), '');
  v_address_line1 text := nullif(btrim(p_address_line1), '');
  v_postal_code text := nullif(btrim(p_postal_code), '');
  v_city text := nullif(btrim(p_city), '');
  v_project_description text := nullif(btrim(p_project_description), '');
  v_display_name text;
begin
  if v_first_name is null
    or v_last_name is null
    or v_email is null
    or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or v_raw_phone is null
    or v_raw_phone !~ '^[+()0-9 .-]{8,25}$'
    or v_phone is null
    or length(v_phone) < 8
    or length(v_phone) > 25
    or v_address_line1 is null
    or v_postal_code is null
    or v_city is null
    or p_desired_sex_preference is null
    or p_desired_sex_preference not in (
      'male_only', 'female_only', 'male_preferred_female_possible',
      'female_preferred_male_possible'
    )
    or v_project_description is null
    or char_length(v_project_description) < 20
    or not coalesce(p_consent_data_processing, false)
    or not coalesce(p_consent_contact, false)
  then
    raise exception 'Invalid public application submission'
      using errcode = '23514';
  end if;

  if p_source_channel not in (
    'sms_link', 'email_link', 'facebook_link', 'instagram_link',
    'whatsapp_link', 'leboncoin_link', 'website', 'manual', 'other', 'unknown'
  ) then
    raise exception 'Invalid source_channel'
      using errcode = '23514';
  end if;

  select pf.*
  into v_form
  from public.public_forms pf
  join public.organizations o on o.id = pf.organization_id
  where o.slug = p_organization_slug
    and o.deleted_at is null
    and pf.slug = p_form_slug
    and pf.is_active
    and pf.deleted_at is null;

  if not found then
    raise exception 'Active public form not found'
      using errcode = 'P0002';
  end if;

  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'public_application:email:' || v_form.organization_id::text || ':' || v_email,
        0
      )
    );
  end if;

  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'public_application:phone:' || v_form.organization_id::text || ':' || v_phone,
        0
      )
    );
  end if;

  insert into public.form_submissions (
    organization_id,
    public_form_id,
    form_type,
    species,
    breed,
    first_name,
    last_name,
    family_or_structure_name,
    email,
    phone,
    address_line1,
    address_line2,
    postal_code,
    city,
    country,
    desired_sex_preference,
    project_description,
    raw_data,
    source_channel,
    ip_address,
    user_agent,
    consent_data_processing,
    consent_contact
  )
  values (
    v_form.organization_id,
    v_form.id,
    v_form.form_type,
    v_form.species,
    v_form.breed,
    nullif(btrim(p_first_name), ''),
    nullif(btrim(p_last_name), ''),
    nullif(btrim(p_family_or_structure_name), ''),
    v_email,
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_address_line1), ''),
    nullif(btrim(p_address_line2), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    coalesce(nullif(upper(btrim(p_country)), ''), 'FR'),
    p_desired_sex_preference,
    nullif(btrim(p_project_description), ''),
    coalesce(p_raw_data, '{}'::jsonb),
    p_source_channel,
    p_ip_address,
    p_user_agent,
    p_consent_data_processing,
    p_consent_contact
  )
  returning id, public_reference
  into v_submission_id, v_public_submission_reference;

  select array_agg(c.id order by c.created_at, c.id)
  into v_email_matches
  from public.contacts c
  where c.organization_id = v_form.organization_id
    and c.deleted_at is null
    and v_email is not null
    and lower(c.email) = v_email;

  select array_agg(c.id order by c.created_at, c.id)
  into v_phone_matches
  from public.contacts c
  where c.organization_id = v_form.organization_id
    and c.deleted_at is null
    and v_phone is not null
    and regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g') = v_phone;

  v_display_name := public.build_contact_display_name(
    p_first_name,
    p_last_name,
    p_family_or_structure_name,
    coalesce(v_email, p_phone, 'Contact sans nom')
  );

  if coalesce(cardinality(v_email_matches), 0) = 1
    and coalesce(cardinality(v_phone_matches), 0) = 1
    and v_email_matches[1] = v_phone_matches[1]
  then
    v_contact_id := v_email_matches[1];
    v_internal_status := 'matched_existing_contact';
  elsif coalesce(cardinality(v_email_matches), 0) = 0
    and coalesce(cardinality(v_phone_matches), 0) = 0
  then
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
      last_interaction_at
    )
    values (
      v_form.organization_id,
      nullif(btrim(p_first_name), ''),
      nullif(btrim(p_last_name), ''),
      nullif(btrim(p_family_or_structure_name), ''),
      v_display_name,
      v_email,
      nullif(btrim(p_phone), ''),
      nullif(btrim(p_address_line1), ''),
      nullif(btrim(p_address_line2), ''),
      nullif(btrim(p_postal_code), ''),
      nullif(btrim(p_city), ''),
      coalesce(nullif(upper(btrim(p_country)), ''), 'FR'),
      p_source_channel,
      'public_form:' || v_form.slug,
      now()
    )
    returning id into v_contact_id;

    v_internal_status := 'created_new_contact';
  else
    if coalesce(cardinality(v_email_matches), 0) = 1
      and coalesce(cardinality(v_phone_matches), 0) = 0
    then
      v_candidate_contact_id := v_email_matches[1];
    elsif coalesce(cardinality(v_phone_matches), 0) = 1
      and coalesce(cardinality(v_email_matches), 0) = 0
    then
      v_candidate_contact_id := v_phone_matches[1];
    end if;

    update public.form_submissions
    set
      duplicate_candidate_contact_id = v_candidate_contact_id,
      duplicate_resolution = 'pending_human_review',
      status = 'duplicate_suspected',
      updated_at = now()
    where id = v_submission_id;

    return query
    select 'accepted'::text, v_public_submission_reference;
    return;
  end if;

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
    source_channel,
    status,
    submitted_at
  )
  values (
    v_form.organization_id,
    v_contact_id,
    v_submission_id,
    v_form.species,
    v_form.breed,
    v_form.litter_group_id,
    v_form.litter_id,
    p_desired_sex_preference,
    nullif(btrim(p_project_description), ''),
    coalesce(p_raw_data, '{}'::jsonb),
    p_source_channel,
    'to_review',
    now()
  )
  returning id into v_application_id;

  insert into public.contact_roles (
    organization_id,
    contact_id,
    role,
    started_at,
    is_active
  )
  values (
    v_form.organization_id,
    v_contact_id,
    'candidate',
    current_date,
    true
  )
  on conflict (organization_id, contact_id, role)
    where is_active and deleted_at is null
  do nothing;

  update public.contact_roles
  set
    is_active = false,
    ended_at = current_date,
    updated_at = now()
  where organization_id = v_form.organization_id
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
    duplicate_resolution = v_internal_status,
    updated_at = now()
  where id = v_submission_id;

  return query
  select 'accepted'::text, v_public_submission_reference;
end;
$$;

revoke all on function public.submit_public_application(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, boolean, jsonb, inet, text
) from public;

grant execute on function public.submit_public_application(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, boolean, jsonb, inet, text
) to anon, authenticated;

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
#variable_conflict use_column
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
    v_contact.id,
    v_submission.id,
    v_submission.species,
    v_submission.breed,
    v_desired_litter_group_id,
    v_desired_litter_id,
    v_submission.desired_sex_preference,
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
#variable_conflict use_column
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
