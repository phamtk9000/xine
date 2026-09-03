"use client";

import Link from "next/link";
import * as React from "react";
import { Poster } from "@/components/poster";
import { QuickRate } from "@/components/quick-rate";
import { setInterest } from "@/app/actions/recommendations";
import { toggleWatchlist } from "@/app/actions/films";
import type { Recommendation } from "@/lib/recommend";

/**
 * The recommendations, as something that answers back.
 *
 * The page used to be a list that changed on the next visit: press
 * Interested, see a button light up, and find out tomorrow what it did. That
 * is a promise with no evidence behind it, and a reader has no reason to
 * keep pressing.
 *
 * So a yes deals in the film's nearest neighbours underneath it, marked as
 * having arrived because of it, and a no takes with it whatever else on
 * screen was suggested for the same reason. Both are the site showing its
 * working: the reason each film is there was always printed under its title,
 * and now pressing the button visibly acts on that reason.
 *
 * Nothing is removed permanently on the client. A card a no took away is
 * held, not dropped, because Undo has to be able to put it back — the write
 * is one row and the gesture is fast enough to misfire.
 */

type Card = Recommendation & {
  /** Their own rating, for the scale under the card. */
  mine: number | null;
  watchlisted: boolean;
  /** Set when this card was dealt in behind a yes. */
  because?: string;
};

export function RecommendationGrid({
  initial,
  signedIn,
}: {
  initial: Card[];
  signedIn: boolean;
}) {
  const [cards, setCards] = React.useState<Card[]>(initial);
  const [verdicts, setVerdicts] = React.useState<
    Record<string, "yes" | "no" | undefined>
  >({});
  /** Cards a no removed, kept so Undo can put them back where they were. */
  const [removed, setRemoved] = React.useState<Record<string, Card[]>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const visible = cards.map((card) => card.id);

  async function press(card: Card, verdict: "yes" | "no") {
    const current = verdicts[card.id];

    // Pressing the same answer again takes it back, and puts back anything
    // that answer removed.
    if (current === verdict) {
      setVerdicts((prev) => ({ ...prev, [card.id]: undefined }));
      const restored = removed[card.id];
      if (restored?.length) {
        setCards((prev) => [...prev, ...restored]);
        setRemoved((prev) => {
          const next = { ...prev };
          delete next[card.id];
          return next;
        });
      }
      if (signedIn) void setInterest(card.id, verdict);
      return;
    }

    setVerdicts((prev) => ({ ...prev, [card.id]: verdict }));
    if (!signedIn) return;

    setBusy(card.id);
    try {
      const result = await setInterest(card.id, verdict, visible);

      if (verdict === "yes" && result.more?.length) {
        // Dealt in directly under the card that earned them.
        setCards((prev) => {
          const at = prev.findIndex((row) => row.id === card.id);
          if (at === -1) return prev;
          const dealt: Card[] = result.more!.map((film) => ({
            ...film,
            mine: null,
            watchlisted: false,
            because: card.title,
          }));
          return [...prev.slice(0, at + 1), ...dealt, ...prev.slice(at + 1)];
        });
      }

      if (verdict === "no" && result.drop?.length) {
        // Never take away a card the reader has already answered. "Fewer
        // like this" is about suggestions they have not looked at yet;
        // removing something they just kept would be the site overruling
        // them with their own press.
        const going = new Set(
          result.drop.filter((id) => !verdicts[id] && id !== card.id),
        );
        if (going.size === 0) return;
        setCards((prev) => {
          const taken = prev.filter((row) => going.has(row.id));
          if (taken.length > 0) {
            setRemoved((was) => ({ ...was, [card.id]: taken }));
          }
          return prev.filter((row) => !going.has(row.id));
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function save(card: Card) {
    setCards((prev) =>
      prev.map((row) =>
        row.id === card.id ? { ...row, watchlisted: !row.watchlisted } : row,
      ),
    );
    const form = new FormData();
    form.set("filmId", card.id);
    form.set("slug", card.slug);
    await toggleWatchlist(form);
  }

  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const verdict = verdicts[card.id];
        const took = removed[card.id]?.length ?? 0;

        return (
          <li key={card.id} className="flex gap-5">
            <Link
              href={`/films/${card.slug}`}
              className="group w-24 shrink-0 sm:w-28"
            >
              <Poster film={card} sizes="120px" />
            </Link>

            <div className="min-w-0 flex-1">
              {card.because && (
                <p className="label !text-gold">Because you kept {card.because}</p>
              )}

              <Link href={`/films/${card.slug}`} className="group block">
                <p className="mt-1 font-display text-xl leading-tight transition-colors group-hover:text-gold">
                  {card.title}
                </p>
                <p className="mt-1 truncate text-xs text-faint">
                  {card.director} · {card.year}
                </p>
              </Link>

              <p className="mt-3 text-sm leading-relaxed text-muted">
                {card.reason}
              </p>

              <div className="mt-3">
                <QuickRate
                  filmId={card.id}
                  slug={card.slug}
                  mine={card.mine}
                  signedIn={signedIn}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Choice
                  on={verdict === "yes"}
                  onClick={() => press(card, "yes")}
                  label={verdict === "yes" ? "Kept" : "Interested"}
                  title="Keep this, and show me more like it"
                />
                <Choice
                  on={verdict === "no"}
                  onClick={() => press(card, "no")}
                  label={verdict === "no" ? "Hidden" : "Not for me"}
                  title="Hide this, and show me fewer like it"
                  muted
                />
                <Choice
                  on={card.watchlisted}
                  onClick={() => save(card)}
                  label={card.watchlisted ? "Saved" : "Save"}
                  title="Put this on your watchlist"
                />
              </div>

              {verdict && (
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-faint">
                  {verdict === "yes"
                    ? busy === card.id
                      ? "Finding more like it…"
                      : "Kept, and pulling on what gets suggested next."
                    : took > 0
                      ? `Hidden, along with ${took} similar suggestion${took === 1 ? "" : "s"}.`
                      : "Hidden from future suggestions."}{" "}
                  <button
                    type="button"
                    onClick={() => press(card, verdict)}
                    className="underline underline-offset-2 transition-colors hover:text-paper"
                  >
                    Undo
                  </button>
                </p>
              )}

              {card.watchlisted && !verdict && (
                <p className="mt-2 text-[0.6875rem] text-faint">
                  On your watchlist.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Choice({
  on,
  onClick,
  label,
  title,
  muted = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`label rounded-full border px-3 py-1 !text-[0.5625rem] transition-colors ${
        on
          ? muted
            ? "border-line-bright bg-ink-raised !text-faint"
            : "border-gold bg-gold/10 !text-gold"
          : "border-line !text-faint hover:border-line-bright hover:!text-paper"
      }`}
    >
      {label}
    </button>
  );
}
