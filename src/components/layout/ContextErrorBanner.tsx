import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Non-blocking banner shown inside the authenticated shell when one or more
 * pieces of account context (profile, platform-admin status, visible teams)
 * failed to load. Provides a Retry that calls AuthProvider.refresh().
 */
export function ContextErrorBanner() {
  const { contextError, contextLoading, refresh } = useAuth();
  if (!contextError) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="font-medium">Account context could not be loaded completely.</div>
        <div className="mt-0.5 text-xs text-destructive/80">{contextError}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => void refresh()}
        disabled={contextLoading}
      >
        <RefreshCw className={contextLoading ? "mr-1.5 h-3 w-3 animate-spin" : "mr-1.5 h-3 w-3"} />
        Retry
      </Button>
    </div>
  );
}
