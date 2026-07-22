alter table public.organization_settings
  add column maternal_temperature_drop_policy jsonb;

create or replace function public.is_valid_maternal_temperature_drop_policy(
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
      'referenceMeasurementCount',
      'dropThresholdCelsius'
    ]) then false
    when jsonb_typeof(p_policy -> 'version') <> 'number' then false
    when jsonb_typeof(p_policy -> 'referenceMeasurementCount') <> 'number' then false
    when jsonb_typeof(p_policy -> 'dropThresholdCelsius') <> 'number' then false
    else
      (p_policy ->> 'version')::numeric = 1
      and (p_policy ->> 'referenceMeasurementCount')::numeric =
        trunc((p_policy ->> 'referenceMeasurementCount')::numeric)
      and (p_policy ->> 'referenceMeasurementCount')::numeric between 2 and 10
      and (p_policy ->> 'dropThresholdCelsius')::numeric between 0.1 and 3.0
      and (p_policy ->> 'dropThresholdCelsius')::numeric * 100 =
        trunc((p_policy ->> 'dropThresholdCelsius')::numeric * 100)
  end;
$$;

alter table public.organization_settings
  add constraint organization_settings_maternal_temperature_drop_policy_check
  check (
    maternal_temperature_drop_policy is null
    or public.is_valid_maternal_temperature_drop_policy(
      maternal_temperature_drop_policy
    )
  );

revoke all on function public.is_valid_maternal_temperature_drop_policy(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_maternal_temperature_drop_policy(jsonb)
  to authenticated;

comment on column public.organization_settings.maternal_temperature_drop_policy is
  'Optional breeder-defined V1 marker policy comparing the latest maternal temperature with the median of preceding measurements. It is not a medical threshold or a birth prediction.';
