create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_key text not null,
  title text not null,
  category text not null,
  subject text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint email_templates_organization_template_key_key unique (organization_id, template_key),
  constraint email_templates_organization_id_id_key unique (organization_id, id),
  constraint email_templates_template_key_check check (btrim(template_key) <> ''),
  constraint email_templates_title_check check (btrim(title) <> ''),
  constraint email_templates_category_check
    check (category in ('adopter_journey', 'post_adoption')),
  constraint email_templates_subject_check check (btrim(subject) <> ''),
  constraint email_templates_body_check check (btrim(body) <> '')
);

create index email_templates_organization_id_idx
  on public.email_templates (organization_id);
create index email_templates_category_idx
  on public.email_templates (organization_id, category);
create index email_templates_active_idx
  on public.email_templates (organization_id, is_active)
  where deleted_at is null;

create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;

create policy email_templates_select_member
on public.email_templates
for select
to authenticated
using (public.is_member_of(organization_id));

create policy email_templates_insert_writer
on public.email_templates
for insert
to authenticated
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

create policy email_templates_update_writer
on public.email_templates
for update
to authenticated
using (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
)
with check (
  public.has_organization_role(organization_id, array['owner', 'admin', 'member'])
);

grant select, insert, update on public.email_templates to authenticated;
