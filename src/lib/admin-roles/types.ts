export interface AdminRole {
  id: string;
  roleKey: string;
  name: string;
  description: string | null;
  scope: "platform" | "team";
  isSystem: boolean;
}

export interface AdminPermission {
  id: string;
  permissionKey: string;
  name: string;
  description: string | null;
}

export interface AdminRolePageVisibility {
  roleId: string;
  routePath: string;
  canView: boolean;
}

export interface AdminRolesData {
  roles: AdminRole[];
  permissions: AdminPermission[];
  grants: Array<{ roleId: string; permissionId: string }>;
}

export interface UpdateRolePermissionInput {
  accessToken: string;
  roleId: string;
  permissionId: string;
  action: "grant" | "revoke";
}

export type UpdateRolePermissionResult = { ok: true } | { ok: false; error: string };

export interface UpdateRoleMetadataInput {
  accessToken: string;
  roleId: string;
  name: string;
  description: string | null;
}

export type UpdateRoleMetadataResult = { ok: true } | { ok: false; error: string };

export interface UpdateRolePageVisibilityInput {
  accessToken: string;
  roleId: string;
  routePath: string;
  canView: boolean;
}

export type UpdateRolePageVisibilityResult = { ok: true } | { ok: false; error: string };
