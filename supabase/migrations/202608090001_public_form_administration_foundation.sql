alter table public.public_forms
  add column lifecycle_status text not null default 'draft',
  add column draft_revision bigint not null default 1,
  add column published_at timestamptz,
  add column published_by uuid references public.profiles(id) on delete set null,
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references public.profiles(id) on delete set null,
  add constraint public_forms_lifecycle_status_check check (lifecycle_status in ('draft','published','withdrawn')),
  add constraint public_forms_draft_revision_check check (draft_revision > 0);

update public.public_forms
set lifecycle_status = case when is_active then 'published' else 'draft' end,
    published_at = case when is_active then updated_at else null end,
    published_by = case when is_active then coalesce(updated_by, created_by) else null end;

create unique index public_forms_one_standard_per_organization_idx
  on public.public_forms (organization_id)
  where deleted_at is null;

create table public.public_form_versions (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null default gen_random_uuid() unique,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  public_form_id uuid not null,
  version_no integer not null,
  name text not null,
  slug text not null,
  form_type text not null,
  species text not null,
  breed text not null,
  title text not null,
  description text not null,
  success_message text not null,
  field_contract jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  constraint public_form_versions_form_fk foreign key (organization_id, public_form_id)
    references public.public_forms(organization_id, id) on delete restrict,
  constraint public_form_versions_number_unique unique (public_form_id, version_no),
  constraint public_form_versions_org_id_unique unique (organization_id, id)
);

alter table public.public_forms add column published_version_id uuid;
alter table public.public_forms add constraint public_forms_published_version_fk
  foreign key (organization_id, published_version_id)
  references public.public_form_versions(organization_id, id) on delete restrict;

insert into public.public_form_versions (
  organization_id, public_form_id, version_no, name, slug, form_type, species, breed,
  title, description, success_message, field_contract, published_at, published_by
)
select organization_id, id, 1, name, slug, form_type, species, breed,
  coalesce(title, name), coalesce(description, 'Formulaire public de candidature.'),
  coalesce(success_message, 'Merci, votre candidature a bien été transmise.'),
  '{"code":"standard-dog-adoption-application","version":1}'::jsonb,
  coalesce(published_at, updated_at), published_by
from public.public_forms where lifecycle_status = 'published' and deleted_at is null;

update public.public_forms pf set published_version_id = v.id
from public.public_form_versions v where v.public_form_id = pf.id and v.version_no = 1;

alter table public.form_submissions
  add column public_form_version_id uuid,
  add column submission_key uuid;

update public.form_submissions fs set public_form_version_id = pf.published_version_id
from public.public_forms pf where pf.id = fs.public_form_id and pf.organization_id = fs.organization_id;

alter table public.form_submissions add constraint form_submissions_version_org_fk
  foreign key (organization_id, public_form_version_id)
  references public.public_form_versions(organization_id, id) on delete restrict;
create unique index form_submissions_public_form_submission_key_idx
  on public.form_submissions(public_form_id, submission_key) where submission_key is not null;

create table public.public_form_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  public_form_id uuid not null,
  public_form_version_id uuid,
  command_id uuid not null,
  event_type text not null check (event_type in ('published','withdrawn','reactivated')),
  form_revision bigint not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  occurred_by uuid not null references public.profiles(id) on delete restrict,
  constraint public_form_events_form_fk foreign key (organization_id, public_form_id)
    references public.public_forms(organization_id, id) on delete restrict,
  constraint public_form_events_version_fk foreign key (organization_id, public_form_version_id)
    references public.public_form_versions(organization_id, id) on delete restrict,
  constraint public_form_events_command_unique unique (organization_id, command_id)
);

create table public.public_application_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  public_form_id uuid not null,
  submission_key uuid not null,
  public_submission_reference uuid,
  created_at timestamptz not null default now(),
  constraint public_application_commands_form_fk foreign key (organization_id, public_form_id)
    references public.public_forms(organization_id, id) on delete restrict,
  constraint public_application_commands_key_unique unique(public_form_id, submission_key)
);

create or replace function public.reject_public_form_history_mutation() returns trigger
language plpgsql set search_path='' as $$ begin
  if current_setting('app.fixture_cleanup', true) = 'on' then return coalesce(new, old); end if;
  raise exception 'Public form history is append-only' using errcode='42501';
end $$;
create trigger public_form_versions_immutable before update or delete on public.public_form_versions
for each row execute function public.reject_public_form_history_mutation();
create trigger public_form_events_immutable before update or delete on public.public_form_events
for each row execute function public.reject_public_form_history_mutation();

create or replace function public.save_standard_public_form_draft(
  p_organization_id uuid, p_expected_revision bigint, p_name text, p_slug text,
  p_title text, p_description text, p_success_message text, p_breed text
) returns table(form_id uuid, revision bigint, lifecycle_status text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_form public.public_forms%rowtype; v_slug text:=lower(btrim(p_slug)); begin
  if v_user is null or not public.has_organization_role(p_organization_id,array['owner','admin']) then raise exception 'Public form administration forbidden' using errcode='42501'; end if;
  if nullif(btrim(p_name),'') is null or nullif(btrim(p_title),'') is null or char_length(btrim(p_description))<20 or char_length(btrim(p_success_message))<20 or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or v_slug ~ '(^|-)(admin|api|auth|login|settings|supabase)(-|$)' then raise exception 'Invalid public form draft' using errcode='23514'; end if;
  select * into v_form from public.public_forms where organization_id=p_organization_id and deleted_at is null for update;
  if not found then
    if p_expected_revision<>0 then raise exception 'Stale public form revision' using errcode='40001'; end if;
    insert into public.public_forms(organization_id,name,slug,form_type,species,breed,is_active,lifecycle_status,title,description,success_message,created_by,updated_by)
    values(p_organization_id,btrim(p_name),v_slug,'adoption_application','dog',coalesce(nullif(btrim(p_breed),''),'Golden Retriever'),false,'draft',btrim(p_title),btrim(p_description),btrim(p_success_message),v_user,v_user) returning * into v_form;
  else
    if v_form.draft_revision<>p_expected_revision then raise exception 'Stale public form revision' using errcode='40001'; end if;
    if v_form.published_version_id is not null and v_slug<>v_form.slug then raise exception 'Published public URL is stable' using errcode='23514'; end if;
    update public.public_forms set name=btrim(p_name),slug=v_slug,title=btrim(p_title),description=btrim(p_description),success_message=btrim(p_success_message),breed=coalesce(nullif(btrim(p_breed),''),'Golden Retriever'),draft_revision=draft_revision+1,updated_by=v_user where id=v_form.id returning * into v_form;
  end if;
  return query select v_form.id,v_form.draft_revision,v_form.lifecycle_status;
end $$;

create or replace function public.change_standard_public_form_lifecycle(
  p_public_form_id uuid, p_expected_revision bigint, p_command_id uuid, p_operation text
) returns table(form_id uuid, revision bigint, lifecycle_status text, version_no integer, replayed boolean)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_form public.public_forms%rowtype; v_version public.public_form_versions%rowtype; v_event public.public_form_events%rowtype; begin
  select * into v_form from public.public_forms where id=p_public_form_id and deleted_at is null for update;
  if not found then raise exception 'Public form not found' using errcode='P0002'; end if;
  if v_user is null or not public.has_organization_role(v_form.organization_id,array['owner','admin']) then raise exception 'Public form administration forbidden' using errcode='42501'; end if;
  select * into v_event from public.public_form_events where organization_id=v_form.organization_id and command_id=p_command_id;
  if found then select * into v_version from public.public_form_versions where id=v_event.public_form_version_id; return query select v_form.id,v_form.draft_revision,v_form.lifecycle_status,v_version.version_no,true; return; end if;
  if v_form.draft_revision<>p_expected_revision then raise exception 'Stale public form revision' using errcode='40001'; end if;
  if p_operation='publish' then
    if nullif(btrim(v_form.title),'') is null or char_length(btrim(coalesce(v_form.description,'')))<20 or char_length(btrim(coalesce(v_form.success_message,'')))<20 then raise exception 'Incomplete public form draft' using errcode='23514'; end if;
    insert into public.public_form_versions(organization_id,public_form_id,version_no,name,slug,form_type,species,breed,title,description,success_message,field_contract,published_by)
    values(v_form.organization_id,v_form.id,coalesce((select max(pfv.version_no)+1 from public.public_form_versions pfv where pfv.public_form_id=v_form.id),1),v_form.name,v_form.slug,v_form.form_type,'dog',v_form.breed,v_form.title,v_form.description,v_form.success_message,'{"code":"standard-dog-adoption-application","version":1}'::jsonb,v_user) returning * into v_version;
    update public.public_forms set lifecycle_status='published',is_active=true,published_version_id=v_version.id,published_at=now(),published_by=v_user,withdrawn_at=null,withdrawn_by=null,draft_revision=draft_revision+1,updated_by=v_user where id=v_form.id returning * into v_form;
  elsif p_operation='withdraw' then
    if v_form.lifecycle_status<>'published' then raise exception 'Public form is not published' using errcode='23514'; end if;
    select * into v_version from public.public_form_versions where id=v_form.published_version_id;
    update public.public_forms set lifecycle_status='withdrawn',is_active=false,withdrawn_at=now(),withdrawn_by=v_user,draft_revision=draft_revision+1,updated_by=v_user where id=v_form.id returning * into v_form;
  elsif p_operation='reactivate' then
    if v_form.lifecycle_status<>'withdrawn' or v_form.published_version_id is null then raise exception 'Public form cannot be reactivated' using errcode='23514'; end if;
    select * into v_version from public.public_form_versions where id=v_form.published_version_id;
    update public.public_forms set lifecycle_status='published',is_active=true,withdrawn_at=null,withdrawn_by=null,draft_revision=draft_revision+1,updated_by=v_user where id=v_form.id returning * into v_form;
  else raise exception 'Invalid public form lifecycle operation' using errcode='23514'; end if;
  insert into public.public_form_events(organization_id,public_form_id,public_form_version_id,command_id,event_type,form_revision,payload,occurred_by)
  values(v_form.organization_id,v_form.id,v_version.id,p_command_id,case when p_operation='withdraw' then 'withdrawn' when p_operation='reactivate' then 'reactivated' else 'published' end,v_form.draft_revision,jsonb_build_object('version_no',v_version.version_no),v_user);
  return query select v_form.id,v_form.draft_revision,v_form.lifecycle_status,v_version.version_no,false;
end $$;

create or replace function public.get_public_application_form(p_organization_slug text,p_form_slug text)
returns table(version_reference uuid,title text,description text,success_message text,species text,breed text)
language sql stable security definer set search_path='' as $$
 select v.public_reference,v.title,v.description,v.success_message,v.species,v.breed
 from public.public_forms f join public.organizations o on o.id=f.organization_id
 join public.public_form_versions v on v.id=f.published_version_id and v.organization_id=f.organization_id
 where o.slug=p_organization_slug and f.slug=p_form_slug and o.deleted_at is null and f.deleted_at is null and f.lifecycle_status='published' and f.is_active;
$$;

alter table public.public_form_versions enable row level security;
alter table public.public_form_events enable row level security;
alter table public.public_application_commands enable row level security;
create policy public_form_versions_select_member on public.public_form_versions for select to authenticated using(public.is_member_of(organization_id));
create policy public_form_events_select_member on public.public_form_events for select to authenticated using(public.is_member_of(organization_id));
drop policy public_forms_insert_writer on public.public_forms;
drop policy public_forms_update_writer on public.public_forms;
create policy public_forms_insert_admin on public.public_forms for insert to authenticated with check(public.has_organization_role(organization_id,array['owner','admin']));
create policy public_forms_update_admin on public.public_forms for update to authenticated using(public.has_organization_role(organization_id,array['owner','admin'])) with check(public.has_organization_role(organization_id,array['owner','admin']));
grant select on public.public_form_versions,public.public_form_events to authenticated;
revoke all on public.public_application_commands from anon,authenticated;
revoke all on function public.save_standard_public_form_draft(uuid,bigint,text,text,text,text,text,text) from public;
grant execute on function public.save_standard_public_form_draft(uuid,bigint,text,text,text,text,text,text) to authenticated;
revoke all on function public.change_standard_public_form_lifecycle(uuid,bigint,uuid,text) from public;
grant execute on function public.change_standard_public_form_lifecycle(uuid,bigint,uuid,text) to authenticated;
revoke all on function public.get_public_application_form(text,text) from public;
grant execute on function public.get_public_application_form(text,text) to anon,authenticated;
revoke select on public.public_form_public_view from anon, authenticated;

create or replace function public.list_standard_public_form_history(p_public_form_id uuid)
returns table(event_type text, version_no integer, occurred_at timestamptz, actor_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_organization_id uuid;
begin
  select f.organization_id into v_organization_id
  from public.public_forms f where f.id = p_public_form_id and f.deleted_at is null;
  if v_organization_id is null or auth.uid() is null or not public.is_member_of(v_organization_id) then
    raise exception 'Public form history forbidden' using errcode = '42501';
  end if;
  return query
  select e.event_type, v.version_no, e.occurred_at,
    coalesce(nullif(btrim(p.display_name), ''), 'Membre de l’élevage')
  from public.public_form_events e
  left join public.public_form_versions v on v.id = e.public_form_version_id
  left join public.profiles p on p.id = e.occurred_by
  where e.public_form_id = p_public_form_id and e.organization_id = v_organization_id
  order by e.occurred_at desc, e.id desc;
end $$;
revoke all on function public.list_standard_public_form_history(uuid) from public;
grant execute on function public.list_standard_public_form_history(uuid) to authenticated;

create or replace function public.submit_public_application_v2(
  p_organization_slug text,
  p_form_slug text,
  p_expected_version_reference uuid,
  p_submission_key uuid,
  p_first_name text,
  p_last_name text,
  p_family_or_structure_name text,
  p_email text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_postal_code text,
  p_city text,
  p_country text,
  p_desired_sex_preference text,
  p_project_description text,
  p_source_channel text,
  p_consent_data_processing boolean,
  p_consent_contact boolean,
  p_ip_address inet default null,
  p_user_agent text default null,
  p_raw_data jsonb default '{}'::jsonb,
  p_honeypot text default null
) returns table(status text, public_submission_reference uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_form public.public_forms%rowtype;
  v_version public.public_form_versions%rowtype;
  v_command public.public_application_commands%rowtype;
  v_result record;
  v_submission public.form_submissions%rowtype;
  v_existing_contact_id uuid;
  v_existing_application_id uuid;
  v_preserved_role_ids uuid[] := '{}'::uuid[];
  v_inserted integer;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if p_submission_key is null or nullif(btrim(coalesce(p_honeypot, '')), '') is not null
    or pg_catalog.octet_length(coalesce(p_raw_data, '{}'::jsonb)::text) > 16384
  then
    raise exception 'Invalid public application submission' using errcode = '23514';
  end if;

  select f.* into v_form
  from public.public_forms f
  join public.organizations o on o.id = f.organization_id
  where o.slug = p_organization_slug and o.deleted_at is null
    and f.slug = p_form_slug and f.deleted_at is null
  for update of f;
  if not found then raise exception 'Public form not found' using errcode = 'P0002'; end if;

  select * into v_command from public.public_application_commands
  where public_form_id = v_form.id and submission_key = p_submission_key;
  if found and v_command.public_submission_reference is not null then
    return query select 'accepted'::text, v_command.public_submission_reference, true;
    return;
  end if;

  if v_form.lifecycle_status <> 'published' or not v_form.is_active or v_form.published_version_id is null then
    raise exception 'Public form not available' using errcode = 'P0002';
  end if;
  select * into v_version from public.public_form_versions where id = v_form.published_version_id;
  if v_version.public_reference <> p_expected_version_reference then
    raise exception 'Public form version changed' using errcode = '40001';
  end if;
  if p_ip_address is not null and (
    select count(*) from public.form_submissions
    where public_form_id = v_form.id and ip_address = p_ip_address
      and submitted_at > now() - interval '15 minutes'
  ) >= 8 then
    raise exception 'Public application temporarily unavailable' using errcode = 'P0001';
  end if;

  insert into public.public_application_commands(organization_id, public_form_id, submission_key)
  values(v_form.organization_id, v_form.id, p_submission_key)
  on conflict(public_form_id, submission_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_command from public.public_application_commands
    where public_form_id = v_form.id and submission_key = p_submission_key;
    if v_command.public_submission_reference is not null then
      return query select 'accepted'::text, v_command.public_submission_reference, true;
      return;
    end if;
    raise exception 'Public application retry in progress' using errcode = '40001';
  end if;

  select (array_agg(c.id order by c.created_at, c.id))[1] into v_existing_contact_id
  from public.contacts c
  where c.organization_id = v_form.organization_id and c.deleted_at is null
    and lower(c.email) = v_email
    and regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g') = v_phone
  having count(*) = 1;
  if v_existing_contact_id is not null then
    select array_agg(id) into v_preserved_role_ids from public.contact_roles
    where organization_id = v_form.organization_id and contact_id = v_existing_contact_id
      and role in ('prospect','pre_reservation_holder','reservation_holder','adopter','former_adopter')
      and is_active and deleted_at is null;
    select a.id into v_existing_application_id from public.applications a
    where a.organization_id = v_form.organization_id and a.contact_id = v_existing_contact_id
      and a.status in ('new','to_review','to_call','qualified','waiting_litter') and a.deleted_at is null
    order by a.created_at limit 1;
  end if;

  select * into v_result from public.submit_public_application(
    p_organization_slug, p_form_slug, p_first_name, p_last_name, p_family_or_structure_name,
    p_email, p_phone, p_address_line1, p_address_line2, p_postal_code, p_city, p_country,
    p_desired_sex_preference, p_project_description, p_source_channel,
    p_consent_data_processing, p_consent_contact, p_raw_data, p_ip_address, p_user_agent
  );
  select * into v_submission from public.form_submissions
  where public_reference = v_result.public_submission_reference for update;

  if cardinality(v_preserved_role_ids) > 0 then
    update public.contact_roles set is_active = true, ended_at = null, updated_at = now()
    where id = any(v_preserved_role_ids);
  end if;

  if v_existing_application_id is not null and v_submission.contact_id = v_existing_contact_id
    and v_submission.application_id is not null
  then
    update public.form_submissions set application_id = null where id = v_submission.id;
    delete from public.applications where id = v_submission.application_id;
    update public.form_submissions set contact_id = null,
      duplicate_candidate_contact_id = v_existing_contact_id,
      duplicate_resolution = 'pending_human_review', status = 'duplicate_suspected',
      public_form_version_id = v_version.id, submission_key = p_submission_key, updated_at = now()
    where id = v_submission.id;
  else
    update public.form_submissions set public_form_version_id = v_version.id,
      submission_key = p_submission_key, updated_at = now() where id = v_submission.id;
    if v_existing_contact_id is not null and v_submission.contact_id = v_existing_contact_id then
      update public.contacts set
        first_name = coalesce(first_name, nullif(btrim(p_first_name), '')),
        last_name = coalesce(last_name, nullif(btrim(p_last_name), '')),
        family_or_structure_name = coalesce(family_or_structure_name, nullif(btrim(p_family_or_structure_name), '')),
        address_line1 = coalesce(address_line1, nullif(btrim(p_address_line1), '')),
        address_line2 = coalesce(address_line2, nullif(btrim(p_address_line2), '')),
        postal_code = coalesce(postal_code, nullif(btrim(p_postal_code), '')),
        city = coalesce(city, nullif(btrim(p_city), '')),
        last_interaction_at = now(), updated_at = now()
      where id = v_existing_contact_id;
    end if;
  end if;

  update public.public_application_commands
  set public_submission_reference = v_result.public_submission_reference
  where public_form_id = v_form.id and submission_key = p_submission_key;
  return query select 'accepted'::text, v_result.public_submission_reference::uuid, false;
end $$;

revoke all on function public.submit_public_application_v2(
  text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,inet,text,jsonb,text
) from public;
grant execute on function public.submit_public_application_v2(
  text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,inet,text,jsonb,text
) to anon, authenticated;
