import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Brain, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · IT Knowledge Center" }] }),
  component: AuthPage,
});

// Future-ready flags. Kept false until a real handler exists.
// Flip these only when the corresponding flow is fully wired end-to-end.
const FEATURES = {
  passwordReset: false,
  companySSO: false,
  microsoft: false,
  google: false,
} as const;

// Optional workspace label, surfaced above the form only when populated
// by a real tenant resolver. Left null in this build.
const WORKSPACE_LABEL: string | null = null;

function AuthPage() {
  const { signIn, session, loading, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/", replace: true });
  }, [session, navigate]);

  const emailInvalid = touched && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
  const passwordInvalid = touched && !password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!email.trim() || !password) return;
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError("Check your email and password, then try again.");
    }
  }

  const showProviderArea = FEATURES.companySSO || FEATURES.microsoft || FEATURES.google;

  return (
    <div className="dark grid min-h-dvh place-items-center bg-background px-4 py-10">
      <main className="w-full max-w-sm">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-xl backdrop-blur sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
              <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight">IT Knowledge Center</h1>
              <p className="text-xs text-muted-foreground">Sign in to your workspace</p>
            </div>
          </div>

          <p className="mb-5 text-xs text-muted-foreground">
            Access your knowledge base, service desk and IT operations workspace.
          </p>

          {WORKSPACE_LABEL && (
            <div className="mb-4 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Workspace</div>
              <div className="text-sm font-medium">{WORKSPACE_LABEL}</div>
            </div>
          )}

          {!configured ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              Sign-in is temporarily unavailable. Please contact your administrator.
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting || loading}
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? "email-error" : undefined}
                />
                {emailInvalid && (
                  <p id="email-error" className="text-[11px] text-destructive">
                    Enter a valid work email address.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {FEATURES.passwordReset && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                      onClick={() => navigate({ to: "/auth" })}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting || loading}
                    className="pr-10"
                    aria-invalid={passwordInvalid || undefined}
                    aria-describedby={passwordInvalid ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    tabIndex={0}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordInvalid && (
                  <p id="password-error" className="text-[11px] text-destructive">
                    Enter your password.
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <div className="font-semibold">Sign-in failed</div>
                  <div className="mt-0.5 text-destructive/90">{error}</div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || loading}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>

              {showProviderArea && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="h-px flex-1 bg-border/60" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                  <div className="space-y-2">
                    {/* Provider buttons render only when their feature flag and real handler exist. */}
                    {FEATURES.companySSO && null}
                    {FEATURES.microsoft && null}
                    {FEATURES.google && null}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        <div className="mt-5 text-center text-[11px] text-muted-foreground">
          <p>Need access? Contact your administrator.</p>
          <p className="mt-1">Accounts are provided by your organization.</p>
        </div>
      </main>
    </div>
  );
}
