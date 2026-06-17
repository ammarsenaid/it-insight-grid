/**
 * LOVABLE PREVIEW ONLY — synthetic auth identity used to render the
 * authenticated app shell when no real Supabase session exists.
 *
 * SAFETY: Gated by `isLovablePreviewHost()` (see previewBypass.ts).
 * NEVER reference this from production code paths.
 */
import type { Session } from "@supabase/supabase-js";
import type { ProfileRow, SdRoleKey, TeamRow } from "@/lib/auth/AuthProvider";

const PREVIEW_USER_ID = "preview-user";
const PREVIEW_TEAM_ID = "preview-team-it-ops";

export const PREVIEW_TEAM: TeamRow = {
  id: PREVIEW_TEAM_ID,
  name: "IT Operations (Preview)",
  slug: "it-ops-preview",
  description: "Sample team rendered in Lovable preview only.",
};

export const PREVIEW_PROFILE: ProfileRow = {
  id: PREVIEW_USER_ID,
  display_name: "Lovable Preview User",
  email: "preview@lovable.dev",
  avatar_url: null,
};

const PREVIEW_SESSION = {
  access_token: "preview",
  refresh_token: "preview",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: PREVIEW_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: PREVIEW_PROFILE.email ?? undefined,
    app_metadata: { provider: "preview" },
    user_metadata: { display_name: PREVIEW_PROFILE.display_name },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
} as unknown as Session;

export const PREVIEW_AUTH_CONTEXT = {
  session: PREVIEW_SESSION,
  user: PREVIEW_SESSION.user,
  profile: PREVIEW_PROFILE,
  isPlatformAdmin: true,
  roleKeys: ["platform_admin"],
  role: "admin" as SdRoleKey,
  teams: [PREVIEW_TEAM] as TeamRow[],
  teamsError: null,
  contextLoading: false,
  contextError: null,
};

export const PREVIEW_TEAM_ID_EXPORT = PREVIEW_TEAM_ID;
