begin;

alter table public.events
  drop constraint events_type_check;

alter table public.events
  add constraint events_type_check
  check (event_type in (
    'contact_follow_up',
    'application_review',
    'payment_due',
    'document_due',
    'mating',
    'pregnancy_check',
    'ultrasound',
    'vaccination',
    'xray',
    'birth_expected',
    'birth_actual',
    'puppy_choice',
    'adoption',
    'post_adoption_follow_up',
    'other',
    'health_other'
  ));

create or replace function public.guard_animal_sensitive_breeding_decisions()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_user uuid := auth.uid();
  v_is_sensitive boolean;
begin
  v_is_sensitive := case
    when tg_op = 'INSERT' then
      new.is_breeder or new.status in ('available', 'kept')
    else
      old.is_breeder is distinct from new.is_breeder
      or (
        old.status is distinct from new.status
        and (
          old.status = 'kept'
          or new.status in ('kept', 'available')
          or (old.status = 'available' and new.status = 'born')
        )
      )
  end;

  if not v_is_sensitive then
    return new;
  end if;

  -- Les migrations, seeds et opérations SQL de maintenance locale n'ont pas
  -- d'identité Auth. Les appels applicatifs et RPC conservent auth.uid().
  if v_user is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.memberships membership
    where membership.organization_id = new.organization_id
      and membership.profile_id = v_user
      and membership.role in ('owner', 'admin')
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    raise exception 'owner_or_admin_required_for_animal_breeding_decision'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create trigger animals_guard_sensitive_breeding_decisions
before insert or update of status, is_breeder on public.animals
for each row execute function public.guard_animal_sensitive_breeding_decisions();

revoke all on function public.guard_animal_sensitive_breeding_decisions()
  from public, anon, authenticated, service_role;

commit;
