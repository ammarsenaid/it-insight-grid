export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface TeamInput {
  name: string;
  slug: string;
  description: string;
}

export interface TeamMember {
  userId: string;
  displayName: string;
  email: string | null;
  membershipStatus: string;
  roleKey: string | null;
  roleName: string | null;
  joinedAt: string;
}

export interface TeamRoleOption {
  roleKey: string;
  name: string;
}

export interface ProfileOption {
  id: string;
  displayName: string;
  email: string | null;
}
