create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null unique,
  email text,
  phone text,
  website_url text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'FR',
  siret text,
  affix_name text,
  dog_affix_name text,
  cat_affix_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint memberships_organization_profile_key unique (organization_id, profile_id),
  constraint memberships_role_check
    check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint memberships_status_check
    check (status in ('active', 'invited', 'disabled', 'removed'))
);

create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  default_species text not null default 'dog',
  default_dog_breed text not null default 'Golden Retriever',
  default_currency text not null default 'EUR',
  default_pre_reservation_deposit_cents integer not null default 25000,
  default_arrhes_second_payment_cents integer not null default 25000,
  default_puppy_price_cents integer,
  pre_reservation_response_delay_days integer not null default 15,
  dog_gestation_average_days integer not null default 63,
  dog_ultrasound_min_day integer not null default 25,
  dog_ultrasound_max_day integer not null default 30,
  dog_xray_day integer not null default 55,
  puppy_choice_age_weeks integer not null default 7,
  puppy_adoption_age_weeks integer not null default 8,
  post_adoption_follow_up_1_days integer not null default 60,
  post_adoption_follow_up_2_months integer not null default 15,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint organization_settings_currency_check
    check (default_currency ~ '^[A-Z]{3}$'),
  constraint organization_settings_amounts_check
    check (
      default_pre_reservation_deposit_cents >= 0
      and default_arrhes_second_payment_cents >= 0
      and (default_puppy_price_cents is null or default_puppy_price_cents >= 0)
    ),
  constraint organization_settings_delays_check
    check (
      pre_reservation_response_delay_days >= 0
      and dog_gestation_average_days > 0
      and dog_ultrasound_min_day > 0
      and dog_ultrasound_max_day >= dog_ultrasound_min_day
      and dog_xray_day > 0
      and puppy_choice_age_weeks >= 0
      and puppy_adoption_age_weeks >= puppy_choice_age_weeks
      and post_adoption_follow_up_1_days >= 0
      and post_adoption_follow_up_2_months >= 0
    )
);

create index memberships_organization_id_idx
  on public.memberships (organization_id);
create index memberships_profile_id_idx
  on public.memberships (profile_id);
create index memberships_active_lookup_idx
  on public.memberships (profile_id, organization_id)
  where status = 'active' and deleted_at is null;
create index organization_settings_organization_id_idx
  on public.organization_settings (organization_id);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

create trigger organization_settings_set_updated_at
before update on public.organization_settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.email,
    new.phone
  )
  on conflict (id) do update
  set
    email = excluded.email,
    phone = excluded.phone,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, phone, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();
