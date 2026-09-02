import { Tag } from "@/components/ui";
import {
  SEAL_TIERS,
  TIER_COLOR,
  sealTier,
  toPercent,
  type SealTier,
} from "@/lib/seal";

/**
 * The crest itself — four corner brackets, like a viewfinder or a strip of
 * film held up to the light. A circular seal reads as generic certification;
 * a frame reads as cinema specifically, and the four states are all
 * variations on the one idea of a frame's condition rather than four
 * unrelated glyphs:
 *
 *   XINE Select — every corner solid, a small mark inside. The pristine cut.
 *   Frame       — every corner solid. Clean, unremarkable, intact.
 *   Mixed Frame — half the corners faded. The frame is only half formed.
 *   Burnt Frame — two corners left, and a crack through the middle.
 *
 * Structural, not just recolours of one shape, so the verdict still reads
 * at 18px on a poster grid where neither the exact colour nor a caption is
 * legible. Colour still carries real weight, though — every tier gets its
 * own hue from TIER_COLOR (lib/seal.ts) at a stroke bold enough to actually
 * read as that colour at 18px, rather than the first version's thin lines,
 * three of which were shades of grey.
 */
export function SealCrest({
  tier,
  size = 40,
}: {
  tier: SealTier;
  size?: number;
}) {
  const TL = "M4 10V4H10";
  const TR = "M36 10V4H30";
  const BL = "M4 20V26H10";
  const BR = "M36 20V26H30";
  const STAR =
    "M20 11.1L20.8 13.4L23.2 13.5L21.3 14.9L22 17.3L20 15.9L18 17.3L18.7 14.9L16.8 13.5L19.2 13.4Z";
  const CRACK = "M13 6L21 16L16 20L27 27";
  const color = TIER_COLOR[tier];

  return (
    <svg
      width={size}
      height={(size * 30) / 40}
      viewBox="0 0 40 30"
      fill="none"
      aria-hidden="true"
    >
      {tier === "select" && (
        <>
          <path
            d={`${TL}${TR}${BL}${BR}`}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="square"
          />
          <path d={STAR} fill="var(--color-gold)" />
        </>
      )}

      {tier === "frame" && (
        <path
          d={`${TL}${TR}${BL}${BR}`}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="square"
        />
      )}

      {tier === "mixed" && (
        <>
          <path
            d={`${TL}${TR}`}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="square"
          />
          {/* Faded in weight, not washed out in colour — half the frame is
              still amber, just a quieter amber, so "mixed" still reads as
              its own colour rather than fading toward grey. */}
          <path
            d={`${BL}${BR}`}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="square"
            opacity="0.4"
          />
        </>
      )}

      {tier === "burnt" && (
        <>
          <path
            d={`${TL}${BR}`}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="square"
            opacity="0.85"
          />
          <path
            d={CRACK}
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

const MARK_COLOR: Record<SealTier, string> = {
  select: "text-gold",
  frame: "text-[#2fd99a]",
  mixed: "text-[#ffb03a]",
  burnt: "text-[#ff4d33]",
};

/**
 * The compact form — a crest and a percentage, for a poster grid or a list
 * row. This is the site's answer to a tomato: at a glance, on every card,
 * without a click.
 */
export function SealMark({
  score,
  reviewCount = 0,
  size = 22,
}: {
  score: number;
  /** Editorial review count — decides XINE Select, see lib/seal.ts. */
  reviewCount?: number;
  size?: number;
}) {
  const percent = toPercent(score);
  if (percent === null) return null;
  const tier = sealTier(percent, reviewCount);

  // The number needs saying out loud: everything else on the site is a score
  // out of ten, so a bare "91%" beside a film is the one figure a reader has
  // to guess the units of. The crest carries that for the eye; this carries
  // it for a screen reader and for anyone who hovers.
  const description = `XINE score ${percent}% — ${SEAL_TIERS[tier].seal}`;

  return (
    <span className="inline-flex items-center gap-1.5" title={description}>
      <SealCrest tier={tier} size={size} />
      <span
        className={`readout text-[0.6875rem] ${MARK_COLOR[tier]}`}
        aria-hidden="true"
      >
        {percent}%
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}

/**
 * The full badge — the editorial verdict on a film page. Critic score only:
 * the audience number sits beside it as a labelled fact, not another crest,
 * because the frame is specifically XINE's own curatorial read and putting
 * it on a crowd average would misrepresent what it is. Xine Score and
 * Audience Score stay two separate numbers for the same reason: the symbol
 * carries the verdict, the numbers carry the degree, and a single figure
 * trying to average "what XINE thinks" with "what everyone thinks" would
 * carry neither clearly.
 */
export function SealBadge({
  score,
  reviewCount,
  quote,
  audienceScore,
}: {
  score: number;
  /** Editorial review count — decides XINE Select, see lib/seal.ts. */
  reviewCount: number;
  quote?: string | null;
  audienceScore: number | null;
}) {
  const percent = toPercent(score)!;
  const tier = sealTier(percent, reviewCount);
  const meta = SEAL_TIERS[tier];
  const audiencePercent = toPercent(audienceScore);

  return (
    <div className="rounded-[4px] border border-line bg-ink p-7">
      <p className="label">Xine Score</p>

      <div className="mt-5 flex items-start gap-5">
        <SealCrest tier={tier} size={56} />
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight tracking-tight">
            {meta.seal}
          </p>
          <p className="mt-1 font-sans text-sm tabular-nums text-muted">
            {percent}% <span className="text-faint">critical consensus</span>
          </p>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-faint">
            {meta.review}
          </p>
        </div>
      </div>

      {quote && (
        <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/90 italic">
          &ldquo;{quote}&rdquo;
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
        <Tag>
          {reviewCount} editorial review{reviewCount === 1 ? "" : "s"}
        </Tag>
        {audiencePercent !== null && (
          // Teal, not gold — visually separating XINE's own verdict above
          // from the crowd's number, the same split the copy already makes.
          <Tag color="var(--color-teal)">{audiencePercent}% audience score</Tag>
        )}
      </div>
    </div>
  );
}
