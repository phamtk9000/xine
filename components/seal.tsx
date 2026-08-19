import { Tag } from "@/components/ui";
import { SEAL_TIERS, sealTier, toPercent, type SealTier } from "@/lib/seal";

const CREST_COLOR: Record<
  SealTier,
  { ring: string; inner: string; mark: string }
> = {
  distinction: {
    ring: "var(--color-accent)",
    inner: "var(--color-gold)",
    mark: "var(--color-gold)",
  },
  selection: {
    ring: "var(--color-paper)",
    inner: "var(--color-paper)",
    mark: "var(--color-paper)",
  },
  revision: {
    ring: "var(--color-faint)",
    inner: "var(--color-faint)",
    mark: "var(--color-faint)",
  },
};

/**
 * The crest itself — the one graphic element that has to read at both 18px
 * on a poster grid and 64px on a film page. Three shapes, not three colour
 * variants of one shape, because the spec's own distinction is structural:
 * a double ring reads as more than a single ring even in a thumbnail where
 * neither colour nor the monogram inside is legible.
 */
export function SealCrest({
  tier,
  size = 40,
}: {
  tier: SealTier;
  size?: number;
}) {
  const c = CREST_COLOR[tier];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      {tier === "distinction" && (
        <>
          <circle cx="20" cy="20" r="18" stroke={c.ring} strokeWidth="1.6" />
          <circle cx="20" cy="20" r="13.5" stroke={c.inner} strokeWidth="1" />
          <path
            d="M14.5 14.5L25.5 25.5M25.5 14.5L14.5 25.5"
            stroke={c.mark}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {tier === "selection" && (
        <>
          <circle cx="20" cy="20" r="16" stroke={c.ring} strokeWidth="1.3" />
          <path
            d="M15 15L25 25M25 15L15 25"
            stroke={c.mark}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.85"
          />
        </>
      )}

      {tier === "revision" && (
        <>
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke={c.ring}
            strokeWidth="1.3"
            strokeDasharray="3.2 3.6"
          />
          <path
            d="M15 20H25"
            stroke={c.mark}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.75"
          />
        </>
      )}
    </svg>
  );
}

const MARK_COLOR: Record<SealTier, string> = {
  distinction: "text-gold",
  selection: "text-paper",
  revision: "text-faint",
};

/**
 * The compact form — a crest and a percentage, for a poster grid or a list
 * row. This is the site's answer to a tomato: at a glance, on every card,
 * without a click.
 */
export function SealMark({
  score,
  size = 20,
}: {
  score: number;
  size?: number;
}) {
  const percent = toPercent(score);
  if (percent === null) return null;
  const tier = sealTier(percent);

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
 * because the seal is specifically XINE's own curatorial stamp and stamping
 * it on a crowd average would misrepresent what it is.
 */
export function SealBadge({
  score,
  quote,
  editorialCount,
  audienceScore,
}: {
  score: number;
  quote?: string | null;
  editorialCount: number;
  audienceScore: number | null;
}) {
  const percent = toPercent(score)!;
  const tier = sealTier(percent);
  const meta = SEAL_TIERS[tier];
  const audiencePercent = toPercent(audienceScore);

  return (
    <div className="rounded-xl border border-line bg-ink p-7">
      <p className="label">XINE Critic Score</p>

      <div className="mt-5 flex items-start gap-5">
        <SealCrest tier={tier} size={60} />
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight tracking-tight">
            {meta.seal}
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-muted">
            {percent}% <span className="text-faint">critical consensus</span>
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
          {editorialCount} editorial review{editorialCount === 1 ? "" : "s"}
        </Tag>
        {audiencePercent !== null && (
          <Tag>{audiencePercent}% audience consensus</Tag>
        )}
      </div>
    </div>
  );
}
