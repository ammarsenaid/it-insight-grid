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
import { isPreviewBypassActive } from "@/preview/previewBypass";
import {
  PREVIEW_AUTH_CONTEXT,
} from "@/preview/previewIdentity";
import {
  pickDisplayRole,
  rolesForRoleKeys,
  setSessionRoles,
  type Role,
} from "@/lib/permissions";
import type { EffectiveAccess } from "./effective-access";


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
  /** Backend-derived authorization snapshot. Null means fail closed. */
  effectiveAccess: EffectiveAccess | null;
  /** All effective DB role_key strings from global and active team grants. */
  roleKeys: string[];
  /** Highest-ranked role mapped to the frontend Role enum, or null. */
  role: SdRoleKey | null;
  teams: TeamRow[];
  teamsError: string | null;
  activeOrganization: EffectiveAccess["activeOrganization"];
  workspaces: EffectiveAccess["workspaces"];
  currentWorkspace: EffectiveAccess["workspaces"][number] | null;
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
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
const WORKSPACE_CONTEXT_STORAGE_KEY = "itkc.currentWorkspaceId";

function parseEffectiveAccess(value: unknown): EffectiveAccess | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);

  const strings = (candidate: unknown) =>
    Array.isArray(candidate) && candidate.every((item) => typeof item === "string")
      ? candidate as string[]
      : null;

  const optionalString = (candidate: unknown) =>
    typeof candidate === "string" ? candidate : null;

  const parseOrganization = (candidate: unknown): EffectiveAccess["activeOrganization"] => {
    if (!isRecord(candidate)) return null;
    const id = optionalString(candidate.id);
    const slug = optionalString(candidate.slug);
    const name = optionalString(candidate.name);
    const status = optionalString(candidate.status);
    if (!id || !slug || !name || !status) return null;
    return { id, slug, name, status };
  };

  const parseTeams = (candidate: unknown): EffectiveAccess["workspaces"][number]["teams"] => {
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = optionalString(item.id);
      const name = optionalString(item.name);
      const slug = item.slug === null ? null : optionalString(item.slug);
      if (!id || !name) return [];
      return [{ id, name, slug }];
    });
  };

  const parseWorkspaces = (candidate: unknown): EffectiveAccess["workspaces"] => {
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((item) => {
      if (!isRecord(item)) return [];

      const id = optionalString(item.id);
      const organizationId = optionalString(item.organization_id);
      const slug = optionalString(item.slug);
      const name = optionalString(item.name);
      const type = optionalString(item.type);
      const status = optionalString(item.status);
      const membershipStatus = optionalString(item.membership_status);
      const roleKeys = strings(item.role_keys) ?? [];
      const permissionKeys = strings(item.permission_keys) ?? [];

      if (!id || !organizationId || !slug || !name || !type || !status || !membershipStatus) {
        return [];
      }

      return [{
        id,
        organizationId,
        slug,
        name,
        type,
        status,
        membershipStatus,
        roleKeys,
        permissionKeys,
        teams: parseTeams(item.teams),
      }];
    });
  };

  const roleKeys = strings(row.role_keys);
  const permissionKeys = strings(row.permission_keys);
  const visibleRoutes = strings(row.visible_routes);

  if (
    !roleKeys || !permissionKeys || !visibleRoutes ||
    typeof row.safe_recovery_route !== "string" ||
    typeof row.is_platform_admin !== "boolean"
  ) return null;

  return {
    roleKeys,
    permissionKeys,
    visibleRoutes,
    safeRecoveryRoute: row.safe_recovery_route,
    isPlatformAdmin: row.is_platform_admin,
    activeOrganization: parseOrganization(row.active_organization),
    workspaces: parseWorkspaces(row.workspaces),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveAccess | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(null);
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
      setEffectiveAccess(null);
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

    // Route authorization fails closed for every refresh, including same-user
    // token refreshes, until a complete new snapshot has been validated.
    setEffectiveAccess(null);
    setContextLoading(true);

    if (pinToLeastPrivilege) {
      // A new authenticated identity must never inherit the local preview role.
      setSessionRoles(["employee"], "employee");
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

      // One backend-derived authorization snapshot drives every route decision.
      const { data: accessData, error: accessError } = await supabase.rpc("get_my_effective_access");
      if (!isCurrentContextRequest()) return;
      const access = accessError ? null : parseEffectiveAccess(accessData);
      if (!access) {
        setIsPlatformAdmin(false);
        setEffectiveAccess(null);
        setRoleKeys([]);
        setRoleState(null);
        setSessionRoles(["employee"], "employee");
        failures.push("effective access");
      } else {
        setEffectiveAccess(access);
        setIsPlatformAdmin(access.isPlatformAdmin);
        setRoleKeys(access.roleKeys);
        const effectiveRoles = rolesForRoleKeys(access.roleKeys);
        const displayRole = pickDisplayRole(effectiveRoles);
        setRoleState(displayRole);
        setSessionRoles(
          effectiveRoles.length > 0 ? effectiveRoles : ["employee"],
          displayRole ?? "employee",
        );
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
      setEffectiveAccess(null);
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
        setEffectiveAccess(null);
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
        setEffectiveAccess(null);
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
      setEffectiveAccess(null);
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

  const activeOrganization = effectiveAccess?.activeOrganization ?? null;
  const workspaces = useMemo(() => effectiveAccess?.workspaces ?? [], [effectiveAccess]);
  const workspaceStorageKey = session?.user?.id
    ? `${WORKSPACE_CONTEXT_STORAGE_KEY}:${session.user.id}`
    : null;

  const setCurrentWorkspaceId = useCallback((workspaceId: string | null) => {
    const normalized = workspaceId && workspaces.some((workspace) => workspace.id === workspaceId)
      ? workspaceId
      : null;

    setCurrentWorkspaceIdState(normalized);

    if (typeof window === "undefined" || !workspaceStorageKey) return;

    try {
      if (normalized) {
        window.localStorage.setItem(workspaceStorageKey, normalized);
      } else {
        window.localStorage.removeItem(workspaceStorageKey);
      }
    } catch {
      // Workspace selection is a convenience preference. Authorization remains backend-driven.
    }
  }, [workspaceStorageKey, workspaces]);

  useEffect(() => {
    if (!session?.user || workspaces.length === 0) {
      setCurrentWorkspaceIdState(null);
      return;
    }

    setCurrentWorkspaceIdState((current) => {
      if (current && workspaces.some((workspace) => workspace.id === current)) {
        return current;
      }

      if (typeof window !== "undefined" && workspaceStorageKey) {
        try {
          const stored = window.localStorage.getItem(workspaceStorageKey);
          if (stored && workspaces.some((workspace) => workspace.id === stored)) {
            return stored;
          }
        } catch {
          // Ignore preference read failures and fall back to the first visible workspace.
        }
      }

      return workspaces[0]?.id ?? null;
    });
  }, [session?.user, workspaceStorageKey, workspaces]);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0] ?? null,
    [currentWorkspaceId, workspaces],
  );

  const value = useMemo<AuthContextValue>(
    () => {
      // ────────────────────────────────────────────────────────────────
      // EXPLICIT PREVIEW ONLY — synthetic auth identity.
      // This requires both the development-only preview flag and a known
      // preview hostname (see previewBypass.ts). Hostname alone never grants
      // synthetic Platform Admin access; normal deployments fail closed.
      // ────────────────────────────────────────────────────────────────
      if (!session && isPreviewBypassActive()) {
        return {
          configured: true,
          loading: false,
          ...PREVIEW_AUTH_CONTEXT,
          effectiveAccess: {
            ...PREVIEW_AUTH_CONTEXT.effectiveAccess,
            activeOrganization: null,
            workspaces: [],
          },
          activeOrganization,
          workspaces,
          currentWorkspace,
          currentWorkspaceId,
          setCurrentWorkspaceId,
          signIn,
          signOut,
          refresh,
        };
      }
      return {
        configured: isSupabaseConfigured,
        loading,
        session,
        user: session?.user ?? null,
        profile,
        isPlatformAdmin,
        effectiveAccess,
        roleKeys,
        role,
        teams,
        teamsError,
        activeOrganization,
        workspaces,
        currentWorkspace,
        currentWorkspaceId,
        setCurrentWorkspaceId,
        contextLoading,
        contextError,
        signIn,
        signOut,
        refresh,
      };
    },
    [
      loading,
      session,
      profile,
      isPlatformAdmin,
      effectiveAccess,
      roleKeys,
      role,
      teams,
      teamsError,
      activeOrganization,
      workspaces,
      currentWorkspace,
      currentWorkspaceId,
      setCurrentWorkspaceId,
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

export function useWorkspaceContext() {
  const {
    activeOrganization,
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    contextLoading,
    contextError,
  } = useAuth();

  return {
    activeOrganization,
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    loading: contextLoading,
    error: contextError,
  };
}
