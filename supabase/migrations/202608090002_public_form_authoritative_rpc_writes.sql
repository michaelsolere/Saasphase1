-- Keep public-form state changes authoritative through the audited RPCs.
-- SECURITY DEFINER functions retain the table-owner privileges they need.

drop policy if exists public_forms_insert_admin on public.public_forms;
drop policy if exists public_forms_update_admin on public.public_forms;

revoke insert, update, delete on table public.public_forms from authenticated;
