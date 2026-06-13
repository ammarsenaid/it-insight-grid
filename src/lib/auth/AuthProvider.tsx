import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import {
  pickDisplayRole,
  rolesForRoleKeys,
  setSessionRoles,
  type Role,
} from "@/lib/permissions";


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
 * `roles` (joined via `user_global_roles`). We expose one deterministic role
 * for display while the permissions store evaluates every effective role.
 */
export type SdRoleKey = Role;

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
  signOut: () => Promise<{ error?: string }>;
  refresh: () => Promise<void>;
}


const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_CONTEXT_ERROR = "Account context could not be loaded. Please try again.";
const AUTH_SESSION_ERROR = "Your session could not be restored. Please sign in again.";
const AUTH_SIGN_OUT_ERROR = "Signed out locally, but the remote session could not be closed.";

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
  const activeUserIdRef = useRef<string | null>(null);
  const contextRequestGenerationRef = useRef(0);
  const providerActiveRef = useRef(false);
  const explicitSignOutRef = useRef(false);
  const signOutInFlightRef = useRef<Promise<{ error?: string }> | null>(null);

  const loadUserContext = useCallback(async (
    current: Session | null,
    pinToLeastPrivilege = true,
  ) => {
    const userId = current?.user?.id ?? null;
    // A deferred callback for an older identity must not invalidate current work.
    if (!providerActiveRef.current || activeUserIdRef.current !== userId) return;
    const requestGeneration = ++contextRequestGenerationRef.current;
    const isCurrentContextRequest = () =>
      providerActiveRef.current &&
      contextRequestGenerationRef.current === requestGeneration &&
      activeUserIdRef.current === userId;

    if (!current?.user || !supabase) {
      if (!isCurrentContextRequest()) return;
      setProfile(null);
      setIsPlatformAdmin(false);
      setTeams([]);
      setTeamsError(null);
      setRoleKeys([]);
      setRoleState(null);
      // If a session exists but the client is missing, still deny the
      // localStorage fallback by pinning to least-privilege.
      setSessionRoles(current?.user ? ["employee"] : null, current?.user ? "employee" : null);
      setContextError(null);
      setContextLoading(false);
      return;
    }


    const failures: string[] = [];

    if (pinToLeastPrivilege) {
      // A new authenticated identity must never inherit the local preview role.
      setSessionRoles(["employee"], "employee");
      setContextLoading(true);
    }

    setContextError(null);


    try {
      // Profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (!isCurrentContextRequest()) return;
      if (profileError) {
        setProfile(null);
        failures.push("profile");
      } else {
        setProfile((profileData as ProfileRow) ?? null);
      }

      // Platform admin flag
      const { data: adminData, error: adminError } = await supabase.rpc("is_platform_admin");
      if (!isCurrentContextRequest()) return;
      if (adminError) {
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
      if (!isCurrentContextRequest()) return;
      if (teamsErr) {
        setTeams([]);
        setTeamsError("Teams could not be loaded.");
        failures.push("teams");
      } else {
        setTeams((teamsData as TeamRow[]) ?? []);
        setTeamsError(null);
      }

      // Global role keys for this user. Display precedence is separate from
      // the additive effective-role set used for authorization.
      const { data: rolesData, error: rolesErr } = await supabase
        .from("user_global_roles")
        .select("role_id, roles!inner(role_key, role_scope)")
        .eq("user_id", userId);
      if (!isCurrentContextRequest()) return;
      if (rolesErr) {
        setRoleKeys([]);
        setRoleState(null);
        // Authenticated: degrade to least-privilege, never to localStorage.
        setSessionRoles(["employee"], "employee");
        failures.push("roles");
      } else {
        const keys = ((rolesData ?? []) as unknown as Array<{
          roles: { role_key: string; role_scope: string } | null;
        }>)
          .map((r) => r.roles?.role_key ?? null)
          .filter((k): k is string => Boolean(k));
        setRoleKeys(keys);
        const effectiveRoles = rolesForRoleKeys(keys);
        const displayRole = pickDisplayRole(effectiveRoles);
        setRoleState(displayRole);
        // No known/recognised role → least-privilege employee.
        setSessionRoles(
          effectiveRoles.length > 0 ? effectiveRoles : ["employee"],
          displayRole ?? "employee",
        );
      }

      if (!isCurrentContextRequest()) return;
      setContextError(
        failures.length === 0
          ? null
          : `Could not load ${failures.join(", ")}. Some account context is missing.`,
      );
    } catch {
      if (!isCurrentContextRequest()) return;
      setProfile(null);
      setIsPlatformAdmin(false);
      setTeams([]);
      setTeamsError(null);
      setRoleKeys([]);
      setRoleState(null);
      setSessionRoles(["employee"], "employee");
      setContextError(AUTH_CONTEXT_ERROR);
    } finally {
      if (isCurrentContextRequest()) setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    providerActiveRef.current = true;
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return () => {
        providerActiveRef.current = false;
        explicitSignOutRef.current = false;
        signOutInFlightRef.current = null;
        contextRequestGenerationRef.current += 1;
        activeUserIdRef.current = null;
      };
    }

    // Register listener BEFORE getSession to avoid missing transitions.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!providerActiveRef.current) return;
      // Explicit sign-out owns the local transition. Ignore session-bearing
      // events until the remote attempt finishes, but allow SIGNED_OUT cleanup.
      if (explicitSignOutRef.current && next) return;
      const nextUserId = next?.user?.id ?? null;
      const sameUser = nextUserId !== null && nextUserId === activeUserIdRef.current;

      // Invalidate every older context request before changing identity state.
      contextRequestGenerationRef.current += 1;
      if (!sameUser) {
        // Clear the previous identity before exposing a new session to guards.
        setProfile(null);
        setIsPlatformAdmin(false);
        setTeams([]);
        setTeamsError(null);
        setRoleKeys([]);
        setRoleState(null);
        setSessionRoles(nextUserId ? ["employee"] : null, nextUserId ? "employee" : null);
        setContextError(null);
        setContextLoading(Boolean(nextUserId));
      }
      activeUserIdRef.current = nextUserId;
      setSession(next);
      setLoading(false);
      const eventGeneration = contextRequestGenerationRef.current;

      // Defer Supabase calls so the listener returns quickly.
      setTimeout(() => {
        if (
          !providerActiveRef.current ||
          contextRequestGenerationRef.current !== eventGeneration ||
          activeUserIdRef.current !== nextUserId
        ) return;
        // Same-user events, including TOKEN_REFRESHED, preserve the established
        // role while reloading grants and revocations in the background.
        if (event === "TOKEN_REFRESHED" && sameUser) {
          void loadUserContext(next, false);
          return;
        }
        void loadUserContext(next, !sameUser);
      }, 0);
    });

    const initialRequestGeneration = contextRequestGenerationRef.current;
    const isCurrentInitialRequest = () =>
      providerActiveRef.current &&
      contextRequestGenerationRef.current === initialRequestGeneration;
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isCurrentInitialRequest()) return;
        if (error) throw error;
        activeUserIdRef.current = data.session?.user?.id ?? null;
        setSession(data.session);
        setLoading(false);
        void loadUserContext(data.session);
      })
      .catch(() => {
        if (!isCurrentInitialRequest()) return;
        activeUserIdRef.current = null;
        setSession(null);
        setProfile(null);
        setIsPlatformAdmin(false);
        setTeams([]);
        setTeamsError(null);
        setRoleKeys([]);
        setRoleState(null);
        setSessionRoles(null);
        setContextError(AUTH_SESSION_ERROR);
        setContextLoading(false);
        setLoading(false);
      });

    return () => {
      providerActiveRef.current = false;
      explicitSignOutRef.current = false;
      signOutInFlightRef.current = null;
      contextRequestGenerationRef.current += 1;
      activeUserIdRef.current = null;
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

  const signOut = useCallback((): Promise<{ error?: string }> => {
    if (!supabase) return Promise.resolve({});
    if (signOutInFlightRef.current) return signOutInFlightRef.current;
    // Stop the current identity from committing context while sign-out is pending.
    explicitSignOutRef.current = true;
    contextRequestGenerationRef.current += 1;
    activeUserIdRef.current = null;
    const clearLocalAuthState = (error: string | null) => {
      setSession(null);
      setProfile(null);
      setIsPlatformAdmin(false);
      setTeams([]);
      setTeamsError(null);
      setRoleKeys([]);
      setRoleState(null);
      setSessionRoles(null);
      setContextError(error);
      setContextLoading(false);
      setLoading(false);
    };
    if (providerActiveRef.current) clearLocalAuthState(null);
    let ownedOperation!: Promise<{ error?: string }>;
    ownedOperation = (async () => {
      let remoteSignOutFailed = false;
      try {
        try {
          const { error } = await supabase.auth.signOut();
          remoteSignOutFailed = Boolean(error);
        } catch {
          remoteSignOutFailed = true;
        }
        if (remoteSignOutFailed) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // Provider state is still cleared below so privileged UI cannot remain visible.
          }
        }
        if (!providerActiveRef.current) {
          return remoteSignOutFailed ? { error: AUTH_SIGN_OUT_ERROR } : {};
        }
        clearLocalAuthState(remoteSignOutFailed ? AUTH_SIGN_OUT_ERROR : null);
        return remoteSignOutFailed ? { error: AUTH_SIGN_OUT_ERROR } : {};
      } finally {
        if (signOutInFlightRef.current === ownedOperation) {
          explicitSignOutRef.current = false;
          signOutInFlightRef.current = null;
        }
      }
    })();
    signOutInFlightRef.current = ownedOperation;
    return ownedOperation;
  }, []);


  const refresh = useCallback(async () => {
    setContextError(null);
    await loadUserContext(session, false);
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
