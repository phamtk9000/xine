/**
 * Starting points and conversation shape.
 *
 * A blank box is a hard ask — most people don't know what they want until they
 * see options. So the entry point is a set of starters that compose a plain
 * sentence into the input, which the reader can then edit or ignore entirely.
 * After the first exchange it is an ordinary conversation, because refining a
 * recommendation is where the real signal is.
 */

export type Turn = {
  role: "user" | "assistant";
  text: string;
};

export const STARTERS = [
  {
    key: "visual",
    label: "Something that looks extraordinary",
    aside: "Plot can be thin. I want to stare at it.",
    prompt:
      "I want something that looks extraordinary. The plot can be thin — I mostly want to stare at it.",
  },
  {
    key: "gutted",
    label: "I want to be gutted",
    aside: "Emotionally devastating. I'll cope.",
    prompt:
      "I want to be emotionally gutted. Something devastating, with an ending that doesn't hand me any comfort.",
  },
  {
    key: "sound",
    label: "Unrecognisable with the sound off",
    aside: "Score and sound design doing the work.",
    prompt:
      "I want a film where the sound design and score are doing the heavy lifting — something that would be unrecognisable muted.",
  },
  {
    key: "unnerved",
    label: "Leave me unnerved",
    aside: "Dread over jump scares.",
    prompt:
      "I want to be unnerved. Slow dread and atmosphere rather than jump scares or gore.",
  },
  {
    key: "laugh",
    label: "Funny about terrible people",
    aside: "Comedy with no moral at the end.",
    prompt:
      "I want something funny about genuinely terrible people — a comedy that refuses to punish or redeem them at the end.",
  },
  {
    key: "slow",
    label: "Slow, quiet, patient",
    aside: "Let it take its time.",
    prompt:
      "I want something slow, quiet and patient. Long takes, no hurry, duration as part of the point.",
  },
  {
    key: "puzzle",
    label: "Keep me guessing",
    aside: "Ambiguity I'll argue about after.",
    prompt:
      "I want something ambiguous that keeps me guessing — an ending I'll still be arguing about afterwards.",
  },
  {
    key: "like",
    label: "Something like…",
    aside: "Start from a film I already love.",
    prompt: "I want something like ",
  },
] as const;

export const CONSTRAINTS = [
  { key: "short", label: "Under 100 minutes", clause: "under 100 minutes" },
  { key: "long", label: "I have all evening", clause: "happy with a long one" },
  { key: "sea", label: "Southeast Asian", clause: "Southeast Asian" },
  { key: "classic", label: "Made before 2000", clause: "made before 2000" },
  { key: "recent", label: "Last five years", clause: "from the last five years" },
  { key: "subtitled", label: "Not in English", clause: "not in English" },
] as const;

export function getStarter(key: string) {
  return STARTERS.find((s) => s.key === key) ?? null;
}

export function getConstraint(key: string) {
  return CONSTRAINTS.find((c) => c.key === key) ?? null;
}

/** Turns the picked chips into a clause the reader can see and edit. */
export function constraintClause(keys: string[]): string {
  const clauses = keys
    .map(getConstraint)
    .filter((c): c is (typeof CONSTRAINTS)[number] => c !== null)
    .map((c) => c.clause);

  if (clauses.length === 0) return "";
  if (clauses.length === 1) return `Ideally ${clauses[0]}.`;
  const last = clauses.pop();
  return `Ideally ${clauses.join(", ")} and ${last}.`;
}

/**
 * A compact record of what was recommended, replayed as the assistant turn on
 * the next request. Keeping the transcript small keeps the prompt cheap and
 * keeps internal scoring out of the history entirely.
 */
export function summariseRecommendations(
  picks: { id: string; title: string; matchScore: number }[],
  finalPick: { id: string } | null,
): string {
  if (picks.length === 0) return "I had nothing strong to offer.";
  const listed = picks
    .map((p) => `${p.title} [${p.id}] (${p.matchScore}%)`)
    .join(", ");
  const final = finalPick ? ` Top pick: ${finalPick.id}.` : "";
  return `I recommended: ${listed}.${final}`;
}
