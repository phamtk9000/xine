import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { QUESTIONS, type Answers, type Question, type WatchCard } from "@/lib/watch-shape";

export { QUESTIONS };
export type { Answers, Question, WatchCard };

/**
 * "What should I watch tonight", asked as questions rather than filters.
 *
 * The catalogue page already has filters, and filters are the wrong shape
 * for this: they ask what genre you want, which nobody knows, and they
 * answer with a grid of sixty posters, which is the problem restated rather
 * than solved. Somebody standing in front of a television at nine o'clock
 * has a mood, an hour and a half, and no patience.
 *
 * So four questions in the language people actually use — how it should
 * feel, how long, how old, where from — and then one film at a time. Each
 * question is optional and every answer narrows the pool; the deck is drawn
 * from what survives.
 *
 * The answers are not stored. They are a mood on a Tuesday, not a taste:
 * what gets remembered is which cards were kept and which were waved off,
 * because that is a judgement about a film rather than about an evening.
 */


/**
 * A mood is a set of genres rather than one.
 *
 * "Dark" is not a genre on any film and does not need to be: it is crime and
 * horror and the kind of thriller that does not end well, and the catalogue
 * knows all three. Matching is a `contains` against the comma-packed genre
 * column, so one query per mood word rather than a join.
 */
const MOODS: Record<string, string[]> = {
  dark: ["Crime", "Thriller", "Horror", "Mystery"],
  tender: ["Romance", "Drama", "Family"],
  thrilling: ["Action", "Adventure", "War"],
  beautiful: ["Drama", "History", "Animation"],
  funny: ["Comedy"],
  strange: ["Science Fiction", "Fantasy", "Mystery"],
};

const PLACES: Record<string, string[]> = {
  "east-asia": ["JP", "KR", "CN", "HK", "TW", "TH", "VN", "ID", "PH", "IN"],
  europe: [
    "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "AT", "CH",
    "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "HU", "GR", "RO", "RU", "SU",
  ],
  americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "UY", "CU"],
};

/** The answers as a database filter. Anything unanswered simply is not one. */
function watchWhere(answers: Answers) {
  const mood = answers.mood ? MOODS[answers.mood] : null;
  const place =
    answers.place && answers.place !== "anywhere"
      ? PLACES[answers.place]
      : null;

  // Two of the answers are each a set of alternatives, and they have to be
  // ANDed with one another rather than merged: a mood OR list and a place OR
  // list written as sibling keys would collapse into one, and "dark, from
  // Europe" would return everything dark plus everything European.
  const either: { OR: Record<string, unknown>[] }[] = [];
  if (mood) {
    either.push({ OR: mood.map((genre) => ({ genres: { contains: genre } })) });
  }
  if (place) {
    // originCountry is a comma-packed list with home first, so a prefix
    // match is "made there" rather than "involved somehow".
    either.push({
      OR: place.map((code) => ({ originCountry: { startsWith: code } })),
    });
  }

  return {
    // A card is a poster. One without art is a card that cannot be shown.
    posterUrl: { not: null },
    kind: "film",
    ...(answers.length === "short" ? { runtime: { lt: 100, gt: 40 } } : {}),
    ...(answers.length === "normal" ? { runtime: { gte: 100, lte: 140 } } : {}),
    ...(answers.length === "long" ? { runtime: { gt: 140 } } : {}),
    ...(answers.era === "now" ? { year: { gte: 2015 } } : {}),
    ...(answers.era === "modern" ? { year: { gte: 1990, lt: 2015 } } : {}),
    ...(answers.era === "classic" ? { year: { lt: 1990 } } : {}),
    ...(either.length > 0 ? { AND: either } : {}),
  };
}


/** How wide the scan goes before the deck is drawn from it. */
const POOL = 400;

/**
 * The deck, and how many films it was drawn from.
 *
 * Size follows the answers: with nothing narrowed down the deck runs long,
 * because the reader is browsing and every card is a question about what
 * they want. Four answers in, it is short — they have described an evening
 * quite precisely, and a hundred cards would mean the description had been
 * ignored.
 */
export async function watchDeck(
  answers: Answers,
  options: { userId?: string | null } = {},
): Promise<{ cards: WatchCard[]; pool: number }> {
  const answered = Object.values(answers).filter(Boolean).length;
  const take = Math.max(10, 26 - answered * 4);

  const where = watchWhere(answers);

  // Everything they have already judged, in one query each. A deck that
  // offers a film somebody rated last week is a deck that is not listening.
  const [ratings, logs, watchlist, feedback] = options.userId
    ? await Promise.all([
        db.rating.findMany({
          where: { userId: options.userId },
          select: {
            filmId: true,
            overall: true,
            film: { select: { director: true, genres: true } },
          },
        }),
        db.filmLog.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
        db.watchlistItem.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
        db.filmFeedback.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
      ])
    : [[], [], [], []];

  const judged = new Set<string>([
    ...ratings.map((r) => r.filmId),
    ...logs.map((l) => l.filmId),
    ...watchlist.map((w) => w.filmId),
    ...feedback.map((f) => f.filmId),
  ]);

  const [pool, rows] = await Promise.all([
    db.film.count({ where }),
    db.film.findMany({
      where: judged.size > 0 ? { ...where, id: { notIn: [...judged] } } : where,
      // Reach first, so the pool is films people have actually seen; the
      // ranking below decides the order within it.
      orderBy: { tmdbVotes: "desc" },
      take: POOL,
      select: {
        id: true,
        slug: true,
        title: true,
        year: true,
        director: true,
        runtime: true,
        country: true,
        genres: true,
        synopsis: true,
        posterUrl: true,
        criticScore: true,
        tmdbScore: true,
        reviewed: true,
        tmdbVotes: true,
      },
    }),
  ]);

  // What this reader has rated highly, cheaply: the directors and genres
  // worth a nudge. Not the full recommender — that reads outward from the
  // editorial lists and would fight the answers given here — just enough
  // that two people asking for "dark, under 100 minutes" do not get an
  // identical deck.
  const lovedDirectors = new Set(
    ratings.filter((r) => r.overall >= 7.5).map((r) => r.film.director),
  );
  const lovedGenres = new Set(
    ratings
      .filter((r) => r.overall >= 7.5)
      .flatMap((r) => fromCsv(r.film.genres)),
  );

  const cards = rows
    .map((film) => {
      const genres = fromCsv(film.genres);
      const quality = (film.criticScore ?? film.tmdbScore ?? 5) / 10;
      const reach = Math.log10(Math.max(10, film.tmdbVotes)) / 5;

      const known = lovedDirectors.has(film.director);
      const familiar = genres.filter((g) => lovedGenres.has(g)).length;

      return {
        film,
        genres,
        // Quality leads, reach keeps the obscure tail from filling the deck,
        // and a little noise stops the same twenty films answering the same
        // question every night.
        score:
          quality * 1.4 +
          reach * 0.6 +
          (known ? 0.5 : 0) +
          familiar * 0.12 +
          (film.reviewed ? 0.25 : 0) +
          Math.random() * 0.35,
        note: known
          ? `By ${film.director}, who you rate highly`
          : film.reviewed
            ? "Written about by xine"
            : null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map(({ film, genres, note }) => ({
      id: film.id,
      slug: film.slug,
      title: film.title,
      year: film.year,
      director: film.director,
      runtime: film.runtime,
      country: film.country,
      genres,
      synopsis: film.synopsis,
      posterUrl: film.posterUrl,
      criticScore: film.criticScore,
      tmdbScore: film.tmdbScore,
      reviewed: film.reviewed,
      note,
    }));

  return { cards, pool };
}
