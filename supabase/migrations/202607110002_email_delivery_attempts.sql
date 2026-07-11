create table public.email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  reservation_id uuid,
  litter_id uuid,
  litter_group_id uuid,
  email_template_id uuid,
  message_type text not null,
  recipient_email text not null,
  recipient_name text,
  subject_snapshot text,
  variables_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  brevo_message_id text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint email_delivery_attempts_organization_id_id_key unique (organization_id, id),
  constraint email_delivery_attempts_organization_idempotency_key_key
    unique (organization_id, idempotency_key),
  constraint email_delivery_attempts_contact_organization_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete restrict,
  constraint email_delivery_attempts_reservation_organization_fk
    foreign key (organization_id, reservation_id)
    references public.reservations (organization_id, id) on delete restrict,
  constraint email_delivery_attempts_litter_organization_fk
    foreign key (organization_id, litter_id)
    references public.litters (organization_id, id) on delete restrict,
  constraint email_delivery_attempts_litter_group_organization_fk
    foreign key (organization_id, litter_group_id)
    references public.litter_groups (organization_id, id) on delete restrict,
  constraint email_delivery_attempts_email_template_organization_fk
    foreign key (organization_id, email_template_id)
    references public.email_templates (organization_id, id) on delete restrict,
  constraint email_delivery_attempts_message_type_check
    check (btrim(message_type) <> ''),
  constraint email_delivery_attempts_recipient_email_check
    check (btrim(recipient_email) <> ''),
  constraint email_delivery_attempts_idempotency_key_check
    check (btrim(idempotency_key) <> ''),
  constraint email_delivery_attempts_status_check
    check (status in ('pending', 'sent', 'failed')),
  constraint email_delivery_attempts_attempt_count_check
    check (attempt_count >= 0),
  constraint email_delivery_attempts_variables_snapshot_object_check
    check (jsonb_typeof(variables_snapshot) = 'object')
);

create index email_delivery_attempts_organization_id_idx
  on public.email_delivery_attempts (organization_id);
create index email_delivery_attempts_contact_id_idx
  on public.email_delivery_attempts (contact_id);
create index email_delivery_attempts_reservation_id_idx
  on public.email_delivery_attempts (reservation_id);
create index email_delivery_attempts_litter_id_idx
  on public.email_delivery_attempts (litter_id);
create index email_delivery_attempts_litter_group_id_idx
  on public.email_delivery_attempts (litter_group_id);
create index email_delivery_attempts_status_idx
  on public.email_delivery_attempts (organization_id, status);
create index email_delivery_attempts_brevo_message_id_idx
  on public.email_delivery_attempts (brevo_message_id)
  where brevo_message_id is not null;
create index email_delivery_attempts_created_at_idx
  on public.email_delivery_attempts (organization_id, created_at desc);

create trigger email_delivery_attempts_set_updated_at
before update on public.email_delivery_attempts
for each row execute function public.set_updated_at();

alter table public.email_delivery_attempts enable row level security;

create policy email_delivery_attempts_select_member
on public.email_delivery_attempts
for select
to authenticated
using (public.is_member_of(organization_id));

create policy email_delivery_attempts_insert_writer
on public.email_delivery_attempts
for insert
to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

create policy email_delivery_attempts_update_writer
on public.email_delivery_attempts
for update
to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

grant select, insert, update on public.email_delivery_attempts to authenticated;
