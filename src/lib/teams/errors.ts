type SupabaseErrorShape = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

type TeamsErrorFields = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 500) : null;
}

export class TeamsServiceError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(message: string, fields?: TeamsErrorFields) {
    super(message);
    this.name = "TeamsServiceError";
    this.code = fields?.code ?? null;
    this.details = fields?.details ?? null;
    this.hint = fields?.hint ?? null;
  }
}

export function normalizeTeamsError(error: unknown, fallback: string): TeamsServiceError {
  if (error instanceof TeamsServiceError) return error;

  const shape =
    typeof error === "object" && error !== null ? (error as SupabaseErrorShape) : undefined;

  return new TeamsServiceError(
    safeText(shape?.message) ??
      (error instanceof Error ? safeText(error.message) : null) ??
      fallback,
    {
      code: safeText(shape?.code),
      details: safeText(shape?.details),
      hint: safeText(shape?.hint),
    },
  );
}

export function formatTeamsError(error: unknown, fallback: string): string {
  const normalized = normalizeTeamsError(error, fallback);
  const parts = [
    normalized.code ? `[${normalized.code}] ${normalized.message}` : normalized.message,
    normalized.details,
    normalized.hint ? `Hint: ${normalized.hint}` : null,
  ];
  return parts.filter(Boolean).join(" - ");
}
