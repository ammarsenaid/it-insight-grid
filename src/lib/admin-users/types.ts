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
