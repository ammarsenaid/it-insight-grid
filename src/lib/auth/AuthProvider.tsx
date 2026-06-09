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

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  isPlatformAdmin: boolean;
  teams: TeamRow[];
  teamsError: string | null;
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

  const loadUserContext = useCallback(async (current: Session | null) => {
    if (!current?.user || !supabase) {
      setProfile(null);
      setIsPlatformAdmin(false);
      setTeams([]);
      setTeamsError(null);
      return;
    }
    const userId = current.user.id;

    // Profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, full_name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("[auth] failed to load profile", profileError);
      setProfile(null);
    } else {
      setProfile((profileData as ProfileRow) ?? null);
    }

    // Platform admin flag
    const { data: adminData, error: adminError } = await supabase.rpc("is_platform_admin");
    if (adminError) {
      console.error("[auth] is_platform_admin failed", adminError);
      setIsPlatformAdmin(false);
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
    } else {
      setTeams((teamsData as TeamRow[]) ?? []);
      setTeamsError(null);
    }
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
  }, []);

  const refresh = useCallback(async () => {
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
      teams,
      teamsError,
      signIn,
      signOut,
      refresh,
    }),
    [loading, session, profile, isPlatformAdmin, teams, teamsError, signIn, signOut, refresh],
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
