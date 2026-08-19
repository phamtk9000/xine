/**
 * The XINE Seal — a curatorial tier stamped on a percentage, in the register
 * of a certification mark rather than a star rating or a tomato. Three
 * tiers, each with its own crest, and each meant equally for a film review
 * and a pitch deck: the same three words describe "this is exemplary craft"
 * whether the craft in question is a finished film or a plan to make one.
 *
 * The Seal is strictly an editorial verdict — it renders from XINE's own
 * critic score, never from the community average or an imported TMDB
 * number. Stamping a formal seal on a score xine didn't actually arrive at
 * editorially would say something false about how it was earned; see the
 * `reviewed` gate everywhere this is used.
 */

export type SealTier = "distinction" | "selection" | "revision";

export type SealMeta = {
  tier: SealTier;
  /** The crest's own name — what's printed next to it. */
  seal: string;
  /** The one- or two-word state, used in tighter spaces than `seal`. */
  status: string;
  review: string;
  deck: string;
};

export const SEAL_TIERS: Record<SealTier, SealMeta> = {
  distinction: {
    tier: "distinction",
    seal: "Seal of Distinction",
    status: "Distinguished",
    review:
      "Universal acclaim — exemplary craftsmanship across direction, narrative architecture and visual language.",
    deck: "Production-ready — elite market positioning, airtight budget logic, a singular creative vision.",
  },
  selection: {
    tier: "selection",
    seal: "Seal of Selection",
    status: "Selected",
    review:
      "Strongly recommended — a clear artistic voice or technical excellence despite minor flaws.",
    deck: "A strong foundation with high artistic potential — ready for development and talent attachment.",
  },
  revision: {
    tier: "revision",
    seal: "Seal of Revision",
    status: "Unsealed",
    review:
      "Mixed or negative consensus — lacks execution or narrative coherence.",
    deck: "Requires core development — narrative structure, visual tone or the business model needs work.",
  },
};

/** ≥85 Distinction, ≥60 Selection, else Revision. */
export function sealTier(percent: number): SealTier {
  if (percent >= 85) return "distinction";
  if (percent >= 60) return "selection";
  return "revision";
}

/** `null` in, `null` out — a film with no critic score has no seal to give it. */
export function sealFromScore(
  score: number | null | undefined,
): SealMeta | null {
  if (score === null || score === undefined) return null;
  return SEAL_TIERS[sealTier(Math.round(score * 10))];
}

export function toPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null;
  return Math.round(score * 10);
}

/**
 * The two weighting tables from the spec. These describe how an editor
 * should weigh a verdict, not a formula the app runs — XINE's own scores
 * come from the five-axis rating (Story, Direction, Visual, Performance,
 * Sound; see lib/scores.ts), which doesn't map one-to-one onto either list
 * below. Shown as the editorial standard, not wired to a calculation.
 */
export const CRITIC_PILLARS = [
  { label: "Narrative Architecture", weight: 30 },
  { label: "Visual / Spatial Language", weight: 30 },
  { label: "Sonic & Editing Pacing", weight: 20 },
  { label: "Cultural / Thematic Impact", weight: 20 },
] as const;

export const DECK_PILLARS = [
  { label: "High Concept & Premise", weight: 30 },
  { label: "Visual & Tone Proofs", weight: 25 },
  { label: "Target Audience & Market", weight: 25 },
  { label: "Production & Budget", weight: 20 },
] as const;
