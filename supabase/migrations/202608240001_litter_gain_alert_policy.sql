alter table public.organization_settings
  add column litter_gain_alert_policy jsonb;

create or replace function public.is_valid_litter_gain_alert_policy(
  p_policy jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_policy is null then true
    when jsonb_typeof(p_policy) <> 'object' then false
    when (select count(*) from jsonb_object_keys(p_policy)) <> 3 then false
    when not (p_policy ?& array[
      'version',
      'lowestGainCount',
      'belowTrendDeviationPercent'
    ]) then false
    when jsonb_typeof(p_policy -> 'version') <> 'number' then false
    when jsonb_typeof(p_policy -> 'lowestGainCount') <> 'number' then false
    when jsonb_typeof(p_policy -> 'belowTrendDeviationPercent') <> 'number' then false
    else
      (p_policy ->> 'version')::numeric = 1
      and (p_policy ->> 'lowestGainCount')::numeric =
        trunc((p_policy ->> 'lowestGainCount')::numeric)
      and (p_policy ->> 'lowestGainCount')::numeric between 0 and 3
      and (p_policy ->> 'belowTrendDeviationPercent')::numeric in (0, 20, 30, 50)
  end;
$$;

alter table public.organization_settings
  add constraint organization_settings_litter_gain_alert_policy_check
  check (
    litter_gain_alert_policy is null
    or public.is_valid_litter_gain_alert_policy(litter_gain_alert_policy)
  );

revoke all on function public.is_valid_litter_gain_alert_policy(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_litter_gain_alert_policy(jsonb)
  to authenticated;

comment on column public.organization_settings.litter_gain_alert_policy is
  'Optional breeder-defined V1 display policy for litter weight-gain signals. It is descriptive, configurable, and not a medical threshold.';
