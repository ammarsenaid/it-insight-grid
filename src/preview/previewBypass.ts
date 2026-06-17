/**
 * Lovable Preview-only auth bypass.
 *
 * SAFETY: This module is gated strictly by hostname. It activates ONLY on
 * known Lovable preview hostnames (localhost during dev, and lovable-owned
 * preview/staging domains). A production VPS using its own IP or custom
 * domain will never satisfy `isLovablePreviewHost()` and therefore will
 * never bypass authentication.
 *
 * NEVER enable this in production. Do not change the allow-list to include
 * customer/production domains.
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

/** Alias kept for readability at call sites. */
export const isPreviewBypassActive = isLovablePreviewHost;
