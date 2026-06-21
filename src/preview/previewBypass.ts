/**
 * Explicitly enabled Lovable Preview-only auth bypass.
 *
 * SAFETY: Hostname is only a secondary allow-list. Synthetic authentication
 * is disabled by default and requires VITE_ENABLE_PREVIEW_AUTH_BYPASS=true at
 * build/dev-server startup. This flag is intended only for deliberate local
 * or hosted development previews; it must not be set in normal production.
 *
 * Do not change the allow-list to include customer/production domains.
 */

const PREVIEW_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovable.dev",
  ".lovable.host",
  ".lovableproject.com",
  ".lovable.build",
];

const PREVIEW_HOST_EXACT = new Set<string>([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

export function isLovablePreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (PREVIEW_HOST_EXACT.has(host)) return true;
  return PREVIEW_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isPreviewBypassActive(): boolean {
  // Exact opt-in prevents hostnames such as localhost from granting synthetic
  // Platform Admin access when the flag is absent or accidentally set to a
  // non-boolean value.
  return import.meta.env.VITE_ENABLE_PREVIEW_AUTH_BYPASS === "true" && isLovablePreviewHost();
}
