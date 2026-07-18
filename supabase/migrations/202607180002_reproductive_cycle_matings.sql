alter table public.reproductive_cycles
  drop constraint reproductive_cycles_litter_reserved_check;

create table public.reproductive_cycle_matings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cycle_id uuid not null,
  father_id uuid not null,
  sequence_no integer not null,
  occurred_at timestamptz not null,
  timezone_name text not null,
  method text not null,
  location text,
  note text,
  client_command_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint reproductive_cycle_matings_organization_id_id_key
    unique (organization_id, id),
  constraint reproductive_cycle_matings_cycle_organization_fk
    foreign key (organization_id, cycle_id)
    references public.reproductive_cycles (organization_id, id) on delete restrict,
  constraint reproductive_cycle_matings_father_organization_fk
    foreign key (organization_id, father_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint reproductive_cycle_matings_sequence_positive_check
    check (sequence_no > 0),
  constraint reproductive_cycle_matings_method_check
    check (method in ('natural', 'ai_fresh', 'ai_chilled', 'ai_frozen', 'other')),
  constraint reproductive_cycle_matings_cycle_sequence_key
    unique (organization_id, cycle_id, sequence_no),
  constraint reproductive_cycle_matings_client_command_key
    unique (organization_id, client_command_id)
);

create index reproductive_cycle_matings_cycle_occurred_at_idx
  on public.reproductive_cycle_matings (
    organization_id,
    cycle_id,
    occurred_at,
    sequence_no
  );

create index reproductive_cycle_matings_cycle_sequence_idx
  on public.reproductive_cycle_matings (
    organization_id,
    cycle_id,
    sequence_no
  );

create or replace function public.protect_reproductive_cycle_mating_link()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.reproductive_cycle_mating_rpc', true) is distinct from 'on' then
    if tg_op = 'INSERT'
      and (new.litter_id is not null or new.status = 'mated') then
      raise exception 'reproductive cycle mating link must be recorded by its dedicated command'
        using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and (
        new.litter_id is distinct from old.litter_id
        or (new.status = 'mated' and old.status is distinct from 'mated')
      ) then
      raise exception 'reproductive cycle mating link must be recorded by its dedicated command'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger reproductive_cycles_protect_mating_link
before insert or update of litter_id, status
on public.reproductive_cycles
for each row execute function public.protect_reproductive_cycle_mating_link();

create or replace function public.prevent_reproductive_cycle_mating_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null then
    raise exception 'recorded reproductive cycle matings are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger reproductive_cycle_matings_immutable
before update or delete
on public.reproductive_cycle_matings
for each row execute function public.prevent_reproductive_cycle_mating_mutation();

alter table public.reproductive_cycle_matings enable row level security;

create policy reproductive_cycle_matings_select_member
on public.reproductive_cycle_matings
for select
to authenticated
using (public.is_member_of(organization_id));

create or replace function public.record_reproductive_cycle_mating(
  p_cycle_id uuid,
  p_client_command_id uuid,
  p_father_id uuid,
  p_occurred_at timestamptz,
  p_timezone_name text,
  p_method text,
  p_location text default null,
  p_note text default null,
  p_litter_name text default null
)
returns table (
  outcome text,
  cycle_id uuid,
  mating_id uuid,
  litter_id uuid,
  sequence_no integer,
  replayed boolean,
  reason text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_cycle public.reproductive_cycles%rowtype;
  v_mother public.animals%rowtype;
  v_father public.animals%rowtype;
  v_litter public.litters%rowtype;
  v_existing_mating public.reproductive_cycle_matings%rowtype;
  v_sequence_no integer;
  v_litter_name text;
  v_local_mating_date date;
begin
  outcome := 'error';
  cycle_id := p_cycle_id;
  mating_id := null;
  litter_id := null;
  sequence_no := null;
  replayed := false;
  reason := null;

  if v_user_id is null then
    reason := 'not_authenticated';
    return next;
    return;
  end if;

  if p_cycle_id is null or p_client_command_id is null or p_father_id is null
    or p_occurred_at is null or p_timezone_name is null or p_method is null then
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select *
  into v_cycle
  from public.reproductive_cycles
  where id = p_cycle_id
  for update;

  if not found then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = v_cycle.organization_id
      and membership.profile_id = v_user_id
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = v_cycle.organization_id
      and membership.profile_id = v_user_id
      and membership.status = 'active'
      and membership.deleted_at is null
      and membership.role in ('owner', 'admin', 'member')
  ) then
    reason := 'membership_required';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.organization_id::text || ':' || p_client_command_id::text,
      0
    )
  );

  select *
  into v_existing_mating
  from public.reproductive_cycle_matings mating
  where mating.organization_id = v_cycle.organization_id
    and mating.client_command_id = p_client_command_id;

  if found then
    if v_existing_mating.cycle_id <> v_cycle.id then
      reason := 'client_command_conflict';
      return next;
      return;
    end if;

    select *
    into v_litter
    from public.litters litter
    where litter.organization_id = v_cycle.organization_id
      and litter.id = v_cycle.litter_id;

    outcome := 'success';
    mating_id := v_existing_mating.id;
    litter_id := v_litter.id;
    sequence_no := v_existing_mating.sequence_no;
    replayed := true;
    return next;
    return;
  end if;

  if v_cycle.deleted_at is not null then
    reason := 'cycle_not_found';
    return next;
    return;
  end if;

  if v_cycle.status in ('closed', 'cancelled') then
    reason := 'cycle_not_open';
    return next;
    return;
  end if;

  if p_method not in ('natural', 'ai_fresh', 'ai_chilled', 'ai_frozen', 'other') then
    reason := 'invalid_method';
    return next;
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names tz
    where tz.name = p_timezone_name
  ) then
    reason := 'invalid_timezone';
    return next;
    return;
  end if;

  select *
  into v_mother
  from public.animals animal
  where animal.organization_id = v_cycle.organization_id
    and animal.id = v_cycle.mother_id
    and animal.deleted_at is null
  for share;

  if not found
    or v_mother.sex <> 'female'
    or v_mother.species <> v_cycle.species
    or not v_mother.is_breeder
    or v_mother.is_retired
    or v_mother.status in ('adopted', 'archived', 'deceased', 'retired')
    or v_mother.ownership_status = 'adopted_out'
    or (
      v_mother.is_external
      and v_mother.ownership_status <> 'external_female'
    )
    or (
      not v_mother.is_external
      and v_mother.ownership_status not in ('owned', 'co_owned', 'produced')
    ) then
    reason := 'mother_ineligible';
    return next;
    return;
  end if;

  select *
  into v_father
  from public.animals animal
  where animal.organization_id = v_cycle.organization_id
    and animal.id = p_father_id
    and animal.deleted_at is null
  for share;

  if not found
    or v_father.id = v_mother.id
    or v_father.sex <> 'male'
    or v_father.species <> v_cycle.species
    or not v_father.is_breeder
    or v_father.is_retired
    or v_father.status in ('adopted', 'archived', 'deceased', 'retired')
    or v_father.ownership_status = 'adopted_out'
    or (
      v_father.is_external
      and v_father.ownership_status <> 'external_stud'
    )
    or (
      not v_father.is_external
      and v_father.ownership_status not in ('owned', 'co_owned', 'produced')
    ) then
    reason := 'father_ineligible';
    return next;
    return;
  end if;

  select coalesce(max(mating.sequence_no), 0) + 1
  into v_sequence_no
  from public.reproductive_cycle_matings mating
  where mating.organization_id = v_cycle.organization_id
    and mating.cycle_id = v_cycle.id;

  v_local_mating_date := (p_occurred_at at time zone p_timezone_name)::date;

  if v_sequence_no = 1 then
    v_litter_name := nullif(btrim(p_litter_name), '');

    if v_litter_name is null or char_length(v_litter_name) > 255 then
      reason := 'litter_name_required';
      return next;
      return;
    end if;

    if v_cycle.litter_id is not null then
      reason := 'cycle_litter_conflict';
      return next;
      return;
    end if;

    insert into public.litters (
      organization_id,
      name,
      species,
      breed,
      mother_id,
      father_id,
      status,
      mating_date,
      created_by,
      updated_by
    ) values (
      v_cycle.organization_id,
      v_litter_name,
      v_cycle.species,
      v_cycle.breed,
      v_mother.id,
      v_father.id,
      'mating_done',
      v_local_mating_date,
      v_user_id,
      v_user_id
    )
    returning * into v_litter;

    perform set_config('app.reproductive_cycle_mating_rpc', 'on', true);

    update public.reproductive_cycles
    set
      litter_id = v_litter.id,
      status = 'mated',
      updated_at = now(),
      updated_by = v_user_id
    where organization_id = v_cycle.organization_id
      and id = v_cycle.id;
  else
    if v_cycle.litter_id is null then
      reason := 'cycle_litter_missing';
      return next;
      return;
    end if;

    select *
    into v_litter
    from public.litters litter
    where litter.organization_id = v_cycle.organization_id
      and litter.id = v_cycle.litter_id
      and litter.deleted_at is null
    for update;

    if not found then
      reason := 'linked_litter_not_found';
      return next;
      return;
    end if;

    if v_litter.father_id is distinct from v_father.id then
      reason := 'father_mismatch';
      return next;
      return;
    end if;

    if v_sequence_no = 2 then
      update public.litters
      set
        mating_date_2 = v_local_mating_date,
        updated_at = now(),
        updated_by = v_user_id
      where organization_id = v_cycle.organization_id
        and id = v_litter.id;
    end if;
  end if;

  insert into public.reproductive_cycle_matings (
    organization_id,
    cycle_id,
    father_id,
    sequence_no,
    occurred_at,
    timezone_name,
    method,
    location,
    note,
    client_command_id,
    created_by,
    updated_by
  ) values (
    v_cycle.organization_id,
    v_cycle.id,
    v_father.id,
    v_sequence_no,
    p_occurred_at,
    p_timezone_name,
    p_method,
    nullif(btrim(p_location), ''),
    nullif(btrim(p_note), ''),
    p_client_command_id,
    v_user_id,
    v_user_id
  )
  returning id into mating_id;

  outcome := 'success';
  litter_id := v_litter.id;
  sequence_no := v_sequence_no;
  return next;
end;
$$;

revoke all on table public.reproductive_cycle_matings from anon, authenticated;
grant select on table public.reproductive_cycle_matings to authenticated;

revoke all on function public.protect_reproductive_cycle_mating_link() from public;
revoke all on function public.prevent_reproductive_cycle_mating_mutation() from public;
revoke all on function public.record_reproductive_cycle_mating(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text
) from public;
grant execute on function public.record_reproductive_cycle_mating(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text
) to authenticated;

comment on table public.reproductive_cycle_matings is
  'Append-only history of matings recorded exclusively by record_reproductive_cycle_mating.';

comment on column public.reproductive_cycles.litter_id is
  'Linked exactly once by record_reproductive_cycle_mating when the first mating is recorded.';
