import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { memo, CATALOGUE_TTL } from "@/lib/memo";
import { deriveProfile, PROFILE_SELECT, type DeriveRow } from "@/lib/rec/derive";
import {
  DIMENSIONS,
  DIMENSION_KEYS,
  NEUTRAL,
  clamp01,
  similarity,
  type DimensionKey,
  type Vector,
} from "@/lib/rec/dimensions";
import { CLUSTERS, membership } from "@/lib/rec/clusters";
import { fromCsv } from "@/lib/serialize";

/**
 * The thing on the homepage that works out what you like.
 *
 * What was there before was a wall of the twenty-four most-voted films in the
 * catalogue and an average. Both halves were wrong. The wall was Avengers,
 * Avengers, Iron Man, Iron Man 3, Deadpool, Doctor Strange — five picks off
 * that board describe the same taste no matter which five you take, so the
 * reading could not be wrong and therefore could not be right either. And an
 * average of five vectors is not a reading; it is a mean with a headline on
 * it.
 *
 * This is an agent in the only sense that matters here: it holds a belief, it
 * knows which parts of that belief are weak, and it chooses what to ask next
 * in order to fix them. Every pick re-deals the board. The films it puts up
 * are the ones whose answer would move the belief furthest — and as the
 * belief firms up, the board slides from "what do you think of this" toward
 * "you are going to want this", so the last round is already a recommendation
 * and the reader can feel it happening.
 *
 * Where the language model sits, and where it does not:
 *
 *   Not here. The belief, the board, the traits, the suggestions and the
 *   confidence are arithmetic over the catalogue, reproducible, and the same
 *   with or without an API key. That is deliberate. A taste engine whose
 *   answers depend on whether a billing account is topped up is a demo.
 *
 *   The model writes. It is handed the picks and the measured traits and asked
 *   for a name and two sentences, and it may not mention a film it was not
 *   given. When there is no key, `derivedReading` writes them instead, from
 *   the same numbers — shorter, blunter, and honest.
 */

const MODEL = "claude-sonnet-5";

export const READING_PROMPT_VERSION = "taste-v1";

export function agentConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AgentFilm = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  posterUrl: string | null;
};

type PoolRow = AgentFilm & DeriveRow & { genres: string };
type PoolFilm = AgentFilm & { profile: Vector; genres: string[]; reach: number };

export type Belief = {
  dims: Vector;
  /** How much the picks agree about each dimension, 0–1. */
  confidence: Partial<Record<DimensionKey, number>>;
  /** Axes the reader stated outright, as opposed to ones read off the picks. */
  stated: DimensionKey[];
  picks: number;
};

export type Trait = {
  key: DimensionKey;
  label: string;
  /** Distance from the neutral middle, 0–1. */
  strength: number;
  confidence: number;
};

export type Reading = {
  name: string;
  body: string;
  source: "ai" | "derived";
};

export type Suggestion = {
  slug: string;
  title: string;
  year: number;
  posterUrl: string | null;
  why: string;
};

export type AgentTurn = {
  /** The next board, already re-dealt around what it now believes. */
  board: AgentFilm[];
  belief: Belief;
  traits: Trait[];
  /** What this board is testing, in a sentence. Null on the opening hand. */
  probe: string | null;
  cluster: { key: string; label: string; blurb: string } | null;
  reading: Reading | null;
  suggestions: Suggestion[];
  /** How much of this it would stand behind, 0–1. */
  certainty: number;
};

/* ---------------------------------------------------------------- pools -- */

/**
 * Two shelves, because "a film you love" means different things at different
 * points in the conversation.
 *
 * The popular shelf exists so the first board is answerable: nobody can tell
 * you their taste by looking at twenty-four films they have not seen. The deep
 * shelf exists so the last board is worth something — by the fifth pick the
 * agent knows enough to put up something with four hundred votes and be right
 * about it, and that moment is the entire argument for making an account.
 */

const POOL_SELECT = {
  id: true,
  slug: true,
  title: true,
  director: true,
  posterUrl: true,
  ...PROFILE_SELECT,
} as const;

async function loadPool(tier: "popular" | "deep"): Promise<PoolRow[]> {
  if (tier === "popular") {
    return db.film.findMany({
      where: { kind: "film", posterUrl: { not: null }, tmdbVotes: { gte: 2500 } },
      orderBy: { tmdbVotes: "desc" },
      take: 1600,
      select: POOL_SELECT,
    });
  }
  // Well-liked and under-seen. The vote floor is a recognisability floor in
  // reverse: below about three hundred votes the derived profile is being
  // computed from too little, and a confident reading off noise is the one
  // failure mode a taste engine cannot recover from.
  return db.film.findMany({
    where: {
      kind: "film",
      posterUrl: { not: null },
      tmdbVotes: { gte: 350, lt: 2500 },
      tmdbScore: { gte: 6.6 },
    },
    orderBy: { tmdbScore: "desc" },
    take: 1600,
    select: POOL_SELECT,
  });
}

async function pool(tier: "popular" | "deep"): Promise<PoolFilm[]> {
  const rows = await memo(`taste-agent-pool-${tier}`, CATALOGUE_TTL, () => loadPool(tier));
  return rows.map((row) => {
  const profile = deriveProfile(row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    director: row.director,
    posterUrl: row.posterUrl,
    genres: fromCsv(row.genres),
    profile,
    // The derivation already worked out how widely seen this is; reading it
    // back beats recomputing a second popularity scale that disagrees.
    reach: 1 - (profile.familiarity ?? 0.5),
  };
  });
}

/**
 * How alike two films are, flatly, over everything.
 *
 * Distinct from `similarity` in dimensions.ts, which answers "does this film
 * match what was asked for" and weights by how strongly each axis was asked
 * about. Here nothing has been asked for: the question is whether two posters
 * on the same board are the same question twice.
 */
function closeness(a: Vector, b: Vector, over: DimensionKey[] = DIMENSION_KEYS): number {
  const keys = over.length > 0 ? over : DIMENSION_KEYS;
  let total = 0;
  for (const key of keys) {
    total += Math.abs((a[key] ?? NEUTRAL) - (b[key] ?? NEUTRAL));
  }
  return 1 - total / keys.length;
}

/* --------------------------------------------------------------- belief -- */

/**
 * What five posters are evidence of.
 *
 * A dimension counts as known when the picks *agree* about it, which is not
 * the same as the mean being far from the middle. Five films averaging 0.5 on
 * humour because two are farces and three are funerals is the loudest signal
 * on the board and a mean alone throws it away — so spread is measured, and
 * a wide spread costs confidence rather than reading as indifference.
 */
export function believe(profiles: Vector[], stated: Vector = {}): Belief {
  const dims: Vector = {};
  const confidence: Belief["confidence"] = {};

  for (const key of DIMENSION_KEYS) {
    // Skipped, because this board decides it rather than the reader. The
    // opening shelf has a vote floor on it — it has to, nobody can describe
    // their taste using films they have not seen — so every reading came back
    // led by "Mainstream", at high confidence, no matter what was clicked.
    // That is not an observation about a person. It is the shelf reading
    // itself back.
    if (SHELF_DETERMINED.has(key)) continue;
    // Missing counts as neutral, and getting this wrong was a real bug rather
    // than a nicety. `deriveProfile` writes a dimension only when something
    // pulls on it — humour is set for a comedy and simply absent for a war
    // film — so filtering the absent ones out meant five picks containing one
    // comedy were read as unanimously funny, at high confidence, because the
    // comedy was the only vote counted. A film with no opinion about humour
    // is not abstaining. It is unfunny.
    const values = profiles.map((profile) => profile[key] ?? NEUTRAL);
    if (values.length === 0) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.sqrt(
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length,
    );

    // A standard deviation of 0.22 across five picks is no agreement at all.
    const agreement = clamp01(1 - spread / 0.22);
    const strength = Math.abs(mean - NEUTRAL) * 2;
    // Two picks cannot know much, however neatly they line up.
    const evidence = values.length / (values.length + 1.5);

    dims[key] = mean;
    confidence[key] = strength * agreement * evidence;
  }

  // Anything said in words outranks anything inferred from artwork. Somebody
  // who types "but I hate horror" after picking five thrillers has told us
  // more in four words than the five posters did.
  const spoken: DimensionKey[] = [];
  for (const [key, value] of Object.entries(stated)) {
    if (value === undefined) continue;
    dims[key as DimensionKey] = clamp01(value);
    confidence[key as DimensionKey] = 0.95;
    spoken.push(key as DimensionKey);
  }

  return { dims, confidence, stated: spoken, picks: profiles.length };
}

/** Dimensions the primer cannot learn anything about, because it sets them. */
const SHELF_DETERMINED = new Set<DimensionKey>(["familiarity"]);

/** The part of a belief worth ranking on: the dimensions it is sure about. */
function convictions(belief: Belief, floor = 0.2): Vector {
  const out: Vector = {};
  for (const key of DIMENSION_KEYS) {
    if ((belief.confidence[key] ?? 0) < floor) continue;
    out[key] = belief.dims[key];
  }
  return out;
}

/**
 * How a leaning is named when it is being said about a person.
 *
 * DIMENSIONS labels its ends for a slider, where the axis is written above
 * the control and "Central" or "None" is unambiguous. Pulled out and stacked
 * in a list of what somebody is like, those same words read as nonsense —
 * "you lean funny and central" — so the trait rows get their own vocabulary.
 */
const PHRASES: Record<DimensionKey, { low: string; high: string }> = {
  pace: { low: "Patient", high: "Fast-moving" },
  weight: { low: "Light", high: "Heavy" },
  accessibility: { low: "Easy to watch", high: "Demanding" },
  realism: { low: "Grounded", high: "Fantastical" },
  dialogue: { low: "Told in images", high: "Talky" },
  story: { low: "Character-led", high: "Plot-driven" },
  darkness: { low: "Warm", high: "Bleak" },
  familiarity: { low: "Mainstream", high: "Off the beaten track" },
  weirdness: { low: "Classical", high: "Strange" },
  beauty: { low: "Plain", high: "Beautiful" },
  humour: { low: "Straight-faced", high: "Funny" },
  tension: { low: "Calm", high: "Tense" },
  romance: { low: "Unromantic", high: "Romantic" },
  violence: { low: "Bloodless", high: "Violent" },
};

export function traitsFrom(belief: Belief, take = 5): Trait[] {
  const rows: Trait[] = [];
  for (const dimension of DIMENSIONS) {
    const value = belief.dims[dimension.key];
    const confidence = belief.confidence[dimension.key] ?? 0;
    if (value === undefined || confidence < 0.12) continue;
    rows.push({
      key: dimension.key,
      label: PHRASES[dimension.key][value >= NEUTRAL ? "high" : "low"],
      strength: Math.abs(value - NEUTRAL) * 2,
      confidence,
    });
  }
  return rows.sort((a, b) => b.confidence - a.confidence).slice(0, take);
}

export function certaintyOf(belief: Belief): number {
  const values = DIMENSION_KEYS.map((key) => belief.confidence[key] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 5);
  if (values.length === 0) return 0;
  return clamp01(values.reduce((a, b) => a + b, 0) / values.length);
}

/* ---------------------------------------------------------------- board -- */

/**
 * The handful of things this board is actually trying to find out.
 *
 * Scoring informativeness across all fourteen dimensions at once does not
 * produce an informative board, it produces a board of oddities: films far
 * from the middle on everything simultaneously. In this catalogue that corner
 * is animated family cinema — very light, very warm, very unreal — so a
 * general "how unusual is this film" score returned the Grinch, Garfield,
 * Minions and the Croods, over and over, whatever had been picked.
 *
 * Narrowing to the three least-settled axes turns the board back into a
 * question. A hand that spans *bleak to warm* teaches the agent something
 * about darkness; a hand of sixteen films that are all unusual in the same
 * direction teaches it nothing and looks, to the reader, like the site has
 * stopped listening.
 */
function openQuestions(belief: Belief, take = 3): DimensionKey[] {
  if (belief.picks === 0) return [];
  return DIMENSION_KEYS.filter((key) => !SHELF_DETERMINED.has(key))
    .map((key) => ({ key, confidence: belief.confidence[key] ?? 0 }))
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, take)
    .map((row) => row.key);
}

/**
 * The next question, expressed as sixteen posters.
 *
 * Two forces, traded off by how far in we are. Early, a film is worth showing
 * when its answer would be informative — far from the current belief on the
 * axes that belief is least sure about. Late, a film is worth showing when it
 * *fits*, because by then the useful thing is not another question but a
 * demonstration that the agent has been listening.
 *
 * Then a third force over the top of both, and it turned out to be the one
 * that mattered. Scoring films independently and taking the best sixteen
 * produced an opening board of sixteen animated family films — every one of
 * them a long way from neutral on darkness, weight and realism, so every one
 * of them "informative", and collectively a board that asks one question
 * sixteen times. So the hand is built greedily and each seat is scored
 * against the seats already filled: a film has to be worth showing *and* not
 * already represented. That is the difference between sixteen good candidates
 * and a good board.
 */
function chooseBoard(
  films: PoolFilm[],
  belief: Belief,
  exclude: Set<string>,
  size: number,
): AgentFilm[] {
  const settled = Math.min(1, belief.picks / 5);
  const want = convictions(belief);
  const asking = openQuestions(belief);

  const scored = films
    .filter((film) => !exclude.has(film.id))
    .map((film) => {
      let informative = 0;
      for (const key of asking) {
        informative += Math.abs((film.profile[key] ?? NEUTRAL) - (belief.dims[key] ?? NEUTRAL));
      }
      informative = asking.length === 0 ? 0.5 : informative / asking.length;
      const fit = similarity(want, film.profile);

      // Nothing is known yet, so nothing can be informative yet — the opening
      // hand is scored on recognition alone and spread out by the pass below.
      // Films nobody has seen make a beautiful board and a useless question.
      const base =
        belief.picks === 0
          ? film.reach
          : (1 - settled) * informative + settled * fit;

      return { film, base };
    })
    // Greedy selection over everything is quadratic in the pool; over the
    // best few hundred it is free and the answer is the same.
    .sort((a, b) => b.base - a.base)
    .slice(0, 320);

  // How hard to push for a varied board. Hardest at the start, when the whole
  // point is coverage; softened later, when converging is the correct thing
  // to be doing.
  const spread = belief.picks === 0 ? 0.9 : 0.45;

  const taken: PoolFilm[] = [];
  const chosen = new Set<string>();
  const directors = new Set<string>();
  const genreCount = new Map<string, number>();
  const genreCap = Math.max(2, Math.round(size / 5));

  // The variety rules are preferences, not laws. Enforced absolutely they
  // returned boards of eight and nine posters, because between the genre cap,
  // the one-per-director rule and a bounded candidate list there was simply
  // nothing left to seat — and a half-empty grid reads as a bug, not as
  // restraint. So they are relaxed one at a time until the hand is full.
  for (const relax of [0, 1, 2] as const) {
    while (taken.length < size) {
      let best: { film: PoolFilm; value: number } | null = null;

      for (const row of scored) {
        const film = row.film;
        if (chosen.has(film.id)) continue;
        if (relax < 2 && directors.has(film.director)) continue;
        // Every genre counts against the cap, not just the first one listed.
        // Capping on the lead genre alone let a board fill with Kung Fu Panda,
        // Minions, Spy Kids and PAW Patrol — sixteen films that are obviously
        // one thing, filed under six different lead genres.
        if (relax < 1 && film.genres.some((genre) => (genreCount.get(genre) ?? 0) >= genreCap)) {
          continue;
        }

        // Crowding over both the axes being probed and the film as a whole.
        // The probe axes alone were too forgiving: two sequels that differ
        // slightly on pace are not two different questions, whatever the
        // question of the round happens to be.
        let crowding = 0;
        for (const seated of taken) {
          crowding = Math.max(
            crowding,
            0.5 * closeness(seated.profile, film.profile, asking) +
              0.5 * closeness(seated.profile, film.profile),
          );
        }

        const value = row.base - spread * crowding;
        if (!best || value > best.value) best = { film, value };
      }

      if (!best) break;
      taken.push(best.film);
      chosen.add(best.film.id);
      directors.add(best.film.director);
      for (const genre of best.film.genres) {
        genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
      }
    }
    if (taken.length >= size) break;
  }

  return taken.map((film) => ({
    id: film.id,
    slug: film.slug,
    title: film.title,
    year: film.year,
    director: film.director,
    posterUrl: film.posterUrl,
  }));
}

/** What the current board is trying to find out. */
function probeFor(belief: Belief): string | null {
  if (belief.picks === 0) return null;

  const [key] = openQuestions(belief, 1);
  if (!key || (belief.confidence[key] ?? 0) >= 0.4) {
    return "Narrowing in — these are the ones it thinks you'd take.";
  }

  const dimension = DIMENSIONS.find((row) => row.key === key)!;
  return `Still undecided about you: ${dimension.low.toLowerCase()}, or ${dimension.high.toLowerCase()}?`;
}

/* ---------------------------------------------------------- suggestions -- */

/**
 * Two or three films that follow from the picks, each with the pick it came
 * from named.
 *
 * Neighbours rather than a fresh ranking, and the provenance is shown, because
 * the point of this panel is not to be useful — it is to be *checkable*. A
 * reader who can see that Burning arrived because they took Parasite has been
 * given a reason to believe the next thing the site tells them.
 */
async function suggestFrom(
  pickIds: string[],
  belief: Belief,
  titles: Map<string, string>,
  take = 3,
): Promise<Suggestion[]> {
  if (pickIds.length === 0) return [];

  const rows = await db.filmNeighbour.findMany({
    where: { filmId: { in: pickIds }, neighbourId: { notIn: pickIds } },
    orderBy: { score: "desc" },
    take: 80,
    select: {
      score: true,
      filmId: true,
      neighbour: { select: { ...POOL_SELECT } },
    },
  });

  const want = convictions(belief);
  const best = new Map<string, { row: (typeof rows)[number]; score: number; profile: Vector }>();

  for (const row of rows) {
    if (!row.neighbour.posterUrl) continue;
    // A floor, because the neighbour graph is a similarity graph and nothing
    // else. Push the belief hard toward "light" and the nearest light film to
    // a Korean thriller turns out to be 2-Headed Shark Attack, which is a
    // correct answer to the question asked and a terrible thing to put in
    // front of somebody as the first recommendation this site ever made them.
    const rating = row.neighbour.criticScore ?? row.neighbour.tmdbScore ?? 0;
    if (row.neighbour.tmdbVotes < 500 || rating < 6.2) continue;
    const profile = deriveProfile(row.neighbour);
    // Half "close to something you chose", half "matches what you are".
    const score = row.score * 0.5 + similarity(want, profile) * 0.5;
    const seen = best.get(row.neighbour.id);
    if (!seen || score > seen.score) best.set(row.neighbour.id, { row, score, profile });
  }

  const directors = new Set<string>();
  const sources = new Set<string>();
  const spent = new Set<DimensionKey>();
  const traits = traitsFrom(belief);
  const out: Suggestion[] = [];

  const ranked = [...best.values()].sort((a, b) => b.score - a.score);

  // Two passes. The first insists each suggestion comes from a different one
  // of their picks — three films all descended from the same poster is a list
  // that has understood one fifth of what it was told. The second fills any
  // remaining slot without that rule rather than returning short.
  for (const strict of [true, false]) {
    for (const entry of ranked) {
      if (out.length >= take) break;
      const film = entry.row.neighbour;
      if (directors.has(film.director)) continue;
      if (strict && sources.has(entry.row.filmId)) continue;
      if (out.some((row) => row.slug === film.slug)) continue;
      // Not the same franchise. Answering "you took Resident Evil: Afterlife"
      // with "so try Resident Evil" is technically the nearest film in the
      // catalogue and tells the reader nothing they did not already know.
      if (sameFranchise(titles.get(entry.row.filmId), film.title)) continue;

      directors.add(film.director);
      sources.add(entry.row.filmId);

      // The trait quoted has to be one this film actually has, or the reason
      // is decoration — a tense recommendation explained by "and it is funny
      // too" is worse than no explanation. And a trait already spent on an
      // earlier row is skipped where possible, because three suggestions that
      // all end "and this is heavy too" read as one sentence with the titles
      // swapped.
      const matches = traits.filter((trait) => {
        const mine = belief.dims[trait.key];
        const theirs = entry.profile[trait.key];
        return mine !== undefined && theirs !== undefined && Math.abs(mine - theirs) < 0.16;
      });
      const shared = matches.find((trait) => !spent.has(trait.key)) ?? matches[0];
      if (shared) spent.add(shared.key);

      const source = titles.get(entry.row.filmId);
      const why = source
        ? `Because you took ${source}${shared ? `, and this is ${shared.label.toLowerCase()} too` : ""}.`
        : "Close to the shape of your five.";

      out.push({ slug: film.slug, title: film.title, year: film.year, posterUrl: film.posterUrl, why });
    }
  }

  return out;
}

/** Two titles from the same series, near enough. */
function sameFranchise(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const clean = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const left = clean(a);
  const right = clean(b);
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 6 && longer.startsWith(shorter);
}

/* -------------------------------------------------------------- reading -- */

/** A name for a taste that leans a given way. The no-key vocabulary. */
const NAMES: Record<DimensionKey, { low: string; high: string }> = {
  pace: { low: "The Long Take", high: "No Time to Sit Down" },
  weight: { low: "Light on Its Feet", high: "The Heavy Stuff" },
  accessibility: { low: "Straight Down the Middle", high: "The Difficult Shelf" },
  realism: { low: "The Real World", high: "Somewhere Else Entirely" },
  dialogue: { low: "Show, Don't Tell", high: "People Talking" },
  story: { low: "People Over Plot", high: "The Machinery of Plot" },
  darkness: { low: "The Warm Shelf", high: "The Dark Shelf" },
  familiarity: { low: "Front of House", high: "The Back Catalogue" },
  weirdness: { low: "Classical Form", high: "The Strange Ones" },
  beauty: { low: "Function Over Frame", high: "Made to Be Looked At" },
  humour: { low: "No Jokes", high: "Funny First" },
  tension: { low: "Nothing to Fear", high: "Nerve Endings" },
  romance: { low: "Nothing Romantic", high: "The Love Stories" },
  violence: { low: "Bloodless", high: "Blood on the Floor" },
};

type PickSummary = {
  title: string;
  year: number;
  director: string;
  genres: string[];
  profile: Vector;
};

/**
 * The reading, without a model.
 *
 * Not a placeholder. It names the agreement, names the film that breaks it,
 * and stops — which is more than most recommender copy does, and it is all
 * true of the numbers. The outlier is the good part: five films that agree
 * about everything describe a genre, and the one that does not is where a
 * taste actually lives.
 */
function derivedReading(
  picks: PickSummary[],
  belief: Belief,
  traits: Trait[],
  cluster: { label: string; blurb: string } | null,
): Reading {
  const lead = traits[0];
  const name = cluster?.label ?? (lead ? NAMES[lead.key][belief.dims[lead.key]! >= NEUTRAL ? "high" : "low"] : "Still Reading");

  const want = convictions(belief);
  const ranked = [...picks].sort(
    (a, b) => similarity(want, a.profile) - similarity(want, b.profile),
  );
  const outlier = ranked[0];

  // Split the evidence by where it came from. Reporting a typed instruction
  // back as something "your picks agree about" is a small lie that the reader
  // can catch immediately — they know what they clicked and what they wrote —
  // and it costs more trust than the sentence is worth.
  const spoken = new Set(belief.stated);
  const inferred = traits
    .filter((trait) => !spoken.has(trait.key))
    .slice(0, 2)
    .map((trait) => trait.label.toLowerCase());
  const asked = traits
    .filter((trait) => spoken.has(trait.key))
    .slice(0, 2)
    .map((trait) => trait.label.toLowerCase());

  const opening =
    inferred.length >= 2
      ? `Your picks agree about two things: ${inferred[0]} and ${inferred[1]}.`
      : inferred.length === 1
        ? `The one thing your picks agree about is that they are ${inferred[0]}.`
        : "Your picks do not agree about much, which is its own kind of answer.";

  const stated =
    asked.length > 0
      ? ` You asked for ${asked.join(" and ")}, and that has been taken as given.`
      : "";

  const closing =
    picks.length >= 3 && outlier
      ? ` ${outlier.title} is the one that breaks the pattern, which is usually the half worth following.`
      : "";

  return { name, body: opening + stated + closing, source: "derived" };
}

const readingSchema = z.object({
  name: z.string().trim().min(2).max(44),
  body: z.string().trim().min(20).max(420),
});

const SYSTEM = `You name a reader's taste in film, from evidence you are given. You are not a recommender and you never suggest a film.

You receive the films they chose and the traits measured from those films. Write:
- a name for the taste: 2 to 4 words, title case, no colon, no subtitle, not a genre name and not the title of one of their films.
- a body of at most two sentences that says what the five have in common and, if there is one, what the odd one out changes about that reading.

Rules:
- Never mention a film that is not in the list you were given.
- Never invent a fact about a film. You may use only the title, year, director, genres and traits provided.
- Do not flatter and do not congratulate. "Great taste" is not an observation.
- Do not mention scores, percentages, algorithms, or this system.
- Write plainly. No metaphors about journeys, palettes, or cinematic voices.`;

/**
 * The written reading. Model if there is one, arithmetic if there is not, and
 * the fallback is used for anything the schema will not accept — a name with a
 * colon in it, a body that ran to five sentences, an empty tool call.
 */
export async function readTaste(
  picks: PickSummary[],
  belief: Belief,
  traits: Trait[],
  cluster: { label: string; blurb: string } | null,
): Promise<Reading> {
  const fallback = derivedReading(picks, belief, traits, cluster);
  if (!agentConfigured() || picks.length === 0) return fallback;

  const evidence = {
    films: picks.map((pick) => ({
      title: pick.title,
      year: pick.year,
      director: pick.director,
      genres: pick.genres,
    })),
    traits: traits.map((trait) => ({
      trait: trait.label,
      confidence: Number(trait.confidence.toFixed(2)),
    })),
    cluster: cluster?.label ?? null,
  };

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      tools: [
        {
          name: "reading",
          description: "Return the name and body of the reading.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string", description: "2 to 4 words, title case." },
              body: { type: "string", description: "At most two sentences." },
            },
            required: ["name", "body"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "reading" },
      messages: [{ role: "user", content: JSON.stringify(evidence) }],
    });

    const block = response.content.find((part) => part.type === "tool_use");
    if (!block || block.type !== "tool_use") return fallback;

    const parsed = readingSchema.safeParse(block.input);
    if (!parsed.success) return fallback;

    // The model is allowed to phrase the reading. It is not allowed to name a
    // film, so anything that is not one of theirs disqualifies the whole
    // answer rather than being edited out — a sentence built around a film
    // that was never on the board does not survive having it removed.
    const allowed = picks.map((pick) => pick.title.toLowerCase());
    const body = parsed.data.body.toLowerCase();
    const invented = /"([^"]{2,60})"|“([^”]{2,60})”/g;
    for (const match of body.matchAll(invented)) {
      const quoted = (match[1] ?? match[2] ?? "").trim();
      if (quoted && !allowed.some((title) => title.includes(quoted) || quoted.includes(title))) {
        return fallback;
      }
    }

    return { name: parsed.data.name, body: parsed.data.body, source: "ai" };
  } catch (error) {
    // Visible in the logs on purpose. A silent fallback is how an expired key
    // survives for a month while everybody assumes the copy is just flat.
    console.warn("[taste-agent] falling back to derived reading:", (error as Error).message);
    return fallback;
  }
}

/* ----------------------------------------------------------------- turn -- */

/**
 * One move: read everything so far, then deal the next board.
 *
 * Stateless. The whole conversation is the list of ids that were picked plus
 * anything typed, both of which live in the browser — no session row, no
 * cookie, and nothing written to anybody's account until they ask for it. A
 * primer that quietly rates five films for a signed-in reader is a primer
 * that has to be explained afterwards.
 */
export async function agentTurn(options: {
  picked: string[];
  shown: string[];
  stated?: Vector;
  boardSize?: number;
  needed?: number;
}): Promise<AgentTurn> {
  const picked = [...new Set(options.picked)].slice(0, 8);
  const needed = options.needed ?? 5;
  const size = options.boardSize ?? 16;
  const done = picked.length >= needed;

  const rows =
    picked.length > 0
      ? await db.film.findMany({ where: { id: { in: picked } }, select: POOL_SELECT })
      : [];

  const summaries: PickSummary[] = rows.map((row) => ({
    title: row.title,
    year: row.year,
    director: row.director,
    genres: fromCsv(row.genres),
    profile: deriveProfile(row),
  }));

  const belief = believe(
    summaries.map((summary) => summary.profile),
    options.stated ?? {},
  );
  const traits = traitsFrom(belief);

  const best = CLUSTERS.map((cluster) => ({ cluster, fit: membership(belief.dims, cluster) })).sort(
    (a, b) => b.fit - a.fit,
  )[0];
  const cluster =
    best && best.fit >= 0.45
      ? { key: best.cluster.key, label: best.cluster.label, blurb: best.cluster.blurb }
      : null;

  // The shelf deepens as the belief firms up: the opening hand has to be
  // answerable, the closing one has to be worth something.
  const tiers: ("popular" | "deep")[] = belief.picks >= 3 ? ["popular", "deep"] : ["popular"];
  const shelves = await Promise.all(tiers.map(pool));
  const films = shelves.flat();

  const exclude = new Set([...picked, ...options.shown]);
  const board = done ? [] : chooseBoard(films, belief, exclude, size);

  const [reading, suggestions] = done
    ? await Promise.all([
        readTaste(summaries, belief, traits, cluster),
        suggestFrom(
          picked,
          belief,
          new Map(rows.map((row) => [row.id, row.title])),
        ),
      ])
    : [null, []];

  return {
    board,
    belief,
    traits,
    probe: done ? null : probeFor(belief),
    cluster,
    reading,
    suggestions,
    certainty: certaintyOf(belief),
  };
}
