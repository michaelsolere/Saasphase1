create or replace function public.list_whelping_birth_adjustment_history(
  p_litter_id uuid,
  p_limit integer default 100
)
returns table (
  adjustment_type text,
  action_at timestamptz,
  reason text,
  session_timezone_name text,
  birth_order integer,
  before_occurred_at timestamptz,
  after_occurred_at timestamptz,
  before_sex text,
  after_sex text,
  before_viability text,
  after_viability text,
  before_initial_collar_color text,
  after_initial_collar_color text,
  before_birth_note text,
  after_birth_note text,
  before_weight_grams integer,
  after_weight_grams integer,
  before_weight_measured_at timestamptz,
  after_weight_measured_at timestamptz,
  before_weight_note text,
  after_weight_note text,
  weight_change_type text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_litter_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  select litter.organization_id
  into v_organization_id
  from public.litters litter
  join public.memberships membership
    on membership.organization_id = litter.organization_id
   and membership.profile_id = v_user_id
   and membership.status = 'active'
   and membership.deleted_at is null
   and membership.role in ('owner', 'admin', 'member', 'viewer')
  where litter.id = p_litter_id
    and litter.deleted_at is null;

  if not found then
    raise exception 'litter not found' using errcode = '42501';
  end if;

  return query
  with projected as (
    select
      command.command_type,
      command.created_at,
      command.reason,
      session.timezone_name,
      nullif(command.snapshot_before #>> '{birth,birth_order}', '')::integer as birth_order,
      nullif(command.snapshot_before #>> '{birth,occurred_at}', '')::timestamptz as before_occurred_at,
      nullif(command.snapshot_after #>> '{birth,occurred_at}', '')::timestamptz as after_occurred_at,
      command.snapshot_before #>> '{birth,sex}' as before_sex,
      command.snapshot_after #>> '{birth,sex}' as after_sex,
      command.snapshot_before #>> '{birth,viability}' as before_viability,
      command.snapshot_after #>> '{birth,viability}' as after_viability,
      command.snapshot_before #>> '{birth,initial_collar_color}' as before_initial_collar_color,
      command.snapshot_after #>> '{birth,initial_collar_color}' as after_initial_collar_color,
      command.snapshot_before #>> '{birth,note}' as before_birth_note,
      command.snapshot_after #>> '{birth,note}' as after_birth_note,
      case
        when command.snapshot_before #>> '{birth_weight,cancelled_at}' is null
          then nullif(command.snapshot_before #>> '{birth_weight,grams}', '')::integer
      end as before_weight_grams,
      case
        when command.snapshot_after #>> '{birth_weight,cancelled_at}' is null
          then nullif(command.snapshot_after #>> '{birth_weight,grams}', '')::integer
      end as after_weight_grams,
      case
        when command.snapshot_before #>> '{birth_weight,cancelled_at}' is null
          then nullif(command.snapshot_before #>> '{birth_weight,measured_at}', '')::timestamptz
      end as before_weight_measured_at,
      case
        when command.snapshot_after #>> '{birth_weight,cancelled_at}' is null
          then nullif(command.snapshot_after #>> '{birth_weight,measured_at}', '')::timestamptz
      end as after_weight_measured_at,
      case
        when command.snapshot_before #>> '{birth_weight,cancelled_at}' is null
          then command.snapshot_before #>> '{birth_weight,note}'
      end as before_weight_note,
      case
        when command.snapshot_after #>> '{birth_weight,cancelled_at}' is null
          then command.snapshot_after #>> '{birth_weight,note}'
      end as after_weight_note
    from public.whelping_birth_adjustment_commands command
    join public.whelping_sessions session
      on session.organization_id = command.organization_id
     and session.id = command.session_id
    where command.organization_id = v_organization_id
      and command.litter_id = p_litter_id
  )
  select
    case projected.command_type
      when 'correct_birth' then 'correction'
      else 'cancellation'
    end,
    projected.created_at,
    projected.reason,
    projected.timezone_name,
    projected.birth_order,
    projected.before_occurred_at,
    projected.after_occurred_at,
    projected.before_sex,
    projected.after_sex,
    projected.before_viability,
    projected.after_viability,
    projected.before_initial_collar_color,
    projected.after_initial_collar_color,
    projected.before_birth_note,
    projected.after_birth_note,
    projected.before_weight_grams,
    projected.after_weight_grams,
    projected.before_weight_measured_at,
    projected.after_weight_measured_at,
    projected.before_weight_note,
    projected.after_weight_note,
    case
      when projected.command_type = 'cancel_birth'
        and projected.before_weight_grams is not null
        and projected.after_weight_grams is null
        then 'neutralized_on_cancellation'
      when projected.before_weight_grams is null
        and projected.after_weight_grams is not null
        then 'added'
      when projected.before_weight_grams is not null
        and projected.after_weight_grams is null
        then 'removed'
      when projected.before_weight_grams is not null
        and projected.after_weight_grams is not null
        and (
          projected.before_weight_grams is distinct from projected.after_weight_grams
          or projected.before_weight_measured_at is distinct from projected.after_weight_measured_at
          or projected.before_weight_note is distinct from projected.after_weight_note
        )
        then 'corrected'
      else 'unchanged'
    end
  from projected
  order by projected.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.list_whelping_birth_adjustment_history(uuid, integer) from public;
grant execute on function public.list_whelping_birth_adjustment_history(uuid, integer) to authenticated;

-- Preserve the routine weighing insertion path after the birth-adjustment
-- foundation extended this shared guard.
create or replace function public.prevent_animal_weight_measurement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
    and current_setting('app.whelping_birth_rpc', true) is distinct from 'on'
    and current_setting('app.whelping_birth_weight_rpc', true) is distinct from 'on'
    and current_setting('app.litter_routine_weight_rpc', true) is distinct from 'on'
    and not (
      current_setting('app.whelping_birth_adjustment_rpc', true) = 'on'
      and current_setting('app.whelping_birth_adjustment_operation', true) = 'correct_birth'
      and new.measurement_kind = 'birth'
      and new.source_birth_id is not null
    ) then
    raise exception 'animal weight measurements are inserted exclusively by dedicated commands'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_animal_weight_measurement_insert() from public, anon, authenticated;
