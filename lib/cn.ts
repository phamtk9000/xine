/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not clsx + tailwind-merge. Nothing here passes competing
 * utilities down through props, so there is no conflict to resolve — and the
 * rest of the codebase already builds class lists with array joins. This is
 * the same thing with a name.
 */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
