-- POST-ADOPTION-QUESTIONNAIRE-REVIEW-FOLLOWUP-01
-- Serialize parent-anchor mutations with instance materialization and keep
-- RLS-visible reconciliation diagnostics free of raw PostgreSQL messages.

begin;

drop trigger if exists aa_post_adoption_questionnaire_instances_lock_anchors
  on public.post_adoption_questionnaire_instances;
drop trigger if exists aa_reservations_lock_post_adoption_questionnaire_anchor
  on public.reservations;
drop trigger if exists aa_contacts_lock_post_adoption_questionnaire_anchor
  on public.contacts;
drop trigger if exists aa_animals_lock_post_adoption_questionnaire_anchor
  on public.animals;

drop function if exists public.lock_post_adoption_questionnaire_reservation_anchor();
drop function if exists public.lock_post_adoption_questionnaire_contact_anchor();
drop function if exists public.lock_post_adoption_questionnaire_animal_anchor();
drop function if exists public.acquire_post_adoption_questionnaire_anchor_lock(text, uuid);

create or replace function public.lock_post_adoption_questionnaire_instance_anchors()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  -- A parent UPDATE owns its tuple lock before its row trigger executes. Lock the
  -- same tuples here, in one canonical table order, rather than mixing tuple and
  -- advisory locks. NOWAIT turns contention into an auditable retry instead of
  -- allowing lock-order cycles between concurrent materialization transactions.
  perform 1
  from public.reservations reservation
  where reservation.organization_id = new.organization_id
    and reservation.id = new.reservation_id
  for no key update of reservation nowait;

  if not found then
    raise exception 'post-adoption questionnaire instance reservation linkage is invalid'
      using errcode = '23514';
  end if;

  perform 1
  from public.contacts contact
  where contact.organization_id = new.organization_id
    and contact.id = new.contact_id
    and contact.deleted_at is null
  for no key update of contact nowait;

  if not found then
    raise exception 'post-adoption questionnaire instance contact linkage is invalid'
      using errcode = '23514';
  end if;

  perform 1
  from public.animals animal
  where animal.organization_id = new.organization_id
    and animal.id = new.animal_id
    and animal.deleted_at is null
  for no key update of animal nowait;

  if not found then
    raise exception 'post-adoption questionnaire instance animal linkage is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger aa_post_adoption_questionnaire_instances_lock_anchors
before insert on public.post_adoption_questionnaire_instances
for each row execute function public.lock_post_adoption_questionnaire_instance_anchors();

create or replace function public.protect_effective_adoption_questionnaire_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if old.status = 'adopted'
    and old.adoption_completed_at is not null
    and (
      new.organization_id is distinct from old.organization_id
      or new.contact_id is distinct from old.contact_id
      or new.animal_id is distinct from old.animal_id
      or new.species is distinct from old.species
      or new.breed is distinct from old.breed
      or new.status is distinct from old.status
      or new.adoption_completed_at is distinct from old.adoption_completed_at
      or new.deleted_at is distinct from old.deleted_at
    )
  then
    raise exception 'effective adoption questionnaire anchor requires an explicit correction workflow'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

drop trigger if exists ab_reservations_protect_effective_adoption_questionnaire_anchor
  on public.reservations;

create trigger ab_reservations_protect_effective_adoption_questionnaire_anchor
before update of
  organization_id,
  contact_id,
  animal_id,
  species,
  breed,
  status,
  adoption_completed_at,
  deleted_at
on public.reservations
for each row execute function public.protect_effective_adoption_questionnaire_anchor();

create or replace function public.protect_effective_adoption_questionnaire_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if (
    new.organization_id is distinct from old.organization_id
    or new.deleted_at is distinct from old.deleted_at
  ) then
    -- Prevent a contact mutation from passing its adopted-state check while an
    -- uncommitted reservation transition is about to make that state effective.
    perform 1
    from public.reservations reservation
    where reservation.organization_id = old.organization_id
      and reservation.contact_id = old.id
    order by reservation.id
    for no key update of reservation nowait;

    if exists (
      select 1
      from public.reservations reservation
      where reservation.organization_id = old.organization_id
        and reservation.contact_id = old.id
        and reservation.status = 'adopted'
        and reservation.adoption_completed_at is not null
    ) then
      raise exception 'effective adoption questionnaire contact requires an explicit correction workflow'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists ab_contacts_protect_effective_adoption_questionnaire_anchor
  on public.contacts;

create trigger ab_contacts_protect_effective_adoption_questionnaire_anchor
before update of organization_id, deleted_at
on public.contacts
for each row execute function public.protect_effective_adoption_questionnaire_contact();

create or replace function public.protect_effective_adoption_questionnaire_animal()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if (
    new.organization_id is distinct from old.organization_id
    or new.species is distinct from old.species
    or new.breed is distinct from old.breed
    or new.deleted_at is distinct from old.deleted_at
    or (
      old.birth_date is not null
      and new.birth_date is distinct from old.birth_date
    )
  ) then
    perform 1
    from public.reservations reservation
    where reservation.organization_id = old.organization_id
      and reservation.animal_id = old.id
    order by reservation.id
    for no key update of reservation nowait;

    if exists (
      select 1
      from public.reservations reservation
      where reservation.organization_id = old.organization_id
        and reservation.animal_id = old.id
        and reservation.status = 'adopted'
        and reservation.adoption_completed_at is not null
    ) then
      raise exception 'effective adoption questionnaire animal requires an explicit correction workflow'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists ab_animals_protect_effective_adoption_questionnaire_anchor
  on public.animals;

create trigger ab_animals_protect_effective_adoption_questionnaire_anchor
before update of organization_id, species, breed, birth_date, deleted_at
on public.animals
for each row execute function public.protect_effective_adoption_questionnaire_animal();

create or replace function public.sanitize_post_adoption_questionnaire_attempt_error()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_error_category text;
begin
  if new.outcome <> 'error' then
    return new;
  end if;

  v_error_category := case
    when left(new.error_sqlstate, 2) = '23' then 'integrity_error'
    when new.error_sqlstate in ('40001', '40P01', '55P03') then 'concurrency_error'
    when left(new.error_sqlstate, 2) in ('08', '53', '57', '58') then 'operational_error'
    else 'database_error'
  end;

  new.error_message := 'Post-adoption questionnaire provisioning failed.';
  new.details := jsonb_build_object('errorCategory', v_error_category);

  return new;
end;
$function$;

-- The preceding migration may already have persisted MESSAGE_TEXT. Sanitize
-- those immutable rows inside this migration transaction before the new
-- insertion boundary becomes the only writer path.
alter table public.post_adoption_questionnaire_reconciliation_attempts
  disable trigger post_adoption_questionnaire_reconciliation_attempts_immutable;

update public.post_adoption_questionnaire_reconciliation_attempts attempt
set error_message = 'Post-adoption questionnaire provisioning failed.',
    details = jsonb_build_object(
      'errorCategory',
      case
        when left(attempt.error_sqlstate, 2) = '23' then 'integrity_error'
        when attempt.error_sqlstate in ('40001', '40P01', '55P03') then 'concurrency_error'
        when left(attempt.error_sqlstate, 2) in ('08', '53', '57', '58') then 'operational_error'
        else 'database_error'
      end
    )
where attempt.outcome = 'error';

alter table public.post_adoption_questionnaire_reconciliation_attempts
  enable trigger post_adoption_questionnaire_reconciliation_attempts_immutable;

drop trigger if exists aa_post_adoption_questionnaire_attempts_sanitize_error
  on public.post_adoption_questionnaire_reconciliation_attempts;

create trigger aa_post_adoption_questionnaire_attempts_sanitize_error
before insert on public.post_adoption_questionnaire_reconciliation_attempts
for each row execute function public.sanitize_post_adoption_questionnaire_attempt_error();

-- Supabase's service_role receives default TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- table privileges. TRUNCATE bypasses RLS and row-level immutability triggers,
-- so the release calendar and audit ledger must not inherit those defaults.
revoke all on table
  public.post_adoption_questionnaire_releases,
  public.post_adoption_questionnaire_reconciliation_runs,
  public.post_adoption_questionnaire_reconciliation_attempts,
  public.post_adoption_questionnaire_reconciliation_run_results
from service_role;

revoke execute on function public.lock_post_adoption_questionnaire_instance_anchors()
  from public, anon, authenticated;
revoke execute on function public.protect_effective_adoption_questionnaire_anchor()
  from public, anon, authenticated;
revoke execute on function public.protect_effective_adoption_questionnaire_contact()
  from public, anon, authenticated;
revoke execute on function public.protect_effective_adoption_questionnaire_animal()
  from public, anon, authenticated;
revoke execute on function public.sanitize_post_adoption_questionnaire_attempt_error()
  from public, anon, authenticated;

commit;
