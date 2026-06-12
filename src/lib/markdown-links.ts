const ALLOWED_SCHEME = /^(?:https?|mailto|tel):/i;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function isSafeMarkdownHref(href: string): boolean {
  if (!href || CONTROL_CHARACTER.test(href)) return false;
  if (!URI_SCHEME.test(href)) return true;
  return ALLOWED_SCHEME.test(href);
}
