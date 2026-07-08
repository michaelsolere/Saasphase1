alter table public.organization_settings
  add column default_male_puppy_price_cents integer,
  add column default_female_puppy_price_cents integer;

alter table public.organization_settings
  add constraint organization_settings_sex_puppy_prices_check
    check (
      (default_male_puppy_price_cents is null or default_male_puppy_price_cents >= 0)
      and (default_female_puppy_price_cents is null or default_female_puppy_price_cents >= 0)
    );
