begin;

alter table public.payments drop constraint payments_type_check;
alter table public.payments add constraint payments_type_check check (payment_type in (
  'pre_reservation_deposit_refundable','arrhes','balance','full_payment','refund',
  'partial_refund','credit_use','withholding','transfer_to_future_reservation','other'
));

create or replace function public.provision_adopter_profile_from_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.reservation_id is not null and new.deleted_at is null
    and new.payment_type in ('arrhes','pre_reservation_deposit_refundable','full_payment')
    and new.status in ('paid','partially_paid','partially_refunded','converted_to_credit','transferred') then
  begin
   perform public.ensure_adopter_profile_questionnaire_instance(new.reservation_id,coalesce(new.paid_at,now()),true);
  exception when others then
   insert into public.adopter_profile_questionnaire_reconciliation_attempts(reservation_id,outcome,error_code,details)
   values(new.reservation_id,'failed',sqlstate,jsonb_build_object('source','payment','paymentId',new.id));
  end;
 end if;
 return new;
end;
$$;

create table public.direct_late_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  application_id uuid not null,
  reservation_id uuid not null,
  litter_id uuid not null,
  animal_id uuid not null,
  contact_id uuid not null,
  status text not null default 'preparing',
  hold_deadline timestamptz not null,
  hold_status text not null default 'active',
  required_amount_cents integer not null,
  payment_id uuid not null,
  reservation_contract_id uuid not null,
  commitment_certificate_id uuid not null,
  email_draft_id uuid,
  version integer not null default 1,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  constraint direct_late_sales_application_fk foreign key (organization_id,application_id) references public.applications(organization_id,id),
  constraint direct_late_sales_reservation_fk foreign key (organization_id,reservation_id) references public.reservations(organization_id,id),
  constraint direct_late_sales_litter_fk foreign key (organization_id,litter_id) references public.litters(organization_id,id),
  constraint direct_late_sales_animal_fk foreign key (organization_id,animal_id) references public.animals(organization_id,id),
  constraint direct_late_sales_contact_fk foreign key (organization_id,contact_id) references public.contacts(organization_id,id),
  constraint direct_late_sales_payment_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id),
  constraint direct_late_sales_contract_fk foreign key (organization_id,reservation_contract_id) references public.documents(organization_id,id),
  constraint direct_late_sales_certificate_fk foreign key (organization_id,commitment_certificate_id) references public.documents(organization_id,id),
  constraint direct_late_sales_application_unique unique(organization_id,application_id),
  constraint direct_late_sales_reservation_unique unique(organization_id,reservation_id),
  constraint direct_late_sales_animal_active_unique unique(organization_id,animal_id),
  constraint direct_late_sales_status_check check(status in ('preparing','awaiting_proofs','ready_to_assign','assigned','cancelled','incident')),
  constraint direct_late_sales_hold_status_check check(hold_status in ('active','released','converted','cancelled')),
  constraint direct_late_sales_values_check check(required_amount_cents>0 and version>0)
);

create table public.direct_late_sale_email_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  direct_sale_id uuid not null,
  reservation_id uuid not null,
  contact_id uuid not null,
  status text not null default 'prepared',
  recipient_email text not null,
  recipient_name text not null,
  subject text not null,
  body_preview text not null,
  variables jsonb not null default '{}'::jsonb,
  template_id uuid,
  previewed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  sent_at timestamptz,
  brevo_message_id text,
  delivery_attempt_id uuid references public.email_delivery_attempts(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  constraint direct_late_sale_email_sale_unique unique(organization_id,direct_sale_id),
  constraint direct_late_sale_email_status_check check(status in ('prepared','previewed','reviewed','sending','sent','failed')),
  constraint direct_late_sale_email_review_check check(status not in ('reviewed','sending','sent') or (previewed_at is not null and reviewed_at is not null and reviewed_by is not null)),
  constraint direct_late_sale_email_sent_check check(status <> 'sent' or (sent_at is not null and brevo_message_id is not null)),
  constraint direct_late_sale_email_version_check check(version>0)
);

alter table public.direct_late_sales add constraint direct_late_sales_email_fk foreign key(email_draft_id) references public.direct_late_sale_email_drafts(id);

create table public.direct_late_sale_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  direct_sale_id uuid not null references public.direct_late_sales(id),
  reservation_id uuid not null,
  event_type text not null,
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  client_command_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint direct_late_sale_event_actor_check check(actor_role in ('owner','admin')),
  constraint direct_late_sale_event_command_unique unique(organization_id,client_command_id)
);

create table public.direct_late_sale_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_command_id uuid not null,
  command_type text not null,
  target_id uuid,
  result jsonb not null default '{}'::jsonb,
  actor_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint direct_late_sale_command_unique unique(organization_id,client_command_id)
);

create trigger direct_late_sale_events_immutable before update or delete on public.direct_late_sale_events for each row execute function public.guard_post_birth_append_only();

alter table public.direct_late_sales enable row level security;
alter table public.direct_late_sale_email_drafts enable row level security;
alter table public.direct_late_sale_events enable row level security;
alter table public.direct_late_sale_commands enable row level security;
create policy direct_late_sales_select on public.direct_late_sales for select to authenticated using(public.is_active_organization_member(organization_id));
create policy direct_late_sale_email_select on public.direct_late_sale_email_drafts for select to authenticated using(public.is_active_organization_member(organization_id));
create policy direct_late_sale_events_select on public.direct_late_sale_events for select to authenticated using(public.is_active_organization_member(organization_id));
grant select on public.direct_late_sales,public.direct_late_sale_email_drafts,public.direct_late_sale_events to authenticated;
revoke insert,update,delete on public.direct_late_sales,public.direct_late_sale_email_drafts,public.direct_late_sale_events,public.direct_late_sale_commands from anon,authenticated;

create or replace function public.create_direct_late_sale(
  p_application_id uuid,p_litter_id uuid,p_animal_id uuid,p_hold_deadline timestamptz,p_required_amount_cents integer,
  p_email_subject text,p_email_body_preview text,p_client_command_id uuid
)
returns table(outcome text,direct_sale_id uuid,reservation_id uuid,version integer,payment_id uuid,contract_document_id uuid,certificate_document_id uuid,email_draft_id uuid,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_application public.applications%rowtype;v_litter public.litters%rowtype;v_animal public.animals%rowtype;v_contact public.contacts%rowtype;v_role text;v_reservation uuid;v_payment uuid;v_contract uuid;v_certificate uuid;v_email uuid;v_event uuid;v_sale public.direct_late_sales%rowtype;v_unresolved integer;v_email_address text;v_name text;
begin
  direct_sale_id:=null;reservation_id:=null;version:=null;payment_id:=null;contract_document_id:=null;certificate_document_id:=null;email_draft_id:=null;reason:=null;
  select * into v_application from public.applications where id=p_application_id and deleted_at is null for update;
  if not found or v_application.status<>'qualified' then outcome:='not_eligible';reason:='qualified_application_required';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_application.organization_id);
  select result->>'outcome',(result->>'directSaleId')::uuid,(result->>'reservationId')::uuid,(result->>'version')::integer,(result->>'paymentId')::uuid,(result->>'contractDocumentId')::uuid,(result->>'certificateDocumentId')::uuid,(result->>'emailDraftId')::uuid into outcome,direct_sale_id,reservation_id,version,payment_id,contract_document_id,certificate_document_id,email_draft_id from public.direct_late_sale_commands where organization_id=v_application.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';return next;return;end if;
  select * into v_litter from public.litters where organization_id=v_application.organization_id and id=p_litter_id and actual_birth_date is not null and deleted_at is null;
  if not found then outcome:='not_eligible';reason:='born_litter_required';return next;return;end if;
  if not exists(select 1 from public.post_birth_positioning_waves wave where wave.organization_id=v_litter.organization_id and wave.litter_id=v_litter.id and wave.wave_kind='ordinary' and wave.status='completed') then outcome:='not_eligible';reason:='ordinary_wave_unresolved';return next;return;end if;
  if exists(select 1 from public.post_birth_incidents incident where incident.organization_id=v_litter.organization_id and incident.litter_id=v_litter.id and incident.status='open') then outcome:='not_eligible';reason:='sensitive_incident_open';return next;return;end if;
  select count(*) into v_unresolved from public.reservations reservation_row join public.applications application_row on application_row.id=reservation_row.application_id
    where reservation_row.organization_id=v_litter.organization_id
      and (reservation_row.litter_id=v_litter.id or reservation_row.litter_group_id=v_litter.litter_group_id)
      and reservation_row.deleted_at is null and not application_row.rank_payment_late
      and reservation_row.status not in('withdrawn','postponed','cancelled','archived')
      and not exists(select 1 from public.post_birth_positions position_row where position_row.reservation_id=reservation_row.id);
  if v_unresolved>0 then outcome:='not_eligible';reason:='priority_families_unresolved';return next;return;end if;
  select * into v_animal from public.animals where organization_id=v_litter.organization_id and id=p_animal_id and litter_id=v_litter.id and deleted_at is null for update;
  if not found or v_animal.status<>'available' or v_animal.ownership_status<>'produced' or v_animal.is_breeder or v_animal.is_external or v_animal.is_retired
    or exists(select 1 from public.reservations r where r.organization_id=v_litter.organization_id and r.animal_id=v_animal.id and r.deleted_at is null)
    or exists(select 1 from public.direct_late_sales sale where sale.organization_id=v_litter.organization_id and sale.animal_id=v_animal.id and sale.hold_status='active')
  then outcome:='not_eligible';reason:='animal_unavailable';return next;return;end if;
  if p_hold_deadline<=now() or p_required_amount_cents<=0 then outcome:='not_eligible';reason:='hold_or_amount_invalid';return next;return;end if;
  select * into v_contact from public.contacts where organization_id=v_application.organization_id and id=v_application.contact_id and deleted_at is null;
  v_email_address:=coalesce(v_contact.email,'');v_name:=btrim(concat_ws(' ',v_contact.first_name,v_contact.last_name));
  if v_email_address='' then outcome:='not_eligible';reason:='contact_email_required';return next;return;end if;
  insert into public.reservations(organization_id,contact_id,application_id,litter_group_id,litter_id,reserved_sex_preference,status,price_cents,currency,created_by,updated_by)
    values(v_application.organization_id,v_application.contact_id,v_application.id,v_litter.litter_group_id,v_litter.id,case v_animal.sex when 'male' then 'male_only' else 'female_only' end,'draft',p_required_amount_cents,'EUR',v_user,v_user) returning id into v_reservation;
  insert into public.documents(organization_id,contact_id,application_id,reservation_id,litter_id,animal_id,document_type,status,title,signature_required,created_by,updated_by)
    values(v_application.organization_id,v_application.contact_id,v_application.id,v_reservation,v_litter.id,v_animal.id,'reservation_contract','to_generate','Contrat de réservation — vente directe tardive',true,v_user,v_user) returning id into v_contract;
  insert into public.documents(organization_id,contact_id,application_id,reservation_id,litter_id,animal_id,document_type,status,title,signature_required,created_by,updated_by)
    values(v_application.organization_id,v_application.contact_id,v_application.id,v_reservation,v_litter.id,v_animal.id,'commitment_certificate','to_generate','Certificat d’engagement',true,v_user,v_user) returning id into v_certificate;
  insert into public.payments(organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,requested_at,due_date,payment_method,notes,created_by,updated_by)
    values(v_application.organization_id,v_application.contact_id,v_reservation,p_required_amount_cents,'EUR','full_payment','requested',now(),p_hold_deadline::date,'unknown','Paiement intégral — vente directe tardive',v_user,v_user) returning id into v_payment;
  insert into public.direct_late_sales(organization_id,application_id,reservation_id,litter_id,animal_id,contact_id,hold_deadline,required_amount_cents,payment_id,reservation_contract_id,commitment_certificate_id,created_by,updated_by)
    values(v_application.organization_id,v_application.id,v_reservation,v_litter.id,v_animal.id,v_application.contact_id,p_hold_deadline,p_required_amount_cents,v_payment,v_contract,v_certificate,v_user,v_user) returning * into v_sale;
  insert into public.direct_late_sale_email_drafts(organization_id,direct_sale_id,reservation_id,contact_id,recipient_email,recipient_name,subject,body_preview,variables,created_by,updated_by)
    values(v_sale.organization_id,v_sale.id,v_reservation,v_sale.contact_id,v_email_address,coalesce(nullif(v_name,''),'Famille'),btrim(p_email_subject),btrim(p_email_body_preview),jsonb_build_object('contact_name',coalesce(nullif(v_name,''),'Famille'),'animal_name',coalesce(v_animal.call_name,v_animal.official_name,'Chiot '||left(v_animal.id::text,8)),'deadline',p_hold_deadline,'amount_cents',p_required_amount_cents),v_user,v_user) returning id into v_email;
  update public.direct_late_sales set email_draft_id=v_email,status='awaiting_proofs' where id=v_sale.id;
  insert into public.direct_late_sale_events(organization_id,direct_sale_id,reservation_id,event_type,actor_profile_id,actor_role,details,client_command_id)
    values(v_sale.organization_id,v_sale.id,v_reservation,'direct_late_sale_prepared',v_user,v_role,jsonb_build_object('animalId',v_animal.id,'paymentId',v_payment,'contractId',v_contract,'certificateId',v_certificate,'emailDraftId',v_email,'holdDeadline',p_hold_deadline),p_client_command_id) returning id into v_event;
  insert into public.direct_late_sale_commands(organization_id,client_command_id,command_type,target_id,result,actor_profile_id)
    values(v_sale.organization_id,p_client_command_id,'create',v_sale.id,jsonb_build_object('outcome','created','directSaleId',v_sale.id,'reservationId',v_reservation,'version',v_sale.version,'paymentId',v_payment,'contractDocumentId',v_contract,'certificateDocumentId',v_certificate,'emailDraftId',v_email),v_user);
  outcome:='created';direct_sale_id:=v_sale.id;reservation_id:=v_reservation;version:=v_sale.version;payment_id:=v_payment;contract_document_id:=v_contract;certificate_document_id:=v_certificate;email_draft_id:=v_email;return next;
end;
$$;

create or replace function public.transition_direct_late_sale_email(
  p_direct_sale_id uuid,p_action text,p_expected_version integer,p_brevo_message_id text,p_client_command_id uuid
)
returns table(outcome text,email_draft_id uuid,status text,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_sale public.direct_late_sales%rowtype;v_email public.direct_late_sale_email_drafts%rowtype;v_role text;v_event uuid;v_next text;v_command public.direct_late_sale_commands%rowtype;
begin
  email_draft_id:=null;status:=null;version:=null;reason:=null;
  select * into v_sale from public.direct_late_sales where id=p_direct_sale_id for update;
  if not found then outcome:='not_eligible';reason:='sale_not_found';return next;return;end if;
  v_role:=public.post_birth_owner_admin_role(v_sale.organization_id);
  select * into v_command from public.direct_late_sale_commands where organization_id=v_sale.organization_id and client_command_id=p_client_command_id;
  if found then outcome:='already_applied';email_draft_id:=v_sale.email_draft_id;select email.status,email.version into status,version from public.direct_late_sale_email_drafts email where email.id=v_sale.email_draft_id;return next;return;end if;
  select * into v_email from public.direct_late_sale_email_drafts where id=v_sale.email_draft_id for update;
  if v_email.version<>p_expected_version then outcome:='conflict';email_draft_id:=v_email.id;status:=v_email.status;version:=v_email.version;reason:='version_conflict';return next;return;end if;
  v_next:=case when p_action='preview' and v_email.status='prepared' then 'previewed' when p_action='review' and v_email.status='previewed' then 'reviewed' when p_action='sending' and v_email.status in('reviewed','failed') then 'sending' when p_action='sent' and v_email.status='sending' and p_brevo_message_id is not null then 'sent' when p_action='failed' and v_email.status='sending' then 'failed' end;
  if v_next is null then outcome:='not_eligible';reason:='email_transition_invalid';return next;return;end if;
  update public.direct_late_sale_email_drafts as email_row set status=v_next,previewed_at=case when v_next='previewed' then now() else email_row.previewed_at end,reviewed_at=case when v_next='reviewed' then now() else email_row.reviewed_at end,reviewed_by=case when v_next='reviewed' then v_user else email_row.reviewed_by end,sent_at=case when v_next='sent' then now() else email_row.sent_at end,brevo_message_id=case when v_next='sent' then p_brevo_message_id else email_row.brevo_message_id end,version=email_row.version+1,updated_at=now(),updated_by=v_user where email_row.id=v_email.id returning * into v_email;
  if v_next='sent' then
    update public.documents document_row
    set status='sent',sent_at=coalesce(document_row.sent_at,now()),updated_at=now(),updated_by=v_user
    where document_row.id in(v_sale.reservation_contract_id,v_sale.commitment_certificate_id)
      and document_row.status not in('sent','signed');
  end if;
  insert into public.direct_late_sale_events(organization_id,direct_sale_id,reservation_id,event_type,actor_profile_id,actor_role,details,client_command_id)
    values(v_sale.organization_id,v_sale.id,v_sale.reservation_id,'direct_late_sale_email_'||v_next,v_user,v_role,jsonb_build_object('emailDraftId',v_email.id,'brevoMessageId',p_brevo_message_id),p_client_command_id) returning id into v_event;
  insert into public.direct_late_sale_commands(organization_id,client_command_id,command_type,target_id,result,actor_profile_id)
    values(v_sale.organization_id,p_client_command_id,'email_'||p_action,v_sale.id,jsonb_build_object('outcome','updated','emailDraftId',v_email.id,'status',v_email.status,'version',v_email.version),v_user);
  outcome:='updated';email_draft_id:=v_email.id;status:=v_email.status;version:=v_email.version;return next;
end;
$$;

create or replace function public.record_direct_late_sale_document_received(
 p_direct_sale_id uuid,p_document_id uuid,p_signed_at timestamptz,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,version integer,ready_to_assign boolean,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_sale public.direct_late_sales%rowtype;v_document public.documents%rowtype;v_role text;v_event uuid;v_ready boolean;v_command public.direct_late_sale_commands%rowtype;
begin
 version:=null;ready_to_assign:=false;reason:=null;select * into v_sale from public.direct_late_sales where id=p_direct_sale_id for update;
 if not found then outcome:='not_eligible';reason:='sale_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_sale.organization_id);
 select * into v_command from public.direct_late_sale_commands where organization_id=v_sale.organization_id and client_command_id=p_client_command_id;
 if found then outcome:='already_applied';version:=v_sale.version;ready_to_assign:=v_sale.status='ready_to_assign';return next;return;end if;
 if v_sale.version<>p_expected_version then outcome:='conflict';version:=v_sale.version;reason:='version_conflict';return next;return;end if;
 if p_document_id not in(v_sale.reservation_contract_id,v_sale.commitment_certificate_id) then outcome:='not_eligible';reason:='document_scope_mismatch';return next;return;end if;
 select * into v_document from public.documents where organization_id=v_sale.organization_id and id=p_document_id and deleted_at is null for update;
 if not found then outcome:='not_eligible';reason:='document_not_found';return next;return;end if;
 if v_document.status='signed' then outcome:='not_eligible';reason:='document_already_signed';return next;return;end if;
 update public.documents set status='signed',signed_at=p_signed_at,received_at=now(),updated_at=now(),updated_by=v_user where id=v_document.id;
 update public.direct_late_sales as sale_row set version=sale_row.version+1,updated_at=now(),updated_by=v_user where id=v_sale.id returning sale_row.version into version;
 select exists(select 1 from public.documents where id=v_sale.reservation_contract_id and status in('signed','received')) and exists(select 1 from public.documents where id=v_sale.commitment_certificate_id and status in('signed','received')) and exists(select 1 from public.payments where id=v_sale.payment_id and status='paid') into v_ready;
 if v_ready then update public.direct_late_sales set status='ready_to_assign' where id=v_sale.id;end if;
 insert into public.direct_late_sale_events(organization_id,direct_sale_id,reservation_id,event_type,actor_profile_id,actor_role,details,client_command_id) values(v_sale.organization_id,v_sale.id,v_sale.reservation_id,'direct_late_sale_document_received',v_user,v_role,jsonb_build_object('documentId',v_document.id,'documentType',v_document.document_type,'readyToAssign',v_ready),p_client_command_id) returning id into v_event;
 insert into public.direct_late_sale_commands(organization_id,client_command_id,command_type,target_id,result,actor_profile_id) values(v_sale.organization_id,p_client_command_id,'document_received',v_sale.id,jsonb_build_object('outcome','updated','version',version,'readyToAssign',v_ready),v_user);
 outcome:='updated';ready_to_assign:=v_ready;return next;
end;
$$;

create or replace function public.record_direct_late_sale_full_payment(
 p_direct_sale_id uuid,p_paid_at timestamptz,p_payment_method text,p_external_reference text,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,version integer,profile_instance_id uuid,ready_to_assign boolean,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_sale public.direct_late_sales%rowtype;v_payment public.payments%rowtype;v_role text;v_event uuid;v_ready boolean;v_profile uuid;v_command public.direct_late_sale_commands%rowtype;
begin
 version:=null;profile_instance_id:=null;ready_to_assign:=false;reason:=null;select * into v_sale from public.direct_late_sales where id=p_direct_sale_id for update;
 if not found then outcome:='not_eligible';reason:='sale_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_sale.organization_id);
 select * into v_command from public.direct_late_sale_commands where organization_id=v_sale.organization_id and client_command_id=p_client_command_id;
 if found then outcome:='already_applied';version:=v_sale.version;ready_to_assign:=v_sale.status='ready_to_assign';select instance.id into profile_instance_id from public.adopter_profile_questionnaire_instances instance where instance.reservation_id=v_sale.reservation_id;return next;return;end if;
 if v_sale.version<>p_expected_version then outcome:='conflict';version:=v_sale.version;reason:='version_conflict';return next;return;end if;
 select * into v_payment from public.payments where id=v_sale.payment_id and organization_id=v_sale.organization_id and deleted_at is null for update;
 if not found then outcome:='not_eligible';reason:='payment_not_found';return next;return;end if;
 if v_payment.status='paid' then outcome:='not_eligible';reason:='payment_already_recorded';return next;return;end if;
 update public.reservations set status='active',reservation_confirmed_at=coalesce(reservation_confirmed_at,p_paid_at),updated_at=now(),updated_by=v_user where id=v_sale.reservation_id;
 update public.payments set status='paid',paid_at=p_paid_at,payment_method=p_payment_method,external_reference=p_external_reference,updated_at=now(),updated_by=v_user where id=v_sale.payment_id;
 begin v_profile:=public.ensure_adopter_profile_questionnaire_instance(v_sale.reservation_id,p_paid_at,true); exception when others then
   insert into public.adopter_profile_questionnaire_reconciliation_attempts(reservation_id,outcome,error_code,details) values(v_sale.reservation_id,'failed',sqlstate,jsonb_build_object('source','direct_late_sale','directSaleId',v_sale.id));
 end;
 update public.direct_late_sales as sale_row set version=sale_row.version+1,updated_at=now(),updated_by=v_user where id=v_sale.id returning sale_row.version into version;
 select exists(select 1 from public.documents where id=v_sale.reservation_contract_id and status in('signed','received')) and exists(select 1 from public.documents where id=v_sale.commitment_certificate_id and status in('signed','received')) into v_ready;
 if v_ready then update public.direct_late_sales set status='ready_to_assign' where id=v_sale.id;end if;
 insert into public.direct_late_sale_events(organization_id,direct_sale_id,reservation_id,event_type,actor_profile_id,actor_role,details,client_command_id) values(v_sale.organization_id,v_sale.id,v_sale.reservation_id,'direct_late_sale_full_payment_received',v_user,v_role,jsonb_build_object('paymentId',v_sale.payment_id,'profileInstanceId',v_profile,'readyToAssign',v_ready),p_client_command_id) returning id into v_event;
 insert into public.direct_late_sale_commands(organization_id,client_command_id,command_type,target_id,result,actor_profile_id) values(v_sale.organization_id,p_client_command_id,'full_payment_received',v_sale.id,jsonb_build_object('outcome','updated','version',version,'profileInstanceId',v_profile,'readyToAssign',v_ready),v_user);
 outcome:='updated';profile_instance_id:=v_profile;ready_to_assign:=v_ready;return next;
end;
$$;

create or replace function public.finalize_direct_late_sale_assignment(
 p_direct_sale_id uuid,p_expected_version integer,p_client_command_id uuid
)
returns table(outcome text,reservation_id uuid,animal_id uuid,version integer,reason text)
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_sale public.direct_late_sales%rowtype;v_role text;v_event uuid;v_command public.direct_late_sale_commands%rowtype;
begin
 reservation_id:=null;animal_id:=null;version:=null;reason:=null;select * into v_sale from public.direct_late_sales where id=p_direct_sale_id for update;
 if not found then outcome:='not_eligible';reason:='sale_not_found';return next;return;end if;v_role:=public.post_birth_owner_admin_role(v_sale.organization_id);
 select * into v_command from public.direct_late_sale_commands where organization_id=v_sale.organization_id and client_command_id=p_client_command_id;
 if found then outcome:='already_applied';reservation_id:=v_sale.reservation_id;animal_id:=case when v_sale.status='assigned' then v_sale.animal_id else null end;version:=v_sale.version;return next;return;end if;
 if v_sale.status='assigned' then outcome:='already_applied';reservation_id:=v_sale.reservation_id;animal_id:=v_sale.animal_id;version:=v_sale.version;return next;return;end if;
 if v_sale.version<>p_expected_version then outcome:='conflict';version:=v_sale.version;reason:='version_conflict';return next;return;end if;
 if v_sale.hold_status<>'active'
    or not exists(select 1 from public.direct_late_sale_email_drafts email where email.id=v_sale.email_draft_id and email.status='sent')
    or not exists(select 1 from public.documents where id=v_sale.reservation_contract_id and status in('signed','received'))
    or not exists(select 1 from public.documents where id=v_sale.commitment_certificate_id and status in('signed','received'))
    or not exists(select 1 from public.payments where id=v_sale.payment_id and status='paid')
 then outcome:='not_eligible';reason:='direct_sale_prerequisites_required';return next;return;end if;
 perform 1 from public.animals where organization_id=v_sale.organization_id and id=v_sale.animal_id and status='available' and deleted_at is null for update;
 if not found then outcome:='conflict';reason:='animal_unavailable';return next;return;end if;
 perform set_config('app.direct_late_sale_assignment','on',true);
 update public.reservations set animal_id=v_sale.animal_id,animal_assigned_at=now(),animal_assignment_locked=true,status='animal_assigned',updated_at=now(),updated_by=v_user where id=v_sale.reservation_id;
 perform set_config('app.direct_late_sale_assignment','off',true);
 update public.animals set status='reserved',updated_at=now(),updated_by=v_user where id=v_sale.animal_id;
 update public.direct_late_sales as sale_row set status='assigned',hold_status='converted',assigned_at=now(),version=sale_row.version+1,updated_at=now(),updated_by=v_user where id=v_sale.id returning sale_row.version into version;
 insert into public.direct_late_sale_events(organization_id,direct_sale_id,reservation_id,event_type,actor_profile_id,actor_role,details,client_command_id) values(v_sale.organization_id,v_sale.id,v_sale.reservation_id,'direct_late_sale_assigned',v_user,v_role,jsonb_build_object('animalId',v_sale.animal_id),p_client_command_id) returning id into v_event;
 insert into public.direct_late_sale_commands(organization_id,client_command_id,command_type,target_id,result,actor_profile_id) values(v_sale.organization_id,p_client_command_id,'finalize_assignment',v_sale.id,jsonb_build_object('outcome','updated','reservationId',v_sale.reservation_id,'animalId',v_sale.animal_id,'version',version),v_user);
 outcome:='updated';reservation_id:=v_sale.reservation_id;animal_id:=v_sale.animal_id;return next;
end;
$$;

create or replace function public.guard_strict_animal_assignment()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.animal_id is not distinct from old.animal_id then return new;end if;
 if new.animal_id is null then return new;end if;
 if current_setting('app.direct_late_sale_assignment',true)='on' then return new;end if;
 if exists(select 1 from public.post_birth_positions position_row join public.animals animal on animal.id=new.animal_id
   where position_row.organization_id=new.organization_id and position_row.reservation_id=new.id and position_row.litter_id=animal.litter_id and position_row.sex=animal.sex and position_row.status='confirmed') then return new;end if;
 raise exception 'post_birth_place_or_direct_late_sale_required';
end;
$$;
create trigger reservations_strict_animal_assignment before update of animal_id on public.reservations for each row execute function public.guard_strict_animal_assignment();

revoke all on function public.create_direct_late_sale(uuid,uuid,uuid,timestamptz,integer,text,text,uuid) from public,anon;
revoke all on function public.transition_direct_late_sale_email(uuid,text,integer,text,uuid) from public,anon;
revoke all on function public.record_direct_late_sale_document_received(uuid,uuid,timestamptz,integer,uuid) from public,anon;
revoke all on function public.record_direct_late_sale_full_payment(uuid,timestamptz,text,text,integer,uuid) from public,anon;
revoke all on function public.finalize_direct_late_sale_assignment(uuid,integer,uuid) from public,anon;
grant execute on function public.create_direct_late_sale(uuid,uuid,uuid,timestamptz,integer,text,text,uuid) to authenticated;
grant execute on function public.transition_direct_late_sale_email(uuid,text,integer,text,uuid) to authenticated;
grant execute on function public.record_direct_late_sale_document_received(uuid,uuid,timestamptz,integer,uuid) to authenticated;
grant execute on function public.record_direct_late_sale_full_payment(uuid,timestamptz,text,text,integer,uuid) to authenticated;
grant execute on function public.finalize_direct_late_sale_assignment(uuid,integer,uuid) to authenticated;

commit;
