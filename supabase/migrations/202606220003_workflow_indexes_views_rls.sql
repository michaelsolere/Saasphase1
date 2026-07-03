do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'litter_groups', 'animals', 'litters', 'public_forms', 'contacts',
    'form_submissions', 'contact_roles', 'applications', 'reservations',
    'document_templates', 'payments', 'credits', 'credit_usages',
    'documents', 'media', 'notes', 'events'
  ]
  loop
    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      table_name || '_organization_id_idx',
      table_name
    );
  end loop;
end;
$$;

create index contacts_email_lower_idx
  on public.contacts (organization_id, lower(email))
  where email is not null and deleted_at is null;
create index contacts_phone_idx
  on public.contacts (organization_id, phone)
  where phone is not null and deleted_at is null;
create index contacts_phone_normalized_idx
  on public.contacts (
    organization_id,
    regexp_replace(phone, '[^0-9+]', '', 'g')
  )
  where phone is not null and deleted_at is null;

create index form_submissions_public_form_id_idx
  on public.form_submissions (public_form_id);
create index form_submissions_contact_id_idx
  on public.form_submissions (contact_id);
create index form_submissions_application_id_idx
  on public.form_submissions (application_id);
create index form_submissions_status_idx
  on public.form_submissions (organization_id, status);

create index contact_roles_contact_id_idx
  on public.contact_roles (contact_id);
create index applications_contact_id_idx
  on public.applications (contact_id);
create index applications_form_submission_id_idx
  on public.applications (form_submission_id);
create index applications_status_idx
  on public.applications (organization_id, status);
create index applications_desired_litter_group_id_idx
  on public.applications (desired_litter_group_id);
create index applications_desired_litter_id_idx
  on public.applications (desired_litter_id);

create index reservations_contact_id_idx
  on public.reservations (contact_id);
create index reservations_application_id_idx
  on public.reservations (application_id);
create index reservations_litter_group_id_idx
  on public.reservations (litter_group_id);
create index reservations_litter_id_idx
  on public.reservations (litter_id);
create index reservations_animal_id_idx
  on public.reservations (animal_id);
create index reservations_status_idx
  on public.reservations (organization_id, status);

create index litter_groups_status_idx
  on public.litter_groups (organization_id, status);
create index litters_litter_group_id_idx
  on public.litters (litter_group_id);
create index litters_status_idx
  on public.litters (organization_id, status);
create index animals_litter_id_idx
  on public.animals (litter_id);
create index animals_father_id_idx
  on public.animals (father_id);
create index animals_mother_id_idx
  on public.animals (mother_id);
create index animals_status_idx
  on public.animals (organization_id, status);

create index payments_contact_id_idx
  on public.payments (contact_id);
create index payments_reservation_id_idx
  on public.payments (reservation_id);
create index payments_status_idx
  on public.payments (organization_id, status);
create index credits_contact_id_idx
  on public.credits (contact_id);
create index credits_status_idx
  on public.credits (organization_id, status);
create index credit_usages_credit_id_idx
  on public.credit_usages (credit_id);

create index documents_contact_id_idx
  on public.documents (contact_id);
create index documents_application_id_idx
  on public.documents (application_id);
create index documents_reservation_id_idx
  on public.documents (reservation_id);
create index documents_litter_id_idx
  on public.documents (litter_id);
create index documents_animal_id_idx
  on public.documents (animal_id);
create index documents_payment_id_idx
  on public.documents (payment_id);
create index documents_status_idx
  on public.documents (organization_id, status);

create index media_contact_id_idx
  on public.media (contact_id);
create index media_reservation_id_idx
  on public.media (reservation_id);
create index media_litter_id_idx
  on public.media (litter_id);
create index media_animal_id_idx
  on public.media (animal_id);

create index notes_contact_id_idx
  on public.notes (contact_id);
create index notes_application_id_idx
  on public.notes (application_id);
create index notes_reservation_id_idx
  on public.notes (reservation_id);
create index notes_litter_id_idx
  on public.notes (litter_id);
create index notes_animal_id_idx
  on public.notes (animal_id);
create index notes_payment_id_idx
  on public.notes (payment_id);
create index notes_document_id_idx
  on public.notes (document_id);

create index events_contact_id_idx
  on public.events (contact_id);
create index events_application_id_idx
  on public.events (application_id);
create index events_reservation_id_idx
  on public.events (reservation_id);
create index events_litter_id_idx
  on public.events (litter_id);
create index events_animal_id_idx
  on public.events (animal_id);
create index events_payment_id_idx
  on public.events (payment_id);
create index events_document_id_idx
  on public.events (document_id);
create index events_status_idx
  on public.events (organization_id, status);
create index events_planned_at_idx
  on public.events (organization_id, planned_at);
create index events_planned_date_idx
  on public.events (organization_id, planned_date);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'litter_groups', 'animals', 'litters', 'public_forms', 'contacts',
    'form_submissions', 'contact_roles', 'applications', 'reservations',
    'document_templates', 'payments', 'credits', 'credit_usages',
    'documents', 'media', 'notes', 'events'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.build_contact_display_name(
  first_name text,
  last_name text,
  family_or_structure_name text,
  fallback text default 'Contact sans nom'
)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      concat_ws(
        ' — ',
        nullif(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), '')), ''),
        nullif(btrim(family_or_structure_name), '')
      ),
      ''
    ),
    nullif(btrim(fallback), ''),
    'Contact sans nom'
  );
$$;

create or replace function public.fill_contact_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_name is null or btrim(new.display_name) = '' then
    new.display_name := public.build_contact_display_name(
      new.first_name,
      new.last_name,
      new.family_or_structure_name,
      coalesce(new.email, new.phone, 'Contact sans nom')
    );
  end if;
  return new;
end;
$$;

create trigger contacts_fill_display_name
before insert or update of display_name on public.contacts
for each row execute function public.fill_contact_display_name();

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

create or replace view public.public_form_public_view
with (security_barrier = true)
as
select
  pf.slug,
  pf.title,
  pf.description,
  pf.species,
  pf.breed,
  pf.success_message
from public.public_forms pf
join public.organizations o
  on o.id = pf.organization_id
where pf.is_active
  and pf.deleted_at is null
  and o.deleted_at is null;

create or replace view public.contact_overview
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.display_name,
  c.email,
  c.phone,
  coalesce(r.active_roles, '{}'::text[]) as active_roles,
  c.last_interaction_at,
  coalesce(a.application_count, 0) as application_count,
  coalesce(rv.reservation_count, 0) as reservation_count,
  c.created_at,
  c.updated_at
from public.contacts c
left join lateral (
  select array_agg(cr.role order by cr.role) as active_roles
  from public.contact_roles cr
  where cr.contact_id = c.id
    and cr.organization_id = c.organization_id
    and cr.is_active
    and cr.deleted_at is null
) r on true
left join lateral (
  select count(*)::integer as application_count
  from public.applications app
  where app.contact_id = c.id
    and app.organization_id = c.organization_id
    and app.deleted_at is null
) a on true
left join lateral (
  select count(*)::integer as reservation_count
  from public.reservations res
  where res.contact_id = c.id
    and res.organization_id = c.organization_id
    and res.deleted_at is null
) rv on true
where c.deleted_at is null;

create or replace view public.application_overview
with (security_invoker = true)
as
select
  a.id,
  a.organization_id,
  a.contact_id,
  c.display_name as contact_display_name,
  c.email as contact_email,
  c.phone as contact_phone,
  a.species,
  a.breed,
  a.desired_sex_preference,
  a.project_description,
  a.status,
  pf.id as public_form_id,
  pf.name as public_form_name,
  pf.slug as public_form_slug,
  coalesce(a.submitted_at, fs.submitted_at, a.created_at) as submitted_at,
  a.reviewed_at,
  case
    when a.reviewed_at is not null then 'reviewed'
    else 'to_review'
  end as review_status,
  a.initial_rank,
  a.active_rank,
  a.created_at,
  a.updated_at
from public.applications a
join public.contacts c
  on c.id = a.contact_id
  and c.organization_id = a.organization_id
left join public.form_submissions fs
  on fs.id = a.form_submission_id
  and fs.organization_id = a.organization_id
left join public.public_forms pf
  on pf.id = fs.public_form_id
  and pf.organization_id = a.organization_id
where a.deleted_at is null
  and c.deleted_at is null;

create or replace view public.reservation_overview
with (security_invoker = true)
as
select
  r.id,
  r.organization_id,
  r.contact_id,
  c.display_name as contact_display_name,
  r.application_id,
  r.litter_group_id,
  lg.name as litter_group_name,
  r.litter_id,
  l.name as litter_name,
  r.animal_id,
  an.display_name as animal_display_name,
  r.reserved_sex_preference,
  r.rank_initial,
  r.rank_active,
  r.status,
  r.price_cents,
  r.currency,
  coalesce(p.paid_cents, 0) as paid_cents,
  coalesce(p.refunded_cents, 0) as refunded_cents,
  r.adoption_planned_at,
  r.adoption_completed_at,
  r.created_at,
  r.updated_at
from public.reservations r
join public.contacts c
  on c.id = r.contact_id
  and c.organization_id = r.organization_id
left join public.litter_groups lg
  on lg.id = r.litter_group_id
  and lg.organization_id = r.organization_id
left join public.litters l
  on l.id = r.litter_id
  and l.organization_id = r.organization_id
left join public.animals an
  on an.id = r.animal_id
  and an.organization_id = r.organization_id
left join lateral (
  select
    coalesce(sum(pay.amount_cents) filter (
      where pay.payment_type not in ('refund', 'partial_refund')
        and pay.status in (
          'partially_paid', 'paid', 'partially_refunded',
          'converted_to_credit', 'transferred'
        )
    ), 0)::bigint as paid_cents,
    coalesce(sum(pay.amount_cents) filter (
      where pay.payment_type in ('refund', 'partial_refund')
        and pay.status in ('paid', 'partially_refunded', 'refunded')
    ), 0)::bigint as refunded_cents
  from public.payments pay
  where pay.reservation_id = r.id
    and pay.organization_id = r.organization_id
    and pay.deleted_at is null
) p on true
where r.deleted_at is null
  and c.deleted_at is null;

create or replace view public.litter_overview
with (security_invoker = true)
as
select
  l.id,
  l.organization_id,
  l.litter_group_id,
  lg.name as litter_group_name,
  l.name,
  l.species,
  l.breed,
  l.status,
  l.mother_id,
  mother.display_name as mother_display_name,
  l.father_id,
  father.display_name as father_display_name,
  l.expected_birth_date,
  l.actual_birth_date,
  l.expected_puppy_count,
  l.born_total_count,
  l.born_male_count,
  l.born_female_count,
  l.alive_count,
  coalesce(a.animal_count, 0) as animal_count,
  coalesce(r.reservation_count, 0) as reservation_count,
  l.created_at,
  l.updated_at
from public.litters l
left join public.litter_groups lg
  on lg.id = l.litter_group_id
  and lg.organization_id = l.organization_id
left join public.animals mother
  on mother.id = l.mother_id
  and mother.organization_id = l.organization_id
left join public.animals father
  on father.id = l.father_id
  and father.organization_id = l.organization_id
left join lateral (
  select count(*)::integer as animal_count
  from public.animals animal
  where animal.litter_id = l.id
    and animal.organization_id = l.organization_id
    and animal.deleted_at is null
) a on true
left join lateral (
  select count(*)::integer as reservation_count
  from public.reservations reservation
  where reservation.litter_id = l.id
    and reservation.organization_id = l.organization_id
    and reservation.deleted_at is null
) r on true
where l.deleted_at is null;

create or replace function public.is_member_of(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

create or replace function public.has_organization_role(
  org_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Organization name is required'
      using errcode = '23514';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug'
      using errcode = '23514';
  end if;

  insert into public.profiles (id, display_name, email, phone)
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name'),
    u.email,
    u.phone
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do nothing;

  insert into public.organizations (name, slug)
  values (btrim(p_name), p_slug)
  returning id into v_organization_id;

  insert into public.memberships (
    organization_id,
    profile_id,
    role,
    status,
    created_by,
    updated_by
  )
  values (
    v_organization_id,
    v_user_id,
    'owner',
    'active',
    v_user_id,
    v_user_id
  );

  insert into public.organization_settings (
    organization_id,
    created_by,
    updated_by
  )
  values (
    v_organization_id,
    v_user_id,
    v_user_id
  );

  return v_organization_id;
end;
$$;

create or replace function public.shares_organization_with(other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = other_profile_id
      and mine.status = 'active'
      and theirs.status = 'active'
      and mine.deleted_at is null
      and theirs.deleted_at is null
  );
$$;

create or replace function public.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_other_active_owner_exists boolean;
begin
  if tg_op = 'UPDATE'
    and (
      new.organization_id <> old.organization_id
      or new.profile_id <> old.profile_id
    )
  then
    raise exception 'Membership organization and profile are immutable'
      using errcode = '23514';
  end if;

  if old.role = 'owner'
    and not public.has_organization_role(old.organization_id, array['owner'])
  then
    raise exception 'Only an owner can modify an owner membership'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'owner'
    and old.role <> 'owner'
    and not public.has_organization_role(old.organization_id, array['owner'])
  then
    raise exception 'Only an owner can promote another owner'
      using errcode = '42501';
  end if;

  if old.role = 'owner'
    and old.status = 'active'
    and old.deleted_at is null
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.status <> 'active'
      or new.deleted_at is not null
    )
  then
    select exists (
      select 1
      from public.memberships m
      where m.organization_id = old.organization_id
        and m.id <> old.id
        and m.role = 'owner'
        and m.status = 'active'
        and m.deleted_at is null
    )
    into v_other_active_owner_exists;

    if not v_other_active_owner_exists then
      raise exception 'An organization must retain at least one active owner'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger memberships_protect_owner
before update or delete on public.memberships
for each row execute function public.protect_owner_membership();

revoke all on function public.protect_owner_membership() from public;

create or replace function public.use_credit(
  p_organization_id uuid,
  p_credit_id uuid,
  p_amount_used_cents integer,
  p_target_reservation_id uuid default null,
  p_target_payment_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.credits%rowtype;
  v_reservation public.reservations%rowtype;
  v_payment public.payments%rowtype;
  v_usage_id uuid;
begin
  if not public.has_organization_role(
    p_organization_id,
    array['owner', 'admin', 'member']
  ) then
    raise exception 'Insufficient organization permissions'
      using errcode = '42501';
  end if;

  if p_amount_used_cents is null or p_amount_used_cents <= 0 then
    raise exception 'Credit usage amount must be positive'
      using errcode = '23514';
  end if;

  if p_target_reservation_id is null and p_target_payment_id is null then
    raise exception 'A target reservation or payment is required'
      using errcode = '23514';
  end if;

  select c.*
  into v_credit
  from public.credits c
  where c.organization_id = p_organization_id
    and c.id = p_credit_id
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'Credit not found'
      using errcode = 'P0002';
  end if;

  if v_credit.status not in ('active', 'partially_used') then
    raise exception 'Credit is not usable'
      using errcode = '23514';
  end if;

  if p_amount_used_cents > v_credit.amount_remaining_cents then
    raise exception 'Credit usage exceeds remaining amount'
      using errcode = '23514';
  end if;

  if p_target_reservation_id is not null then
    select r.*
    into v_reservation
    from public.reservations r
    where r.organization_id = p_organization_id
      and r.id = p_target_reservation_id
      and r.deleted_at is null;

    if not found then
      raise exception 'Target reservation not found'
        using errcode = 'P0002';
    end if;

    if v_reservation.contact_id <> v_credit.contact_id
      or v_reservation.currency <> v_credit.currency
    then
      raise exception 'Credit and reservation are inconsistent'
        using errcode = '23514';
    end if;
  end if;

  if p_target_payment_id is not null then
    select p.*
    into v_payment
    from public.payments p
    where p.organization_id = p_organization_id
      and p.id = p_target_payment_id
      and p.deleted_at is null;

    if not found then
      raise exception 'Target payment not found'
        using errcode = 'P0002';
    end if;

    if v_payment.contact_id <> v_credit.contact_id
      or v_payment.currency <> v_credit.currency
    then
      raise exception 'Credit and payment are inconsistent'
        using errcode = '23514';
    end if;

    if p_target_reservation_id is not null
      and v_payment.reservation_id is not null
      and v_payment.reservation_id <> p_target_reservation_id
    then
      raise exception 'Payment does not belong to the target reservation'
        using errcode = '23514';
    end if;
  end if;

  insert into public.credit_usages (
    organization_id,
    credit_id,
    contact_id,
    target_reservation_id,
    target_payment_id,
    amount_used_cents,
    notes,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_credit.id,
    v_credit.contact_id,
    p_target_reservation_id,
    p_target_payment_id,
    p_amount_used_cents,
    nullif(btrim(p_notes), ''),
    auth.uid(),
    auth.uid()
  )
  returning id into v_usage_id;

  update public.credits
  set
    amount_remaining_cents = amount_remaining_cents - p_amount_used_cents,
    status = case
      when amount_remaining_cents - p_amount_used_cents = 0 then 'used'
      else 'partially_used'
    end,
    updated_by = auth.uid(),
    updated_at = now()
  where organization_id = p_organization_id
    and id = p_credit_id;

  return v_usage_id;
end;
$$;

revoke all on function public.is_member_of(uuid) from public;
revoke all on function public.has_organization_role(uuid, text[]) from public;
revoke all on function public.create_organization_with_owner(text, text) from public;
revoke all on function public.shares_organization_with(uuid) from public;
revoke all on function public.use_credit(uuid, uuid, integer, uuid, uuid, text) from public;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;
grant execute on function public.shares_organization_with(uuid) to authenticated;
grant execute on function public.use_credit(uuid, uuid, integer, uuid, uuid, text)
  to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.organization_settings enable row level security;
alter table public.litter_groups enable row level security;
alter table public.animals enable row level security;
alter table public.litters enable row level security;
alter table public.public_forms enable row level security;
alter table public.contacts enable row level security;
alter table public.form_submissions enable row level security;
alter table public.contact_roles enable row level security;
alter table public.applications enable row level security;
alter table public.reservations enable row level security;
alter table public.document_templates enable row level security;
alter table public.payments enable row level security;
alter table public.credits enable row level security;
alter table public.credit_usages enable row level security;
alter table public.documents enable row level security;
alter table public.media enable row level security;
alter table public.notes enable row level security;
alter table public.events enable row level security;

create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_member_of(id));

create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (public.has_organization_role(id, array['owner', 'admin']))
with check (public.has_organization_role(id, array['owner', 'admin']));

create policy profiles_select_related
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.shares_organization_with(id)
);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy memberships_select_member
on public.memberships
for select
to authenticated
using (public.is_member_of(organization_id));

create policy memberships_insert_admin
on public.memberships
for insert
to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  and (
    role <> 'owner'
    or public.has_organization_role(organization_id, array['owner'])
  )
);

create policy memberships_update_admin
on public.memberships
for update
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
  and (
    role <> 'owner'
    or public.has_organization_role(organization_id, array['owner'])
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_settings', 'litter_groups', 'animals', 'litters',
    'public_forms', 'contacts', 'form_submissions', 'contact_roles',
    'applications', 'reservations', 'document_templates', 'payments',
    'credits', 'credit_usages', 'documents', 'media', 'notes', 'events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member_of(organization_id))',
      table_name || '_select_member',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'litter_groups', 'animals', 'litters', 'public_forms', 'contacts',
    'form_submissions', 'contact_roles', 'applications', 'reservations',
    'document_templates', 'payments', 'documents', 'media', 'notes', 'events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_organization_role(organization_id, array[''owner'', ''admin'', ''member'']))',
      table_name || '_insert_writer',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_organization_role(organization_id, array[''owner'', ''admin'', ''member''])) with check (public.has_organization_role(organization_id, array[''owner'', ''admin'', ''member'']))',
      table_name || '_update_writer',
      table_name
    );
  end loop;
end;
$$;

create policy organization_settings_insert_admin
on public.organization_settings
for insert
to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin'])
);

create policy organization_settings_update_admin
on public.organization_settings
for update
to authenticated
using (public.has_organization_role(organization_id, array['owner', 'admin']))
with check (public.has_organization_role(organization_id, array['owner', 'admin']));

create policy credits_insert_writer
on public.credits
for insert
to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.public_form_public_view to anon, authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.memberships to authenticated;
grant select, insert, update on public.organization_settings to authenticated;
grant select, insert, update on table
  public.litter_groups,
  public.animals,
  public.litters,
  public.public_forms,
  public.contacts,
  public.form_submissions,
  public.contact_roles,
  public.applications,
  public.reservations,
  public.document_templates,
  public.payments,
  public.documents,
  public.media,
  public.notes,
  public.events
to authenticated;
grant select, insert on public.credits to authenticated;
grant select on public.credit_usages to authenticated;
grant select on public.contact_overview to authenticated;
grant select on public.application_overview to authenticated;
grant select on public.reservation_overview to authenticated;
grant select on public.litter_overview to authenticated;

revoke all on function public.set_updated_at() from public;
revoke all on function public.build_contact_display_name(text, text, text, text)
  from public;
revoke all on function public.fill_contact_display_name() from public;
revoke all on function public.submit_public_application(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, boolean, jsonb, inet, text
) from public;
revoke all on function public.is_member_of(uuid) from public;
revoke all on function public.has_organization_role(uuid, text[]) from public;
revoke all on function public.create_organization_with_owner(text, text) from public;
revoke all on function public.shares_organization_with(uuid) from public;
revoke all on function public.protect_owner_membership() from public;
revoke all on function public.use_credit(uuid, uuid, integer, uuid, uuid, text)
  from public;
grant execute on function public.submit_public_application(
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, boolean, jsonb, inet, text
) to anon, authenticated;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;
grant execute on function public.shares_organization_with(uuid) to authenticated;
grant execute on function public.use_credit(uuid, uuid, integer, uuid, uuid, text)
  to authenticated;
