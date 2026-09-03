/**
 * What "working" means for a recommender, as arithmetic.
 *
 * Every one of these is computed from the event log and nothing else, which
 * is the point: a recommender's quality is not a matter of opinion once the
 * events are honest, and the arguments about ranking that cannot be settled
 * by looking are the ones nobody has instrumented.
 *
 * The north star is deliberately not click-through. A system optimised for
 * clicks learns to show films people will look at and not watch, which is the
 * failure mode of every streaming home page. What matters here is whether an
 * evening ended in a decision, and how many cards it took.
 *
 * Pure functions over plain rows, so the evaluation script and any future
 * dashboard read the same numbers rather than two implementations of them.
 */

export type EventRow = {
  sessionId: string;
  type: string;
  filmId: string | null;
  rank: number | null;
  score: number | null;
  reason: string | null;
  createdAt: Date;
};

export type SessionRow = {
  id: string;
  createdAt: Date;
  confidence: number;
  modelVersion: string;
};

export type FilmFacts = {
  id: string;
  director: string;
  country: string | null;
  year: number;
  genres: string[];
};

const POSITIVE = new Set(["interested", "save", "finalist_selected", "pick_for_me", "open"]);
const NEGATIVE = new Set(["not_tonight", "never"]);

export type Report = {
  sessions: number;
  events: number;
  /** Sessions that ended with the reader choosing something. */
  decided: number;
  decisionRate: number;
  /** Cards judged before the decision, averaged over decided sessions. */
  cardsToDecision: number | null;
  interestRate: number;
  neverRate: number;
  reasonsGiven: number;
  /** How much of the catalogue the recommender actually reaches. */
  coverage: number;
  /** Distinct directors, countries and decades per session, averaged. */
  diversity: { directors: number; countries: number; decades: number } | null;
  /** Films shown to the same reader more than once in a session. */
  repeatRate: number;
  topReasons: { reason: string; count: number }[];
};

export function evaluate(
  sessions: SessionRow[],
  events: EventRow[],
  films: Map<string, FilmFacts>,
  catalogueSize: number,
): Report {
  const bySession = new Map<string, EventRow[]>();
  for (const event of events) {
    const list = bySession.get(event.sessionId) ?? [];
    list.push(event);
    bySession.set(event.sessionId, list);
  }

  let decided = 0;
  let cardsBefore = 0;
  let positives = 0;
  let negatives = 0;
  let nevers = 0;
  let reasons = 0;
  let repeats = 0;
  let impressions = 0;

  const directors: number[] = [];
  const countries: number[] = [];
  const decades: number[] = [];
  const reached = new Set<string>();
  const reasonTally = new Map<string, number>();

  for (const [, list] of bySession) {
    const ordered = [...list].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const seen = new Set<string>();
    const sessionDirectors = new Set<string>();
    const sessionCountries = new Set<string>();
    const sessionDecades = new Set<number>();

    let judged = 0;
    let decidedAt: number | null = null;

    for (const event of ordered) {
      if (event.filmId) reached.add(event.filmId);

      if (event.type === "impression" && event.filmId) {
        impressions++;
        if (seen.has(event.filmId)) repeats++;
        seen.add(event.filmId);

        const film = films.get(event.filmId);
        if (film) {
          sessionDirectors.add(film.director);
          if (film.country) sessionCountries.add(film.country);
          sessionDecades.add(Math.floor(film.year / 10) * 10);
        }
      }

      if (NEGATIVE.has(event.type)) {
        judged++;
        negatives++;
        if (event.type === "never") nevers++;
      }
      if (event.type === "interested") {
        judged++;
        positives++;
      }
      if (event.type === "reason_selected") {
        reasons++;
        if (event.reason) {
          reasonTally.set(event.reason, (reasonTally.get(event.reason) ?? 0) + 1);
        }
      }

      // A decision is the end of the evening: they took one.
      if (decidedAt === null && POSITIVE.has(event.type) && event.type !== "interested") {
        decidedAt = judged;
      }
    }

    if (decidedAt !== null) {
      decided++;
      cardsBefore += decidedAt;
    }
    if (sessionDirectors.size > 0) {
      directors.push(sessionDirectors.size);
      countries.push(sessionCountries.size);
      decades.push(sessionDecades.size);
    }
  }

  const judgements = positives + negatives;
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    sessions: sessions.length,
    events: events.length,
    decided,
    decisionRate: sessions.length === 0 ? 0 : decided / sessions.length,
    cardsToDecision: decided === 0 ? null : cardsBefore / decided,
    interestRate: judgements === 0 ? 0 : positives / judgements,
    neverRate: judgements === 0 ? 0 : nevers / judgements,
    reasonsGiven: reasons,
    coverage: catalogueSize === 0 ? 0 : reached.size / catalogueSize,
    diversity:
      directors.length === 0
        ? null
        : {
            directors: mean(directors),
            countries: mean(countries),
            decades: mean(decades),
          },
    repeatRate: impressions === 0 ? 0 : repeats / impressions,
    topReasons: [...reasonTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  };
}

/**
 * Whether there is enough here to believe any of it.
 *
 * Reported rather than assumed, because the most dangerous output of an
 * evaluation harness is a confident number computed from nine events. Below
 * this, the report prints its figures and says plainly that they are noise.
 */
export function enough(report: Report) {
  return report.sessions >= 30 && report.events >= 300;
}
