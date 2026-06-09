import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "./AppShell";

const PUBLIC_PATHS = new Set<string>(["/auth"]);

/**
 * Top-level gate for the authenticated UI.
 *
 * Behavior:
 *  - Unauthenticated user on a protected route → redirected to /auth.
 *  - Authenticated user on /auth → redirected to /.
 *  - Authenticated non-admin on /admin/* → redirected to /.
 *  - Authenticated admin on /admin/* → allowed.
 *
 * SSR vs. client hydration: we render the same wrapper (AppShell for
 * protected routes, bare children for /auth) on both sides to avoid
 * hydration mismatches. The redirect effects run on the client after mount.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, isPlatformAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isAdminRoute = pathname.startsWith("/admin");

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
    } else if (session && isPublic) {
      navigate({ to: "/", replace: true });
    } else if (session && isAdminRoute && !isPlatformAdmin) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, session, isPublic, isAdminRoute, isPlatformAdmin, navigate]);

  // Public route: render bare. Both SSR and client render the same tree.
  if (isPublic) return <>{children}</>;

  // After mount we know the real session state; suppress flashes during redirect.
  if (mounted && !loading) {
    if (!session) return null;
    if (isAdminRoute && !isPlatformAdmin) return null;
  }

  return <AppShell>{children}</AppShell>;
}
