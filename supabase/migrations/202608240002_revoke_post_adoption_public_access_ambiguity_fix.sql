-- JOURNAL-FIXES-01 / constat 3
-- revoke_post_adoption_questionnaire_public_access: la clause RETURNS TABLE expose une
-- colonne de sortie nommee revoked_at qui entrait en collision avec la colonne
-- post_adoption_questionnaire_public_accesses.revoked_at referencee sans qualification.
-- PostgreSQL levait 42702 (column reference "revoked_at" is ambiguous) des la premiere
-- requete de la fonction: toute revocation reelle echouait au lieu de marquer l'acces
-- public comme revoque et d'invalider les sessions publiques ouvertes.
-- Correctif: qualifier explicitement table.colonne dans la requete de selection.

begin;

create or replace function public.revoke_post_adoption_questionnaire_public_access(
  p_instance_id uuid
)
returns table (outcome text, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_instance public.post_adoption_questionnaire_instances%rowtype;
  v_access public.post_adoption_questionnaire_public_accesses%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null then return query select 'not_authenticated'::text, null::timestamptz; return; end if;
  select * into v_instance from public.post_adoption_questionnaire_instances where id = p_instance_id;
  if not found then return query select 'not_found'::text, null::timestamptz; return; end if;
  if not public.has_organization_role(v_instance.organization_id, array['owner','admin']) then
    return query select 'forbidden'::text, null::timestamptz; return;
  end if;
  select * into v_instance
  from public.post_adoption_questionnaire_instances
  where id = p_instance_id and organization_id = v_instance.organization_id
  for update;
  if not found then return query select 'not_found'::text, null::timestamptz; return; end if;
  select * into v_access
  from public.post_adoption_questionnaire_public_accesses
  where organization_id = v_instance.organization_id and instance_id = v_instance.id
    and post_adoption_questionnaire_public_accesses.revoked_at is null
  for update;
  if not found then return query select 'already_revoked'::text, null::timestamptz; return; end if;
  update public.post_adoption_questionnaire_public_accesses
  set revoked_at = v_now, revoked_by = v_user_id
  where organization_id = v_access.organization_id and id = v_access.id;
  update public.post_adoption_questionnaire_public_sessions
  set invalidated_at = v_now
  where organization_id = v_access.organization_id and access_id = v_access.id and invalidated_at is null;
  return query select 'success'::text, v_now;
end;
$fn$;

revoke execute on function public.revoke_post_adoption_questionnaire_public_access(uuid) from public, anon;
grant execute on function public.revoke_post_adoption_questionnaire_public_access(uuid) to authenticated;

commit;
