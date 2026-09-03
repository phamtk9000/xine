"use client";

import Link from "next/link";
import * as React from "react";
import { setInterest } from "@/app/actions/recommendations";
import type { WatchCard } from "@/lib/watch-shape";

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
 * Every answer is written as it happens, so a deck abandoned halfway still
 * taught the recommender everything it was told. Back takes one away again,
 * because the whole gesture is fast and fast gestures misfire.
 */

const THROW = 0.25; // Fraction of the deck's width that counts as a decision.

export function WatchDeck({
  cards,
  signedIn,
}: {
  cards: WatchCard[];
  signedIn: boolean;
}) {
  const [index, setIndex] = React.useState(0);
  /** What was said to each card, so Back can unsay it. */
  const [answers, setAnswers] = React.useState<Record<string, "yes" | "no">>({});
  const [drag, setDrag] = React.useState<{ x: number; y: number } | null>(null);

  const frame = React.useRef<HTMLDivElement>(null);
  /**
   * The deck's width, measured rather than read off the ref during render.
   *
   * The throw distance is a fraction of it, so it has to be a real number on
   * a phone and on a desktop, and it has to survive a rotation — which is
   * what the observer is for. The fallback is only ever used for the first
   * paint, before anything has been dragged.
   */
  const [width, setWidth] = React.useState(420);
  const origin = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const [leaving, setLeaving] = React.useState<"yes" | "no" | null>(null);

  const card = cards[index];
  const remaining = cards.length - index;

  const answer = React.useCallback(
    (verdict: "yes" | "no") => {
      const current = cards[index];
      if (!current) return;

      setLeaving(verdict);
      setAnswers((prev) => ({ ...prev, [current.id]: verdict }));
      setDrag(null);

      // The write does not block the animation. A card that waits on a round
      // trip before it moves makes the whole deck feel broken.
      if (signedIn) void setInterest(current.id, verdict);

      window.setTimeout(() => {
        setIndex((i) => i + 1);
        setLeaving(null);
      }, 260);
    },
    [cards, index, signedIn],
  );

  const back = React.useCallback(() => {
    if (index === 0) return;
    const previous = cards[index - 1];
    const said = answers[previous.id];
    // Pressing the same verdict again clears it — see the action.
    if (signedIn && said) void setInterest(previous.id, said);
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[previous.id];
      return next;
    });
    setIndex(index - 1);
  }, [answers, cards, index, signedIn]);

  React.useEffect(() => {
    const node = frame.current;
    if (!node) return;
    setWidth(node.offsetWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") answer("no");
      else if (event.key === "ArrowRight") answer("yes");
      else if (event.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, back]);

  if (!card) {
    return (
      <div className="rounded-[4px] border border-line bg-ink-raised px-6 py-16 text-center">
        <p className="label">That&rsquo;s the deck</p>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
          {signedIn
            ? "Everything you kept is on your For You page, and it is already pulling on what gets suggested there."
            : "Sign in and the next deck remembers what you kept."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={signedIn ? "/for-you" : "/sign-in"}
            className="label rounded-full border border-line px-4 py-2 transition-colors hover:border-line-bright hover:text-paper"
          >
            {signedIn ? "See what you kept" : "Sign in"}
          </Link>
          <Link
            href="/watch"
            className="label rounded-full border border-line px-4 py-2 transition-colors hover:border-line-bright hover:text-paper"
          >
            Start again
          </Link>
        </div>
      </div>
    );
  }

  const throwAt = width * THROW;
  const dx = leaving ? (leaving === "yes" ? width * 1.4 : -width * 1.4) : (drag?.x ?? 0);
  const dy = leaving ? -40 : (drag?.y ?? 0);
  const tilt = dx / 18;
  const decided = Math.min(1, Math.abs(dx) / throwAt);

  return (
    <div>
      <div
        ref={frame}
        className="relative mx-auto"
        style={{ maxWidth: "26rem", height: "min(70vh, 34rem)" }}
      >
        {/* Two cards behind, so the deck reads as a stack with an end. */}
        {cards.slice(index + 1, index + 3).map((next, depth) => (
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
          className="absolute inset-0 touch-none overflow-hidden rounded-[6px] border border-line-bright bg-ink-raised shadow-2xl select-none"
          style={{
            transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`,
            transition: drag ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
            cursor: drag ? "grabbing" : "grab",
          }}
          onPointerDown={(event) => {
            if (leaving) return;
            origin.current = {
              x: event.clientX,
              y: event.clientY,
              id: event.pointerId,
            };
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

          {/* What the drag is about to do, before it does it. */}
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
            Not for me
          </span>

          <div className="absolute inset-x-0 bottom-0 p-6">
            {card.note && <p className="label !text-gold">{card.note}</p>}
            <h2 className="mt-2 font-display text-3xl leading-tight">
              {card.title}
            </h2>
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
          Not for me
        </button>
        <button
          type="button"
          onClick={() => answer("yes")}
          className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
        >
          Interested
        </button>
      </div>

      <p className="mt-5 text-center text-xs text-faint">
        {remaining} left · drag the card, or use ← and →
        {index > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={back}
              className="underline underline-offset-2 transition-colors hover:text-paper"
            >
              Back
            </button>
          </>
        )}
      </p>

      {!signedIn && (
        <p className="mt-3 text-center text-xs text-faint">
          <Link href="/sign-in" className="text-gold underline underline-offset-4">
            Sign in
          </Link>{" "}
          to keep what you pick — signed out, nothing is remembered.
        </p>
      )}
    </div>
  );
}
