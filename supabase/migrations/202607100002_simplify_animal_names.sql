do $$
declare
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.animals
  where nullif(btrim(chosen_name_by_adopter), '') is not null
    and nullif(btrim(call_name), '') is not null
    and nullif(btrim(chosen_name_by_adopter), '') is distinct from nullif(btrim(call_name), '');

  if v_count > 0 then
    raise exception 'animal name migration blocked: % chosen_name_by_adopter/call_name conflicts', v_count;
  end if;

  select count(*)::integer
  into v_count
  from public.animals
  where nullif(btrim(official_affix_name), '') is not null
    and nullif(btrim(official_name), '') is not null
    and nullif(btrim(official_affix_name), '') is distinct from nullif(btrim(official_name), '');

  if v_count > 0 then
    raise exception 'animal name migration blocked: % official_affix_name/official_name conflicts', v_count;
  end if;

  select count(*)::integer
  into v_count
  from public.animals
  where nullif(btrim(display_name), '') is not null
    and nullif(btrim(call_name), '') is null
    and nullif(btrim(official_name), '') is null
    and nullif(btrim(chosen_name_by_adopter), '') is null
    and nullif(btrim(official_affix_name), '') is null
    and (
      display_name ~* '^(collier|chiot|chaton)(\\s|$)'
      or display_name like '% — %×%'
    )
    and (
      litter_id is null
      or (
        nullif(btrim(collar_color_current), '') is null
        and nullif(btrim(collar_color_initial), '') is null
        and birth_order is null
      )
    );

  if v_count > 0 then
    raise exception 'animal name migration blocked: % technical display names cannot be recalculated from litter/collar/birth order data', v_count;
  end if;

  select count(*)::integer
  into v_count
  from public.animals
  where nullif(btrim(display_name), '') is not null
    and nullif(btrim(call_name), '') is null
    and nullif(btrim(official_name), '') is null
    and nullif(btrim(chosen_name_by_adopter), '') is null
    and nullif(btrim(official_affix_name), '') is null
    and not (
      display_name ~* '^(collier|chiot|chaton)(\\s|$)'
      or display_name like '% — %×%'
    )
    and litter_id is not null;

  if v_count > 0 then
    raise exception 'animal name migration blocked: % litter animals have ambiguous real-vs-technical display names', v_count;
  end if;
end $$;

update public.animals
set call_name = nullif(btrim(chosen_name_by_adopter), '')
where nullif(btrim(call_name), '') is null
  and nullif(btrim(chosen_name_by_adopter), '') is not null;

update public.animals
set official_name = nullif(btrim(official_affix_name), '')
where nullif(btrim(official_name), '') is null
  and nullif(btrim(official_affix_name), '') is not null;

update public.animals
set official_name = nullif(btrim(display_name), '')
where nullif(btrim(official_name), '') is null
  and nullif(btrim(display_name), '') is not null
  and not (
    display_name ~* '^(collier|chiot|chaton)(\\s|$)'
    or display_name like '% — %×%'
  );

drop view public.reservation_overview;
drop view public.litter_overview;

create view public.reservation_overview
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
  coalesce(nullif(btrim(an.call_name), ''), nullif(btrim(an.official_name), '')) as animal_display_name,
  an.call_name as animal_call_name,
  an.official_name as animal_official_name,
  an.species as animal_species,
  an.litter_id as animal_litter_id,
  an.birth_order as animal_birth_order,
  an.collar_color_current as animal_collar_color_current,
  an.collar_color_initial as animal_collar_color_initial,
  mother.call_name as animal_mother_call_name,
  father.call_name as animal_father_call_name,
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
left join public.litters animal_litter
  on animal_litter.id = an.litter_id
  and animal_litter.organization_id = an.organization_id
left join public.animals mother
  on mother.id = animal_litter.mother_id
  and mother.organization_id = animal_litter.organization_id
left join public.animals father
  on father.id = animal_litter.father_id
  and father.organization_id = animal_litter.organization_id
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

create view public.litter_overview
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
  coalesce(nullif(btrim(mother.call_name), ''), nullif(btrim(mother.official_name), '')) as mother_display_name,
  mother.call_name as mother_call_name,
  mother.official_name as mother_official_name,
  l.father_id,
  coalesce(nullif(btrim(father.call_name), ''), nullif(btrim(father.official_name), '')) as father_display_name,
  father.call_name as father_call_name,
  father.official_name as father_official_name,
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

grant select on public.reservation_overview to authenticated;
grant select on public.litter_overview to authenticated;

alter table public.animals
  drop column display_name,
  drop column temporary_name,
  drop column chosen_name_by_adopter,
  drop column official_affix_name;
