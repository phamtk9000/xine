import { AXES, dominantAxis, type AxisKey, type AxisScores } from "@/lib/scores";

/**
 * The viewer as a character.
 *
 * A taste profile that says "Visual 9.2, Story 8.4" is a readout, and nobody
 * recognises themselves in a readout. This turns the same numbers into
 * somebody — a figure with a name, a habit and a failing — because that is
 * the form a person will actually claim, argue with, and want to find other
 * people inside.
 *
 * Derived, never stored. Nobody picks their type and nothing here is written
 * back to the user, so it moves as taste moves and can't go stale or be
 * gamed. It is also honest about not knowing: under a handful of rated films
 * there is no figure, and the page says so rather than guessing.
 *
 * Pure — no database, no `server-only` — so pages, scripts and the agent can
 * all reach for the same reading.
 */

export type ArchetypeKey =
  | "archivist"
  | "draughtsman"
  | "colourist"
  | "confidant"
  | "listener"
  | "wanderer";

export type Archetype = {
  key: ArchetypeKey;
  /** The figure. */
  name: string;
  /** One line, in their own voice. */
  epithet: string;
  /** Who they are, second person. */
  blurb: string;
  /** What this taste costs them — every figure has one. */
  blindSpot: string;
  color: string;
  /** Emblem, drawn on a 24x24 grid with `stroke`, no fill. */
  glyph: string;
};

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  archivist: {
    key: "archivist",
    name: "The Archivist",
    epithet: "A film is a story or it is nothing.",
    blurb:
      "You reward construction. You can feel a second act sagging before you can say why, you remember endings for years, and you will forgive almost any ugliness in a film that knows where it is going.",
    blindSpot:
      "You have walked out on beautiful films for the crime of being shapeless.",
    color: "#c9a227",
    glyph: "M4 6h16M4 12h16M4 18h16M8 3v18",
  },
  draughtsman: {
    key: "draughtsman",
    name: "The Draughtsman",
    epithet: "You can tell where the camera was standing.",
    blurb:
      "You watch the hand behind the frame. Blocking, coverage, the decision to hold instead of cut — you rate the choices rather than the result, and a competent film made without any choices at all bores you more than a failed one.",
    blindSpot:
      "You mistake control for depth, and you over-reward a director who is merely tidy.",
    color: "#6c8ec9",
    glyph: "M12 3l8 18H4zM12 3v18",
  },
  colourist: {
    key: "colourist",
    name: "The Colourist",
    epithet: "You remember films as a set of colours.",
    blurb:
      "Image first, and no apology for it. You hold whole films in your head as light — a corridor, a coat, a particular green — and you would rather sit inside a gorgeous failure than watch a sensible film shot like a form.",
    blindSpot:
      "A film can look like that and mean nothing, and you will still be arguing for it.",
    color: "#b5588f",
    glyph: "M8 8a5 5 0 1 0 0 8 5 5 0 1 0 0-8M16 8a5 5 0 1 0 0 8 5 5 0 1 0 0-8",
  },
  confidant: {
    key: "confidant",
    name: "The Confidant",
    epithet: "You came for the face.",
    blurb:
      "You watch people. A performance that lands buys the film everything else — a slack script, a lazy frame — because you are there for the moment somebody stops acting and simply is, and you can name the shot where it happened.",
    blindSpot:
      "You will defend a bad film for two good minutes in the middle of it.",
    color: "#c96f4a",
    glyph: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M5 21c0-4 3.5-6 7-6s7 2 7 6",
  },
  listener: {
    key: "listener",
    name: "The Listener",
    epithet: "You hear the room before anyone speaks.",
    blurb:
      "Sound is where you live: score, silence, the texture of a space, the cut that lands a beat early. You notice mixing the way other people notice weather, and a film that treats its track as decoration has already lost you.",
    blindSpot:
      "You have called films profound when what moved you was a cello.",
    color: "#4a9d8f",
    glyph: "M4 12h2l2-6 3 14 3-11 2 5h4",
  },
  wanderer: {
    key: "wanderer",
    name: "The Wanderer",
    epithet: "No allegiance. You go where the projector points.",
    blurb:
      "Nothing dominates your scores, and that is the finding rather than the absence of one. You rate each film against what it was trying to be instead of against a standing preference, which makes you the hardest person here to predict and the best to take a recommendation from.",
    blindSpot:
      "Liking a bit of everything can be its own way of never committing.",
    color: "#8a8f98",
    glyph: "M12 2v20M2 12h20M6 6l12 12M18 6L6 18",
  },
};

const BY_AXIS: Record<AxisKey, ArchetypeKey> = {
  story: "archivist",
  direction: "draughtsman",
  visual: "colourist",
  performance: "confidant",
  sound: "listener",
};

/** Below this the axes are too level to call anyone anything. */
const LEAN_FLOOR = 0.25;
/** Fewer rated films than this and the reading is noise. */
export const MIN_RATINGS = 3;

export type Reading = {
  archetype: Archetype;
  /** How far the leading axis sits above the others. 0 for the Wanderer. */
  lean: number;
  /** A second line particular to this person, not to the type. */
  temper: string | null;
};

/**
 * Read a set of ratings as a figure.
 *
 * Returns null rather than defaulting to a type: an account with two ratings
 * has not told us anything, and inventing a personality for it would make
 * every other reading on the site less believable.
 */
export function readTaste(
  ratings: (AxisScores & { overall: number })[],
  context?: { years?: number[]; average?: number | null },
): Reading | null {
  if (ratings.length < MIN_RATINGS) return null;

  const filled = AXES.filter(({ key }) =>
    ratings.some((r) => typeof r[key] === "number"),
  );
  if (filled.length < 2) return null;

  const top = dominantAxis(ratings);
  const archetype =
    !top || top.lean < LEAN_FLOOR
      ? ARCHETYPES.wanderer
      : ARCHETYPES[BY_AXIS[top.key]];

  return {
    archetype,
    lean: archetype.key === "wanderer" ? 0 : (top?.lean ?? 0),
    temper: temper(ratings, context),
  };
}

/**
 * The part that is about this person rather than their type — era and
 * severity. Ordered so the more unusual observation wins; two people of the
 * same type should rarely read identically.
 */
function temper(
  ratings: { overall: number }[],
  context?: { years?: number[]; average?: number | null },
): string | null {
  const years = context?.years ?? [];
  const average = context?.average ?? null;

  if (years.length >= MIN_RATINGS) {
    const old = years.filter((y) => y < 1990).length / years.length;
    const recent = years.filter((y) => y >= 2015).length / years.length;
    if (old >= 0.5) return "You mostly watch backwards — half your record is older than 1990.";
    if (recent >= 0.75) return "You watch almost entirely in the present tense.";
    const span = Math.max(...years) - Math.min(...years);
    if (span >= 60) return `Your record spans ${span} years, which almost nobody's does.`;
  }

  if (average !== null) {
    if (average >= 8.5) return "You are a generous marker, and you know it.";
    if (average <= 6.5) return "You are hard to please, and the scores show it.";
  }
  return null;
}
