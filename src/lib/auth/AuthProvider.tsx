import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { setSessionRole } from "@/lib/permissions";


export interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface TeamRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
}

/**
 * Service-Desk role identity. The DB stores role_key strings on
 * `roles` (joined via `user_global_roles`). We expose the highest-ranked
 * one to the frontend so `useRole()` can resolve permissions without
 * having to inspect every key.
 */
export type SdRoleKey =
  | "super_admin"
  | "it_admin"
  | "sd_lead"
  | "helpdesk"
  | "technician"
  | "network_admin"
  | "doc_editor"
  | "auditor"
  | "employee";

// Map DB role_key -> frontend Role enum.
const DB_ROLE_ALIASES: Record<string, SdRoleKey> = {
  platform_admin: "super_admin",
  platform_auditor: "auditor",
};

// Highest -> lowest precedence.
const ROLE_PRECEDENCE: SdRoleKey[] = [
  "super_admin",
  "it_admin",
  "sd_lead",
  "network_admin",
  "technician",
  "doc_editor",
  "helpdesk",
  "auditor",
  "employee",
];

function pickHighestRole(roleKeys: string[]): SdRoleKey | null {
  if (roleKeys.length === 0) return null;
  const mapped = new Set<SdRoleKey>();
  for (const k of roleKeys) {
    const m = (DB_ROLE_ALIASES[k] ?? (k as SdRoleKey));
    if (ROLE_PRECEDENCE.includes(m)) mapped.add(m);
  }
  for (const r of ROLE_PRECEDENCE) {
    if (mapped.has(r)) return r;
  }
  return null;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  isPlatformAdmin: boolean;
  /** All DB role_key strings currently granted globally to the user. */
  roleKeys: string[];
  /** Highest-ranked role mapped to the frontend Role enum, or null. */
  role: SdRoleKey | null;
  teams: TeamRow[];
  teamsError: string | null;
  contextLoading: boolean;
  contextError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}


const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [role, setRoleState] = useState<SdRoleKey | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const loadUserContext = useCallback(async (current: Session | null) => {
    if (!current?.user || !supabase) {
      setProfile(null);
      setIsPlatformAdmin(false);
      setTeams([]);
      setTeamsError(null);
      setRoleKeys([]);
      setRoleState(null);
      setSessionRole(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    const userId = current.user.id;
    const failures: string[] = [];

    setContextLoading(true);
    setContextError(null);

    // Profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("[auth] failed to load profile", profileError);
      setProfile(null);
      failures.push("profile");
    } else {
      setProfile((profileData as ProfileRow) ?? null);
    }

    // Platform admin flag
    const { data: adminData, error: adminError } = await supabase.rpc("is_platform_admin");
    if (adminError) {
      console.error("[auth] is_platform_admin failed", adminError);
      setIsPlatformAdmin(false);
      failures.push("admin status");
    } else {
      setIsPlatformAdmin(Boolean(adminData));
    }

    // Teams visible to this user (RLS enforces visibility)
    const { data: teamsData, error: teamsErr } = await supabase
      .from("teams")
      .select("id, name, slug, description")
      .order("name", { ascending: true });
    if (teamsErr) {
      console.error("[auth] failed to load teams", teamsErr);
      setTeams([]);
      setTeamsError(teamsErr.message);
      failures.push("teams");
    } else {
      setTeams((teamsData as TeamRow[]) ?? []);
      setTeamsError(null);
    }

    // Global role keys for this user → highest-ranked frontend Role.
    const { data: rolesData, error: rolesErr } = await supabase
      .from("user_global_roles")
      .select("role_id, roles!inner(role_key, role_scope)")
      .eq("user_id", userId);
    if (rolesErr) {
      console.error("[auth] failed to load roles", rolesErr);
      setRoleKeys([]);
      setRoleState(null);
      setSessionRole(null);
      failures.push("roles");
    } else {
      const keys = ((rolesData ?? []) as unknown as Array<{
        roles: { role_key: string; role_scope: string } | null;
      }>)
        .map((r) => r.roles?.role_key ?? null)
        .filter((k): k is string => Boolean(k));
      setRoleKeys(keys);
      const highest = pickHighestRole(keys);
      setRoleState(highest);
      setSessionRole(highest);
    }


    setContextError(
      failures.length === 0
        ? null
        : `Could not load ${failures.join(", ")}. Some account context is missing.`,
    );
    setContextLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    // Register listener BEFORE getSession to avoid missing transitions.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer Supabase calls so the listener returns quickly.
      setTimeout(() => {
        void loadUserContext(next);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadUserContext(data.session).finally(() => setLoading(false));
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadUserContext]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Sign-in failed" };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setIsPlatformAdmin(false);
    setTeams([]);
    setTeamsError(null);
    setRoleKeys([]);
    setRoleState(null);
    setContextError(null);
    setContextLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setContextError(null);
    await loadUserContext(session);
  }, [loadUserContext, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isPlatformAdmin,
      roleKeys,
      role,
      teams,
      teamsError,
      contextLoading,
      contextError,
      signIn,
      signOut,
      refresh,
    }),
    [
      loading,
      session,
      profile,
      isPlatformAdmin,
      roleKeys,
      role,
      teams,
      teamsError,
      contextLoading,
      contextError,
      signIn,
      signOut,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useTeams() {
  const { teams, teamsError, loading } = useAuth();
  return { teams, error: teamsError, loading };
}
