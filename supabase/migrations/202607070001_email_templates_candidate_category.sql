alter table public.email_templates
  drop constraint email_templates_category_check;

alter table public.email_templates
  add constraint email_templates_category_check
  check (category in ('adopter_journey', 'post_adoption', 'candidate_journey'));
