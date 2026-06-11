/**
 * Tiny helpers to coerce Supabase's typed `data` payloads into plain
 * row objects for our mapper functions. The Supabase JS client returns
 * `GenericStringError` placeholders when the `.select()` string can't be
 * inferred against a generated schema (we don't ship one), so we cast
 * through `unknown` once here.
 */

export type SbRow = Record<string, unknown>;

export function asRow<T = SbRow>(data: unknown): T {
  return data as unknown as T;
}

export function asRows<T = SbRow>(data: unknown): T[] {
  return (data ?? []) as unknown as T[];
}
