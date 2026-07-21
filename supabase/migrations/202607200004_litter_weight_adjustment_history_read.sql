create or replace function public.list_litter_weight_adjustment_history(
  p_litter_id uuid,
  p_limit integer default 100
)
returns table (
  command_type text,
  created_at timestamptz,
  reason text,
  session_measured_at timestamptz,
  session_timezone_name text,
  animal_label text,
  before_grams integer,
  after_grams integer,
  before_note text,
  after_note text,
  affected_measurement_count integer
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
  select
    command.command_type,
    command.created_at,
    command.reason,
    session.measured_at,
    session.timezone_name,
    case
      when command.animal_id is null then null
      else coalesce(
        nullif(btrim(animal.call_name), ''),
        nullif(btrim(animal.official_name), ''),
        nullif(btrim(animal.collar_color_current), ''),
        nullif(btrim(animal.collar_color_initial), ''),
        case when animal.birth_order is not null then 'Chiot n° ' || animal.birth_order::text end,
        'Animal'
      )
    end,
    case when command.command_type in ('correct_measurement', 'cancel_measurement')
      then nullif(command.before_snapshot #>> '{measurement,grams}', '')::integer end,
    case when command.command_type = 'correct_measurement'
      then nullif(command.after_snapshot #>> '{measurement,grams}', '')::integer end,
    case when command.command_type in ('correct_measurement', 'cancel_measurement')
      then command.before_snapshot #>> '{measurement,note}' end,
    case when command.command_type = 'correct_measurement'
      then command.after_snapshot #>> '{measurement,note}' end,
    command.affected_measurement_count
  from public.litter_weight_adjustment_commands command
  join public.litter_weighing_sessions session
    on session.organization_id = command.organization_id
   and session.id = command.litter_weighing_session_id
  left join public.animals animal
    on animal.organization_id = command.organization_id
   and animal.id = command.animal_id
  where command.organization_id = v_organization_id
    and command.litter_id = p_litter_id
  order by command.created_at desc, command.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_litter_weight_adjustment_history(uuid, integer) from public;
grant execute on function public.list_litter_weight_adjustment_history(uuid, integer) to authenticated;
