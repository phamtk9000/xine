/**
 * The house genre vocabulary.
 *
 * The catalogue was carrying thirty-three genre labels from three different
 * sources that never agreed with each other:
 *
 *   - TMDB's film genres ("Action", "Science Fiction", "War")
 *   - TMDB's *television* genres, which are a different id space with
 *     combined names ("Action & Adventure", "Sci-Fi & Fantasy", "War &
 *     Politics", "Kids", "Soap")
 *   - one-off labels from the hand-written editorial films ("Noir", "Epic",
 *     "Courtroom Drama", "Period", "Biography", "Spiritual", "Musical")
 *
 * That was not only untidy, it was a filter that lied: this site treats films
 * and series as one medium, so a reader clicking "Science Fiction" was being
 * shown the films and silently denied a hundred and eighty series that are
 * science fiction, because TMDB had filed them under a different name.
 *
 * So every label resolves to one of the eighteen below, at the point titles
 * are read out of TMDB and again on the way into the database. The mapping is
 * lossy by design — a series tagged "Sci-Fi & Fantasy" cannot be split into
 * its two halves after the fact, and it is filed under the term that carries
 * most of those shows rather than tagged with both, because tagging both
 * would put a claim on the card that nobody checked.
 *
 * Pure data: no database, no `server-only`, so the importer, the seeder, the
 * agent and the pages all read the same list.
 */

export const HOUSE_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
] as const;

export type HouseGenre = (typeof HOUSE_GENRES)[number];

const ORDER = new Map(HOUSE_GENRES.map((genre, i) => [genre, i]));

/**
 * Everything that is not already a house genre, and what it becomes.
 *
 * Keyed lowercase so "Sci-Fi & Fantasy" and "sci-fi and fantasy" both land.
 * A label that is neither a house genre nor listed here is dropped rather
 * than passed through — that is what stops the next import from quietly
 * growing the vocabulary again.
 */
const ALIASES: Record<string, HouseGenre> = {
  // TMDB television genres
  "action & adventure": "Action",
  "sci-fi & fantasy": "Science Fiction",
  "war & politics": "War",
  kids: "Family",
  soap: "Drama",

  // Editorial one-offs from the seeded films
  "psychological thriller": "Thriller",
  "dark comedy": "Comedy",
  "courtroom drama": "Drama",
  "coming of age": "Drama",
  biography: "Drama",
  spiritual: "Drama",
  period: "History",
  historical: "History",
  epic: "Adventure",
  noir: "Crime",
  musical: "Music",

  // Spellings TMDB and older seed data disagree on
  "science-fiction": "Science Fiction",
  "sci-fi": "Science Fiction",
  scifi: "Science Fiction",
  "tv movie": "Drama",
};

/** One label to its house genre, or null if it is not a genre we keep. */
export function mapGenre(label: string): HouseGenre | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  if (ORDER.has(trimmed as HouseGenre)) return trimmed as HouseGenre;
  return ALIASES[trimmed.toLowerCase()] ?? null;
}

/**
 * A title's genres, normalised: mapped, de-duplicated, and put back in house
 * order so two films with the same genres always read the same way round.
 *
 * Takes either the comma-separated column or an array, because the importer
 * has an array and the database has a string.
 */
export function normaliseGenres(input: string | string[] | null): HouseGenre[] {
  const labels = Array.isArray(input) ? input : (input ?? "").split(",");
  const kept = new Set<HouseGenre>();

  for (const label of labels) {
    const genre = mapGenre(label);
    if (genre) kept.add(genre);
  }

  return [...kept].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** The same, ready for the comma-separated column. */
export function genreCsv(input: string | string[] | null): string {
  return normaliseGenres(input).join(", ");
}
