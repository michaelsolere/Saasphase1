create or replace function public.is_valid_transactional_email_attachment_snapshot(
  value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  previous_document_type text;
  current_document_type text;
  seen_document_ids uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 10 then
    return false;
  end if;

  for item in select entry from jsonb_array_elements(value) as entries(entry)
  loop
    if jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 7
      or not item ?& array[
        'kind',
        'document_id',
        'document_type',
        'file_name',
        'file_sha256',
        'file_size_bytes',
        'version'
      ]
      or item->>'kind' <> 'document_pdf'
      or not (item->>'document_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or item->>'document_type' not in (
        'reservation_contract',
        'commitment_certificate'
      )
      or length(item->>'file_name') not between 5 and 255
      or item->>'file_name' !~ '\.pdf$'
      or item->>'file_sha256' !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(item->'file_size_bytes') <> 'number'
      or item->>'file_size_bytes' !~ '^[1-9][0-9]*$'
      or jsonb_typeof(item->'version') <> 'number'
      or item->>'version' !~ '^[1-9][0-9]*$'
    then
      return false;
    end if;

    if (item->>'document_id')::uuid = any(seen_document_ids) then
      return false;
    end if;
    seen_document_ids := array_append(
      seen_document_ids,
      (item->>'document_id')::uuid
    );

    current_document_type := item->>'document_type';
    if previous_document_type = 'reservation_contract'
      and current_document_type = 'commitment_certificate'
    then
      return false;
    end if;
    previous_document_type := current_document_type;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

alter table public.email_delivery_attempts
  add column attachments_snapshot jsonb not null default '[]'::jsonb,
  add constraint email_delivery_attempts_attachments_snapshot_check
    check (
      public.is_valid_transactional_email_attachment_snapshot(
        attachments_snapshot
      )
    );

create or replace function public.protect_email_delivery_attempt_attachments_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.attachments_snapshot is distinct from '[]'::jsonb then
      raise exception 'email delivery attachment snapshot must be empty on insert'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.attachments_snapshot is not distinct from old.attachments_snapshot then
    return new;
  end if;

  if old.attachments_snapshot <> '[]'::jsonb then
    raise exception 'email delivery attachment snapshot is immutable'
      using errcode = '23514';
  end if;

  if new.attachments_snapshot <> '[]'::jsonb and new.status <> 'sending' then
    raise exception 'email delivery attachment snapshot requires sending status'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger email_delivery_attempts_require_empty_attachments_snapshot
before insert on public.email_delivery_attempts
for each row execute function public.protect_email_delivery_attempt_attachments_snapshot();

create trigger email_delivery_attempts_protect_attachments_snapshot
before update of attachments_snapshot on public.email_delivery_attempts
for each row execute function public.protect_email_delivery_attempt_attachments_snapshot();
