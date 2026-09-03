import { clamp01, NEUTRAL, type Vector } from "@/lib/rec/dimensions";

/**
 * What a rejection actually said.
 *
 * A bare "not tonight" can only move every dimension a little, which is
 * another way of saying it moves nothing. "Too slow" names the dimension and
 * the direction, and one of those is worth a dozen of the other — which is
 * why the page asks, occasionally, and why the vocabulary is fixed rather
 * than free text: a list of nine reasons is a list of nine deltas, and free
 * text is a language model call on the critical path.
 *
 * Deltas are offsets applied to tonight's intent, not to the reader. Nothing
 * here touches a permanent profile; an evening where somebody wanted
 * something fast should not be remembered as a person who dislikes slowness.
 */

export const REASONS = [
  { key: "too-slow", label: "Too slow" },
  { key: "too-dark", label: "Too dark" },
  { key: "too-violent", label: "Too violent" },
  { key: "too-sentimental", label: "Too sentimental" },
  { key: "too-weird", label: "Too weird" },
  { key: "too-mainstream", label: "Too mainstream" },
  { key: "too-old", label: "Too old" },
  { key: "too-demanding", label: "Too demanding" },
  { key: "wrong-mood", label: "Wrong mood" },
  { key: "seen-similar", label: "Seen something too similar" },
] as const;

export type ReasonKey = (typeof REASONS)[number]["key"];

/** Where each reason pushes tonight, as offsets on the shared dimensions. */
const DELTAS: Record<ReasonKey, Vector> = {
  "too-slow": { pace: 0.22, tension: 0.1 },
  "too-dark": { darkness: -0.25, weight: -0.15 },
  "too-violent": { violence: -0.3, darkness: -0.1 },
  "too-sentimental": { romance: -0.2, weight: -0.18 },
  "too-weird": { weirdness: -0.28, accessibility: -0.18 },
  "too-mainstream": { familiarity: 0.25, weirdness: 0.12 },
  "too-old": {},
  "too-demanding": { accessibility: -0.25, weight: -0.15 },
  "wrong-mood": {},
  "seen-similar": {},
};

/**
 * A rejection with no reason still says something, just quietly.
 *
 * It nudges tonight away from whatever the refused film was strongest at —
 * the dimension furthest from the middle — because that is the most likely
 * thing the reader was reacting to. A tenth of the move a named reason gets.
 */
export function driftFromRejection(profile: Vector, reason?: ReasonKey | null): Vector {
  if (reason && DELTAS[reason]) {
    const named = DELTAS[reason];
    if (Object.keys(named).length > 0) return named;
  }

  let strongest: { key: keyof Vector; distance: number } | null = null;
  for (const [key, value] of Object.entries(profile)) {
    if (value === undefined) continue;
    const distance = Math.abs(value - NEUTRAL);
    if (!strongest || distance > strongest.distance) {
      strongest = { key: key as keyof Vector, distance };
    }
  }
  if (!strongest || strongest.distance < 0.15) return {};

  const value = profile[strongest.key] ?? NEUTRAL;
  return { [strongest.key]: value > NEUTRAL ? -0.08 : 0.08 } as Vector;
}

/** A keeper pulls tonight toward the film that earned it, gently. */
export function driftFromInterest(profile: Vector): Vector {
  const out: Vector = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value === undefined) continue;
    const distance = value - NEUTRAL;
    if (Math.abs(distance) < 0.15) continue;
    out[key as keyof Vector] = distance * 0.12;
  }
  return out;
}

/** Fold a set of offsets into the session's running drift. */
export function accumulate(drift: Vector, delta: Vector): Vector {
  const out: Vector = { ...drift };
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue;
    const k = key as keyof Vector;
    // Bounded: a session can move a dimension by at most a third, however
    // many times somebody presses the same button.
    out[k] = Math.max(-0.34, Math.min(0.34, (out[k] ?? 0) + value));
  }
  return out;
}

/** Tonight's intent, after everything said since it was parsed. */
export function applyDrift(soft: Vector, drift: Vector): Vector {
  const out: Vector = { ...soft };
  for (const [key, offset] of Object.entries(drift)) {
    if (offset === undefined) continue;
    const k = key as keyof Vector;
    out[k] = clamp01((out[k] ?? NEUTRAL) + offset);
  }
  return out;
}
