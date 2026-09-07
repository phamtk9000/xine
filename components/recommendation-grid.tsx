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
 * So an answer exchanges one card for another in the same slot. A yes refills
 * from that film's nearest neighbours — the reader liked this, so here is
 * what sits next to it — and a no refills from anything the recommender
 * likes that is explicitly *not* one of them. Same slot either way, because
 * the reader's mental model is the same either way: this one, not that one.
 *
 * Replacing rather than appending keeps the grid's shape and the reader's
 * place in it. A list that grows under every press moves everything below the
 * card they just answered, which is the one thing they were looking at.
 *
 * Nothing is lost on the client. The film that was answered is remembered
 * against the slot its replacement now occupies, so Undo puts it back exactly
 * where it was rather than appending it to the end — the write is one row and
 * the gesture is fast enough to misfire.
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
  /**
   * Which film took each answered film's slot, so Undo can put the original
   * back exactly where it was rather than appending it to the end.
   */
  const [replaced, setReplaced] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const visible = cards.map((card) => card.id);

  async function press(card: Card, verdict: "yes" | "no") {
    const current = verdicts[card.id];

    // Pressing the same answer again takes it back, and puts the film back in
    // the slot whatever replaced it is sitting in.
    if (current === verdict) {
      setVerdicts((prev) => ({ ...prev, [card.id]: undefined }));
      setCards((prev) => {
        const replacementId = replaced[card.id];
        if (!replacementId) return prev;
        return prev.map((row) =>
          row.id === replacementId ? { ...card, because: undefined } : row,
        );
      });
      setReplaced((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
      if (signedIn) void setInterest(card.id, verdict);
      return;
    }

    setVerdicts((prev) => ({ ...prev, [card.id]: verdict }));
    if (!signedIn) return;

    setBusy(card.id);
    try {
      const result = await setInterest(card.id, verdict, visible);
      const incoming = result.replacement;
      if (!incoming) return;

      // Straight into the slot the answered film was in, rather than appended
      // or dealt in below. The grid keeps its shape, the reader's eye keeps
      // its place, and the answer is legible as an exchange: this one, not
      // that one.
      setCards((prev) => {
        const at = prev.findIndex((row) => row.id === card.id);
        if (at === -1) return prev;
        const next = [...prev];
        next[at] = {
          ...incoming,
          mine: null,
          watchlisted: false,
          because: verdict === "yes" ? card.title : undefined,
        };
        return next;
      });
      setReplaced((prev) => ({ ...prev, [card.id]: incoming.id }));
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
                  {busy === card.id
                    ? "Finding another…"
                    : verdict === "yes"
                      ? "Kept. Its neighbour took the slot."
                      : "Hidden. Something unlike it took the slot."}{" "}
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
