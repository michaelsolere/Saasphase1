-- Keep litter projections derived from active births when a cancelled birth order is reused.
do $$
declare
  v_definition text;
  v_fragment text;
  v_replacement text;
  v_occurrences integer;
begin
  v_definition := pg_get_functiondef(
    'public.record_whelping_birth(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure
  );

  v_fragment := E'    where session.organization_id = v_litter.organization_id\n      and session.litter_id = v_litter.id\n  ) aggregates;';
  v_replacement := E'    where session.organization_id = v_litter.organization_id\n      and session.litter_id = v_litter.id\n      and birth.cancelled_at is null\n  ) aggregates;';
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_fragment, ''))
  ) / length(v_fragment);

  if v_occurrences <> 1 then
    raise exception
      'record_whelping_birth projection fix failed: expected aggregate fragment once, found %',
      v_occurrences;
  end if;

  execute replace(v_definition, v_fragment, v_replacement);
end;
$$;

comment on function public.record_whelping_birth(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) is
  'Atomically records a birth, its immutable timeline event, produced animal, optional birth weight, and litter projections derived only from active births.';
