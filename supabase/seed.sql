-- Development-only fixtures. No real personal data or production credentials.
-- Local login: owner@saasphase1.invalid / LocalDevOwner-2026!

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone_change,
  phone_change_token,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'owner@saasphase1.invalid',
  extensions.crypt('LocalDevOwner-2026!', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Owner développement"}'::jsonb,
  now(),
  now()
);

-- Supabase Auth password login requires a matching email identity.
insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000001',
    'email', 'owner@saasphase1.invalid',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now()
);

insert into public.organizations (
  id,
  name,
  legal_name,
  slug,
  email,
  country,
  affix_name,
  dog_affix_name
)
values (
  '20000000-0000-4000-8000-000000000001',
  'Élevage de démonstration',
  'Élevage de démonstration',
  'elevage-demo',
  'contact@saasphase1.invalid',
  'FR',
  'Affixe Démonstration',
  'Affixe Démonstration'
);

insert into public.memberships (
  id,
  organization_id,
  profile_id,
  role,
  status,
  created_by,
  updated_by
)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'owner',
  'active',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.organization_settings (
  id,
  organization_id,
  default_species,
  default_dog_breed,
  default_currency,
  default_puppy_price_cents,
  created_by,
  updated_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'dog',
  'Golden Retriever',
  'EUR',
  180000,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.litter_groups (
  id,
  organization_id,
  name,
  description,
  species,
  expected_period_start,
  expected_period_end,
  status,
  created_by,
  updated_by
)
values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Portées Golden Retriever 2026',
  'Groupe de portées fictif réservé au développement local.',
  'dog',
  '2026-01-01',
  '2026-12-31',
  'open_for_applications',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.public_forms (
  id,
  organization_id,
  name,
  slug,
  form_type,
  species,
  breed,
  litter_group_id,
  is_active,
  title,
  description,
  success_message,
  created_by,
  updated_by
)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Candidature Golden Retriever 2026',
  'golden-retriever-2026',
  'adoption_application',
  'dog',
  'Golden Retriever',
  '50000000-0000-4000-8000-000000000001',
  true,
  'Candidature Golden Retriever 2026',
  'Formulaire fictif pour tester le workflow de candidature en développement.',
  'Merci, votre candidature de démonstration a bien été enregistrée.',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
