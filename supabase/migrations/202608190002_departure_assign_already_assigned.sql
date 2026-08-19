-- Attribution d'un bloc : rejeter proprement une famille déjà attribuée dans le planning
-- (au lieu d'une violation d'unicité brute sur departure_slots_one_active_reservation_idx).

begin;

create or replace function public.assign_departure_slot(p_slot_id uuid,p_reservation_id uuid,p_client_command_id uuid)
returns table(outcome text,slot_id uuid,reason text) language plpgsql security definer set search_path='' as $$
declare v_slot public.departure_slots%rowtype;v_plan public.departure_plans%rowtype;v_res public.reservations%rowtype;v_user uuid:=auth.uid();v_role text;v_existing public.departure_commands%rowtype;v_hash text;begin
  select slot.* into v_slot from public.departure_slots slot where slot.id=p_slot_id;select plan.* into v_plan from public.departure_plans plan where plan.id=v_slot.plan_id for update;v_role:=public.departure_owner_admin_role(v_plan.organization_id);select * into v_slot from public.departure_slots where id=p_slot_id for update;select * into v_res from public.reservations where organization_id=v_plan.organization_id and id=p_reservation_id and status='animal_assigned' and animal_id is not null and deleted_at is null for update;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('slotId',p_slot_id,'reservationId',p_reservation_id)::text,'UTF8'),'sha256'),'hex');select * into v_existing from public.departure_commands command where command.organization_id=v_plan.organization_id and command.client_command_id=p_client_command_id;if found then if v_existing.command_type='assign_slot' and v_existing.target_id=p_slot_id and v_existing.payload_hash=v_hash then outcome:=v_existing.outcome;slot_id:=p_slot_id;return next;return;end if;outcome:='conflict';reason:='command_payload_mismatch';return next;return;end if;
  if v_res.id is null or v_slot.status<>'open' or v_slot.visibility<>'public' then outcome:='not_eligible';reason:='slot_unavailable';return next;return;end if;
  if exists(select 1 from public.departure_slots existing where existing.organization_id=v_plan.organization_id and existing.reservation_id=v_res.id and existing.status in('booked','to_review','completed','late','no_show')) then outcome:='not_eligible';reason:='already_assigned';return next;return;end if;
  update public.departure_slots set status='booked',reservation_id=v_res.id,booked_at=now(),booked_by_kind='member',confirmed_at=now(),version=version+1,updated_at=now(),updated_by=v_user where id=v_slot.id returning * into v_slot;perform public.departure_write_calendar_projection(v_slot,v_user);
  insert into public.departure_commands(organization_id,client_command_id,command_type,target_id,payload_hash,outcome,result,actor_profile_id) values(v_plan.organization_id,p_client_command_id,'assign_slot',v_slot.id,v_hash,'booked',jsonb_build_object('slotId',v_slot.id),v_user);
  insert into public.departure_events(organization_id,plan_id,slot_id,reservation_id,event_type,actor_kind,actor_profile_id,actor_role,client_command_id) values(v_plan.organization_id,v_plan.id,v_slot.id,v_res.id,'appointment_booked','member',v_user,v_role,p_client_command_id);outcome:='booked';slot_id:=v_slot.id;return next;end;$$;

commit;
