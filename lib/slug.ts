/**
 * URL slugs. Dependency-free — no `server-only`, no db — so build scripts
 * can import it alongside server components. `lib/people.ts` is server-only,
 * and a script that imported the slug helper through it would crash on the
 * `server-only` guard rather than run.
 */

/** Lowercase, diacritic-folded, hyphenated. Matches the film importer's. */
export function slugify(value: string, fallback = "item") {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      // Strip combining marks, so "Léa Seydoux" and "Lea Seydoux" agree.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || fallback
  );
}

export const personSlug = (name: string) => slugify(name, "person");
