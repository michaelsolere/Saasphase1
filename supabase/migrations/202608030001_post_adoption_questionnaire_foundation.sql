-- POST-ADOPTION-QUESTIONNAIRE-FOUNDATION-01
-- Versioned T1/T2 definitions, linked instances, mutable drafts and append-only submissions/events.

create table public.post_adoption_questionnaire_definitions (
  code text not null,
  version integer not null,
  milestone text not null,
  title text not null,
  species text not null default 'dog',
  breed text,
  anchor_type text not null,
  anchor_offset interval not null,
  response_window interval not null default interval '30 days',
  definition jsonb not null,
  definition_sha256 text not null,
  published_at timestamptz not null default now(),
  primary key (code, version),
  constraint post_adoption_questionnaire_definitions_code_check check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint post_adoption_questionnaire_definitions_version_check check (version > 0),
  constraint post_adoption_questionnaire_definitions_milestone_check check (milestone in ('t1', 't2')),
  constraint post_adoption_questionnaire_definitions_species_check check (species in ('dog', 'cat')),
  constraint post_adoption_questionnaire_definitions_breed_check check (breed is null or char_length(btrim(breed)) between 1 and 255),
  constraint post_adoption_questionnaire_definitions_anchor_check check (anchor_type in ('adoption_completed_at', 'animal_birth_date')),
  constraint post_adoption_questionnaire_definitions_intervals_check check (anchor_offset >= interval '0 days' and response_window > interval '0 days'),
  constraint post_adoption_questionnaire_definitions_json_check check (jsonb_typeof(definition) = 'object' and jsonb_typeof(definition->'questions') = 'array'),
  constraint post_adoption_questionnaire_definitions_metadata_check check (
    definition->>'code' = code
    and (definition->>'version')::integer = version
    and definition->>'title' = title
    and definition->>'species' = species
    and definition->>'breed' is not distinct from breed
  ),
  constraint post_adoption_questionnaire_definitions_hash_check check (
    definition_sha256 ~ '^[0-9a-f]{64}$'
    and definition_sha256 = encode(
      extensions.digest(pg_catalog.convert_to(definition::text, 'UTF8'), 'sha256'),
      'hex'
    )
  )
);

create or replace function public.assert_post_adoption_questionnaire_definition(p_definition jsonb)
returns boolean language plpgsql immutable set search_path = '' as $fn$
declare
  v_question jsonb;
  v_reference_question jsonb;
  v_condition jsonb;
  v_condition_name text;
  v_key text;
  v_keys text[] := '{}'::text[];
  v_type text;
  v_option jsonb;
  v_option_values text[];
  v_row jsonb;
  v_row_keys text[];
  v_field jsonb;
  v_field_keys text[];
  v_reference_key text;
  v_condition_value jsonb;
  v_operator_count integer;
begin
  if p_definition is null or jsonb_typeof(p_definition) is distinct from 'object'
    or jsonb_typeof(p_definition->'schemaVersion') is distinct from 'number'
    or p_definition->>'schemaVersion' <> '1'
    or jsonb_typeof(p_definition->'code') is distinct from 'string'
    or jsonb_typeof(p_definition->'version') is distinct from 'number'
    or jsonb_typeof(p_definition->'title') is distinct from 'string'
    or jsonb_typeof(p_definition->'species') is distinct from 'string'
    or not (p_definition ? 'breed')
    or jsonb_typeof(p_definition->'breed') not in ('string', 'null')
    or jsonb_typeof(p_definition->'rules') is distinct from 'object'
    or jsonb_typeof(p_definition->'questions') is distinct from 'array'
    or jsonb_array_length(p_definition->'questions') = 0 then return false; end if;

  for v_question in select value from jsonb_array_elements(p_definition->'questions') loop
    if jsonb_typeof(v_question) is distinct from 'object'
      or jsonb_typeof(v_question->'key') is distinct from 'string'
      or jsonb_typeof(v_question->'section') is distinct from 'string'
      or jsonb_typeof(v_question->'type') is distinct from 'string'
      or jsonb_typeof(v_question->'label') is distinct from 'string'
      or jsonb_typeof(v_question->'required') is distinct from 'boolean' then return false; end if;
    v_key := v_question->>'key';
    v_type := v_question->>'type';
    if v_key !~ '^[a-z][a-z0-9_]{1,99}$' or v_key = any(v_keys)
      or v_type not in ('single_choice','multi_choice','short_text','long_text','date_or_period','decimal','matrix_single_choice','repeater')
      then return false; end if;
    v_keys := array_append(v_keys, v_key);

    if v_type in ('single_choice','multi_choice','matrix_single_choice') then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
        or jsonb_array_length(v_question->'options') = 0 then return false; end if;
      v_option_values := '{}'::text[];
      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        if jsonb_typeof(v_option) is distinct from 'object'
          or jsonb_typeof(v_option->'value') is distinct from 'string'
          or jsonb_typeof(v_option->'label') is distinct from 'string'
          or v_option->>'value' = any(v_option_values) then return false; end if;
        v_option_values := array_append(v_option_values, v_option->>'value');
      end loop;
    end if;

    if v_type = 'decimal' and (
      ((v_question ? 'min') and jsonb_typeof(v_question->'min') is distinct from 'number')
      or ((v_question ? 'max') and jsonb_typeof(v_question->'max') is distinct from 'number')
      or ((v_question ? 'min') and (v_question ? 'max') and (v_question->>'min')::numeric > (v_question->>'max')::numeric)
    ) then return false; end if;

    if v_type = 'matrix_single_choice' then
      if jsonb_typeof(v_question->'rows') is distinct from 'array'
        or jsonb_array_length(v_question->'rows') = 0 then return false; end if;
      v_row_keys := '{}'::text[];
      for v_row in select value from jsonb_array_elements(v_question->'rows') loop
        if jsonb_typeof(v_row) is distinct from 'object'
          or jsonb_typeof(v_row->'key') is distinct from 'string'
          or jsonb_typeof(v_row->'label') is distinct from 'string'
          or v_row->>'key' = any(v_row_keys) then return false; end if;
        v_row_keys := array_append(v_row_keys, v_row->>'key');
      end loop;
    end if;

    if v_type = 'repeater' then
      if jsonb_typeof(v_question->'fields') is distinct from 'array'
        or jsonb_array_length(v_question->'fields') = 0
        or jsonb_typeof(v_question->'eventCategories') is distinct from 'array'
        or jsonb_array_length(v_question->'eventCategories') = 0 then return false; end if;
      v_option_values := '{}'::text[];
      for v_option in select value from jsonb_array_elements(v_question->'eventCategories') loop
        if jsonb_typeof(v_option) is distinct from 'object'
          or jsonb_typeof(v_option->'value') is distinct from 'string'
          or jsonb_typeof(v_option->'label') is distinct from 'string'
          or v_option->>'value' = any(v_option_values) then return false; end if;
        v_option_values := array_append(v_option_values, v_option->>'value');
      end loop;
      v_field_keys := '{}'::text[];
      for v_field in select value from jsonb_array_elements(v_question->'fields') loop
        if jsonb_typeof(v_field) is distinct from 'object'
          or jsonb_typeof(v_field->'key') is distinct from 'string'
          or jsonb_typeof(v_field->'type') is distinct from 'string'
          or jsonb_typeof(v_field->'required') is distinct from 'boolean'
          or v_field->>'type' not in ('single_choice','short_text','long_text')
          or v_field->>'key' = any(v_field_keys) then return false; end if;
        v_field_keys := array_append(v_field_keys, v_field->>'key');
        if v_field->>'type' = 'single_choice' and v_field->>'key' <> 'category' then
          if jsonb_typeof(v_field->'options') is distinct from 'array'
            or jsonb_array_length(v_field->'options') = 0
            or exists (
              select 1 from jsonb_array_elements(v_field->'options') allowed
              where jsonb_typeof(allowed) is distinct from 'string'
            ) then return false; end if;
        end if;
      end loop;
      if not ('category' = any(v_field_keys)) then return false; end if;
    end if;
  end loop;

  for v_question in select value from jsonb_array_elements(p_definition->'questions') loop
    foreach v_condition_name in array array['visibleWhen','requiredWhen'] loop
      if not (v_question ? v_condition_name) then continue; end if;
      v_condition := v_question->v_condition_name;
      if jsonb_typeof(v_condition) is distinct from 'object' then return false; end if;

      if v_condition ? 'question' then
        select count(*) into v_operator_count
        from unnest(array['equals','notEquals','in']) operator_name
        where v_condition ? operator_name;
        if (select count(*) from jsonb_object_keys(v_condition)) <> 2
          or v_operator_count <> 1
          or jsonb_typeof(v_condition->'question') is distinct from 'string' then return false; end if;
        v_reference_key := v_condition->>'question';
        select value into v_reference_question
        from jsonb_array_elements(p_definition->'questions')
        where value->>'key' = v_reference_key;
        if v_reference_question is null or v_reference_question->>'type' <> 'single_choice' then return false; end if;
        if v_condition ? 'in' then
          if jsonb_typeof(v_condition->'in') is distinct from 'array'
            or jsonb_array_length(v_condition->'in') = 0 then return false; end if;
          for v_condition_value in select value from jsonb_array_elements(v_condition->'in') loop
            if jsonb_typeof(v_condition_value) is distinct from 'string'
              or not exists (
                select 1 from jsonb_array_elements(v_reference_question->'options') allowed
                where allowed->'value' = v_condition_value
              ) then return false; end if;
          end loop;
        else
          v_condition_value := coalesce(v_condition->'equals', v_condition->'notEquals');
          if jsonb_typeof(v_condition_value) is distinct from 'string'
            or not exists (
              select 1 from jsonb_array_elements(v_reference_question->'options') allowed
              where allowed->'value' = v_condition_value
            ) then return false; end if;
        end if;
      elsif v_condition ? 'anyQuestion' then
        if (select count(*) from jsonb_object_keys(v_condition)) <> 2
          or not (v_condition ? 'notIn')
          or jsonb_typeof(v_condition->'anyQuestion') is distinct from 'array'
          or jsonb_array_length(v_condition->'anyQuestion') = 0
          or jsonb_typeof(v_condition->'notIn') is distinct from 'array'
          or jsonb_array_length(v_condition->'notIn') = 0 then return false; end if;
        for v_condition_value in select value from jsonb_array_elements(v_condition->'anyQuestion') loop
          if jsonb_typeof(v_condition_value) is distinct from 'string' then return false; end if;
          v_reference_key := v_condition_value #>> '{}';
          select value into v_reference_question
          from jsonb_array_elements(p_definition->'questions')
          where value->>'key' = v_reference_key;
          if v_reference_question is null or v_reference_question->>'type' <> 'single_choice'
            or exists (
              select 1 from jsonb_array_elements(v_condition->'notIn') excluded
              where jsonb_typeof(excluded) is distinct from 'string'
                or not exists (
                  select 1 from jsonb_array_elements(v_reference_question->'options') allowed
                  where allowed->'value' = excluded
                )
            ) then return false; end if;
        end loop;
      elsif v_condition ? 'matrixQuestion' then
        if (select count(*) from jsonb_object_keys(v_condition)) <> 2
          or not (v_condition ? 'in')
          or jsonb_typeof(v_condition->'matrixQuestion') is distinct from 'string'
          or jsonb_typeof(v_condition->'in') is distinct from 'array'
          or jsonb_array_length(v_condition->'in') = 0 then return false; end if;
        v_reference_key := v_condition->>'matrixQuestion';
        select value into v_reference_question
        from jsonb_array_elements(p_definition->'questions')
        where value->>'key' = v_reference_key;
        if v_reference_question is null or v_reference_question->>'type' <> 'matrix_single_choice'
          or exists (
            select 1 from jsonb_array_elements(v_condition->'in') included
            where jsonb_typeof(included) is distinct from 'string'
              or not exists (
                select 1 from jsonb_array_elements(v_reference_question->'options') allowed
                where allowed->'value' = included
              )
          ) then return false; end if;
      else
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$fn$;

alter table public.post_adoption_questionnaire_definitions
  add constraint post_adoption_questionnaire_definitions_shape_check
  check (public.assert_post_adoption_questionnaire_definition(definition));

create or replace function public.post_adoption_questionnaire_condition_matches(
  p_condition jsonb,
  p_answers jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_question_key text;
  v_matrix_value text;
begin
  if p_condition is null then
    return true;
  end if;

  if p_condition ? 'question' then
    v_question_key := p_condition->>'question';
    if not (p_answers ? v_question_key) then
      return false;
    end if;
    if p_condition ? 'equals' then
      return p_answers->v_question_key = p_condition->'equals';
    elsif p_condition ? 'notEquals' then
      return p_answers->v_question_key <> p_condition->'notEquals';
    elsif p_condition ? 'in' then
      return exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_condition->'in') candidate
        where candidate = p_answers->v_question_key
      );
    end if;
  elsif p_condition ? 'anyQuestion' and p_condition ? 'notIn' then
    return exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(p_condition->'anyQuestion') as keys(question_key)
      where p_answers ? question_key
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_condition->'notIn') excluded
          where excluded = p_answers->question_key
        )
    );
  elsif p_condition ? 'matrixQuestion' and p_condition ? 'in' then
    if pg_catalog.jsonb_typeof(p_answers->(p_condition->>'matrixQuestion')) <> 'object' then
      return false;
    end if;
    for v_matrix_value in
      select value
      from pg_catalog.jsonb_each_text(p_answers->(p_condition->>'matrixQuestion'))
    loop
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_condition->'in') candidate
        where candidate = v_matrix_value
      ) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  return false;
end;
$fn$;

create or replace function public.validate_post_adoption_questionnaire_answers(
  p_definition jsonb,
  p_answers jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_question jsonb;
  v_answer jsonb;
  v_visible boolean;
  v_required boolean;
  v_item jsonb;
  v_field jsonb;
  v_row jsonb;
  v_value jsonb;
begin
  if pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_answers) as keys(answer_key)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_definition->'questions') question
      where question->>'key' = answer_key
    )
  ) then
    return false;
  end if;

  for v_question in
    select value from pg_catalog.jsonb_array_elements(p_definition->'questions')
  loop
    v_visible := not (v_question ? 'visibleWhen')
      or public.post_adoption_questionnaire_condition_matches(
        v_question->'visibleWhen',
        p_answers
      );

    if p_answers ? (v_question->>'key') and not v_visible then
      return false;
    end if;

    if v_question ? 'requiredWhen' then
      v_required := v_visible and public.post_adoption_questionnaire_condition_matches(
        v_question->'requiredWhen',
        p_answers
      );
    else
      v_required := coalesce((v_question->>'required')::boolean, false) and v_visible;
    end if;

    if not (p_answers ? (v_question->>'key')) or p_answers->(v_question->>'key') = 'null'::jsonb then
      if v_required then return false; end if;
      continue;
    end if;

    v_answer := p_answers->(v_question->>'key');
    case v_question->>'type'
      when 'single_choice' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'string'
          or not exists (
            select 1 from pg_catalog.jsonb_array_elements(v_question->'options') option
            where option->'value' = v_answer
          ) then return false; end if;
      when 'multi_choice' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'array' then return false; end if;
        if (v_required and pg_catalog.jsonb_array_length(v_answer) = 0)
          or pg_catalog.jsonb_array_length(v_answer) <> (
            select count(distinct choice)
            from pg_catalog.jsonb_array_elements(v_answer) choice
          ) then return false; end if;
        for v_value in select value from pg_catalog.jsonb_array_elements(v_answer) loop
          if pg_catalog.jsonb_typeof(v_value) <> 'string'
            or not exists (
              select 1 from pg_catalog.jsonb_array_elements(v_question->'options') option
              where option->'value' = v_value
            ) then return false; end if;
        end loop;
      when 'short_text', 'long_text', 'date_or_period' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'string'
          or (v_required and pg_catalog.length(pg_catalog.btrim(v_answer #>> '{}')) = 0) then return false; end if;
      when 'decimal' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'number'
          or ((v_question ? 'min') and (v_answer #>> '{}')::numeric < (v_question->>'min')::numeric)
          or ((v_question ? 'max') and (v_answer #>> '{}')::numeric > (v_question->>'max')::numeric) then return false; end if;
      when 'matrix_single_choice' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'object' then return false; end if;
        if exists (
          select 1
          from pg_catalog.jsonb_object_keys(v_answer) answer_row(row_key)
          where not exists (
            select 1
            from pg_catalog.jsonb_array_elements(v_question->'rows') declared_row
            where declared_row->>'key' = answer_row.row_key
          )
        ) then return false; end if;
        for v_row in select value from pg_catalog.jsonb_array_elements(v_question->'rows') loop
          if not (v_answer ? (v_row->>'key')) then return false; end if;
          if not exists (
            select 1 from pg_catalog.jsonb_array_elements(v_question->'options') option
            where option->'value' = v_answer->(v_row->>'key')
          ) then return false; end if;
        end loop;
      when 'repeater' then
        if pg_catalog.jsonb_typeof(v_answer) <> 'array'
          or (v_required and pg_catalog.jsonb_array_length(v_answer) = 0) then return false; end if;
        for v_item in select value from pg_catalog.jsonb_array_elements(v_answer) loop
          if pg_catalog.jsonb_typeof(v_item) <> 'object' then return false; end if;
          if exists (
            select 1
            from pg_catalog.jsonb_object_keys(v_item) item_field(field_key)
            where not exists (
              select 1
              from pg_catalog.jsonb_array_elements(v_question->'fields') declared_field
              where declared_field->>'key' = item_field.field_key
            )
          ) then return false; end if;
          for v_field in select value from pg_catalog.jsonb_array_elements(v_question->'fields') loop
            if coalesce((v_field->>'required')::boolean, false)
              and (
                not (v_item ? (v_field->>'key'))
                or v_item->(v_field->>'key') = 'null'::jsonb
                or (pg_catalog.jsonb_typeof(v_item->(v_field->>'key')) = 'string' and pg_catalog.length(pg_catalog.btrim(v_item->>(v_field->>'key'))) = 0)
              ) then return false; end if;
            if v_item ? (v_field->>'key') and v_item->(v_field->>'key') <> 'null'::jsonb then
              if (v_field->>'type') in ('single_choice', 'short_text', 'long_text')
                and pg_catalog.jsonb_typeof(v_item->(v_field->>'key')) <> 'string' then return false; end if;
              if v_field ? 'options' and not exists (
                select 1
                from pg_catalog.jsonb_array_elements(v_field->'options') allowed
                where allowed = v_item->(v_field->>'key')
              ) then return false; end if;
            end if;
          end loop;
          if v_item ? 'category' and not exists (
            select 1 from pg_catalog.jsonb_array_elements(v_question->'eventCategories') option
            where option->'value' = v_item->'category'
          ) then return false; end if;
        end loop;
      else
        return false;
    end case;
  end loop;

  return true;
end;
$fn$;

create or replace function public.post_adoption_questionnaire_definition_immutable()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  raise exception 'post-adoption questionnaire definition is immutable' using errcode = '42501';
end;
$fn$;
create trigger post_adoption_questionnaire_definitions_immutable
before update or delete on public.post_adoption_questionnaire_definitions
for each row execute function public.post_adoption_questionnaire_definition_immutable();

create table public.post_adoption_questionnaire_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  questionnaire_code text not null,
  questionnaire_version integer not null,
  contact_id uuid not null,
  reservation_id uuid not null,
  animal_id uuid not null,
  due_at timestamptz not null,
  invited_at timestamptz,
  response_deadline_at timestamptz,
  status text not null default 'planned',
  validated_response_revision_no integer,
  validated_at timestamptz,
  validated_by uuid references public.profiles(id) on delete restrict,
  suspension_reason text,
  suspended_from_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  constraint post_adoption_questionnaire_instances_organization_id_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_instances_definition_fk foreign key (questionnaire_code, questionnaire_version) references public.post_adoption_questionnaire_definitions(code, version) on delete restrict,
  constraint post_adoption_questionnaire_instances_contact_fk foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_instances_reservation_fk foreign key (organization_id, reservation_id) references public.reservations(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_instances_animal_fk foreign key (organization_id, animal_id) references public.animals(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_instances_status_check check (status in ('planned','due','invited','in_progress','submitted','under_review','validated','expired','suspended')),
  constraint post_adoption_questionnaire_instances_dates_check check (
    (invited_at is null and response_deadline_at is null and status in ('planned','due'))
    or (invited_at is not null and response_deadline_at is not null and response_deadline_at > invited_at and status not in ('planned','due'))
    or (status = 'suspended' and ((invited_at is null and response_deadline_at is null) or (invited_at is not null and response_deadline_at is not null and response_deadline_at > invited_at)))
  ),
  constraint post_adoption_questionnaire_instances_validation_check check ((status = 'validated' and validated_response_revision_no is not null and validated_at is not null and validated_by is not null) or (status <> 'validated' and validated_response_revision_no is null and validated_at is null and validated_by is null)),
  constraint post_adoption_questionnaire_instances_suspension_check check (
    (status = 'suspended' and suspension_reason is not null and char_length(btrim(suspension_reason)) between 1 and 5000 and suspended_from_status in ('planned','due','invited','in_progress','submitted','under_review'))
    or (status <> 'suspended' and suspension_reason is null and suspended_from_status is null)
  )
);
create unique index post_adoption_questionnaire_instances_reservation_milestone_key on public.post_adoption_questionnaire_instances(organization_id, reservation_id, questionnaire_code);
create index post_adoption_questionnaire_instances_due_idx on public.post_adoption_questionnaire_instances(organization_id, status, due_at);
create trigger post_adoption_questionnaire_instances_set_updated_at before update on public.post_adoption_questionnaire_instances for each row execute function public.set_updated_at();
comment on column public.post_adoption_questionnaire_instances.contact_id is 'Historical contact linkage captured when the questionnaire instance is created.';
comment on column public.post_adoption_questionnaire_instances.reservation_id is 'Historical reservation linkage captured when the questionnaire instance is created.';
comment on column public.post_adoption_questionnaire_instances.animal_id is 'Historical animal linkage captured when the questionnaire instance is created.';

create or replace function public.assert_post_adoption_questionnaire_instance_linkage()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_reservation public.reservations%rowtype;
  v_animal public.animals%rowtype;
  v_definition public.post_adoption_questionnaire_definitions%rowtype;
  v_expected_due_at timestamptz;
begin
  if tg_op = 'UPDATE' and (
    new.organization_id is distinct from old.organization_id
    or new.questionnaire_code is distinct from old.questionnaire_code
    or new.questionnaire_version is distinct from old.questionnaire_version
    or new.contact_id is distinct from old.contact_id
    or new.reservation_id is distinct from old.reservation_id
    or new.animal_id is distinct from old.animal_id
    or new.due_at is distinct from old.due_at
    or (old.invited_at is not null and new.invited_at is distinct from old.invited_at)
    or (old.response_deadline_at is not null and new.response_deadline_at is distinct from old.response_deadline_at)
  ) then
    raise exception 'post-adoption questionnaire instance linkage is immutable' using errcode = '55000';
  end if;
  select * into v_reservation from public.reservations where organization_id = new.organization_id and id = new.reservation_id and deleted_at is null;
  select * into v_animal from public.animals where organization_id = new.organization_id and id = new.animal_id and deleted_at is null;
  select * into v_definition from public.post_adoption_questionnaire_definitions where code = new.questionnaire_code and version = new.questionnaire_version;
  if v_reservation.id is null or v_reservation.status <> 'adopted' or v_reservation.adoption_completed_at is null
    or v_reservation.contact_id is distinct from new.contact_id or v_reservation.animal_id is distinct from new.animal_id
    or v_animal.id is null
    or v_reservation.species is distinct from v_animal.species
    or v_reservation.breed is distinct from v_animal.breed
    or v_definition.code is null
    or v_definition.species is distinct from v_animal.species
    or (v_definition.breed is not null and v_definition.breed is distinct from v_animal.breed) then
    raise exception 'post-adoption questionnaire instance linkage is invalid' using errcode = '23514';
  end if;
  v_expected_due_at := case v_definition.anchor_type
    when 'adoption_completed_at' then v_reservation.adoption_completed_at + v_definition.anchor_offset
    when 'animal_birth_date' then (v_animal.birth_date::timestamp at time zone 'UTC') + v_definition.anchor_offset
    else null
  end;
  if new.due_at is distinct from v_expected_due_at then
    raise exception 'post-adoption questionnaire due date does not match its published anchor' using errcode = '23514';
  end if;
  if new.invited_at is not null
    and new.response_deadline_at is distinct from new.invited_at + v_definition.response_window then
    raise exception 'post-adoption questionnaire response deadline does not match its published window' using errcode = '23514';
  end if;
  return new;
end;
$fn$;
create trigger post_adoption_questionnaire_instances_linkage
before insert or update
on public.post_adoption_questionnaire_instances for each row execute function public.assert_post_adoption_questionnaire_instance_linkage();

create or replace function public.assert_post_adoption_questionnaire_instance_state_mutation()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' and new.status <> 'planned' then
    raise exception 'questionnaire instance must be created in its planned state' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
      new.status is distinct from old.status
      or new.invited_at is distinct from old.invited_at
      or new.response_deadline_at is distinct from old.response_deadline_at
      or new.validated_response_revision_no is distinct from old.validated_response_revision_no
      or new.validated_at is distinct from old.validated_at
      or new.validated_by is distinct from old.validated_by
      or new.suspension_reason is distinct from old.suspension_reason
      or new.suspended_from_status is distinct from old.suspended_from_status
    )
    and not (
      pg_catalog.pg_trigger_depth() > 1
      and pg_catalog.current_setting('app.post_adoption_event_transition', true) = 'on'
    ) then
    raise exception 'questionnaire instance lifecycle can only change through an append-only event' using errcode = '55000';
  end if;
  return new;
end;
$fn$;

create trigger post_adoption_questionnaire_instances_state_mutation
before insert or update on public.post_adoption_questionnaire_instances
for each row execute function public.assert_post_adoption_questionnaire_instance_state_mutation();

create table public.post_adoption_questionnaire_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  revision integer not null default 1,
  answers jsonb not null default '{}'::jsonb,
  editor_kind text not null,
  editor_profile_id uuid references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  constraint post_adoption_questionnaire_drafts_organization_id_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_drafts_instance_key unique (organization_id, instance_id),
  constraint post_adoption_questionnaire_drafts_instance_fk foreign key (organization_id, instance_id) references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_drafts_revision_check check (revision > 0),
  constraint post_adoption_questionnaire_drafts_answers_check check (jsonb_typeof(answers) = 'object'),
  constraint post_adoption_questionnaire_drafts_editor_check check (editor_kind in ('family','member','system') and ((editor_kind = 'member' and editor_profile_id is not null) or (editor_kind <> 'member' and editor_profile_id is null)))
);

create table public.post_adoption_questionnaire_response_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  revision_no integer not null,
  definition_sha256 text not null,
  answers jsonb not null,
  submitted_at timestamptz not null,
  submission_source text not null,
  submitted_by_profile_id uuid references public.profiles(id) on delete restrict,
  supersedes_revision_no integer,
  completion_started_at timestamptz,
  completion_duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint post_adoption_response_revisions_org_id_key unique (organization_id, id),
  constraint post_adoption_response_revisions_instance_revision_key unique (organization_id, instance_id, revision_no),
  constraint post_adoption_questionnaire_response_revisions_instance_fk foreign key (organization_id, instance_id) references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_response_revisions_supersedes_fk foreign key (organization_id, instance_id, supersedes_revision_no) references public.post_adoption_questionnaire_response_revisions(organization_id, instance_id, revision_no) on delete restrict,
  constraint post_adoption_questionnaire_response_revisions_revision_check check (revision_no > 0 and (supersedes_revision_no is null or supersedes_revision_no < revision_no)),
  constraint post_adoption_questionnaire_response_revisions_duration_check check (
    (completion_started_at is null and completion_duration_seconds is null)
    or (
      completion_started_at is not null
      and completion_duration_seconds is not null
      and completion_started_at <= submitted_at
      and completion_duration_seconds >= 0
    )
  ),
  constraint post_adoption_questionnaire_response_revisions_hash_check check (definition_sha256 ~ '^[0-9a-f]{64}$'),
  constraint post_adoption_questionnaire_response_revisions_answers_check check (jsonb_typeof(answers) = 'object'),
  constraint post_adoption_questionnaire_response_revisions_source_check check (submission_source in ('family','member','system','backfill') and ((submission_source = 'member' and submitted_by_profile_id is not null) or (submission_source <> 'member' and submitted_by_profile_id is null)))
);
create index post_adoption_questionnaire_response_revisions_instance_idx on public.post_adoption_questionnaire_response_revisions(organization_id, instance_id, revision_no desc);

alter table public.post_adoption_questionnaire_instances
  add constraint post_adoption_questionnaire_instances_validated_response_fk
  foreign key (organization_id, id, validated_response_revision_no)
  references public.post_adoption_questionnaire_response_revisions(organization_id, instance_id, revision_no)
  on delete restrict deferrable initially deferred;

create or replace function public.assert_post_adoption_questionnaire_response_definition()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $fn$
declare
  v_hash text;
  v_definition jsonb;
  v_instance_status text;
  v_invited_at timestamptz;
  v_response_deadline_at timestamptz;
  v_expected_revision integer;
begin
  select definition.definition_sha256, definition.definition, instance.status, instance.invited_at, instance.response_deadline_at
  into v_hash, v_definition, v_instance_status, v_invited_at, v_response_deadline_at
  from public.post_adoption_questionnaire_instances instance
  join public.post_adoption_questionnaire_definitions definition on definition.code = instance.questionnaire_code and definition.version = instance.questionnaire_version
  where instance.organization_id = new.organization_id and instance.id = new.instance_id
  for update of instance;
  if not found or v_hash <> new.definition_sha256 then raise exception 'questionnaire response definition hash mismatch' using errcode = '23514'; end if;
  if v_instance_status in ('planned','due','validated','expired','suspended') then
    raise exception 'questionnaire instance does not accept response revisions in its current state' using errcode = '23514';
  end if;
  if new.submitted_at < v_invited_at or new.submitted_at > v_response_deadline_at then
    raise exception 'questionnaire response submission falls outside its invitation window' using errcode = '23514';
  end if;
  select coalesce(max(revision_no), 0) + 1 into v_expected_revision
  from public.post_adoption_questionnaire_response_revisions
  where organization_id = new.organization_id and instance_id = new.instance_id;
  if new.revision_no <> v_expected_revision
    or (v_expected_revision = 1 and new.supersedes_revision_no is not null)
    or (v_expected_revision > 1 and new.supersedes_revision_no is distinct from v_expected_revision - 1) then
    raise exception 'questionnaire response revision chain is invalid' using errcode = '23514';
  end if;
  if not public.validate_post_adoption_questionnaire_answers(v_definition, new.answers) then
    raise exception 'questionnaire response does not satisfy its published definition' using errcode = '23514';
  end if;
  return new;
end;
$fn$;
create trigger post_adoption_questionnaire_response_revisions_definition
before insert on public.post_adoption_questionnaire_response_revisions for each row execute function public.assert_post_adoption_questionnaire_response_definition();

create table public.post_adoption_questionnaire_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  instance_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  response_revision_no integer,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint post_adoption_questionnaire_events_organization_id_id_key unique (organization_id, id),
  constraint post_adoption_questionnaire_events_instance_fk foreign key (organization_id, instance_id) references public.post_adoption_questionnaire_instances(organization_id, id) on delete restrict,
  constraint post_adoption_questionnaire_events_response_fk foreign key (organization_id, instance_id, response_revision_no) references public.post_adoption_questionnaire_response_revisions(organization_id, instance_id, revision_no) on delete restrict,
  constraint post_adoption_questionnaire_events_type_check check (event_type in ('instance_created','became_due','invitation_sent','reminder_sent','draft_started','response_submitted','revision_submitted','review_started','changes_requested','validated','expired','suspended','resumed')),
  constraint post_adoption_questionnaire_events_status_check check ((from_status is null or from_status in ('planned','due','invited','in_progress','submitted','under_review','validated','expired','suspended')) and (to_status is null or to_status in ('planned','due','invited','in_progress','submitted','under_review','validated','expired','suspended'))),
  constraint post_adoption_questionnaire_events_actor_check check (actor_kind in ('family','member','system') and ((actor_kind = 'member' and actor_profile_id is not null) or (actor_kind <> 'member' and actor_profile_id is null))),
  constraint post_adoption_questionnaire_events_details_check check (jsonb_typeof(details) = 'object')
);
create index post_adoption_questionnaire_events_instance_idx on public.post_adoption_questionnaire_events(organization_id, instance_id, occurred_at, id);

create or replace function public.apply_post_adoption_questionnaire_event_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_response_window interval;
begin
  if (new.from_status is null) <> (new.to_status is null) then
    raise exception 'questionnaire event must provide both transition states or neither' using errcode = '23514';
  end if;

  select * into v_instance
  from public.post_adoption_questionnaire_instances
  where organization_id = new.organization_id and id = new.instance_id
  for update;
  if v_instance.id is null then
    raise exception 'questionnaire event instance does not exist' using errcode = '23503';
  end if;
  if not (
    (new.event_type = 'instance_created' and new.from_status is null and new.to_status is null and new.response_revision_no is null and v_instance.status = 'planned')
    or (new.event_type = 'became_due' and new.from_status = 'planned' and new.to_status = 'due' and new.response_revision_no is null)
    or (new.event_type = 'invitation_sent' and new.from_status = 'due' and new.to_status = 'invited' and new.response_revision_no is null)
    or (new.event_type = 'reminder_sent' and new.from_status is null and new.to_status is null and new.response_revision_no is null and v_instance.status in ('invited','in_progress'))
    or (new.event_type = 'draft_started' and new.from_status = 'invited' and new.to_status = 'in_progress' and new.response_revision_no is null)
    or (new.event_type = 'response_submitted' and new.from_status in ('invited','in_progress') and new.to_status = 'submitted' and new.response_revision_no is not null)
    or (new.event_type = 'revision_submitted' and new.from_status = 'in_progress' and new.to_status = 'submitted' and new.response_revision_no is not null)
    or (new.event_type = 'review_started' and new.from_status = 'submitted' and new.to_status = 'under_review' and new.response_revision_no is not null)
    or (new.event_type = 'changes_requested' and new.from_status in ('submitted','under_review') and new.to_status = 'in_progress' and new.response_revision_no is not null)
    or (new.event_type = 'validated' and new.from_status in ('submitted','under_review') and new.to_status = 'validated' and new.response_revision_no is not null)
    or (new.event_type = 'expired' and new.from_status in ('invited','in_progress') and new.to_status = 'expired' and new.response_revision_no is null)
    or (new.event_type = 'suspended' and new.from_status in ('planned','due','invited','in_progress','submitted','under_review') and new.to_status = 'suspended' and new.response_revision_no is null)
    or (new.event_type = 'resumed' and new.from_status = 'suspended' and new.to_status = v_instance.suspended_from_status)
  ) then
    raise exception 'questionnaire event type does not match its lifecycle transition' using errcode = '23514';
  end if;
  if new.to_status is null then return new; end if;
  if v_instance.status <> new.from_status then
    raise exception 'questionnaire event transition is stale or inconsistent' using errcode = '40001';
  end if;
  if not (
    (new.from_status = 'planned' and new.to_status in ('due','suspended'))
    or (new.from_status = 'due' and new.to_status in ('invited','suspended'))
    or (new.from_status = 'invited' and new.to_status in ('in_progress','submitted','expired','suspended'))
    or (new.from_status = 'in_progress' and new.to_status in ('submitted','expired','suspended'))
    or (new.from_status = 'submitted' and new.to_status in ('under_review','in_progress','validated','suspended'))
    or (new.from_status = 'under_review' and new.to_status in ('in_progress','validated','suspended'))
    or (new.from_status = 'suspended' and new.to_status in ('planned','due','invited','in_progress','submitted','under_review','expired'))
  ) then
    raise exception 'questionnaire event transition is not allowed' using errcode = '23514';
  end if;
  if new.to_status in ('submitted','under_review','validated') and new.response_revision_no is null then
    raise exception 'questionnaire response revision is required for this transition' using errcode = '23514';
  end if;
  if new.to_status = 'suspended' and pg_catalog.length(pg_catalog.btrim(coalesce(new.details->>'reason',''))) = 0 then
    raise exception 'questionnaire suspension requires a reason' using errcode = '23514';
  end if;
  if new.to_status = 'validated' and (new.actor_kind <> 'member' or new.actor_profile_id is null) then
    raise exception 'questionnaire validation requires a member actor' using errcode = '23514';
  end if;

  select response_window into v_response_window
  from public.post_adoption_questionnaire_definitions
  where code = v_instance.questionnaire_code and version = v_instance.questionnaire_version;

  perform pg_catalog.set_config('app.post_adoption_event_transition', 'on', true);
  update public.post_adoption_questionnaire_instances
  set status = new.to_status,
      invited_at = case
        when new.to_status = 'invited' and v_instance.invited_at is null then new.occurred_at
        else v_instance.invited_at
      end,
      response_deadline_at = case
        when new.to_status = 'invited' and v_instance.invited_at is null then new.occurred_at + v_response_window
        else v_instance.response_deadline_at
      end,
      validated_response_revision_no = case when new.to_status = 'validated' then new.response_revision_no else null end,
      validated_at = case when new.to_status = 'validated' then new.occurred_at else null end,
      validated_by = case when new.to_status = 'validated' then new.actor_profile_id else null end,
      suspension_reason = case when new.to_status = 'suspended' then new.details->>'reason' else null end,
      suspended_from_status = case when new.to_status = 'suspended' then new.from_status else null end,
      updated_by = new.actor_profile_id
  where organization_id = new.organization_id and id = new.instance_id;
  return new;
end;
$fn$;

create trigger post_adoption_questionnaire_events_state_transition
before insert on public.post_adoption_questionnaire_events
for each row execute function public.apply_post_adoption_questionnaire_event_transition();

create or replace function public.assert_post_adoption_questionnaire_actor_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_new jsonb := pg_catalog.to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else '{}'::jsonb end;
  v_actor record;
  v_profile_id uuid;
begin
  for v_actor in
    select key, value
    from pg_catalog.jsonb_each(v_new)
    where key in (
      'created_by',
      'updated_by',
      'validated_by',
      'editor_profile_id',
      'submitted_by_profile_id',
      'actor_profile_id'
    )
      and value <> 'null'::jsonb
      and (tg_op = 'INSERT' or v_old->key is distinct from value)
  loop
    v_profile_id := (v_actor.value #>> '{}')::uuid;
    if not exists (
      select 1
      from public.memberships membership
      where membership.organization_id = new.organization_id
        and membership.profile_id = v_profile_id
        and membership.status = 'active'
        and membership.deleted_at is null
    ) then
      raise exception 'post-adoption questionnaire actor must be an active organization member' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$fn$;

create trigger post_adoption_questionnaire_instances_actor_membership
before insert or update on public.post_adoption_questionnaire_instances
for each row execute function public.assert_post_adoption_questionnaire_actor_membership();
create trigger post_adoption_questionnaire_drafts_actor_membership
before insert or update on public.post_adoption_questionnaire_drafts
for each row execute function public.assert_post_adoption_questionnaire_actor_membership();
create trigger post_adoption_questionnaire_response_revisions_actor_membership
before insert or update on public.post_adoption_questionnaire_response_revisions
for each row execute function public.assert_post_adoption_questionnaire_actor_membership();
create trigger post_adoption_questionnaire_events_actor_membership
before insert or update on public.post_adoption_questionnaire_events
for each row execute function public.assert_post_adoption_questionnaire_actor_membership();

create or replace function public.post_adoption_questionnaire_append_only()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'DELETE'
    and session_user = 'postgres'
    and current_setting('app.qa_hard_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'post-adoption questionnaire history is immutable' using errcode = '55000';
end;
$fn$;
create trigger post_adoption_questionnaire_response_revisions_immutable before update or delete on public.post_adoption_questionnaire_response_revisions for each row execute function public.post_adoption_questionnaire_append_only();
create trigger post_adoption_questionnaire_events_immutable before update or delete on public.post_adoption_questionnaire_events for each row execute function public.post_adoption_questionnaire_append_only();

alter table public.post_adoption_questionnaire_definitions enable row level security;
alter table public.post_adoption_questionnaire_instances enable row level security;
alter table public.post_adoption_questionnaire_drafts enable row level security;
alter table public.post_adoption_questionnaire_response_revisions enable row level security;
alter table public.post_adoption_questionnaire_events enable row level security;

revoke all on table public.post_adoption_questionnaire_definitions, public.post_adoption_questionnaire_instances, public.post_adoption_questionnaire_drafts, public.post_adoption_questionnaire_response_revisions, public.post_adoption_questionnaire_events from public, anon, authenticated;
grant select on table public.post_adoption_questionnaire_definitions, public.post_adoption_questionnaire_instances, public.post_adoption_questionnaire_drafts, public.post_adoption_questionnaire_response_revisions, public.post_adoption_questionnaire_events to authenticated;

create policy post_adoption_questionnaire_definitions_select_authenticated on public.post_adoption_questionnaire_definitions for select to authenticated using (true);
create policy post_adoption_questionnaire_instances_select_member on public.post_adoption_questionnaire_instances for select to authenticated using (public.is_member_of(organization_id));
create policy post_adoption_questionnaire_drafts_select_member on public.post_adoption_questionnaire_drafts for select to authenticated using (public.is_member_of(organization_id));
create policy post_adoption_questionnaire_response_revisions_select_member on public.post_adoption_questionnaire_response_revisions for select to authenticated using (public.is_member_of(organization_id));
create policy post_adoption_questionnaire_events_select_member on public.post_adoption_questionnaire_events for select to authenticated using (public.is_member_of(organization_id));

revoke execute on function public.assert_post_adoption_questionnaire_definition(jsonb) from public, anon, authenticated;
revoke execute on function public.post_adoption_questionnaire_condition_matches(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.validate_post_adoption_questionnaire_answers(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.post_adoption_questionnaire_definition_immutable() from public, anon, authenticated;
revoke execute on function public.assert_post_adoption_questionnaire_instance_linkage() from public, anon, authenticated;
revoke execute on function public.assert_post_adoption_questionnaire_instance_state_mutation() from public, anon, authenticated;
revoke execute on function public.assert_post_adoption_questionnaire_response_definition() from public, anon, authenticated;
revoke execute on function public.assert_post_adoption_questionnaire_actor_membership() from public, anon, authenticated;
revoke execute on function public.apply_post_adoption_questionnaire_event_transition() from public, anon, authenticated;
revoke execute on function public.post_adoption_questionnaire_append_only() from public, anon, authenticated;

with source(definition) as (values ($definition${"schemaVersion":1,"species":"dog","breed":"Golden Retriever","rules":{"structuredAnswersRequired":true,"requiredConditionalDetails":true,"freeCommentsOptional":true,"noGlobalScore":true,"noAutomaticBusinessMutation":true},"code":"post-adoption-t1","version":1,"title":"Questionnaire post-adoption T1","estimatedMinutes":{"min":8,"max":10},"observationPeriods":{"behavior":"last_4_weeks","cleanliness":"last_14_days","adaptation":"since_arrival","satisfaction":"adoption_journey_to_t1"},"sectionOrder":["adaptation","behavior","education","cleanliness","care","conclusion","satisfaction"],"questions":[{"key":"behavior_activity","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment décririez-vous globalement le niveau d’activité de votre chien ?","required":true,"options":[{"value":"very_calm","label":"Très calme ou peu actif"},{"value":"rather_calm","label":"Plutôt calme"},{"value":"intermediate","label":"Niveau d’activité intermédiaire"},{"value":"rather_active","label":"Plutôt actif"},{"value":"very_active","label":"Très actif"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"activity"},{"key":"behavior_calm_return","section":"behavior","type":"single_choice","label":"Après une période d’activité, de jeu ou d’excitation, votre chien parvient-il à retrouver un état calme ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"depends","label":"Cela dépend beaucoup des situations"},{"value":"difficult","label":"Difficilement"},{"value":"very_difficult","label":"Très difficilement"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"calm_return"},{"key":"behavior_calm_return_comment","section":"behavior","type":"long_text","label":"Si vous le souhaitez, vous pouvez préciser dans quelles situations le retour au calme est difficile.","required":false,"visibleWhen":{"question":"behavior_calm_return","in":["difficult","very_difficult"]},"comment":true},{"key":"behavior_novelty","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment votre chien a-t-il généralement réagi face à des lieux, objets, bruits ou situations inhabituels ?","required":true,"options":[{"value":"very_comfortable","label":"Très à l’aise"},{"value":"rather_comfortable","label":"Plutôt à l’aise"},{"value":"variable","label":"Réaction variable selon la situation"},{"value":"often_worried","label":"Souvent en difficulté ou inquiet"},{"value":"very_often_worried","label":"Très souvent en difficulté ou très inquiet"},{"value":"not_exposed","label":"Il n’a pas été confronté à une situation nouvelle"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"novelty"},{"key":"behavior_specific_fears","section":"behavior","type":"single_choice","label":"Avez-vous observé une ou plusieurs peurs particulières ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"visibleWhen":{"question":"behavior_novelty","in":["variable","often_worried","very_often_worried"]}},{"key":"behavior_specific_fears_detail","section":"behavior","type":"long_text","label":"Dans quelles situations ou face à quoi avez-vous observé ces réactions ?","required":true,"visibleWhen":{"question":"behavior_specific_fears","equals":"yes"},"requiredWhen":{"question":"behavior_specific_fears","equals":"yes"}},{"key":"behavior_novelty_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous ajouter une précision sur les situations nouvelles ou les peurs observées ?","required":false,"visibleWhen":{"question":"behavior_specific_fears","equals":"yes"},"comment":true},{"key":"behavior_unknown_people","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment se sont généralement passées les rencontres avec des personnes que votre chien ne connaissait pas ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable selon les personnes ou les situations"},{"value":"frequent_reserve","label":"Avec une réserve ou une inquiétude fréquente"},{"value":"major_difficulty","label":"Avec une difficulté importante"},{"value":"no_encounter","label":"Il n’a pas rencontré de personne inconnue"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"unknown_people"},{"key":"behavior_unknown_people_comment","section":"behavior","type":"long_text","label":"Si vous le souhaitez, précisez les situations variables ou difficiles.","required":false,"visibleWhen":{"question":"behavior_unknown_people","in":["variable","frequent_reserve","major_difficulty"]},"comment":true},{"key":"context_children_exposure","section":"behavior","type":"single_choice","label":"Votre chien vit-il avec des enfants ou en rencontre-t-il régulièrement ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}]},{"key":"context_children_interactions","section":"behavior","type":"single_choice","label":"Comment se passent généralement ces interactions ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable"},{"value":"manageable_difficulties","label":"Avec quelques difficultés gérables"},{"value":"major_difficulties","label":"Avec des difficultés importantes"},{"value":"not_enough_exposure","label":"Les contacts sont trop limités pour répondre"}],"visibleWhen":{"question":"context_children_exposure","equals":"yes"},"requiredWhen":{"question":"context_children_exposure","equals":"yes"}},{"key":"context_children_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser ces interactions avec des enfants ?","required":false,"visibleWhen":{"question":"context_children_exposure","equals":"yes"},"comment":true},{"key":"behavior_dogs_exposure","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, votre chien a-t-il eu l’occasion de rencontrer d’autres chiens ?","required":true,"options":[{"value":"regularly","label":"Oui, régulièrement"},{"value":"sometimes","label":"Oui, quelques fois"},{"value":"very_rarely","label":"Très rarement"},{"value":"no","label":"Non"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"dogs_exposure"},{"key":"behavior_dogs_course","section":"behavior","type":"single_choice","label":"Comment se sont généralement déroulées ces rencontres ?","required":true,"options":[{"value":"very_easily","label":"Très facilement avec la plupart des chiens"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable selon le chien ou la situation"},{"value":"frequent_reserve","label":"Avec une réserve ou une inquiétude fréquente"},{"value":"major_difficulties","label":"Avec des difficultés importantes"}],"visibleWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"requiredWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"longitudinalAxis":"dogs_course"},{"key":"behavior_dogs_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser le déroulement des rencontres avec d’autres chiens ?","required":false,"visibleWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"comment":true},{"key":"context_other_animals_exposure","section":"behavior","type":"single_choice","label":"Votre chien vit-il avec d’autres animaux ou en rencontre-t-il régulièrement ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}]},{"key":"context_other_animals_course","section":"behavior","type":"single_choice","label":"Comment se passe généralement la cohabitation ou la rencontre avec ces animaux ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable"},{"value":"manageable_difficulties","label":"Avec quelques difficultés gérables"},{"value":"major_difficulties","label":"Avec des difficultés importantes"},{"value":"not_enough_observation","label":"Situation encore trop peu observée"}],"visibleWhen":{"question":"context_other_animals_exposure","equals":"yes"},"requiredWhen":{"question":"context_other_animals_exposure","equals":"yes"}},{"key":"context_other_animals_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser ces interactions avec d’autres animaux ?","required":false,"visibleWhen":{"question":"context_other_animals_exposure","equals":"yes"},"comment":true},{"key":"behavior_solitude_exposure","section":"behavior","type":"single_choice","label":"Votre chien reste-t-il parfois seul sans présence humaine dans le logement ?","required":true,"options":[{"value":"never","label":"Non, jamais ou presque jamais"},{"value":"occasionally","label":"Oui, occasionnellement"},{"value":"regularly","label":"Oui, régulièrement"}],"longitudinalAxis":"solitude_exposure"},{"key":"behavior_solitude_duration","section":"behavior","type":"single_choice","label":"Lorsqu’il reste seul, quelle est habituellement la durée la plus longue ?","required":true,"options":[{"value":"under_30m","label":"Moins de 30 minutes"},{"value":"30m_1h","label":"De 30 minutes à 1 heure"},{"value":"1h_2h","label":"De 1 à 2 heures"},{"value":"2h_4h","label":"De 2 à 4 heures"},{"value":"over_4h","label":"Plus de 4 heures"}],"visibleWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"requiredWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"longitudinalAxis":"solitude_duration"},{"key":"behavior_solitude_course","section":"behavior","type":"single_choice","label":"Comment se passent généralement ces périodes de solitude ?","required":true,"options":[{"value":"very_well","label":"Très bien, sans difficulté observée"},{"value":"rather_well","label":"Plutôt bien"},{"value":"variable","label":"De manière variable"},{"value":"difficult","label":"Avec des difficultés importantes ou régulières"},{"value":"not_observable","label":"Je ne peux pas réellement observer ce qui se passe en mon absence"}],"visibleWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"requiredWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"longitudinalAxis":"solitude_course"},{"key":"behavior_solitude_manifestations","section":"behavior","type":"multi_choice","label":"Quelles manifestations avez-vous observées ?","required":true,"options":[{"value":"vocalizations","label":"Vocalises ou aboiements"},{"value":"agitation","label":"Agitation"},{"value":"cannot_settle","label":"Difficulté à se poser"},{"value":"destruction","label":"Destructions"},{"value":"elimination","label":"Éliminations dans le logement"},{"value":"escape_attempts","label":"Tentatives de sortie ou de fuite"},{"value":"other","label":"Autre manifestation"}],"visibleWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]},"requiredWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]}},{"key":"behavior_solitude_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser les manifestations observées pendant les absences ?","required":false,"visibleWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]},"comment":true},{"key":"behavior_management_impact","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, dans quelle mesure avez-vous rencontré des difficultés dans l’éducation ou la gestion quotidienne de votre chien ?","required":true,"options":[{"value":"none","label":"Aucune difficulté particulière"},{"value":"light","label":"Quelques difficultés légères"},{"value":"regular_manageable","label":"Des difficultés régulières, mais qui restent gérables"},{"value":"major_daily_impact","label":"Des difficultés importantes ayant un impact sur le quotidien"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"management_impact"},{"key":"behavior_management_topics","section":"behavior","type":"multi_choice","label":"Quels sujets sont concernés ?","required":true,"options":[{"value":"activity","label":"Niveau d’activité ou excitation"},{"value":"calm_return","label":"Retour au calme"},{"value":"fears_novelty","label":"Peurs ou nouveauté"},{"value":"people","label":"Rencontres avec des personnes"},{"value":"dogs","label":"Rencontres avec des chiens"},{"value":"separation","label":"Autonomie ou séparation"},{"value":"daily_management","label":"Gestion quotidienne ou respect des repères"},{"value":"vocalizations","label":"Aboiements ou vocalises"},{"value":"mouthing","label":"Mordillements"},{"value":"exploratory_destruction","label":"Destructions exploratoires"},{"value":"other","label":"Autre difficulté"}],"visibleWhen":{"question":"behavior_management_impact","notEquals":"none"},"requiredWhen":{"question":"behavior_management_impact","notEquals":"none"},"variantOptions":{"t1":[{"value":"mouthing","label":"Mordillements"},{"value":"exploratory_destruction","label":"Destructions exploratoires"}]}},{"key":"behavior_management_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser les difficultés rencontrées ?","required":false,"visibleWhen":{"question":"behavior_management_impact","notEquals":"none"},"comment":true},{"key":"education_support_status","section":"education","type":"single_choice","label":"Depuis l’adoption, avez-vous bénéficié d’un accompagnement en éducation canine ?","required":true,"options":[{"value":"current","label":"Oui, actuellement"},{"value":"past","label":"Oui, auparavant"},{"value":"planned","label":"Non, mais c’est prévu ou envisagé"},{"value":"no","label":"Non"}],"longitudinalAxis":"education_support"},{"key":"education_support_reasons","section":"education","type":"multi_choice","label":"Pour quelles raisons avez-vous choisi ou envisagez-vous cet accompagnement ?","required":true,"options":[{"value":"daily_education","label":"Être accompagné dans l’éducation quotidienne"},{"value":"puppy_or_group_classes","label":"Participer à des cours pour chiots ou à des cours collectifs"},{"value":"specific_difficulty","label":"Travailler une difficulté particulière"},{"value":"activity","label":"Préparer une activité ou une discipline"},{"value":"other","label":"Autre raison"}],"visibleWhen":{"question":"education_support_status","in":["current","past","planned"]},"requiredWhen":{"question":"education_support_status","in":["current","past","planned"]}},{"key":"education_support_types","section":"education","type":"multi_choice","label":"De quel type d’accompagnement s’agit-il ou s’agirait-il ?","required":true,"options":[{"value":"individual_trainer","label":"Séances individuelles avec un éducateur"},{"value":"group_or_club","label":"Cours collectifs ou club canin"},{"value":"behaviorist","label":"Accompagnement par un comportementaliste"},{"value":"remote","label":"Accompagnement à distance"},{"value":"other","label":"Autre forme"},{"value":"undecided","label":"Ce n’est pas encore décidé"}],"visibleWhen":{"question":"education_support_status","in":["current","past","planned"]},"requiredWhen":{"question":"education_support_status","in":["current","past","planned"]}},{"key":"t1_adaptation","section":"adaptation","type":"single_choice","label":"Depuis son arrivée, comment votre chiot s’est-il adapté à sa nouvelle famille et à son nouveau quotidien ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"progressively","label":"Progressivement, avec quelques ajustements"},{"value":"still_difficult","label":"L’adaptation reste difficile"},{"value":"hard_to_assess","label":"C’est encore difficile à évaluer"}],"observationPeriod":"since_arrival","longitudinal":false},{"key":"t1_adaptation_comment","section":"adaptation","type":"long_text","label":"Si vous le souhaitez, racontez-moi en quelques mots comment se sont passées ses premières semaines avec vous.","required":false,"comment":true,"longitudinal":false},{"key":"t1_cleanliness_day","section":"cleanliness","type":"single_choice","label":"Au cours des quatorze derniers jours, pendant combien de journées votre chiot a-t-il eu au moins un accident de propreté dans le logement ?","required":true,"options":[{"value":"0","label":"Aucune journée"},{"value":"1_2","label":"1 ou 2 journées"},{"value":"3_5","label":"3 à 5 journées"},{"value":"6_10","label":"6 à 10 journées"},{"value":"11_14","label":"11 à 14 journées"}],"observationPeriod":"last_14_days"},{"key":"t1_cleanliness_night","section":"cleanliness","type":"single_choice","label":"Au cours des quatorze dernières nuits, pendant combien de nuits votre chiot a-t-il eu au moins un accident de propreté ?","required":true,"options":[{"value":"0","label":"Aucune nuit"},{"value":"1_2","label":"1 ou 2 nuits"},{"value":"3_5","label":"3 à 5 nuits"},{"value":"6_10","label":"6 à 10 nuits"},{"value":"11_14","label":"11 à 14 nuits"}],"observationPeriod":"last_14_days"},{"key":"t1_cleanliness_contexts","section":"cleanliness","type":"multi_choice","label":"Dans quelles circonstances ces accidents se produisent-ils le plus souvent ?","required":true,"options":[{"value":"waking_or_night","label":"Au réveil ou pendant la nuit"},{"value":"after_food_or_drink","label":"Après un repas ou après avoir bu"},{"value":"play_or_excitement","label":"Pendant ou après une période de jeu ou d’excitation"},{"value":"exit_delayed","label":"Lorsque la sortie n’a pas pu avoir lieu assez rapidement"},{"value":"absence","label":"Pendant une absence"},{"value":"no_identified_context","label":"Sans circonstance particulière identifiable"},{"value":"other","label":"Autre situation"}],"visibleWhen":{"anyQuestion":["t1_cleanliness_day","t1_cleanliness_night"],"notIn":["0"]},"requiredWhen":{"anyQuestion":["t1_cleanliness_day","t1_cleanliness_night"],"notIn":["0"]}},{"key":"t1_cleanliness_signal","section":"cleanliness","type":"single_choice","label":"Votre chiot manifeste-t-il généralement un signal avant d’avoir besoin de sortir ?","required":true,"options":[{"value":"clear","label":"Oui, un signal assez clair"},{"value":"subtle","label":"Oui, mais le signal est encore discret ou irrégulier"},{"value":"none","label":"Non, aucun signal identifiable pour le moment"},{"value":"unknown","label":"Je ne sais pas"}],"visibleWhen":{"anyQuestion":["t1_cleanliness_day","t1_cleanliness_night"],"notIn":["0"]},"requiredWhen":{"anyQuestion":["t1_cleanliness_day","t1_cleanliness_night"],"notIn":["0"]}},{"key":"t1_cleanliness_comment","section":"cleanliness","type":"long_text","label":"Souhaitez-vous ajouter un commentaire sur la propreté ?","required":false,"comment":true},{"key":"t1_care_handling","section":"care","type":"matrix_single_choice","label":"Au cours des dernières semaines, comment se sont passées les manipulations ou les soins suivants ?","required":true,"rows":[{"key":"coat","label":"Brossage ou entretien du pelage"},{"key":"paws","label":"Manipulation des pattes ou des griffes"},{"key":"ears","label":"Vérification ou entretien des oreilles"},{"key":"mouth","label":"Manipulation de la bouche ou des dents"}],"options":[{"value":"not_done","label":"Pas réalisé"},{"value":"easy","label":"Facile"},{"value":"possible_with_pauses","label":"Possible avec pauses ou réassurance"},{"value":"difficult","label":"Difficile"},{"value":"stopped_or_impossible","label":"Interrompu ou impossible"}],"observationPeriod":"last_weeks"},{"key":"t1_care_comment","section":"care","type":"long_text","label":"Si vous le souhaitez, vous pouvez préciser ce qui rend certaines manipulations difficiles.","required":false,"visibleWhen":{"matrixQuestion":"t1_care_handling","in":["difficult","stopped_or_impossible"]},"comment":true},{"key":"personality_family_place","section":"conclusion","type":"long_text","label":"En quelques mots, comment décririez-vous aujourd’hui la personnalité de votre chien et la place qu’il occupe dans votre famille ?","required":true,"longitudinalAxis":"personality_family_place"},{"key":"t1_satisfaction_overall","section":"satisfaction","type":"single_choice","label":"Globalement, dans quelle mesure êtes-vous satisfait(e) de votre expérience d’adoption auprès des Golden du Pays Pourpre ?","required":true,"options":[{"value":"very_satisfied","label":"Très satisfait(e)"},{"value":"satisfied","label":"Satisfait(e)"},{"value":"neutral","label":"Ni satisfait(e) ni insatisfait(e)"},{"value":"dissatisfied","label":"Insatisfait(e)"},{"value":"very_dissatisfied","label":"Très insatisfait(e)"}],"separateFromDogAssessment":true},{"key":"t1_satisfaction_reason","section":"satisfaction","type":"long_text","label":"Pourquoi ?","required":false,"comment":true,"separateFromDogAssessment":true},{"key":"t1_satisfaction_details","section":"satisfaction","type":"matrix_single_choice","label":"Dans quelle mesure êtes-vous satisfait(e) des aspects suivants ?","required":true,"rows":[{"key":"organization","label":"Organisation des différentes étapes de l’adoption"},{"key":"availability","label":"Temps et disponibilité consacrés individuellement"},{"key":"litter_updates","label":"Nouvelles et suivi de la portée avant l’adoption"},{"key":"information","label":"Clarté et utilité des informations transmises"},{"key":"welcome_booklet","label":"Clarté et utilité du livret d’accueil"}],"options":[{"value":"very_satisfied","label":"Très satisfait(e)"},{"value":"satisfied","label":"Satisfait(e)"},{"value":"neutral","label":"Ni satisfait(e) ni insatisfait(e)"},{"value":"dissatisfied","label":"Insatisfait(e)"},{"value":"very_dissatisfied","label":"Très insatisfait(e)"}],"separateFromDogAssessment":true},{"key":"t1_booklet_missing_topics","section":"satisfaction","type":"long_text","label":"Quels sujets non traités auriez-vous aimé voir figurer dans le livret d’accueil ?","required":false,"comment":true,"separateFromDogAssessment":true},{"key":"t1_improvements_filter","section":"satisfaction","type":"single_choice","label":"Dans votre expérience d’adoption, y a-t-il des éléments que vous auriez aimé trouver ou qui auraient pu être améliorés ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"separateFromDogAssessment":true},{"key":"t1_improvements_detail","section":"satisfaction","type":"long_text","label":"Quels éléments auriez-vous aimé trouver ou voir améliorés ?","required":true,"visibleWhen":{"question":"t1_improvements_filter","equals":"yes"},"requiredWhen":{"question":"t1_improvements_filter","equals":"yes"},"separateFromDogAssessment":true},{"key":"t1_final_comment","section":"satisfaction","type":"long_text","label":"Souhaitez-vous ajouter un commentaire sur votre expérience d’adoption ou évoquer un point qui n’a pas été abordé ?","required":false,"comment":true,"separateFromDogAssessment":true}]}$definition$::jsonb))
insert into public.post_adoption_questionnaire_definitions (code, version, milestone, title, species, breed, anchor_type, anchor_offset, response_window, definition, definition_sha256)
select 'post-adoption-t1', 1, 't1', 'Questionnaire post-adoption T1', 'dog', 'Golden Retriever', 'adoption_completed_at', interval '60 days', interval '30 days', definition, encode(extensions.digest(pg_catalog.convert_to(definition::text, 'UTF8'), 'sha256'), 'hex') from source;

with source(definition) as (values ($definition${"schemaVersion":1,"species":"dog","breed":"Golden Retriever","rules":{"structuredAnswersRequired":true,"requiredConditionalDetails":true,"freeCommentsOptional":true,"noGlobalScore":true,"noAutomaticBusinessMutation":true},"code":"post-adoption-t2","version":1,"title":"Questionnaire post-adoption T2","estimatedMinutes":{"min":10,"max":12},"observationPeriods":{"behavior":"last_4_weeks","context":"since_t1","health":"current","health_events":"since_adoption","weight_food_sterilization":"current_or_last_known"},"sectionOrder":["context","behavior","education","health","health_events","weight","food","sterilization","conclusion"],"questions":[{"key":"behavior_activity","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment décririez-vous globalement le niveau d’activité de votre chien ?","required":true,"options":[{"value":"very_calm","label":"Très calme ou peu actif"},{"value":"rather_calm","label":"Plutôt calme"},{"value":"intermediate","label":"Niveau d’activité intermédiaire"},{"value":"rather_active","label":"Plutôt actif"},{"value":"very_active","label":"Très actif"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"activity"},{"key":"behavior_calm_return","section":"behavior","type":"single_choice","label":"Après une période d’activité, de jeu ou d’excitation, votre chien parvient-il à retrouver un état calme ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"depends","label":"Cela dépend beaucoup des situations"},{"value":"difficult","label":"Difficilement"},{"value":"very_difficult","label":"Très difficilement"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"calm_return"},{"key":"behavior_calm_return_comment","section":"behavior","type":"long_text","label":"Si vous le souhaitez, vous pouvez préciser dans quelles situations le retour au calme est difficile.","required":false,"visibleWhen":{"question":"behavior_calm_return","in":["difficult","very_difficult"]},"comment":true},{"key":"behavior_novelty","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment votre chien a-t-il généralement réagi face à des lieux, objets, bruits ou situations inhabituels ?","required":true,"options":[{"value":"very_comfortable","label":"Très à l’aise"},{"value":"rather_comfortable","label":"Plutôt à l’aise"},{"value":"variable","label":"Réaction variable selon la situation"},{"value":"often_worried","label":"Souvent en difficulté ou inquiet"},{"value":"very_often_worried","label":"Très souvent en difficulté ou très inquiet"},{"value":"not_exposed","label":"Il n’a pas été confronté à une situation nouvelle"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"novelty"},{"key":"behavior_specific_fears","section":"behavior","type":"single_choice","label":"Avez-vous observé une ou plusieurs peurs particulières ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"visibleWhen":{"question":"behavior_novelty","in":["variable","often_worried","very_often_worried"]}},{"key":"behavior_specific_fears_detail","section":"behavior","type":"long_text","label":"Dans quelles situations ou face à quoi avez-vous observé ces réactions ?","required":true,"visibleWhen":{"question":"behavior_specific_fears","equals":"yes"},"requiredWhen":{"question":"behavior_specific_fears","equals":"yes"}},{"key":"behavior_novelty_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous ajouter une précision sur les situations nouvelles ou les peurs observées ?","required":false,"visibleWhen":{"question":"behavior_specific_fears","equals":"yes"},"comment":true},{"key":"behavior_unknown_people","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, comment se sont généralement passées les rencontres avec des personnes que votre chien ne connaissait pas ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable selon les personnes ou les situations"},{"value":"frequent_reserve","label":"Avec une réserve ou une inquiétude fréquente"},{"value":"major_difficulty","label":"Avec une difficulté importante"},{"value":"no_encounter","label":"Il n’a pas rencontré de personne inconnue"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"unknown_people"},{"key":"behavior_unknown_people_comment","section":"behavior","type":"long_text","label":"Si vous le souhaitez, précisez les situations variables ou difficiles.","required":false,"visibleWhen":{"question":"behavior_unknown_people","in":["variable","frequent_reserve","major_difficulty"]},"comment":true},{"key":"context_children_exposure","section":"behavior","type":"single_choice","label":"Votre chien vit-il avec des enfants ou en rencontre-t-il régulièrement ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}]},{"key":"context_children_interactions","section":"behavior","type":"single_choice","label":"Comment se passent généralement ces interactions ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable"},{"value":"manageable_difficulties","label":"Avec quelques difficultés gérables"},{"value":"major_difficulties","label":"Avec des difficultés importantes"},{"value":"not_enough_exposure","label":"Les contacts sont trop limités pour répondre"}],"visibleWhen":{"question":"context_children_exposure","equals":"yes"},"requiredWhen":{"question":"context_children_exposure","equals":"yes"}},{"key":"context_children_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser ces interactions avec des enfants ?","required":false,"visibleWhen":{"question":"context_children_exposure","equals":"yes"},"comment":true},{"key":"behavior_dogs_exposure","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, votre chien a-t-il eu l’occasion de rencontrer d’autres chiens ?","required":true,"options":[{"value":"regularly","label":"Oui, régulièrement"},{"value":"sometimes","label":"Oui, quelques fois"},{"value":"very_rarely","label":"Très rarement"},{"value":"no","label":"Non"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"dogs_exposure"},{"key":"behavior_dogs_course","section":"behavior","type":"single_choice","label":"Comment se sont généralement déroulées ces rencontres ?","required":true,"options":[{"value":"very_easily","label":"Très facilement avec la plupart des chiens"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable selon le chien ou la situation"},{"value":"frequent_reserve","label":"Avec une réserve ou une inquiétude fréquente"},{"value":"major_difficulties","label":"Avec des difficultés importantes"}],"visibleWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"requiredWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"longitudinalAxis":"dogs_course"},{"key":"behavior_dogs_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser le déroulement des rencontres avec d’autres chiens ?","required":false,"visibleWhen":{"question":"behavior_dogs_exposure","notEquals":"no"},"comment":true},{"key":"context_other_animals_exposure","section":"behavior","type":"single_choice","label":"Votre chien vit-il avec d’autres animaux ou en rencontre-t-il régulièrement ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}]},{"key":"context_other_animals_course","section":"behavior","type":"single_choice","label":"Comment se passe généralement la cohabitation ou la rencontre avec ces animaux ?","required":true,"options":[{"value":"very_easily","label":"Très facilement"},{"value":"rather_easily","label":"Plutôt facilement"},{"value":"variable","label":"De manière variable"},{"value":"manageable_difficulties","label":"Avec quelques difficultés gérables"},{"value":"major_difficulties","label":"Avec des difficultés importantes"},{"value":"not_enough_observation","label":"Situation encore trop peu observée"}],"visibleWhen":{"question":"context_other_animals_exposure","equals":"yes"},"requiredWhen":{"question":"context_other_animals_exposure","equals":"yes"}},{"key":"context_other_animals_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser ces interactions avec d’autres animaux ?","required":false,"visibleWhen":{"question":"context_other_animals_exposure","equals":"yes"},"comment":true},{"key":"behavior_solitude_exposure","section":"behavior","type":"single_choice","label":"Votre chien reste-t-il parfois seul sans présence humaine dans le logement ?","required":true,"options":[{"value":"never","label":"Non, jamais ou presque jamais"},{"value":"occasionally","label":"Oui, occasionnellement"},{"value":"regularly","label":"Oui, régulièrement"}],"longitudinalAxis":"solitude_exposure"},{"key":"behavior_solitude_duration","section":"behavior","type":"single_choice","label":"Lorsqu’il reste seul, quelle est habituellement la durée la plus longue ?","required":true,"options":[{"value":"under_30m","label":"Moins de 30 minutes"},{"value":"30m_1h","label":"De 30 minutes à 1 heure"},{"value":"1h_2h","label":"De 1 à 2 heures"},{"value":"2h_4h","label":"De 2 à 4 heures"},{"value":"over_4h","label":"Plus de 4 heures"}],"visibleWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"requiredWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"longitudinalAxis":"solitude_duration"},{"key":"behavior_solitude_course","section":"behavior","type":"single_choice","label":"Comment se passent généralement ces périodes de solitude ?","required":true,"options":[{"value":"very_well","label":"Très bien, sans difficulté observée"},{"value":"rather_well","label":"Plutôt bien"},{"value":"variable","label":"De manière variable"},{"value":"difficult","label":"Avec des difficultés importantes ou régulières"},{"value":"not_observable","label":"Je ne peux pas réellement observer ce qui se passe en mon absence"}],"visibleWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"requiredWhen":{"question":"behavior_solitude_exposure","in":["occasionally","regularly"]},"longitudinalAxis":"solitude_course"},{"key":"behavior_solitude_manifestations","section":"behavior","type":"multi_choice","label":"Quelles manifestations avez-vous observées ?","required":true,"options":[{"value":"vocalizations","label":"Vocalises ou aboiements"},{"value":"agitation","label":"Agitation"},{"value":"cannot_settle","label":"Difficulté à se poser"},{"value":"destruction","label":"Destructions"},{"value":"elimination","label":"Éliminations dans le logement"},{"value":"escape_attempts","label":"Tentatives de sortie ou de fuite"},{"value":"other","label":"Autre manifestation"}],"visibleWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]},"requiredWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]}},{"key":"behavior_solitude_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser les manifestations observées pendant les absences ?","required":false,"visibleWhen":{"question":"behavior_solitude_course","in":["variable","difficult"]},"comment":true},{"key":"behavior_management_impact","section":"behavior","type":"single_choice","label":"Au cours des quatre dernières semaines, dans quelle mesure avez-vous rencontré des difficultés dans l’éducation ou la gestion quotidienne de votre chien ?","required":true,"options":[{"value":"none","label":"Aucune difficulté particulière"},{"value":"light","label":"Quelques difficultés légères"},{"value":"regular_manageable","label":"Des difficultés régulières, mais qui restent gérables"},{"value":"major_daily_impact","label":"Des difficultés importantes ayant un impact sur le quotidien"}],"observationPeriod":"last_4_weeks","longitudinalAxis":"management_impact"},{"key":"behavior_management_topics","section":"behavior","type":"multi_choice","label":"Quels sujets sont concernés ?","required":true,"options":[{"value":"activity","label":"Niveau d’activité ou excitation"},{"value":"calm_return","label":"Retour au calme"},{"value":"fears_novelty","label":"Peurs ou nouveauté"},{"value":"people","label":"Rencontres avec des personnes"},{"value":"dogs","label":"Rencontres avec des chiens"},{"value":"separation","label":"Autonomie ou séparation"},{"value":"daily_management","label":"Gestion quotidienne ou respect des repères"},{"value":"vocalizations","label":"Aboiements ou vocalises"},{"value":"other","label":"Autre difficulté"}],"visibleWhen":{"question":"behavior_management_impact","notEquals":"none"},"requiredWhen":{"question":"behavior_management_impact","notEquals":"none"},"variantOptions":{"t1":[{"value":"mouthing","label":"Mordillements"},{"value":"exploratory_destruction","label":"Destructions exploratoires"}]}},{"key":"behavior_management_comment","section":"behavior","type":"long_text","label":"Souhaitez-vous préciser les difficultés rencontrées ?","required":false,"visibleWhen":{"question":"behavior_management_impact","notEquals":"none"},"comment":true},{"key":"education_support_status","section":"education","type":"single_choice","label":"Depuis l’adoption, avez-vous bénéficié d’un accompagnement en éducation canine ?","required":true,"options":[{"value":"current","label":"Oui, actuellement"},{"value":"past","label":"Oui, auparavant"},{"value":"planned","label":"Non, mais c’est prévu ou envisagé"},{"value":"no","label":"Non"}],"longitudinalAxis":"education_support"},{"key":"education_support_reasons","section":"education","type":"multi_choice","label":"Pour quelles raisons avez-vous choisi ou envisagez-vous cet accompagnement ?","required":true,"options":[{"value":"daily_education","label":"Être accompagné dans l’éducation quotidienne"},{"value":"puppy_or_group_classes","label":"Participer à des cours pour chiots ou à des cours collectifs"},{"value":"specific_difficulty","label":"Travailler une difficulté particulière"},{"value":"activity","label":"Préparer une activité ou une discipline"},{"value":"other","label":"Autre raison"}],"visibleWhen":{"question":"education_support_status","in":["current","past","planned"]},"requiredWhen":{"question":"education_support_status","in":["current","past","planned"]}},{"key":"education_support_types","section":"education","type":"multi_choice","label":"De quel type d’accompagnement s’agit-il ou s’agirait-il ?","required":true,"options":[{"value":"individual_trainer","label":"Séances individuelles avec un éducateur"},{"value":"group_or_club","label":"Cours collectifs ou club canin"},{"value":"behaviorist","label":"Accompagnement par un comportementaliste"},{"value":"remote","label":"Accompagnement à distance"},{"value":"other","label":"Autre forme"},{"value":"undecided","label":"Ce n’est pas encore décidé"}],"visibleWhen":{"question":"education_support_status","in":["current","past","planned"]},"requiredWhen":{"question":"education_support_status","in":["current","past","planned"]}},{"key":"t2_daily_change_filter","section":"context","type":"single_choice","label":"Depuis le premier questionnaire, un changement important est-il intervenu dans le quotidien de votre chien ou de votre foyer ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"observationPeriod":"since_t1"},{"key":"t2_daily_change_detail","section":"context","type":"long_text","label":"Quel changement important est intervenu ?","required":true,"visibleWhen":{"question":"t2_daily_change_filter","equals":"yes"},"requiredWhen":{"question":"t2_daily_change_filter","equals":"yes"}},{"key":"t2_health_concern","section":"health","type":"single_choice","label":"Votre chien présente-t-il actuellement un problème de santé ou un symptôme qui vous préoccupe ?","required":true,"options":[{"value":"no","label":"Non"},{"value":"occasional","label":"Oui, ponctuellement"},{"value":"persistent","label":"Oui, de manière persistante"},{"value":"consultation_planned","label":"Une consultation ou des examens sont prévus"},{"value":"unknown","label":"Je ne sais pas encore"}],"observationPeriod":"current"},{"key":"t2_health_symptoms","section":"health","type":"long_text","label":"Quel problème ou quels symptômes avez-vous observés ?","required":true,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"requiredWhen":{"question":"t2_health_concern","notEquals":"no"}},{"key":"t2_health_onset","section":"health","type":"short_text","label":"À quelle période approximative sont-ils apparus ?","required":true,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"requiredWhen":{"question":"t2_health_concern","notEquals":"no"}},{"key":"t2_health_course","section":"health","type":"long_text","label":"Comment ont-ils évolué et à quelle fréquence se manifestent-ils ?","required":true,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"requiredWhen":{"question":"t2_health_concern","notEquals":"no"}},{"key":"t2_health_daily_impact","section":"health","type":"long_text","label":"Quel est leur impact éventuel sur la vie quotidienne ?","required":true,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"requiredWhen":{"question":"t2_health_concern","notEquals":"no"}},{"key":"t2_health_consultation","section":"health","type":"long_text","label":"Une consultation a-t-elle été réalisée ou prévue ?","required":true,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"requiredWhen":{"question":"t2_health_concern","notEquals":"no"}},{"key":"t2_health_diagnosis","section":"health","type":"long_text","label":"Quel diagnostic a éventuellement été posé ?","required":false,"visibleWhen":{"question":"t2_health_concern","notEquals":"no"},"comment":true},{"key":"t2_treatment_status","section":"health","type":"single_choice","label":"Votre chien fait-il actuellement l’objet d’un traitement ou d’une surveillance vétérinaire ?","required":true,"options":[{"value":"no","label":"Non"},{"value":"occasional_treatment","label":"Traitement ponctuel"},{"value":"regular_treatment","label":"Traitement régulier"},{"value":"monitoring","label":"Surveillance sans traitement"},{"value":"exams","label":"Examens en cours"}],"observationPeriod":"current"},{"key":"t2_treatment_reason","section":"health","type":"long_text","label":"Pour quel motif ?","required":true,"visibleWhen":{"question":"t2_treatment_status","notEquals":"no"},"requiredWhen":{"question":"t2_treatment_status","notEquals":"no"}},{"key":"t2_treatment_nature","section":"health","type":"long_text","label":"Quelle est la nature du traitement ou de la surveillance ?","required":true,"visibleWhen":{"question":"t2_treatment_status","notEquals":"no"},"requiredWhen":{"question":"t2_treatment_status","notEquals":"no"}},{"key":"t2_treatment_next_step","section":"health","type":"long_text","label":"Quelle est la prochaine étape connue ?","required":false,"visibleWhen":{"question":"t2_treatment_status","notEquals":"no"},"comment":true},{"key":"t2_notable_events_filter","section":"health_events","type":"single_choice","label":"Depuis son adoption, votre chien a-t-il connu au moins un événement vétérinaire notable ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"observationPeriod":"since_adoption"},{"key":"t2_notable_events","section":"health_events","type":"repeater","label":"Décrivez chaque événement vétérinaire notable.","required":true,"visibleWhen":{"question":"t2_notable_events_filter","equals":"yes"},"requiredWhen":{"question":"t2_notable_events_filter","equals":"yes"},"eventCategories":[{"value":"illness","label":"Maladie ou symptômes ayant motivé une consultation"},{"value":"injury_accident","label":"Blessure ou accident"},{"value":"emergency_hospitalization","label":"Urgence ou hospitalisation"},{"value":"surgery","label":"Intervention chirurgicale"},{"value":"diagnosis","label":"Diagnostic d’une affection"},{"value":"persistent_recurrent","label":"Problème persistant ou récurrent, même sans diagnostic"}],"fields":[{"key":"category","type":"single_choice","required":true},{"key":"approximate_date","type":"short_text","required":true},{"key":"reason_or_signs","type":"long_text","required":true},{"key":"diagnosis","type":"long_text","required":false},{"key":"care_or_treatment","type":"long_text","required":false},{"key":"current_state","type":"single_choice","required":true,"options":["resolved","improved","persistent","recurrent","under_evaluation"]},{"key":"comment","type":"long_text","required":false}]},{"key":"t2_weight_known","section":"weight","type":"single_choice","label":"Connaissez-vous le dernier poids de votre chien ?","required":true,"options":[{"value":"known","label":"Oui"},{"value":"unknown","label":"Poids inconnu"}]},{"key":"t2_weight_kg","section":"weight","type":"decimal","label":"Quel est le dernier poids connu de votre chien en kilogrammes ?","required":true,"visibleWhen":{"question":"t2_weight_known","equals":"known"},"requiredWhen":{"question":"t2_weight_known","equals":"known"},"min":0.1,"max":150,"provenance":"family_reported"},{"key":"t2_weight_date","section":"weight","type":"date_or_period","label":"À quelle date approximative a-t-il été mesuré ?","required":true,"visibleWhen":{"question":"t2_weight_known","equals":"known"},"requiredWhen":{"question":"t2_weight_known","equals":"known"}},{"key":"t2_body_shape","section":"weight","type":"single_choice","label":"En vous aidant du repère visuel, quelle silhouette correspond le mieux à votre chien actuellement ?","required":true,"options":[{"value":"too_thin","label":"Plutôt trop mince"},{"value":"thin_ok","label":"Mince, sans inquiétude particulière"},{"value":"appropriate","label":"Corpulence qui semble adaptée"},{"value":"slightly_overweight","label":"Légèrement en surpoids"},{"value":"overweight","label":"Nettement en surpoids"},{"value":"unknown","label":"Je ne sais pas l’évaluer"}],"visualGuide":"dog_body_shape_v1"},{"key":"t2_weight_recommendation","section":"weight","type":"single_choice","label":"Un vétérinaire vous a-t-il recommandé de modifier ou de surveiller son poids ou sa silhouette ?","required":true,"options":[{"value":"no","label":"Non"},{"value":"gain","label":"Oui, une prise de poids a été recommandée"},{"value":"loss","label":"Oui, une perte de poids a été recommandée"},{"value":"monitor","label":"Oui, une surveillance a été recommandée"},{"value":"other","label":"Autre recommandation"}]},{"key":"t2_weight_recommendation_detail","section":"weight","type":"long_text","label":"Souhaitez-vous préciser cette recommandation ?","required":false,"visibleWhen":{"question":"t2_weight_recommendation","notEquals":"no"},"comment":true},{"key":"t2_food_types","section":"food","type":"multi_choice","label":"Quel type d’alimentation votre chien reçoit-il actuellement ?","required":true,"options":[{"value":"dry","label":"Croquettes"},{"value":"wet","label":"Alimentation humide"},{"value":"home_cooked","label":"Ration ménagère"},{"value":"raw","label":"Alimentation crue"},{"value":"mixed","label":"Mélange de plusieurs types"},{"value":"other","label":"Autre"}]},{"key":"t2_food_product","section":"food","type":"short_text","label":"Si vous le connaissez, quel est son aliment ou produit principal actuel ?","required":false,"comment":true},{"key":"t2_appetite","section":"food","type":"single_choice","label":"Comment décririez-vous généralement son appétit ?","required":true,"options":[{"value":"regular","label":"Régulier"},{"value":"variable","label":"Variable"},{"value":"difficult","label":"Il mange difficilement"},{"value":"very_fast","label":"Il mange très rapidement"},{"value":"often_hungry","label":"Il semble fréquemment avoir faim"},{"value":"other_difficulty","label":"Autre difficulté"}]},{"key":"t2_appetite_comment","section":"food","type":"long_text","label":"Souhaitez-vous préciser cette difficulté d’appétit ?","required":false,"visibleWhen":{"question":"t2_appetite","in":["difficult","very_fast","often_hungry","other_difficulty"]},"comment":true},{"key":"t2_food_tolerance","section":"food","type":"single_choice","label":"Comment tolère-t-il actuellement son alimentation ?","required":true,"options":[{"value":"very_well","label":"Très bien, sans difficulté observée"},{"value":"rather_well","label":"Plutôt bien"},{"value":"occasional_difficulties","label":"Quelques difficultés occasionnelles"},{"value":"regular_difficulties","label":"Des difficultés régulières"},{"value":"unknown","label":"Je ne sais pas l’évaluer"}]},{"key":"t2_food_tolerance_signs","section":"food","type":"long_text","label":"Quelles manifestations avez-vous observées ?","required":true,"visibleWhen":{"question":"t2_food_tolerance","in":["occasional_difficulties","regular_difficulties"]},"requiredWhen":{"question":"t2_food_tolerance","in":["occasional_difficulties","regular_difficulties"]}},{"key":"t2_food_change_filter","section":"food","type":"single_choice","label":"Son alimentation principale a-t-elle changé depuis son adoption ?","required":true,"options":[{"value":"yes","label":"Oui"},{"value":"no","label":"Non"}],"observationPeriod":"since_adoption"},{"key":"t2_food_change_reasons","section":"food","type":"multi_choice","label":"Pour quelle raison ?","required":true,"options":[{"value":"age","label":"Évolution normale liée à l’âge"},{"value":"health","label":"Santé"},{"value":"tolerance","label":"Tolérance"},{"value":"family_choice","label":"Choix familial"}],"visibleWhen":{"question":"t2_food_change_filter","equals":"yes"},"requiredWhen":{"question":"t2_food_change_filter","equals":"yes"}},{"key":"t2_food_change_comment","section":"food","type":"long_text","label":"Souhaitez-vous préciser ce changement d’alimentation ?","required":false,"visibleWhen":{"question":"t2_food_change_filter","equals":"yes"},"comment":true},{"key":"t2_sterilization","section":"sterilization","type":"single_choice","label":"Quelle est actuellement la situation concernant la stérilisation de votre chien ?","required":true,"options":[{"value":"sterilized","label":"Il est stérilisé"},{"value":"planned","label":"Il n’est pas stérilisé, mais nous prévoyons ou envisageons de le faire"},{"value":"not_planned","label":"Il n’est pas stérilisé et ce n’est pas prévu actuellement"},{"value":"undecided","label":"La décision n’est pas encore prise"},{"value":"prefer_not_to_answer","label":"Je préfère ne pas répondre"}]},{"key":"personality_family_place","section":"conclusion","type":"long_text","label":"En quelques mots, comment décririez-vous aujourd’hui la personnalité de votre chien et la place qu’il occupe dans votre famille ?","required":true,"longitudinalAxis":"personality_family_place"}]}$definition$::jsonb))
insert into public.post_adoption_questionnaire_definitions (code, version, milestone, title, species, breed, anchor_type, anchor_offset, response_window, definition, definition_sha256)
select 'post-adoption-t2', 1, 't2', 'Questionnaire post-adoption T2', 'dog', 'Golden Retriever', 'animal_birth_date', interval '15 months', interval '30 days', definition, encode(extensions.digest(pg_catalog.convert_to(definition::text, 'UTF8'), 'sha256'), 'hex') from source;
