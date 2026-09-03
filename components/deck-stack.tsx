"use client";

import Link from "next/link";
import * as React from "react";

/**
 * One film at a time, answered with a hand rather than a scroll.
 *
 * A grid asks you to compare sixty things, which is the state somebody is
 * already in when they open a film site at nine in the evening and close it
 * at half past having watched nothing. A deck asks one question — this one,
 * yes or no — and the only way to see the next card is to answer it.
 *
 * Drag or press; both do the same thing, because a deck that can only be
 * swiped is a deck that does not work with a mouse or a keyboard. The card
 * follows the pointer and tilts into the direction it is going, and past a
 * quarter of the screen it leaves. Below that it springs back, which is what
 * makes an exploratory tug safe.
 *
 * The stack knows nothing about recommendations. It renders cards, reports
 * verdicts, and lets its owner decide what any of that means — which is what
 * lets the same physics serve a browse deck and a ranked session without the
 * two growing separate copies of the same drag maths.
 */

const THROW = 0.25; // Fraction of the deck's width that counts as a decision.

export type StackCard = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  runtime: number | null;
  country: string | null;
  synopsis: string;
  posterUrl: string | null;
  /** One line, above the title: why this card is here. */
  why?: string;
};

export type Verdict = "yes" | "no";

export function DeckStack({
  cards,
  onAnswer,
  onBack,
  canGoBack = false,
  secondary,
  footer,
  empty,
}: {
  cards: StackCard[];
  onAnswer: (card: StackCard, verdict: Verdict) => void;
  onBack?: () => void;
  canGoBack?: boolean;
  /** Rendered under the two main buttons — seen it, save, never. */
  secondary?: (card: StackCard) => React.ReactNode;
  /** Rendered under everything, for counts and hints. */
  footer?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const [drag, setDrag] = React.useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = React.useState<Verdict | null>(null);

  const frame = React.useRef<HTMLDivElement>(null);
  const origin = React.useRef<{ x: number; y: number; id: number } | null>(null);
  /**
   * The deck's width, measured rather than read off the ref during render.
   * The throw distance is a fraction of it, so it has to be a real number on
   * a phone and on a desktop, and survive a rotation.
   */
  const [width, setWidth] = React.useState(420);

  const card = cards[0];

  React.useEffect(() => {
    const node = frame.current;
    if (!node) return;
    setWidth(node.offsetWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const answer = React.useCallback(
    (verdict: Verdict) => {
      const current = cards[0];
      if (!current || leaving) return;

      setLeaving(verdict);
      setDrag(null);

      // The card leaves on its own schedule; the owner writes whatever the
      // verdict means in the background. A card that waits on a round trip
      // before it moves makes the whole deck feel broken.
      onAnswer(current, verdict);

      window.setTimeout(() => setLeaving(null), 260);
    },
    [cards, leaving, onAnswer],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (typing) return;

      if (event.key === "ArrowLeft") answer("no");
      else if (event.key === "ArrowRight") answer("yes");
      else if (event.key === "Backspace" && onBack) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, onBack]);

  if (!card) return <>{empty}</>;

  const throwAt = width * THROW;
  const dx = leaving
    ? leaving === "yes"
      ? width * 1.4
      : -width * 1.4
    : (drag?.x ?? 0);
  const dy = leaving ? -40 : (drag?.y ?? 0);
  const tilt = dx / 18;
  const decided = Math.min(1, Math.abs(dx) / Math.max(1, throwAt));

  return (
    <div>
      <div
        ref={frame}
        className="relative mx-auto"
        style={{ maxWidth: "26rem", height: "min(66vh, 32rem)" }}
      >
        {cards.slice(1, 3).map((next, depth) => (
          <article
            key={next.id}
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-[6px] border border-line bg-ink-raised"
            style={{
              transform: `translateY(${(depth + 1) * 10}px) scale(${1 - (depth + 1) * 0.03})`,
              opacity: 1 - (depth + 1) * 0.35,
            }}
          />
        ))}

        <article
          key={card.id}
          className="absolute inset-0 touch-none overflow-hidden rounded-[6px] border border-line-bright bg-ink-raised shadow-2xl select-none"
          style={{
            transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`,
            transition: drag ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: drag ? "grabbing" : "grab",
          }}
          onPointerDown={(event) => {
            if (leaving) return;
            origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = origin.current;
            if (!start || start.id !== event.pointerId) return;
            setDrag({
              x: event.clientX - start.x,
              y: (event.clientY - start.y) * 0.4,
            });
          }}
          onPointerUp={() => {
            const moved = drag?.x ?? 0;
            origin.current = null;
            if (Math.abs(moved) >= throwAt) answer(moved > 0 ? "yes" : "no");
            else setDrag(null);
          }}
          onPointerCancel={() => {
            origin.current = null;
            setDrag(null);
          }}
        >
          {card.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.posterUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/85 via-40% to-transparent" />

          <span
            className="absolute top-5 left-5 rounded-full border border-gold px-3 py-1 font-sans text-[0.625rem] tracking-[0.16em] text-gold uppercase"
            style={{ opacity: dx > 0 ? decided : 0 }}
          >
            Interested
          </span>
          <span
            className="absolute top-5 right-5 rounded-full border border-line-bright px-3 py-1 font-sans text-[0.625rem] tracking-[0.16em] text-faint uppercase"
            style={{ opacity: dx < 0 ? decided : 0 }}
          >
            Not tonight
          </span>

          <div className="absolute inset-x-0 bottom-0 p-6">
            {card.why && <p className="label !text-gold">{card.why}</p>}
            <h2 className="mt-2 font-display text-3xl leading-tight">{card.title}</h2>
            <p className="mt-1.5 text-xs text-faint">
              {[card.director, card.year, card.runtime && `${card.runtime} min`, card.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
              {card.synopsis}
            </p>
            <Link
              href={`/films/${card.slug}`}
              className="label mt-4 inline-block transition-colors hover:text-paper"
              onClick={(event) => event.stopPropagation()}
            >
              Read the page →
            </Link>
          </div>
        </article>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => answer("no")}
          className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
        >
          Not tonight
        </button>
        <button
          type="button"
          onClick={() => answer("yes")}
          className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
        >
          Interested
        </button>
      </div>

      {secondary && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {secondary(card)}
        </div>
      )}

      <p className="mt-5 text-center text-xs text-faint">
        Drag the card, or use ← and →
        {canGoBack && onBack && (
          <>
            {" · "}
            <button
              type="button"
              onClick={onBack}
              className="underline underline-offset-2 transition-colors hover:text-paper"
            >
              Back
            </button>
          </>
        )}
      </p>

      {footer}
    </div>
  );
}
