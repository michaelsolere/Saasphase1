create schema if not exists private;

create or replace function private.list_active_public_forms()
returns table (
  slug text,
  title text,
  description text,
  species text,
  breed text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pf.slug,
    pf.title,
    pf.description,
    pf.species,
    pf.breed
  from public.public_forms pf
  join public.organizations o
    on o.id = pf.organization_id
  where pf.is_active
    and pf.deleted_at is null
    and o.deleted_at is null;
$$;

revoke all on function private.list_active_public_forms() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.list_active_public_forms()
  to anon, authenticated;

drop view public.public_form_public_view;

create view public.public_form_public_view
with (
  security_invoker = true,
  security_barrier = true
)
as
select
  pf.slug,
  pf.title,
  pf.description,
  pf.species,
  pf.breed
from private.list_active_public_forms() pf;

revoke all on public.public_form_public_view from public;
grant select on public.public_form_public_view to anon, authenticated;

revoke all on public.public_forms from anon;

comment on function private.list_active_public_forms() is
  'Returns only active, non-sensitive public form metadata.';

comment on view public.public_form_public_view is
  'Minimal public form metadata exposed with invoker permissions.';
