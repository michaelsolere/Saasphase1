-- Executed only after the public-form migration, inside a transaction rolled back by the runner.
-- Every assertion raises an exception on failure.

insert into public.organizations(id, name, slug)
values('80000000-0000-4000-8000-000000000001', 'Élevage isolé de test', 'elevage-isole-public-form');
insert into public.public_forms(
  id, organization_id, name, slug, form_type, species, breed, is_active,
  lifecycle_status, title, description, success_message
) values(
  '80000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
  'Formulaire isolé', 'golden-retriever-2026', 'adoption_application', 'dog',
  'Golden Retriever', false, 'draft', 'Formulaire isolé',
  'Description réservée à un autre élevage pour le test d’isolation.',
  'Merci, cette réponse appartient uniquement à cet autre élevage.'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare v_org uuid; v_revision bigint;
begin
  select id into v_org from public.organizations where slug = 'elevage-e2e';
  if exists(select 1 from public.public_forms where organization_id='80000000-0000-4000-8000-000000000001') then raise exception 'member crossed organization RLS'; end if;
  select draft_revision into v_revision from public.public_forms where organization_id = v_org and deleted_at is null;
  begin
    perform public.save_standard_public_form_draft(v_org, v_revision, 'Interdit au membre', 'golden-retriever-2026', 'Titre interdit', 'Description suffisamment longue pour le contrôle.', 'Message suffisamment long pour le contrôle.', 'Golden Retriever');
    raise exception 'member unexpectedly edited the public form';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare
  v_org uuid; v_form uuid; v_revision bigint; v_version_count integer; v_event_count integer;
  v_publish record; v_replay record; v_withdraw record; v_reactivate record;
begin
  select id into v_org from public.organizations where slug = 'elevage-e2e';
  begin
    perform public.save_standard_public_form_draft('80000000-0000-4000-8000-000000000001', 1, 'Interdit', 'golden-retriever-2026', 'Interdit', 'Description suffisamment longue pour être valide.', 'Message suffisamment long pour être valide.', 'Golden Retriever');
    raise exception 'owner crossed organization boundary';
  exception when insufficient_privilege then null;
  end;
  select id, draft_revision into v_form, v_revision from public.public_forms where organization_id = v_org and deleted_at is null;

  if has_table_privilege('authenticated', 'public.public_forms', 'INSERT')
    or has_table_privilege('authenticated', 'public.public_forms', 'UPDATE')
    or has_table_privilege('authenticated', 'public.public_forms', 'DELETE')
  then
    raise exception 'authenticated retains a direct public_forms mutation privilege';
  end if;
  begin
    update public.public_forms
    set slug = 'adresse-contournee',
        lifecycle_status = 'published',
        is_active = true,
        published_version_id = null
    where id = v_form;
    raise exception 'owner bypassed authoritative public form RPCs';
  exception when insufficient_privilege then null;
  end;

  perform public.save_standard_public_form_draft(
    v_org, v_revision, 'Candidature générale', 'golden-retriever-2026',
    'Présentez-nous votre projet',
    'Parlez-nous de votre projet afin que nous puissions préparer un premier échange.',
    'Merci, votre candidature a bien été transmise et sera relue avec attention.',
    'Golden Retriever'
  );
  select draft_revision into v_revision from public.public_forms where id = v_form;

  select * into v_publish from public.change_standard_public_form_lifecycle(v_form, v_revision, '81000000-0000-4000-8000-000000000001', 'publish');
  if v_publish.lifecycle_status <> 'published' or v_publish.replayed then raise exception 'publication result invalid'; end if;
  select count(*) into v_version_count from public.public_form_versions where public_form_id = v_form;
  select * into v_replay from public.change_standard_public_form_lifecycle(v_form, v_publish.revision, '81000000-0000-4000-8000-000000000001', 'publish');
  if not v_replay.replayed then raise exception 'publication command was not replayed'; end if;
  if (select count(*) from public.public_form_versions where public_form_id = v_form) <> v_version_count then raise exception 'publication replay created a version'; end if;

  select * into v_withdraw from public.change_standard_public_form_lifecycle(v_form, v_publish.revision, '81000000-0000-4000-8000-000000000002', 'withdraw');
  if exists(select 1 from public.get_public_application_form('elevage-e2e', 'golden-retriever-2026')) then raise exception 'withdrawn form remained public'; end if;
  select * into v_reactivate from public.change_standard_public_form_lifecycle(v_form, v_withdraw.revision, '81000000-0000-4000-8000-000000000003', 'reactivate');
  if not exists(select 1 from public.get_public_application_form('elevage-e2e', 'golden-retriever-2026')) then raise exception 'reactivated form unavailable'; end if;
  select count(*) into v_event_count from public.public_form_events where public_form_id = v_form and command_id in ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003');
  if v_event_count <> 3 then raise exception 'lifecycle event history incomplete: %', v_event_count; end if;
  if (select count(*) from public.list_standard_public_form_history(v_form)) <> 3 then raise exception 'lifecycle history read model incomplete'; end if;
  begin
    perform public.save_standard_public_form_draft(
      v_org, v_reactivate.revision, 'Candidature générale', 'adresse-changee-interdite',
      'Présentez-nous votre projet',
      'Parlez-nous de votre projet afin que nous puissions préparer un premier échange.',
      'Merci, votre candidature a bien été transmise et sera relue avec attention.',
      'Golden Retriever'
    );
    raise exception 'published public address unexpectedly changed';
  exception when check_violation then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare v_form uuid;
begin
  select f.id into v_form from public.public_forms f join public.organizations o on o.id=f.organization_id where o.slug='elevage-e2e';
  if (select count(*) from public.list_standard_public_form_history(v_form)) <> 3 then raise exception 'member could not read lifecycle history'; end if;
end $$;
reset role;

do $$
declare
  v_version uuid; v_first record; v_replay record; v_form uuid; v_submission_count integer;
begin
  select f.id, v.public_reference into v_form, v_version
  from public.public_forms f join public.public_form_versions v on v.id = f.published_version_id
  join public.organizations o on o.id = f.organization_id
  where o.slug = 'elevage-e2e' and f.slug = 'golden-retriever-2026';

  select * into v_first from public.submit_public_application_v2(
    'elevage-e2e','golden-retriever-2026',v_version,'82000000-0000-4000-8000-000000000001',
    'Alice','Transaction',null,'alice.public-form-01@example.invalid','+33612349871',
    '12 rue des Tests',null,'33000','Bordeaux','FR','female_only',
    'Nous avons un cadre familial stable et du temps pour accueillir un chiot.',
    'website',true,true,null,'transaction-test','{"source":"transaction-test"}'::jsonb,null
  );
  select * into v_replay from public.submit_public_application_v2(
    'elevage-e2e','golden-retriever-2026',v_version,'82000000-0000-4000-8000-000000000001',
    'Alice','Transaction',null,'alice.public-form-01@example.invalid','+33612349871',
    '12 rue des Tests',null,'33000','Bordeaux','FR','female_only',
    'Nous avons un cadre familial stable et du temps pour accueillir un chiot.',
    'website',true,true,null,'transaction-test','{"source":"transaction-test"}'::jsonb,null
  );
  if v_first.public_submission_reference <> v_replay.public_submission_reference or v_first.replayed or not v_replay.replayed then raise exception 'submission replay invalid'; end if;
  select count(*) into v_submission_count from public.form_submissions where public_form_id = v_form and submission_key = '82000000-0000-4000-8000-000000000001';
  if v_submission_count <> 1 then raise exception 'submission idempotency failed: %', v_submission_count; end if;
end $$;

-- A recognized contact keeps historical roles and only empty canonical fields are completed.
do $$
declare v_org uuid; v_form uuid; v_version uuid; v_contact uuid := '83000000-0000-4000-8000-000000000001'; v_role uuid := '83000000-0000-4000-8000-000000000002'; v_result record;
begin
  select o.id, f.id, v.public_reference into v_org, v_form, v_version from public.organizations o join public.public_forms f on f.organization_id=o.id join public.public_form_versions v on v.id=f.published_version_id where o.slug='elevage-e2e';
  insert into public.contacts(id,organization_id,first_name,last_name,display_name,email,phone) values(v_contact,v_org,'Claire','Historique','Claire Historique','claire.public-form@example.invalid','+33612349872');
  insert into public.contact_roles(id,organization_id,contact_id,role,is_active,started_at) values(v_role,v_org,v_contact,'adopter',true,current_date-100);
  select * into v_result from public.submit_public_application_v2('elevage-e2e','golden-retriever-2026',v_version,'83000000-0000-4000-8000-000000000003','Claire','Historique',null,'claire.public-form@example.invalid','+33612349872','8 rue Nouvelle',null,'75001','Paris','FR','female_only','Nous souhaitons accueillir un nouveau chien dans un cadre familial stable.','website',true,true,null,'transaction-test','{}'::jsonb,null);
  if not exists(select 1 from public.contact_roles where id=v_role and is_active and ended_at is null) then raise exception 'historical adopter role was deactivated'; end if;
  if (select address_line1 from public.contacts where id=v_contact) <> '8 rue Nouvelle' then raise exception 'empty contact address was not completed'; end if;
end $$;

-- An already active application is sent to human review instead of being duplicated.
do $$
declare v_org uuid; v_version uuid; v_contact uuid := '84000000-0000-4000-8000-000000000001'; v_application uuid := '84000000-0000-4000-8000-000000000002'; v_result record; v_submission public.form_submissions%rowtype;
begin
  select o.id, v.public_reference into v_org, v_version from public.organizations o join public.public_forms f on f.organization_id=o.id join public.public_form_versions v on v.id=f.published_version_id where o.slug='elevage-e2e';
  insert into public.contacts(id,organization_id,first_name,last_name,display_name,email,phone) values(v_contact,v_org,'Élodie','Active','Élodie Active','elodie.active-form@example.invalid','+33612349873');
  insert into public.applications(id,organization_id,contact_id,species,breed,desired_sex_preference,status) values(v_application,v_org,v_contact,'dog','Golden Retriever','female_only','to_review');
  select * into v_result from public.submit_public_application_v2('elevage-e2e','golden-retriever-2026',v_version,'84000000-0000-4000-8000-000000000003','Élodie','Active',null,'elodie.active-form@example.invalid','+33612349873','9 rue Active',null,'69001','Lyon','FR','female_only','Nous précisons notre projet déjà en cours sans demander une seconde candidature.','website',true,true,null,'transaction-test','{}'::jsonb,null);
  select * into v_submission from public.form_submissions where public_reference=v_result.public_submission_reference;
  if v_submission.status <> 'duplicate_suspected' or v_submission.duplicate_candidate_contact_id <> v_contact or v_submission.application_id is not null then raise exception 'active application was not routed to human review'; end if;
  if (select count(*) from public.applications where contact_id=v_contact) <> 1 then raise exception 'active application was duplicated'; end if;
end $$;

-- The enclosing runner executes ROLLBACK, then verifies these known fixture markers are absent.
