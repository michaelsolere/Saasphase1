-- DEPARTURE-ORGANIZATION-01
-- Signed sale certificate evidence and one-shot authorization for the existing adoption finalizer.

begin;

alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check(document_type in(
  'phone_call_summary','plaud_transcript','application_form','reservation_contract','commitment_certificate','payment_receipt','invoice','sale_certificate','veterinary_certificate','birth_certificate','welcome_booklet','photo_use_authorization','other'
));
alter table public.document_templates drop constraint if exists document_templates_type_check;
alter table public.document_templates add constraint document_templates_type_check check(document_type in(
  'phone_call_summary','plaud_transcript','application_form','reservation_contract','commitment_certificate','payment_receipt','invoice','sale_certificate','veterinary_certificate','birth_certificate','welcome_booklet','photo_use_authorization','other'
));
alter table public.document_template_families drop constraint if exists document_template_families_type_check;
alter table public.document_template_families add constraint document_template_families_type_check check(document_type in(
  'phone_call_summary','plaud_transcript','application_form','reservation_contract','commitment_certificate','payment_receipt','invoice','sale_certificate','veterinary_certificate','birth_certificate','welcome_booklet','photo_use_authorization','other'
));

alter table public.departure_slots
  add column physical_documents_handed_over_at timestamptz,
  add column physical_documents_handed_over_by uuid references public.profiles(id) on delete restrict;

create table public.departure_signature_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null,
  animal_id uuid not null,
  document_id uuid not null,
  signed_return_id uuid not null,
  client_command_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  signer_name text not null,
  consent_text text not null,
  consent_sha256 text not null,
  source_pdf_sha256 text not null,
  signature_sha256 text not null,
  signed_pdf_sha256 text not null,
  occurred_at timestamptz not null default now(),
  constraint departure_signature_events_org_id_key unique(organization_id,id),
  constraint departure_signature_events_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id) on delete restrict,
  constraint departure_signature_events_animal_fk foreign key(organization_id,animal_id) references public.animals(organization_id,id) on delete restrict,
  constraint departure_signature_events_document_fk foreign key(organization_id,document_id) references public.documents(organization_id,id) on delete restrict,
  constraint departure_signature_events_return_fk foreign key(organization_id,signed_return_id) references public.document_signed_returns(organization_id,id) on delete restrict,
  constraint departure_signature_events_command_key unique(organization_id,client_command_id),
  constraint departure_signature_events_role_check check(actor_role in('owner','admin')),
  constraint departure_signature_events_hash_check check(consent_sha256~'^[0-9a-f]{64}$' and source_pdf_sha256~'^[0-9a-f]{64}$' and signature_sha256~'^[0-9a-f]{64}$' and signed_pdf_sha256~'^[0-9a-f]{64}$'),
  constraint departure_signature_events_text_check check(length(btrim(signer_name)) between 2 and 300 and length(btrim(consent_text)) between 10 and 2000)
);
alter table public.departure_signature_events enable row level security;
create policy departure_signature_events_select on public.departure_signature_events for select to authenticated using(public.is_member_of(organization_id));
revoke all on public.departure_signature_events from public,anon,authenticated,service_role;
grant select on public.departure_signature_events to authenticated;
create trigger departure_signature_events_immutable before update or delete on public.departure_signature_events for each row execute function public.guard_departure_append_only();

create table public.departure_finalization_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  adoption_completed_at timestamptz not null,
  expected_reservation_updated_at timestamptz not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '5 minutes',
  consumed_at timestamptz,
  constraint departure_finalization_authorizations_org_id_key unique(organization_id,id),
  constraint departure_finalization_authorizations_reservation_fk foreign key(organization_id,reservation_id) references public.reservations(organization_id,id) on delete cascade,
  constraint departure_finalization_authorizations_hash_check check(payload_hash~'^[0-9a-f]{64}$'),
  constraint departure_finalization_authorizations_dates_check check(expires_at>created_at and expires_at<=created_at+interval '10 minutes')
);
alter table public.departure_finalization_authorizations enable row level security;
revoke all on public.departure_finalization_authorizations from public,anon,authenticated,service_role;

create or replace function public.archive_sale_certificate_signature(
  p_document_id uuid,p_signed_return_id uuid,p_file_path text,p_file_sha256 text,p_file_size_bytes bigint,
  p_source_pdf_sha256 text,p_signature_sha256 text,p_signer_name text,p_consent_text text,p_consent_sha256 text,p_client_command_id uuid
)
returns table(outcome text,signed_return_id uuid,reason text) language plpgsql security definer set search_path='' as $$
declare v_document public.documents%rowtype;v_res public.reservations%rowtype;v_role text;v_user uuid:=auth.uid();v_expected text;v_existing public.departure_signature_events%rowtype;begin
  outcome:='error';signed_return_id:=null;reason:=null;
  if v_user is null or p_file_sha256!~'^[0-9a-f]{64}$' or p_source_pdf_sha256!~'^[0-9a-f]{64}$' or p_signature_sha256!~'^[0-9a-f]{64}$' or p_consent_sha256!~'^[0-9a-f]{64}$' or p_file_size_bytes<=0 or p_file_size_bytes>10*1024*1024 or length(btrim(coalesce(p_signer_name,'')))<2 or length(btrim(coalesce(p_consent_text,'')))<10 then reason:='invalid_input';return next;return;end if;
  select * into v_document from public.documents where id=p_document_id and document_type='sale_certificate' and deleted_at is null for update;if not found then reason:='document_not_found';return next;return;end if;
  v_role:=public.departure_owner_admin_role(v_document.organization_id);
  select * into v_existing from public.departure_signature_events where organization_id=v_document.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='existing';signed_return_id:=v_existing.signed_return_id;return next;return;end if;
  select * into v_res from public.reservations where organization_id=v_document.organization_id and id=v_document.reservation_id and animal_id=v_document.animal_id and status='animal_assigned' and deleted_at is null for update;
  if not found or v_document.status not in('generated','sent') or v_document.file_sha256 is distinct from p_source_pdf_sha256 or v_document.file_path is null or v_document.animal_id is null then reason:='document_not_eligible';return next;return;end if;
  v_expected:=format('organizations/%s/documents/%s/signed-returns/%s/%s.pdf',v_document.organization_id,v_document.id,p_signed_return_id,p_file_sha256);
  if p_file_path is distinct from v_expected or not exists(select 1 from storage.objects object where object.bucket_id='documents' and object.name=p_file_path and object.metadata->>'mimetype'='application/pdf' and object.metadata->>'size'=p_file_size_bytes::text) then reason:='stored_pdf_not_verified';return next;return;end if;
  insert into public.document_signed_returns(id,organization_id,document_id,file_path,file_sha256,file_size_bytes,mime_type,received_at,created_at,created_by) values(p_signed_return_id,v_document.organization_id,v_document.id,p_file_path,p_file_sha256,p_file_size_bytes,'application/pdf',now(),now(),v_user);
  update public.documents set status='signed',sent_at=coalesce(sent_at,now()),signed_at=now(),updated_at=now(),updated_by=v_user where id=v_document.id;
  insert into public.departure_signature_events(organization_id,reservation_id,animal_id,document_id,signed_return_id,client_command_id,actor_profile_id,actor_role,signer_name,consent_text,consent_sha256,source_pdf_sha256,signature_sha256,signed_pdf_sha256) values(v_document.organization_id,v_res.id,v_res.animal_id,v_document.id,p_signed_return_id,p_client_command_id,v_user,v_role,btrim(p_signer_name),btrim(p_consent_text),p_consent_sha256,p_source_pdf_sha256,p_signature_sha256,p_file_sha256);
  outcome:='created';signed_return_id:=p_signed_return_id;return next;
exception when unique_violation then outcome:='conflict';reason:='signature_already_archived';return next;end;$$;

create or replace function public.authorize_departure_finalization(
  p_reservation_id uuid,p_adoption_completed_at timestamptz,p_expected_reservation_updated_at timestamptz,p_physical_documents_handed_over boolean,p_payload_hash text
)
returns table(outcome text,authorization_id uuid,reason text) language plpgsql security definer set search_path='' as $$
declare v_res public.reservations%rowtype;v_animal public.animals%rowtype;v_slot public.departure_slots%rowtype;v_user uuid:=auth.uid();v_role text;v_paid bigint:=0;v_refunded bigint:=0;v_balance bigint;v_authorization uuid:=gen_random_uuid();begin
  outcome:='blocked';authorization_id:=null;reason:=null;
  if v_user is null or p_payload_hash!~'^[0-9a-f]{64}$' or not p_physical_documents_handed_over or p_adoption_completed_at is null or p_adoption_completed_at>now() then reason:='invalid_input';return next;return;end if;
  select * into v_res from public.reservations where id=p_reservation_id and status='animal_assigned' and animal_id is not null and deleted_at is null for no key update;if not found then reason:='reservation_not_ready';return next;return;end if;
  v_role:=public.departure_owner_admin_role(v_res.organization_id);
  if v_res.updated_at is distinct from p_expected_reservation_updated_at then reason:='reservation_stale';return next;return;end if;
  select * into v_animal from public.animals where organization_id=v_res.organization_id and id=v_res.animal_id and deleted_at is null for no key update;
  if not found or nullif(btrim(coalesce(v_animal.identification_number,'')),'') is null then reason:='identification_missing';return next;return;end if;
  select * into v_slot from public.departure_slots where organization_id=v_res.organization_id and reservation_id=v_res.id and status in('booked','late') order by booked_at desc limit 1 for update;
  if not found or v_slot.confirmed_at is null then reason:='appointment_not_confirmed';return next;return;end if;
  if exists(select 1 from public.post_birth_incidents incident where incident.organization_id=v_res.organization_id and incident.litter_id=v_res.litter_id and incident.status='open') then reason:='sensitive_incident_open';return next;return;end if;
  select coalesce(sum(payment.amount_cents) filter(where payment.payment_type not in('refund','partial_refund') and payment.status in('partially_paid','paid','partially_refunded','converted_to_credit','transferred')),0),coalesce(sum(payment.amount_cents) filter(where payment.payment_type in('refund','partial_refund') and payment.status in('paid','partially_refunded','refunded')),0) into v_paid,v_refunded from public.payments payment where payment.organization_id=v_res.organization_id and payment.reservation_id=v_res.id and payment.deleted_at is null;
  if v_res.price_cents is null then reason:='price_missing';return next;return;end if;v_balance:=v_res.price_cents-v_paid+v_refunded;if v_balance>0 then reason:='balance_remaining';return next;return;end if;
  if not exists(select 1 from public.documents document join public.document_signed_returns signed_return on signed_return.organization_id=document.organization_id and signed_return.document_id=document.id where document.organization_id=v_res.organization_id and document.reservation_id=v_res.id and document.animal_id=v_res.animal_id and document.document_type='sale_certificate' and document.status='signed' and document.deleted_at is null and document.superseded_at is null) then reason:='sale_certificate_not_signed';return next;return;end if;
  update public.departure_slots set physical_documents_handed_over_at=now(),physical_documents_handed_over_by=v_user,updated_at=now(),updated_by=v_user where id=v_slot.id;
  delete from public.departure_finalization_authorizations authrow where authrow.reservation_id=v_res.id and (authrow.expires_at<=now() or authrow.consumed_at is not null);
  insert into public.departure_finalization_authorizations(id,organization_id,reservation_id,actor_profile_id,adoption_completed_at,expected_reservation_updated_at,payload_hash) values(v_authorization,v_res.organization_id,v_res.id,v_user,p_adoption_completed_at,p_expected_reservation_updated_at,p_payload_hash);
  outcome:='authorized';authorization_id:=v_authorization;return next;end;$$;

create or replace function public.enforce_departure_finalization_authorization()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_authorization public.departure_finalization_authorizations%rowtype;begin
  if new.status is not distinct from old.status or new.status<>'adopted' then return new;end if;
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'')='' then return new;end if;
  select * into v_authorization from public.departure_finalization_authorizations authrow where authrow.organization_id=new.organization_id and authrow.reservation_id=new.id and authrow.actor_profile_id=auth.uid() and authrow.adoption_completed_at is not distinct from new.adoption_completed_at and authrow.expires_at>now() and authrow.consumed_at is null order by authrow.created_at desc limit 1 for update;
  if not found then raise exception 'departure_finalization_authorization_required' using errcode='42501';end if;
  update public.departure_finalization_authorizations set consumed_at=now() where id=v_authorization.id;
  return new;end;$$;
create trigger reservations_departure_finalization_authorization before update of status,adoption_completed_at on public.reservations for each row execute function public.enforce_departure_finalization_authorization();

create or replace function public.complete_departure_slot_after_adoption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='adopted' and old.status is distinct from new.status then update public.departure_slots set status='completed',version=version+1,updated_at=now(),updated_by=new.updated_by where organization_id=new.organization_id and reservation_id=new.id and status in('booked','late');end if;return new;end;$$;
create trigger reservations_complete_departure_slot after update of status on public.reservations for each row execute function public.complete_departure_slot_after_adoption();

revoke all on function public.archive_sale_certificate_signature(uuid,uuid,text,text,bigint,text,text,text,text,text,uuid),public.authorize_departure_finalization(uuid,timestamptz,timestamptz,boolean,text) from public,anon;
grant execute on function public.archive_sale_certificate_signature(uuid,uuid,text,text,bigint,text,text,text,text,text,uuid),public.authorize_departure_finalization(uuid,timestamptz,timestamptz,boolean,text) to authenticated;
revoke all on function public.enforce_departure_finalization_authorization(),public.complete_departure_slot_after_adoption() from public,anon,authenticated,service_role;

insert into public.email_templates(organization_id,template_key,title,category,subject,body,is_active)
select organization.id,'departure_documents','Documents remis lors du départ','adopter_journey','Vos documents de départ','Modèle transactionnel géré dans Brevo : prenom, portee, nom_chiot.',true
from public.organizations organization where organization.deleted_at is null
on conflict(organization_id,template_key) do nothing;

commit;
