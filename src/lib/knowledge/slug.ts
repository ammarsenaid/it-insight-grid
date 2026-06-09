// Lightweight slug helper used by knowledge CRUD forms.
// Matches the regex enforced by the database checks:
//   ^[a-z0-9]+(?:-[a-z0-9]+)*$
// Length 2..160 (article) / 2..100 (space, category) / 2..80 (tag).
//
// Callers are free to let the user override; we only auto-derive a default.

export function slugify(input: string, maxLen = 100): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base.slice(0, maxLen).replace(/-+$/g, "");
}

export function isValidSlug(slug: string, max = 100): boolean {
  if (slug.length < 2 || slug.length > max) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
