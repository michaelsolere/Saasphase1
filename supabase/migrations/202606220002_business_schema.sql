create table public.litter_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  description text,
  species text not null default 'dog',
  expected_period_start date,
  expected_period_end date,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint litter_groups_organization_id_id_key unique (organization_id, id),
  constraint litter_groups_status_check
    check (status in (
      'planned', 'open_for_applications', 'pregnancy_pending',
      'births_in_progress', 'born', 'closed', 'cancelled', 'archived'
    )),
  constraint litter_groups_period_check
    check (
      expected_period_end is null
      or expected_period_start is null
      or expected_period_end >= expected_period_start
    )
);

create table public.animals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  sex text not null default 'unknown',
  temporary_name text,
  call_name text,
  official_name text,
  display_name text not null,
  birth_date date,
  death_date date,
  status text not null default 'active',
  ownership_status text not null default 'owned',
  is_breeder boolean not null default false,
  is_external boolean not null default false,
  is_retired boolean not null default false,
  color text,
  coat_color text,
  identification_number text,
  lof_number text,
  pedigree_url text,
  father_id uuid,
  mother_id uuid,
  birth_order integer,
  birth_time time,
  birth_weight_grams integer,
  collar_color_initial text,
  collar_color_current text,
  collar_color_note text,
  chosen_name_by_adopter text,
  official_affix_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint animals_organization_id_id_key unique (organization_id, id),
  constraint animals_father_organization_fk
    foreign key (organization_id, father_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint animals_mother_organization_fk
    foreign key (organization_id, mother_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint animals_sex_check check (sex in ('male', 'female', 'unknown')),
  constraint animals_status_check
    check (status in (
      'planned', 'born', 'active', 'available', 'reserved', 'adopted',
      'kept', 'breeding', 'retired', 'deceased', 'archived'
    )),
  constraint animals_ownership_status_check
    check (ownership_status in (
      'owned', 'produced', 'external_stud', 'external_female',
      'co_owned', 'sold', 'adopted_out', 'unknown'
    )),
  constraint animals_dates_check
    check (death_date is null or birth_date is null or death_date >= birth_date),
  constraint animals_birth_values_check
    check (
      (birth_order is null or birth_order > 0)
      and (birth_weight_grams is null or birth_weight_grams > 0)
    ),
  constraint animals_distinct_parents_check
    check (father_id is null or mother_id is null or father_id <> mother_id),
  constraint animals_not_own_parent_check
    check (
      (father_id is null or father_id <> id)
      and (mother_id is null or mother_id <> id)
    )
);

create table public.litters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litter_group_id uuid,
  name text not null,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  mother_id uuid,
  father_id uuid,
  status text not null default 'planned',
  mating_date date,
  mating_date_2 date,
  estimated_ovulation_date date,
  expected_birth_date date,
  actual_birth_date date,
  pregnancy_confirmed_at date,
  pregnancy_confirmation_method text,
  expected_puppy_count integer,
  born_total_count integer,
  born_male_count integer,
  born_female_count integer,
  alive_count integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint litters_organization_id_id_key unique (organization_id, id),
  constraint litters_litter_group_organization_fk
    foreign key (organization_id, litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  constraint litters_mother_organization_fk
    foreign key (organization_id, mother_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint litters_father_organization_fk
    foreign key (organization_id, father_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint litters_status_check
    check (status in (
      'planned', 'mating_done', 'pregnancy_unconfirmed', 'pregnancy_confirmed',
      'birth_expected', 'birth_in_progress', 'born', 'puppies_created',
      'choice_period', 'ready_to_leave', 'closed', 'cancelled', 'archived'
    )),
  constraint litters_distinct_parents_check
    check (father_id is null or mother_id is null or father_id <> mother_id),
  constraint litters_counts_check
    check (
      (expected_puppy_count is null or expected_puppy_count >= 0)
      and (born_total_count is null or born_total_count >= 0)
      and (born_male_count is null or born_male_count >= 0)
      and (born_female_count is null or born_female_count >= 0)
      and (alive_count is null or alive_count >= 0)
      and (
        born_total_count is null
        or born_male_count is null
        or born_female_count is null
        or born_male_count + born_female_count <= born_total_count
      )
      and (
        alive_count is null
        or born_total_count is null
        or alive_count <= born_total_count
      )
    )
);

alter table public.animals
  add column litter_id uuid,
  add constraint animals_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict;

create table public.public_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  form_type text not null default 'adoption_application',
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  litter_group_id uuid,
  litter_id uuid,
  is_active boolean not null default true,
  title text,
  description text,
  success_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint public_forms_organization_id_id_key unique (organization_id, id),
  constraint public_forms_organization_slug_key unique (organization_id, slug),
  constraint public_forms_litter_group_organization_fk
    foreign key (organization_id, litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  constraint public_forms_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint public_forms_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_type text not null default 'person',
  first_name text,
  last_name text,
  family_or_structure_name text,
  display_name text not null,
  email text,
  phone text,
  secondary_phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'FR',
  origin_channel text,
  origin_details text,
  primary_status text not null default 'active',
  internal_comment text,
  restriction_level text not null default 'none',
  restriction_reason text,
  restriction_added_at timestamptz,
  restriction_review_at timestamptz,
  restriction_visible_admin_only boolean not null default true,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint contacts_organization_id_id_key unique (organization_id, id),
  constraint contacts_type_check
    check (contact_type in ('person', 'family', 'organization', 'professional', 'other')),
  constraint contacts_restriction_level_check
    check (restriction_level in (
      'none', 'vigilance', 'adoption_discouraged', 'do_not_place_animal'
    ))
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  public_form_id uuid not null,
  public_reference uuid not null default gen_random_uuid(),
  form_type text not null default 'adoption_application',
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  contact_id uuid,
  first_name text,
  last_name text,
  family_or_structure_name text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'FR',
  desired_sex_preference text not null default 'unknown',
  project_description text,
  raw_data jsonb not null default '{}'::jsonb,
  source_channel text not null default 'sms_link',
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  duplicate_candidate_contact_id uuid,
  duplicate_resolution text,
  ip_address inet,
  user_agent text,
  consent_data_processing boolean not null default false,
  consent_contact boolean not null default false,
  internal_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint form_submissions_organization_id_id_key unique (organization_id, id),
  constraint form_submissions_public_reference_key unique (public_reference),
  constraint form_submissions_public_form_organization_fk
    foreign key (organization_id, public_form_id)
    references public.public_forms (organization_id, id) on delete restrict,
  constraint form_submissions_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint form_submissions_duplicate_contact_organization_fk
    foreign key (organization_id, duplicate_candidate_contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint form_submissions_desired_sex_check
    check (desired_sex_preference in (
      'male_only', 'female_only', 'male_preferred_female_possible',
      'female_preferred_male_possible', 'no_preference', 'unknown'
    )),
  constraint form_submissions_source_channel_check
    check (source_channel in (
      'sms_link', 'email_link', 'facebook_link', 'instagram_link',
      'whatsapp_link', 'leboncoin_link', 'website', 'manual', 'other', 'unknown'
    )),
  constraint form_submissions_status_check
    check (status in (
      'submitted', 'contact_created', 'contact_updated', 'application_created',
      'needs_review', 'reviewed', 'duplicate_suspected', 'merged',
      'rejected', 'archived'
    ))
);

create table public.contact_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  role text not null,
  started_at date,
  ended_at date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint contact_roles_organization_id_id_key unique (organization_id, id),
  constraint contact_roles_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint contact_roles_role_check
    check (role in (
      'prospect', 'candidate', 'pre_reservation_holder', 'reservation_holder',
      'adopter', 'former_adopter', 'stud_owner', 'veterinarian',
      'partner_breeder', 'mediation_organization', 'supplier', 'other'
    )),
  constraint contact_roles_dates_check
    check (ended_at is null or started_at is null or ended_at >= started_at)
);

create unique index contact_roles_one_active_role_idx
  on public.contact_roles (organization_id, contact_id, role)
  where is_active and deleted_at is null;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  form_submission_id uuid,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  desired_period text,
  desired_litter_group_id uuid,
  desired_litter_id uuid,
  desired_sex_preference text not null default 'unknown',
  desired_quantity integer not null default 1,
  project_description text,
  internal_comment text,
  housing_type text,
  has_garden boolean,
  garden_fenced boolean,
  adults_count integer,
  children_description text,
  other_animals text,
  dog_experience text,
  daily_absence text,
  planned_activities text,
  specific_project text,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  initial_rank integer,
  active_rank integer,
  rank_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint applications_organization_id_id_key unique (organization_id, id),
  constraint applications_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint applications_form_submission_organization_fk
    foreign key (organization_id, form_submission_id)
    references public.form_submissions (organization_id, id) on delete restrict,
  constraint applications_litter_group_organization_fk
    foreign key (organization_id, desired_litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  constraint applications_litter_organization_fk
    foreign key (organization_id, desired_litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint applications_desired_sex_check
    check (desired_sex_preference in (
      'male_only', 'female_only', 'male_preferred_female_possible',
      'female_preferred_male_possible', 'no_preference', 'unknown'
    )),
  constraint applications_status_check
    check (status in (
      'new', 'to_review', 'to_call', 'qualified', 'waiting_litter',
      'rejected', 'withdrawn', 'archived'
    )),
  constraint applications_values_check
    check (
      desired_quantity > 0
      and (adults_count is null or adults_count >= 0)
      and (initial_rank is null or initial_rank > 0)
      and (active_rank is null or active_rank > 0)
    )
);

alter table public.form_submissions
  add column application_id uuid,
  add constraint form_submissions_application_organization_fk
    foreign key (organization_id, application_id)
    references public.applications (organization_id, id) on delete restrict;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  application_id uuid,
  litter_group_id uuid,
  litter_id uuid,
  animal_id uuid,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  reserved_sex_preference text not null default 'unknown',
  rank_initial integer,
  rank_active integer,
  rank_assigned_at timestamptz,
  rank_expires_at timestamptz,
  rank_priority_override boolean not null default false,
  rank_priority_reason text,
  status text not null default 'draft',
  pre_reservation_deadline timestamptz,
  reservation_confirmed_at timestamptz,
  animal_assigned_at timestamptz,
  animal_assignment_locked boolean not null default false,
  choice_meeting_at timestamptz,
  choice_meeting_mode text not null default 'not_defined',
  adoption_planned_at timestamptz,
  adoption_completed_at timestamptz,
  price_cents integer,
  currency text not null default 'EUR',
  withdrawal_reason text,
  withdrawn_at timestamptz,
  financial_resolution text not null default 'none',
  financial_resolution_notes text,
  internal_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint reservations_organization_id_id_key unique (organization_id, id),
  constraint reservations_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint reservations_application_organization_fk
    foreign key (organization_id, application_id)
    references public.applications (organization_id, id) on delete restrict,
  constraint reservations_litter_group_organization_fk
    foreign key (organization_id, litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  constraint reservations_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint reservations_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint reservations_desired_sex_check
    check (reserved_sex_preference in (
      'male_only', 'female_only', 'male_preferred_female_possible',
      'female_preferred_male_possible', 'no_preference', 'unknown'
    )),
  constraint reservations_status_check
    check (status in (
      'draft', 'pending_positioning', 'pre_reservation_requested',
      'pre_reservation_paid', 'active', 'confirmed_after_birth',
      'waiting_for_available_sex', 'postponed', 'animal_assigned',
      'adoption_ready', 'adopted', 'withdrawn', 'expired',
      'cancelled', 'archived'
    )),
  constraint reservations_choice_meeting_mode_check
    check (choice_meeting_mode in ('in_person', 'video', 'phone', 'not_defined')),
  constraint reservations_financial_resolution_check
    check (financial_resolution in (
      'none', 'full_refund', 'partial_refund', 'credit_issued',
      'transfer_to_future_reservation', 'withholding_applied',
      'no_refund', 'pending', 'other'
    )),
  constraint reservations_values_check
    check (
      (rank_initial is null or rank_initial > 0)
      and (rank_active is null or rank_active > 0)
      and (price_cents is null or price_cents >= 0)
      and currency ~ '^[A-Z]{3}$'
    )
);

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  document_type text not null,
  species text not null default 'dog',
  breed text not null default 'Golden Retriever',
  template_format text not null default 'html',
  template_content text,
  version integer not null default 1,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint document_templates_organization_id_id_key unique (organization_id, id),
  constraint document_templates_format_check
    check (template_format in ('html', 'markdown', 'docx', 'pdf_form', 'other')),
  constraint document_templates_type_check
    check (document_type in (
      'phone_call_summary', 'plaud_transcript', 'application_form',
      'reservation_contract', 'commitment_certificate', 'payment_receipt',
      'invoice', 'sale_certificate', 'welcome_booklet',
      'photo_use_authorization', 'other'
    )),
  constraint document_templates_version_check check (version > 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  reservation_id uuid,
  amount_cents integer not null,
  currency text not null default 'EUR',
  payment_type text not null,
  status text not null default 'requested',
  requested_at timestamptz,
  due_date date,
  paid_at timestamptz,
  refunded_at timestamptz,
  payment_method text not null default 'unknown',
  external_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint payments_organization_id_id_key unique (organization_id, id),
  constraint payments_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint payments_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint payments_amount_check check (amount_cents > 0),
  constraint payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payments_type_check
    check (payment_type in (
      'pre_reservation_deposit_refundable', 'arrhes', 'balance', 'refund',
      'partial_refund', 'credit_use', 'withholding',
      'transfer_to_future_reservation', 'other'
    )),
  constraint payments_status_check
    check (status in (
      'requested', 'pending', 'partially_paid', 'paid', 'partially_refunded',
      'refunded', 'converted_to_credit', 'transferred', 'cancelled',
      'failed', 'disputed'
    )),
  constraint payments_method_check
    check (payment_method in (
      'bank_transfer', 'cash', 'card', 'cheque', 'paypal',
      'stripe', 'other', 'unknown'
    ))
);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  origin_reservation_id uuid,
  origin_payment_id uuid,
  amount_initial_cents integer not null,
  amount_remaining_cents integer not null,
  currency text not null default 'EUR',
  reason text,
  status text not null default 'active',
  issued_at date not null default current_date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint credits_organization_id_id_key unique (organization_id, id),
  constraint credits_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint credits_reservation_organization_fk
    foreign key (organization_id, origin_reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint credits_payment_organization_fk
    foreign key (organization_id, origin_payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint credits_status_check
    check (status in ('active', 'partially_used', 'used', 'expired', 'cancelled')),
  constraint credits_amounts_check
    check (
      amount_initial_cents > 0
      and amount_remaining_cents >= 0
      and amount_remaining_cents <= amount_initial_cents
    ),
  constraint credits_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint credits_dates_check check (expires_at is null or expires_at >= issued_at)
);

create table public.credit_usages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  credit_id uuid not null,
  contact_id uuid not null,
  target_reservation_id uuid,
  target_payment_id uuid,
  amount_used_cents integer not null,
  used_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint credit_usages_organization_id_id_key unique (organization_id, id),
  constraint credit_usages_credit_organization_fk
    foreign key (organization_id, credit_id)
    references public.credits (organization_id, id) on delete restrict,
  constraint credit_usages_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint credit_usages_reservation_organization_fk
    foreign key (organization_id, target_reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint credit_usages_payment_organization_fk
    foreign key (organization_id, target_payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint credit_usages_amount_check check (amount_used_cents > 0),
  constraint credit_usages_target_check
    check (target_reservation_id is not null or target_payment_id is not null)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_id uuid,
  generated_from_template boolean not null default false,
  generated_at timestamptz,
  generation_data jsonb not null default '{}'::jsonb,
  contact_id uuid,
  application_id uuid,
  reservation_id uuid,
  litter_id uuid,
  animal_id uuid,
  payment_id uuid,
  document_type text not null,
  status text not null default 'to_generate',
  title text not null,
  file_path text,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  sent_at timestamptz,
  signed_at timestamptz,
  received_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  signature_required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint documents_organization_id_id_key unique (organization_id, id),
  constraint documents_template_organization_fk
    foreign key (organization_id, template_id)
    references public.document_templates (organization_id, id) on delete restrict,
  constraint documents_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint documents_application_organization_fk
    foreign key (organization_id, application_id)
    references public.applications (organization_id, id) on delete restrict,
  constraint documents_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint documents_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint documents_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint documents_payment_organization_fk
    foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint documents_type_check
    check (document_type in (
      'phone_call_summary', 'plaud_transcript', 'application_form',
      'reservation_contract', 'commitment_certificate', 'payment_receipt',
      'invoice', 'sale_certificate', 'welcome_booklet',
      'photo_use_authorization', 'other'
    )),
  constraint documents_status_check
    check (status in (
      'to_generate', 'generated', 'uploaded', 'sent', 'signed', 'received',
      'archived', 'missing', 'expired', 'cancelled', 'not_applicable'
    )),
  constraint documents_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint documents_generation_check
    check (
      not generated_from_template
      or template_id is not null
      or generated_at is not null
    )
);

alter table public.payments
  add column document_id uuid,
  add constraint payments_document_organization_fk
    foreign key (organization_id, document_id)
    references public.documents (organization_id, id) on delete restrict;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid,
  reservation_id uuid,
  litter_id uuid,
  animal_id uuid,
  media_type text not null default 'photo',
  source text not null default 'manual_upload',
  title text,
  description text,
  file_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  received_at timestamptz,
  taken_at timestamptz,
  puppy_age_days integer,
  publication_authorization text not null default 'unknown',
  visibility text not null default 'internal',
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint media_organization_id_id_key unique (organization_id, id),
  constraint media_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint media_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint media_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint media_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint media_type_check check (media_type in ('photo', 'video', 'audio', 'other')),
  constraint media_source_check
    check (source in ('manual_upload', 'form_submission', 'generated', 'import', 'other')),
  constraint media_publication_authorization_check
    check (publication_authorization in ('unknown', 'authorized', 'refused', 'restricted')),
  constraint media_visibility_check
    check (visibility in ('internal', 'admin_only', 'shared', 'public')),
  constraint media_values_check
    check (
      (file_size_bytes is null or file_size_bytes >= 0)
      and (puppy_age_days is null or puppy_age_days >= 0)
    )
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid,
  application_id uuid,
  reservation_id uuid,
  litter_id uuid,
  animal_id uuid,
  payment_id uuid,
  document_id uuid,
  note_type text not null default 'internal',
  title text,
  body text not null,
  is_pinned boolean not null default false,
  visibility text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint notes_organization_id_id_key unique (organization_id, id),
  constraint notes_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint notes_application_organization_fk
    foreign key (organization_id, application_id)
    references public.applications (organization_id, id) on delete restrict,
  constraint notes_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint notes_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint notes_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint notes_payment_organization_fk
    foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint notes_document_organization_fk
    foreign key (organization_id, document_id)
    references public.documents (organization_id, id) on delete restrict,
  constraint notes_type_check
    check (note_type in (
      'internal', 'call_summary', 'plaud_summary', 'follow_up',
      'decision', 'health', 'other'
    )),
  constraint notes_visibility_check
    check (visibility in ('internal', 'admin_only', 'shared')),
  constraint notes_subject_check
    check (num_nonnulls(
      contact_id, application_id, reservation_id, litter_id,
      animal_id, payment_id, document_id
    ) > 0)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid,
  application_id uuid,
  reservation_id uuid,
  litter_id uuid,
  animal_id uuid,
  payment_id uuid,
  document_id uuid,
  event_type text not null,
  title text not null,
  description text,
  planned_at timestamptz,
  planned_date date,
  actual_at timestamptz,
  status text not null default 'planned',
  priority text not null default 'normal',
  is_task boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint events_organization_id_id_key unique (organization_id, id),
  constraint events_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint events_application_organization_fk
    foreign key (organization_id, application_id)
    references public.applications (organization_id, id) on delete restrict,
  constraint events_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint events_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint events_animal_organization_fk
    foreign key (organization_id, animal_id)
    references public.animals (organization_id, id) on delete restrict,
  constraint events_payment_organization_fk
    foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint events_document_organization_fk
    foreign key (organization_id, document_id)
    references public.documents (organization_id, id) on delete restrict,
  constraint events_type_check
    check (event_type in (
      'contact_follow_up', 'application_review', 'payment_due', 'document_due',
      'mating', 'pregnancy_check', 'ultrasound', 'vaccination', 'xray',
      'birth_expected', 'birth_actual', 'puppy_choice', 'adoption',
      'post_adoption_follow_up', 'other'
    )),
  constraint events_status_check
    check (status in ('planned', 'todo', 'done', 'late', 'cancelled', 'postponed', 'not_applicable')),
  constraint events_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint events_schedule_check
    check (planned_at is not null or planned_date is not null or actual_at is not null)
);
