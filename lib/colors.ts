/**
 * Presentational colour that isn't tied to a single article or film — kept
 * dependency-free (no `server-only`, no filesystem, no db) so both server
 * and client components can import it. `lib/journal.ts` is server-only and
 * `components/ui.tsx` is shared with several client forms, so this couldn't
 * live in either without leaking a server-only import into a client bundle.
 */

/**
 * One colour per Journal kicker, so the index reads as several sections
 * rather than one gold label repeated on every card. The artwork inside an
 * article already carries real colour — every piece sets its own `accent`
 * in frontmatter — but everywhere outside an open article (the index, a
 * film page's "In the Journal" rail, the article header itself) flattened
 * every category to the same gold, which made the site more monochrome
 * than its own content.
 *
 * These are the kickers actually in use across content/journal — checked
 * directly (`grep '^kicker:' content/journal/*.md`) rather than trusting
 * the `KICKERS` list in lib/journal.ts, which turns out not to match: it
 * still has Interview and Festival, neither of which any article uses, and
 * is missing Character Study and both Film & ... kickers, which several do.
 * That list is unused elsewhere in the app, so nothing but this map's
 * accuracy depended on it — but it's worth fixing at the source too.
 *
 * Three reuse the site's existing tokens rather than inventing new hues —
 * Review keeps gold because a review is the one kicker tied to a score,
 * Essay finally puts the long-unused teal to work, Analysis reuses the
 * house oxblood. The rest extend the same warm, low-chroma family the
 * per-article accents already live in (several literally reuse a hue seen
 * in a real article's `accent` field) rather than a colder, more saturated
 * palette that would sit outside it.
 */
export const KICKER_COLORS: Record<string, string> = {
  Review: "#2fe4e0", // --color-signal, because a review is tied to a score
  Essay: "#8b6bff", // --color-violet
  Analysis: "#ff4d33", // --color-accent
  Craft: "#7fd94f",
  "Character Study": "#ffb03a",
  "Film & Society": "#ff5fa2",
  "Film & Philosophy": "#4bb8ff",
};

/**
 * A kicker outside the hand-picked set above still gets a distinct, stable
 * colour rather than silently collapsing onto Essay's teal — which is
 * exactly the bug that not doing this caused here: three real, different
 * categories all rendering identically until the map above was corrected.
 */
export function kickerColor(kicker: string): string {
  return KICKER_COLORS[kicker] ?? hashColor(kicker);
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * A deterministic colour for an arbitrary string — same idea as the poster
 * plates in components/poster.tsx (hash the name, not a lookup table,
 * because there's no fixed, curated list to hand-pick from: dozens of genre
 * strings across the catalogue, and potentially any future kicker). Kept in
 * the same low-chroma oklch register as the poster plates so a tag reads as
 * part of the same restrained system instead of a brighter, unrelated one.
 */
function hashColor(value: string): string {
  const hue = hash(value) % 360;
  // Chroma raised from 0.1: at that level every genre tag was the same
  // desaturated putty at a glance, which defeats the point of colouring
  // them at all. 0.19 at this lightness stays legible on ink and actually
  // distinguishes Horror from Romance across a rail of eighteen.
  return `oklch(0.74 0.19 ${hue})`;
}

export function genreColor(genre: string): string {
  return hashColor(genre);
}
