import { getSupabase } from "@/integrations/supabase/client";
import { asRows, type SbRow } from "@/lib/service-desk/sb";
import type { AdminPermission, AdminRole, AdminRolesData } from "./types";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value).trim();
  return valueText || null;
}

export async function listAdminRolesData(): Promise<AdminRolesData> {
  const supabase = getSupabase();
  const [rolesResult, permissionsResult, grantsResult] = await Promise.all([
    supabase
      .from("roles")
      .select("id, role_key, name, description, role_scope, is_system")
      .order("role_scope", { ascending: true })
      .order("role_key", { ascending: true }),
    supabase
      .from("permissions")
      .select("id, permission_key, name, description")
      .order("permission_key", { ascending: true }),
    supabase.from("role_permissions").select("role_id, permission_id"),
  ]);

  if (rolesResult.error) throw rolesResult.error;
  if (permissionsResult.error) throw permissionsResult.error;
  if (grantsResult.error) throw grantsResult.error;

  const roles = asRows<SbRow>(rolesResult.data)
    .map<AdminRole>((row) => ({
      id: text(row.id),
      roleKey: text(row.role_key),
      name: text(row.name),
      description: nullableText(row.description),
      scope: row.role_scope === "team" ? "team" : "platform",
      isSystem: row.is_system === true,
    }))
    .filter((role) => role.id && role.roleKey && role.name);

  const permissions = asRows<SbRow>(permissionsResult.data)
    .map<AdminPermission>((row) => ({
      id: text(row.id),
      permissionKey: text(row.permission_key),
      name: text(row.name),
      description: nullableText(row.description),
    }))
    .filter((permission) => permission.id && permission.permissionKey && permission.name);

  const grants = asRows<SbRow>(grantsResult.data)
    .map((row) => ({ roleId: text(row.role_id), permissionId: text(row.permission_id) }))
    .filter((grant) => grant.roleId && grant.permissionId);

  return { roles, permissions, grants };
}
