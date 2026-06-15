export interface AdminUser {
  id: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  roleKeys: string[];
  roleNames: string[];
  teamNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserFormOption {
  id: string;
  name: string;
}

export interface AdminUserFormOptions {
  roles: AdminUserFormOption[];
  teams: AdminUserFormOption[];
}

export interface CreateAdminUserInput {
  accessToken: string;
  displayName: string;
  email: string;
  roleId: string | null;
  teamId: string | null;
  isActive: boolean;
}

export type CreateAdminUserResult =
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; error: string };

export interface SetAdminUserActiveInput {
  accessToken: string;
  userId: string;
  isActive: boolean;
}

export type AdminUserMutationResult = { ok: true; userId: string } | { ok: false; error: string };
