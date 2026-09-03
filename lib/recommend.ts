import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { round1 } from "@/lib/scores";

/**
 * Recommendations, from facts rather than a fitted model.
 *
 * There is nothing here to train. Forty-one ratings across four accounts is
 * not a matrix anybody can factorise, and per-film axis data exists for about
 * thirty titles. Sparsity is not a problem to model around; it is a fact to
 * design for.
 *
 * Two layers, and the order matters.
 *
 * The editorial graph comes first, because it is the signal no other film
 * site has: seventy-two lists in which a person placed eight films next to
 * each other and said why, which is a similarity graph with its edges
 * labelled. But only 351 of 1,797 titles are in a list, so on its own it can
 * only ever recommend from a fifth of the catalogue.
 *
 * The rest of the catalogue is reached by what every row carries: genre,
 * country, decade, and the people — director, cinematographer,
 * composer, and the billed cast through the credits table. Shared attributes
 * are weighted by how rare they are, which is the whole trick. Two films
 * sharing "Drama" (1,145 of them) means nothing; two sharing "Western" (22)
 * or Cantonese or a cinematographer means a great deal.
 *
 * Every score decomposes into named contributions, so every recommendation
 * can say what it is for — and a reader can disagree with the reasoning
 * rather than with a number.
 */

export type Recommendation = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  posterUrl: string | null;
  genres: string[];
  criticScore: number | null;
  tmdbScore: number | null;
  reviewed: boolean;
  score: number;
  /** Why this film, in the site's own terms. Never generated prose. */
  reason: string;
};

/** Ratings this high are treated as a preference rather than a record. */
const LOVED = 7.5;
/** Below this, a rating is evidence *against* the things it resembles. */
const DISLIKED = 5.5;

/** Nobody wants a page of one director, or one list recited. */
const MAX_PER_DIRECTOR = 2;
const MAX_PER_LIST = 2;
/** And the same for a crew member: three Deakins films is a filmography. */
const MAX_PER_PERSON = 2;

/**
 * What share of the page the editorial graph may take.
 *
 * Left alone it takes all of it. The lists are the strongest signal here, so
 * for a reader whose favourites are all in them every slot fills with list
 * matches and the other 1,446 titles never appear — reachable in principle,
 * invisible in practice. Holding back a portion forces the rest of the page
 * to be earned by a person or a rare attribute, which is the only way the
 * catalogue outside the lists ever gets seen.
 */
const LIST_SHARE = 0.55;

/** How wide the content scan goes before scoring. */
const SCAN = 900;

/**
 * The weakest contribution worth counting.
 *
 * Without it, "Drama" plus "English" plus "the 2010s" adds up to a
 * recommendation, and the first version of this duly suggested The Godfather
 * and Fight Club to somebody whose favourite film is In the Mood for Love —
 * three true statements that together say nothing. A contribution has to
 * clear this bar on its own to be counted at all.
 */
const FLOOR = 0.3;

/**
 * How strong a film's *best* reason has to be before it can be recommended.
 *
 * A page can be filled with true statements that say nothing — "a drama",
 * "in English", "from the 2010s" — and the first version of this did exactly
 * that, opening with The Godfather for somebody whose favourite film is In
 * the Mood for Love. Weak signals may still contribute to the ordering, but
 * a film has to clear this on one single reason to appear at all, which in
 * practice means a person, an editorial list, or an attribute rare enough to
 * be a real claim.
 */
const MIN_TOP = 1.2;

/**
 * How much a shared attribute is worth, before rarity is applied.
 *
 * People outrank attributes on purpose. Sharing a cinematographer with a
 * film somebody loves is a real claim about how the next one will look;
 * sharing a genre is barely a claim at all.
 */
const WEIGHT = {
  list: 3,
  director: 2.4,
  cinematographer: 1.8,
  composer: 1.4,
  cast: 1.1,
  genre: 1.2,
  country: 1.0,
  decade: 0.6,
  quality: 0.35,
} as const;

/** A film in many lists is a hub, not a match — damped, but gently. */
function damp(listCount: number) {
  return 1 / Math.pow(Math.max(1, listCount), 0.35);
}

/**
 * Inverse document frequency: how much it means that two films share this.
 *
 * Drama appears on 1,145 of 1,797 titles and says almost nothing; Western
 * appears on 22 and says a great deal. Without this the recommender simply
 * ranks the catalogue by how much drama it contains.
 */
function idf(total: number, count: number) {
  return Math.log((total + 1) / (Math.max(1, count) + 1)) + 0.2;
}

type Contribution = {
  weight: number;
  reason: string;
  listId?: string;
  /** The person this reason rests on, for the diversity cap. */
  personKey?: string;
};

/** The internal listId is a diversity control, not part of the answer. */
function strip(
  film: Recommendation & { listId?: string; personKey?: string },
): Recommendation {
  const copy = { ...film };
  delete copy.listId;
  delete copy.personKey;
  return copy;
}

/** Scale a dimension to [-1, 1] so it cannot outgrow the others. */
function normalise(map: Map<string, number> | Map<number, number>) {
  const peak = Math.max(...[...map.values()].map(Math.abs), 1);
  for (const [key, value] of map.entries()) {
    (map as Map<unknown, number>).set(key, value / peak);
  }
}

export async function recommendFor(
  userId: string,
  options: { take?: number } = {},
): Promise<Recommendation[]> {
  const take = options.take ?? 12;

  const [ratings, logs, watchlist] = await Promise.all([
    db.rating.findMany({
      where: { userId },
      select: {
        overall: true,
        film: {
          select: {
            id: true,
            title: true,
            director: true,
            cinematographer: true,
            composer: true,
            genres: true,
            originCountry: true,
            year: true,
          },
        },
      },
    }),
    db.filmLog.findMany({ where: { userId }, select: { filmId: true } }),
    db.watchlistItem.findMany({ where: { userId }, select: { filmId: true } }),
  ]);

  const seen = new Set<string>([
    ...ratings.map((r) => r.film.id),
    ...logs.map((l) => l.filmId),
    ...watchlist.map((w) => w.filmId),
  ]);

  // Dislikes are not filtered out here — they pull the taste vector negative
  // in the loop below, which is what stops "more of the same, but worse".
  const loved = ratings.filter((r) => r.overall >= LOVED);
  if (loved.length === 0) return [];

  // ---- The taste vector ---------------------------------------------------
  // Weighted by how much they liked the film it came from, so a 9.4 pulls
  // harder than a 7.6, and negative from what they disliked.
  const affinity = {
    genre: new Map<string, number>(),
    country: new Map<string, number>(),
    decade: new Map<number, number>(),
    director: new Map<string, number>(),
    cinematographer: new Map<string, number>(),
    composer: new Map<string, number>(),
  };
  /** Which loved film each attribute came from, for the explanation. */
  const source = new Map<string, string>();

  const note = (key: string, title: string) => {
    if (!source.has(key)) source.set(key, title);
  };

  for (const { overall, film } of ratings) {
    const pull = overall >= LOVED ? overall / 10 : overall <= DISLIKED ? -0.6 : 0;
    if (pull === 0) continue;

    for (const genre of fromCsv(film.genres)) {
      affinity.genre.set(genre, (affinity.genre.get(genre) ?? 0) + pull);
      if (pull > 0) note(`genre:${genre}`, film.title);
    }

    const country = film.originCountry?.split(",")[0]?.trim();
    if (country) {
      affinity.country.set(country, (affinity.country.get(country) ?? 0) + pull);
      if (pull > 0) note(`country:${country}`, film.title);
    }
    const decade = Math.floor(film.year / 10) * 10;
    affinity.decade.set(decade, (affinity.decade.get(decade) ?? 0) + pull);

    if (pull > 0) {
      for (const [key, value] of [
        ["director", film.director],
        ["cinematographer", film.cinematographer],
        ["composer", film.composer],
      ] as const) {
        if (!value || value === "Unknown") continue;
        const map = affinity[key];
        map.set(value, (map.get(value) ?? 0) + pull);
        note(`${key}:${value}`, film.title);
      }
    }
  }

  // Normalised per dimension. Without this an affinity grows with the number
  // of films rated — after a dozen ratings "English" carries a weight of
  // eight simply for being the commonest thing in cinema — and the common
  // attributes drown the rare ones no matter how they are weighted after.
  for (const map of Object.values(affinity)) normalise(map);

  // ---- The people they keep watching -------------------------------------
  // Billed cast of loved films, then everything else those people are in.
  // This is the credits table earning its keep: 14,498 rows over 1,260
  // titles, which reaches films no list or genre filter would surface.
  const lovedIds = loved.map((r) => r.film.id);
  const lovedTitle = new Map(loved.map((r) => [r.film.id, r.film.title]));

  const lovedCredits = await db.credit.findMany({
    where: { filmId: { in: lovedIds }, order: { lt: 6 } },
    select: {
      personId: true,
      filmId: true,
      order: true,
      person: { select: { name: true } },
    },
  });

  const tally = new Map<
    string,
    { weight: number; name: string; from: string; films: number; lead: boolean }
  >();
  for (const credit of lovedCredits) {
    const rating = loved.find((r) => r.film.id === credit.filmId);
    if (!rating) continue;
    const existing = tally.get(credit.personId);
    tally.set(credit.personId, {
      weight: (existing?.weight ?? 0) + rating.overall / 10,
      name: credit.person.name,
      from: existing?.from ?? lovedTitle.get(credit.filmId) ?? rating.film.title,
      films: (existing?.films ?? 0) + 1,
      lead: (existing?.lead ?? false) || credit.order <= 1,
    });
  }

  /**
   * One shared actor is a coincidence; two is a pattern.
   *
   * Without this the page recommended Guardians of the Galaxy to a reader
   * whose favourite film is In the Mood for Love, because Dave Bautista is
   * fourth-billed in Dune. A performer only counts if they carried a film
   * this reader loved — top billing — or turned up in two of them.
   */
  const personPull = new Map(
    [...tally.entries()].filter(([, person]) => person.lead || person.films >= 2),
  );

  const castCredits =
    personPull.size > 0
      ? await db.credit.findMany({
          where: {
            personId: { in: [...personPull.keys()] },
            filmId: { notIn: [...seen] },
            // Only where they are billed near the front — a lead carries a
            // film, a tenth-billed appearance says nothing about it.
            order: { lt: 4 },
          },
          select: { filmId: true, personId: true },
          take: 1500,
        })
      : [];

  // ---- Candidates ---------------------------------------------------------
  // Anything sharing a genre, a country or a person with something they
  // love. That is the whole catalogue in principle; the take keeps one
  // request honest.
  const topGenres = [...affinity.genre.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);
  const topCountries = [...affinity.country.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  const [candidates, totals, listEntries] = await Promise.all([
    db.film.findMany({
      where: {
        id: { notIn: [...seen] },
        OR: [
          ...topGenres.map((genre) => ({ genres: { contains: genre } })),
          ...topCountries.map((country) => ({
            originCountry: { contains: country },
          })),
          { director: { in: [...affinity.director.keys()] } },
          { cinematographer: { in: [...affinity.cinematographer.keys()] } },
          { composer: { in: [...affinity.composer.keys()] } },
          { id: { in: castCredits.map((c) => c.filmId) } },
        ],
      },
      orderBy: { tmdbVotes: "desc" },
      take: SCAN,
      select: {
        id: true,
        slug: true,
        title: true,
        year: true,
        director: true,
        cinematographer: true,
        composer: true,
        genres: true,
        originCountry: true,
        language: true,
        posterUrl: true,
        criticScore: true,
        tmdbScore: true,
        reviewed: true,
      },
    }),
    catalogueTotals(),
    lovedListNeighbours(lovedIds, seen),
  ]);

  // ---- Score --------------------------------------------------------------
  const contributions = new Map<string, Contribution[]>();
  const push = (filmId: string, contribution: Contribution) => {
    if (contribution.weight < FLOOR) return;
    contributions.set(filmId, [
      ...(contributions.get(filmId) ?? []),
      contribution,
    ]);
  };

  for (const [filmId, entry] of listEntries) {
    push(filmId, {
      weight: entry.weight * WEIGHT.list,
      reason: entry.reason,
      listId: entry.listId,
    });
  }

  const castByFilm = new Map<string, string[]>();
  for (const credit of castCredits) {
    castByFilm.set(credit.filmId, [
      ...(castByFilm.get(credit.filmId) ?? []),
      credit.personId,
    ]);
  }

  for (const film of candidates) {
    const genres = fromCsv(film.genres);

    for (const genre of genres) {
      const pull = affinity.genre.get(genre);
      if (!pull) continue;
      push(film.id, {
        weight:
          pull * idf(totals.films, totals.genre.get(genre) ?? 1) * WEIGHT.genre,
        reason: `${genre}, like ${source.get(`genre:${genre}`)}`,
      });
    }

    const country = film.originCountry?.split(",")[0]?.trim();
    if (country) {
      const pull = affinity.country.get(country);
      if (pull) {
        push(film.id, {
          weight:
            pull *
            idf(totals.films, totals.country.get(country) ?? 1) *
            WEIGHT.country,
          reason: `From the same cinema as ${source.get(`country:${country}`)}`,
        });
      }
    }

    const decade = Math.floor(film.year / 10) * 10;
    const decadePull = affinity.decade.get(decade);
    if (decadePull && decadePull > 0) {
      push(film.id, {
        weight: decadePull * WEIGHT.decade,
        reason: `${decade}s, a decade you rate highly`,
      });
    }

    for (const [key, value] of [
      ["director", film.director],
      ["cinematographer", film.cinematographer],
      ["composer", film.composer],
    ] as const) {
      if (!value) continue;
      const pull = affinity[key].get(value);
      if (!pull) continue;

      const verb =
        key === "director"
          ? `Also directed by ${value}`
          : key === "cinematographer"
            ? `Shot by ${value}, like ${source.get(`${key}:${value}`)}`
            : `Scored by ${value}, like ${source.get(`${key}:${value}`)}`;

      push(film.id, {
        weight: pull * WEIGHT[key],
        reason: verb,
        personKey: `${key}:${value}`,
      });
    }

    for (const personId of castByFilm.get(film.id) ?? []) {
      const person = personPull.get(personId);
      if (!person) continue;
      push(film.id, {
        weight: person.weight * WEIGHT.cast,
        reason: `With ${person.name}, from ${person.from}`,
        personKey: `cast:${personId}`,
      });
    }
  }

  // Films the editorial graph found that the content scan did not return.
  const missing = [...listEntries.keys()].filter(
    (id) => !candidates.some((film) => film.id === id),
  );
  const extra =
    missing.length > 0
      ? await db.film.findMany({
          where: { id: { in: missing } },
          select: {
            id: true,
            slug: true,
            title: true,
            year: true,
            director: true,
            cinematographer: true,
            composer: true,
            genres: true,
            originCountry: true,
            posterUrl: true,
            criticScore: true,
            tmdbScore: true,
            reviewed: true,
          },
        })
      : [];

  const ranked = [...candidates, ...extra]
    .map((film) => {
      const parts = contributions.get(film.id) ?? [];
      if (parts.length === 0) return null;

      // No recommendation without a specific reason — see MIN_TOP.
      const best = Math.max(...parts.map((part) => part.weight));
      if (best < MIN_TOP) return null;

      // Diminishing returns: five weak reasons should not outrank one strong
      // one, or every film that is merely "a drama from the 2010s" wins.
      const sorted = [...parts].sort((a, b) => b.weight - a.weight);
      const total = sorted.reduce(
        (sum, part, index) => sum + part.weight / (index + 1),
        0,
      );
      const quality = ((film.criticScore ?? film.tmdbScore ?? 5) / 10) * WEIGHT.quality;

      return {
        ...film,
        genres: fromCsv(film.genres),
        score: round1(total + quality),
        reason: sorted[0].reason,
        listId: sorted[0].listId,
        personKey: sorted[0].personKey,
      };
    })
    .filter((film): film is NonNullable<typeof film> => film !== null)
    .sort((a, b) => b.score - a.score);

  const perDirector = new Map<string, number>();
  const perList = new Map<string, number>();
  const perPerson = new Map<string, number>();
  const listBudget = Math.ceil(take * LIST_SHARE);
  let fromLists = 0;
  const out: Recommendation[] = [];
  const passed = new Set<string>();

  const consider = (film: (typeof ranked)[number], allowList: boolean) => {
    if (passed.has(film.id)) return;

    const directorCount = perDirector.get(film.director) ?? 0;
    if (directorCount >= MAX_PER_DIRECTOR) return;

    const personCount = film.personKey ? (perPerson.get(film.personKey) ?? 0) : 0;
    if (film.personKey && personCount >= MAX_PER_PERSON) return;

    if (film.listId) {
      if (!allowList || fromLists >= listBudget) return;
      const listCount = perList.get(film.listId) ?? 0;
      if (listCount >= MAX_PER_LIST) return;
      perList.set(film.listId, listCount + 1);
      fromLists++;
    }

    perDirector.set(film.director, directorCount + 1);
    if (film.personKey) perPerson.set(film.personKey, personCount + 1);
    passed.add(film.id);
    out.push(strip(film));
  };

  // Two passes over the same ranking: the first spends the list budget and
  // fills everything else in order, the second tops up from whatever is left
  // if the wider catalogue could not supply enough.
  for (const film of ranked) {
    if (out.length >= take) break;
    consider(film, true);
  }
  for (const film of ranked) {
    if (out.length >= take) break;
    consider(film, false);
  }

  return out.slice(0, take);
}

/** How common each attribute is, which is what makes rarity meaningful. */
async function catalogueTotals() {
  const rows = await db.film.findMany({
    select: { genres: true, originCountry: true },
  });

  const genre = new Map<string, number>();
  const country = new Map<string, number>();

  for (const row of rows) {
    for (const value of fromCsv(row.genres)) {
      genre.set(value, (genre.get(value) ?? 0) + 1);
    }
    const home = row.originCountry?.split(",")[0]?.trim();
    if (home) country.set(home, (country.get(home) ?? 0) + 1);
  }

  return { films: rows.length, genre, country };
}

/** The editorial graph: films sharing a list with something they love. */
async function lovedListNeighbours(lovedIds: string[], seen: Set<string>) {
  const out = new Map<
    string,
    { weight: number; reason: string; listId: string }
  >();
  if (lovedIds.length === 0) return out;

  const entries = await db.listEntry.findMany({
    where: { filmId: { in: lovedIds } },
    select: {
      filmId: true,
      list: {
        select: {
          id: true,
          title: true,
          entries: { select: { filmId: true } },
        },
      },
    },
  });
  if (entries.length === 0) return out;

  const candidateIds = entries.flatMap((entry) =>
    entry.list.entries.map((row) => row.filmId),
  );
  const membership = new Map<string, number>();
  for (const row of await db.listEntry.groupBy({
    by: ["filmId"],
    where: { filmId: { in: candidateIds } },
    _count: { _all: true },
  })) {
    membership.set(row.filmId, row._count._all);
  }

  const sourceTitles = new Map(
    (
      await db.film.findMany({
        where: { id: { in: lovedIds } },
        select: { id: true, title: true },
      })
    ).map((film) => [film.id, film.title]),
  );

  for (const entry of entries) {
    for (const neighbour of entry.list.entries) {
      if (seen.has(neighbour.filmId)) continue;

      const weight = damp(membership.get(neighbour.filmId) ?? 1);
      const existing = out.get(neighbour.filmId);
      if (existing && existing.weight >= weight) continue;

      out.set(neighbour.filmId, {
        weight,
        reason: `With ${sourceTitles.get(entry.filmId)} in “${entry.list.title}”`,
        listId: entry.list.id,
      });
    }
  }

  return out;
}

/**
 * What to show somebody the recommender cannot read yet.
 *
 * Not a silent empty state and not a guess: the films this site has actually
 * written about, which is the honest answer to "we don't know you yet".
 */
export async function editorialPicks(take = 12) {
  const films = await db.film.findMany({
    where: { reviewed: true, criticScore: { not: null } },
    orderBy: { criticScore: "desc" },
    take,
    select: {
      id: true,
      slug: true,
      title: true,
      year: true,
      director: true,
      posterUrl: true,
      genres: true,
      criticScore: true,
      tmdbScore: true,
      reviewed: true,
    },
  });

  return films.map((film) => ({
    ...film,
    genres: fromCsv(film.genres),
    score: film.criticScore ?? 0,
    reason: "Written about by xine",
  }));
}
