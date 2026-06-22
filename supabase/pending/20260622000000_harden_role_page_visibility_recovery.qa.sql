-- Transaction-backed QA for recovery-route database invariants.
-- Run only against a disposable database after the matching migration.
begin;

do $$
declare
  recovery_role record;
  employee_id uuid := (
    select id from public.roles where role_key = 'employee' and role_scope = 'platform'
  );
begin
  assert to_regclass('public.role_page_visibility') is not null,
    'role_page_visibility table must exist';

  for recovery_role in
    select roles.id, roles.role_key
      from public.roles
     where roles.role_scope = 'platform'
       and roles.role_key = any(array[
         'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
         'technician', 'network_admin', 'doc_editor', 'platform_auditor'
       ]::text[])
  loop
    begin
      update public.role_page_visibility
         set can_view = false
       where role_id = recovery_role.id and route_path = '/';
      raise exception '% recovery route disable unexpectedly succeeded', recovery_role.role_key;
    exception when insufficient_privilege then null;
    end;

    begin
      update public.role_page_visibility
         set route_path = '/qa-moved-recovery-route'
       where role_id = recovery_role.id and route_path = '/';
      raise exception '% recovery route move unexpectedly succeeded', recovery_role.role_key;
    exception when insufficient_privilege then null;
    end;

    begin
      delete from public.role_page_visibility
       where role_id = recovery_role.id and route_path = '/';
      raise exception '% recovery route delete unexpectedly succeeded', recovery_role.role_key;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    update public.role_page_visibility
       set can_view = false
     where role_id = employee_id and route_path = '/my-requests';
    raise exception 'employee recovery route disable unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.role_page_visibility
       set route_path = '/qa-moved-employee-recovery-route'
     where role_id = employee_id and route_path = '/my-requests';
    raise exception 'employee recovery route move unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.role_page_visibility
     where role_id = employee_id and route_path = '/my-requests';
    raise exception 'employee recovery route delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
