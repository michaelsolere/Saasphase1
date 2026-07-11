alter table public.email_templates
  add column brevo_template_id bigint,
  add constraint email_templates_brevo_template_id_check
    check (brevo_template_id is null or brevo_template_id > 0);

alter table public.email_delivery_attempts
  add column brevo_template_id bigint,
  add column brevo_template_modified_at timestamptz,
  add constraint email_delivery_attempts_brevo_template_id_check
    check (brevo_template_id is null or brevo_template_id > 0);

alter table public.email_delivery_attempts
  drop constraint email_delivery_attempts_status_check,
  add constraint email_delivery_attempts_status_check
    check (status in ('pending', 'sending', 'sent', 'failed'));
