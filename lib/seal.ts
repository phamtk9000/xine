/**
 * The XINE Frame — a curatorial tier stamped on a percentage, read at a
 * glance the way a film frame itself reads at a glance: clean, or damaged.
 *
 * Three ordinary tiers by score, and one rare fourth that isn't a score
 * band at all. XINE Select needs both a high score *and* enough editorial
 * voices behind it — a single five-star review isn't consensus, so a lone
 * glowing notice doesn't qualify a film for XINE's own distinction, however
 * high the number. That's the whole point of separating the symbol from
 * the number: the icon states a verdict (worth it / divisive / skip it /
 * XINE's own pick), and the percentage next to it states the degree. Asking
 * one glyph to represent a hundred possible scores is asking it to say
 * nothing.
 *
 * Strictly an editorial verdict — it renders from XINE's own critic score
 * on a film marked `reviewed`, never from the community average or an
 * imported TMDB number. See the `reviewed` gate everywhere this is used.
 */

export type SealTier = "select" | "frame" | "mixed" | "burnt";

export type SealMeta = {
  tier: SealTier;
  /** The tier's own name — what's printed next to it. */
  seal: string;
  /** The one- or two-word state, used in tighter spaces than `seal`. */
  status: string;
  review: string;
  deck: string;
};

export const SEAL_TIERS: Record<SealTier, SealMeta> = {
  select: {
    tier: "select",
    seal: "XINE Select",
    status: "Select",
    review:
      "XINE's own distinction — a high score backed by enough editorial voices to call it consensus, not just one enthusiastic review.",
    deck: "The deck equivalent of a green light — production-ready, with elite market positioning and a singular creative vision, judged by more than one reader.",
  },
  frame: {
    tier: "frame",
    seal: "Frame",
    status: "Worth Watching",
    review: "Worth watching.",
    deck: "A strong foundation with real potential — ready for development and talent attachment.",
  },
  mixed: {
    tier: "mixed",
    seal: "Mixed Frame",
    status: "Mixed",
    review: "Divisive, or a mixed reception.",
    deck: "Promising but uneven — parts of the pitch are ready, others need real work before it travels.",
  },
  burnt: {
    tier: "burnt",
    seal: "Burnt Frame",
    status: "Not Recommended",
    review: "Generally not recommended.",
    deck: "Requires core development — narrative structure, visual tone or the business model needs work.",
  },
};

/** Score and voice count together decide XINE Select — see the module note. */
const SELECT_MIN_PERCENT = 85;
const SELECT_MIN_REVIEWS = 2;

/**
 * Frame ≥70, Mixed Frame ≥50, else Burnt Frame — and Select only when the
 * score clears its own, higher bar *and* more than one review backs it.
 */
export function sealTier(percent: number, reviewCount = 0): SealTier {
  if (percent >= SELECT_MIN_PERCENT && reviewCount >= SELECT_MIN_REVIEWS) {
    return "select";
  }
  if (percent >= 70) return "frame";
  if (percent >= 50) return "mixed";
  return "burnt";
}

/** `null` in, `null` out — a film with no critic score has no tier to give it. */
export function sealFromScore(
  score: number | null | undefined,
  reviewCount = 0,
): SealMeta | null {
  if (score === null || score === undefined) return null;
  return SEAL_TIERS[sealTier(Math.round(score * 10), reviewCount)];
}

export function toPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null;
  return Math.round(score * 10);
}

/**
 * The two weighting tables from the original spec. These describe how an
 * editor should weigh a verdict, not a formula the app runs — XINE's own
 * scores come from the five-axis rating (Story, Direction, Visual,
 * Performance, Sound; see lib/scores.ts), which doesn't map one-to-one onto
 * either list below. Shown as the editorial standard, not wired to a
 * calculation.
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
