/**
 * The ten editorial shelves.
 *
 * A collection is the layer above a list: seventy-two lists is a filing
 * problem rather than a page, and "Crime" is what somebody scanning for one
 * actually has in mind before they know which of the eight they want.
 *
 * Only the name and the line under it live here — which lists belong to
 * which shelf is a column on FilmList, written by scripts/seed-collections.ts
 * from prisma/seed-data/collections.ts. This file is what the pages read, so
 * it stays pure data: no database, no `server-only`.
 */

export type Shelf = {
  slug: string;
  name: string;
  /** One line, in the site's voice, for the hub card and the shelf header. */
  blurb: string;
};

export const SHELVES: Shelf[] = [
  {
    slug: "power-wealth-ambition",
    name: "Power, wealth & ambition",
    blurb:
      "Status, leverage, and what people turn out to be willing to trade for either.",
  },
  {
    slug: "crime",
    name: "Crime",
    blurb:
      "Organised, tailored, and almost never actually about the money.",
  },
  {
    slug: "psychological",
    name: "Psychological",
    blurb:
      "Films that argue with your reading of them, and usually win.",
  },
  {
    slug: "dark-unsettling",
    name: "Dark & unsettling",
    blurb:
      "Dread that arrives quietly, sits down, and does not leave afterwards.",
  },
  {
    slug: "visual-atmospheric",
    name: "Visual & atmospheric",
    blurb:
      "Cinema you could watch with the sound off — and absolutely should not.",
  },
  {
    slug: "love-emotion",
    name: "Love & emotion",
    blurb:
      "Romance, mostly in the past tense, and the damage is mostly the point.",
  },
  {
    slug: "obsession-intelligence-work",
    name: "Obsession, intelligence & work",
    blurb:
      "Being very good at one thing, and what it costs to stay that way.",
  },
  {
    slug: "chaos-adrenaline",
    name: "Chaos & adrenaline",
    blurb:
      "Two hours with your shoulders somewhere around your ears.",
  },
  {
    slug: "science-fiction",
    name: "Science fiction",
    blurb: "The future as a way of asking about now.",
  },
  {
    slug: "comfort-accessible-viewing",
    name: "Comfort & accessible viewing",
    blurb: "Nothing on this shelf is going to hurt you.",
  },
];

const BY_SLUG = new Map(SHELVES.map((shelf) => [shelf.slug, shelf]));

export function findShelf(slug: string | null | undefined): Shelf | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}
