import { Tag } from "@/components/ui";
import { SEAL_TIERS, sealTier, toPercent, type SealTier } from "@/lib/seal";

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
 * legible.
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
            stroke="var(--color-accent)"
            strokeWidth="1.7"
            strokeLinecap="square"
          />
          <path d={STAR} fill="var(--color-gold)" />
        </>
      )}

      {tier === "frame" && (
        <path
          d={`${TL}${TR}${BL}${BR}`}
          stroke="var(--color-paper)"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      )}

      {tier === "mixed" && (
        <>
          <path
            d={`${TL}${TR}`}
            stroke="var(--color-paper)"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          <path
            d={`${BL}${BR}`}
            stroke="var(--color-paper)"
            strokeWidth="1.5"
            strokeLinecap="square"
            opacity="0.35"
          />
        </>
      )}

      {tier === "burnt" && (
        <>
          <path
            d={`${TL}${BR}`}
            stroke="var(--color-faint)"
            strokeWidth="1.5"
            strokeLinecap="square"
            opacity="0.7"
          />
          <path
            d={CRACK}
            stroke="var(--color-faint)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        </>
      )}
    </svg>
  );
}

const MARK_COLOR: Record<SealTier, string> = {
  select: "text-gold",
  frame: "text-paper",
  mixed: "text-muted",
  burnt: "text-faint",
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

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={SEAL_TIERS[tier].seal}
    >
      <SealCrest tier={tier} size={size} />
      <span className={`font-mono text-xs tabular-nums ${MARK_COLOR[tier]}`}>
        {percent}%
      </span>
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
    <div className="rounded-xl border border-line bg-ink p-7">
      <p className="label">Xine Score</p>

      <div className="mt-5 flex items-start gap-5">
        <SealCrest tier={tier} size={56} />
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight tracking-tight">
            {meta.seal}
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-muted">
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
