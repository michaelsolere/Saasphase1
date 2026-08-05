-- ADOPTER-FINANCIAL-RESOLUTION-01
-- Expose the current resolution state to read-only journey projections.

begin;

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
  r.updated_at,
  r.financial_resolution,
  r.financial_resolution_notes,
  r.current_financial_resolution_event_id
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

commit;
