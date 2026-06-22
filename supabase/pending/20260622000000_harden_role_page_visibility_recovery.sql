-- IT Knowledge Center: harden role page-visibility recovery invariants.
--
-- Problem: API checks prevent required recovery routes from being disabled,
-- but an already-installed database trigger may not enforce the same rule.
-- Security impact: a privileged direct write could remove every safe landing
-- page for a role before DB-backed route enforcement is enabled.
-- Affected objects: public.validate_role_page_visibility() only. The existing
-- role_page_visibility trigger automatically uses this replacement function.
-- Rollback consideration: restore the prior function only after proving that
-- another database-bound invariant protects all recovery destinations.
--
-- Staged for manual review. Do not apply to the live database automatically.
begin;

create or replace function public.validate_role_page_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role_key text;
  selected_role_scope text;
  previous_role_key text;
  non_employee_recovery_role_keys constant text[] := array[
    'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
    'technician', 'network_admin', 'doc_editor', 'platform_auditor'
  ];
begin
  if tg_op = 'DELETE' then
    select role_key
      into selected_role_key
      from public.roles
     where id = old.role_id;

    if (selected_role_key = 'platform_admin' and old.route_path = '/admin/roles')
       or (selected_role_key = any(non_employee_recovery_role_keys) and old.route_path = '/')
       or (selected_role_key = 'employee' and old.route_path = '/my-requests') then
      raise exception 'Protected page visibility cannot be deleted'
        using errcode = '42501';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    select role_key
      into previous_role_key
      from public.roles
     where id = old.role_id;

    if previous_role_key = 'platform_admin'
       and old.route_path = '/admin/roles'
       and (
         new.role_id is distinct from old.role_id
         or new.route_path is distinct from old.route_path
         or not new.can_view
       ) then
      raise exception 'Platform administrator role-management visibility is protected'
        using errcode = '42501';
    end if;

    if (
      (previous_role_key = any(non_employee_recovery_role_keys) and old.route_path = '/')
      or (previous_role_key = 'employee' and old.route_path = '/my-requests')
    ) and (
      new.role_id is distinct from old.role_id
      or new.route_path is distinct from old.route_path
      or not new.can_view
    ) then
      raise exception 'Required recovery destination visibility is protected'
        using errcode = '42501';
    end if;
  end if;

  select role_key, role_scope
    into selected_role_key, selected_role_scope
    from public.roles
   where id = new.role_id;

  if selected_role_key is null then
    raise exception 'Unknown role identifier'
      using errcode = '23503';
  end if;

  if selected_role_scope <> 'platform' then
    raise exception 'Page visibility supports platform roles only'
      using errcode = '23514';
  end if;

  if selected_role_key = 'employee'
     and (new.route_path = '/admin' or new.route_path like '/admin/%')
     and new.can_view then
    raise exception 'Requester roles cannot access administration pages'
      using errcode = '42501';
  end if;

  if selected_role_key = 'platform_admin'
     and new.route_path = '/admin/roles'
     and not new.can_view then
    raise exception 'Platform administrator role-management visibility is protected'
      using errcode = '42501';
  end if;

  if not new.can_view and (
    (selected_role_key = any(non_employee_recovery_role_keys) and new.route_path = '/')
    or (selected_role_key = 'employee' and new.route_path = '/my-requests')
  ) then
    raise exception 'Required recovery destination visibility is protected'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_role_page_visibility() from public;

commit;
