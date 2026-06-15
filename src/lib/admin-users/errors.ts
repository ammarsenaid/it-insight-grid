type SupabaseErrorShape = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 500) : null;
}

export function formatAdminUsersError(error: unknown, fallback: string): string {
  const shape =
    typeof error === "object" && error !== null ? (error as SupabaseErrorShape) : undefined;
  const message =
    safeText(shape?.message) ??
    (error instanceof Error ? safeText(error.message) : null) ??
    fallback;
  const code = safeText(shape?.code);
  const details = safeText(shape?.details);
  const hint = safeText(shape?.hint);

  return [code ? `[${code}] ${message}` : message, details, hint ? `Hint: ${hint}` : null]
    .filter(Boolean)
    .join(" - ");
}
