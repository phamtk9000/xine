"use client";

import Link from "next/link";
import * as React from "react";
import { DeckStack, type StackCard } from "@/components/deck-stack";
import { WatchQuestions, type Answers } from "@/components/watch-questions";
import { FineTune } from "@/components/fine-tune";
import {
  ATTRACTIONS,
  REASONS,
  type AttractionKey,
  type ReasonKey,
} from "@/lib/rec/feedback";
import {
  describeEvening,
  dropChip,
  giveAttraction,
  giveReason,
  pickForMe,
  refine,
  respond,
  chooseFinalist,
  type DeckPayload,
  type PublicCard,
} from "@/app/actions/watch";

/**
 * An evening, from a sentence or a set of chips down to one film.
 *
 * The page holds the deck and the server holds the reasoning. Every press
 * sends one verdict and receives a re-ranked deck — not a re-rendered page —
 * because the thing being protected here is the feeling that the cards are
 * responding rather than reloading.
 *
 * Two ways in, deliberately equal. Chips are faster when you know roughly
 * what you want; a sentence is better when what you want is specific and
 * strange ("beautiful and depressing but not slow"). Whatever the sentence is
 * read as appears as chips you can remove, because an interpretation that
 * cannot be overruled is the machine arguing with the person.
 */

export function WatchSession({
  initial,
  initialAnswers,
  signedIn,
}: {
  initial: DeckPayload | null;
  initialAnswers: Answers;
  signedIn: boolean;
}) {
  const [answers, setAnswers] = React.useState<Answers>(initialAnswers);
  const [deck, setDeck] = React.useState<DeckPayload | null>(initial);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [askingAbout, setAskingAbout] = React.useState<StackCard | null>(null);
  const [askingWhy, setAskingWhy] = React.useState<StackCard | null>(null);
  const [chosen, setChosen] = React.useState<PublicCard | null>(null);
  /**
   * How many verdicts had been given when the finalists were last waved away.
   *
   * Without it "keep looking" lasts exactly one card: the next payload still
   * satisfies the condition and the three come straight back, which reads as
   * the page refusing to take no for an answer.
   */
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);

  async function changeAnswers(next: Answers) {
    setAnswers(next);
    setBusy(true);
    try {
      setDeck(await refine(next));
    } finally {
      setBusy(false);
    }
  }

  async function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setThinking(true);
    try {
      setDeck(await describeEvening(query, answers));
    } finally {
      setThinking(false);
    }
  }

  async function remove(chip: { kind: string; key: string }) {
    setBusy(true);
    try {
      setDeck(await dropChip(chip.key, chip.kind, answers));
    } finally {
      setBusy(false);
    }
  }

  async function answer(card: StackCard, verdict: "yes" | "no") {
    // Optimistic: the card leaves now, the deck catches up. Everything else
    // in this component can wait; this cannot.
    setDeck((prev) =>
      prev ? { ...prev, cards: prev.cards.filter((row) => row.id !== card.id) } : prev,
    );

    const next = await respond(card.id, verdict === "yes" ? "interested" : "not_tonight");
    if (!next) return;
    setDeck(next);
    if (verdict === "no" && next.askReason) setAskingAbout(card);
    if (verdict === "yes" && next.askAttraction) setAskingWhy(card);
  }

  async function secondaryAction(
    card: StackCard,
    verdict: "never" | "seen" | "save",
  ) {
    setDeck((prev) =>
      prev ? { ...prev, cards: prev.cards.filter((row) => row.id !== card.id) } : prev,
    );
    const next = await respond(card.id, verdict);
    if (next) setDeck(next);
  }

  async function attraction(key: AttractionKey) {
    const card = askingWhy;
    setAskingWhy(null);
    if (!card) return;
    const next = await giveAttraction(card.id, key);
    if (next) setDeck(next);
  }

  async function reason(key: ReasonKey) {
    const card = askingAbout;
    setAskingAbout(null);
    if (!card) return;
    const next = await giveReason(card.id, key);
    if (next) setDeck(next);
  }

  async function pick() {
    setBusy(true);
    try {
      const film = await pickForMe();
      if (film) setChosen(film);
    } finally {
      setBusy(false);
    }
  }

  const cards: StackCard[] = deck?.cards ?? [];

  return (
    <div className="grid gap-14 lg:grid-cols-[22rem_1fr] lg:gap-20">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <form onSubmit={submitQuery}>
          <label className="label" htmlFor="watch-query">
            Tell xine what you want
          </label>
          <textarea
            id="watch-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuery(event);
              }
            }}
            rows={3}
            placeholder="Something beautiful and sad, but not slow. Maybe Korean. Under two hours."
            className="mt-3 w-full resize-none rounded-[3px] border border-line bg-ink-raised px-4 py-3 text-sm leading-relaxed placeholder:text-faint focus:border-line-bright focus:outline-none"
          />
          <button
            type="submit"
            disabled={thinking || !query.trim()}
            className="label mt-2 rounded-full border border-line px-4 py-2 transition-colors hover:border-line-bright hover:text-paper disabled:opacity-40"
          >
            {thinking ? "Reading…" : "Read that"}
          </button>
        </form>

        {deck && deck.chips.length > 0 && (
          <div className="mt-8 border-t border-line pt-6">
            <p className="label">What xine understood</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {deck.chips.map((chip) => (
                <button
                  key={`${chip.kind}:${chip.key}`}
                  type="button"
                  onClick={() => remove(chip)}
                  title="Remove"
                  className="label rounded-full border border-line-bright bg-ink-raised px-3 py-1.5 !text-[0.5625rem] transition-colors hover:border-accent hover:!text-accent"
                >
                  {chip.label} ×
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 border-t border-line pt-8">
          <WatchQuestions answers={answers} onChange={changeAnswers} disabled={busy} />

          <FineTune
            fine={answers.fine ?? {}}
            ending={answers.ending}
            disabled={busy}
            onChange={(next) =>
              changeAnswers({ ...answers, fine: next.fine, ending: next.ending })
            }
          />
        </div>

        <p className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-faint">
          Every answer is optional, and leaving one out is not the same as
          answering “anything” — it simply does not narrow. Change one and the
          deck is re-dealt.
        </p>
      </div>

      <div>
        {chosen ? (
          <Chosen card={chosen} onBack={() => setChosen(null)} />
        ) : deck?.finalists &&
          (dismissedAt === null || deck.verdicts >= dismissedAt + 4) ? (
          <Finalists
            finalists={deck.finalists}
            onChoose={(card) => {
              void chooseFinalist(card.id);
              setChosen(card);
            }}
            onPick={pick}
            onKeepGoing={() => setDismissedAt(deck.verdicts)}
          />
        ) : (
          <>
            <DeckStack
              cards={cards}
              onAnswer={answer}
              secondary={(card) => (
                <>
                  <Small onClick={() => secondaryAction(card, "seen")}>Seen it</Small>
                  <Small onClick={() => secondaryAction(card, "save")}>Save</Small>
                  <Small onClick={() => secondaryAction(card, "never")}>
                    Never recommend
                  </Small>
                </>
              )}
              footer={
                <div className="mt-4 text-center text-xs text-faint">
                  {deck ? (
                    <>
                      {deck.pool.toLocaleString()} films match
                      {deck.verdicts > 0 && ` · ${deck.verdicts} answered`}
                      {signedIn && (
                        <>
                          {" · "}
                          <Link
                            href="/watch/taste"
                            className="underline underline-offset-2 hover:text-paper"
                          >
                            your taste
                          </Link>
                        </>
                      )}
                      {!signedIn && (
                        <>
                          {" · "}
                          <Link
                            href="/sign-in"
                            className="text-gold underline underline-offset-4"
                          >
                            sign in
                          </Link>{" "}
                          to keep this
                        </>
                      )}
                    </>
                  ) : (
                    "Dealing…"
                  )}
                </div>
              }
              empty={
                <div className="rounded-[4px] border border-line bg-ink-raised px-6 py-16 text-center">
                  <p className="label">{busy ? "Dealing…" : "That's the deck"}</p>
                  <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
                    {busy
                      ? "Ranking what fits."
                      : "Change an answer, or say what you want in your own words, and there will be more."}
                  </p>
                </div>
              }
            />

            {askingWhy && (
              <div className="mt-8 rounded-[4px] border border-gold/40 bg-gold/5 px-5 py-5">
                <p className="label !text-gold">
                  What caught your attention about {askingWhy.title}?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ATTRACTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => attraction(option.key)}
                      className="label rounded-full border border-line px-3 py-1.5 !text-[0.5625rem] transition-colors hover:border-gold hover:!text-gold"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAskingWhy(null)}
                    className="label px-2 py-1.5 !text-[0.5625rem] underline underline-offset-2"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}

            {askingAbout && (
              <div className="mt-8 rounded-[4px] border border-line bg-ink-raised px-5 py-5">
                <p className="label">What wasn&rsquo;t right about {askingAbout.title}?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REASONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => reason(option.key)}
                      className="label rounded-full border border-line px-3 py-1.5 !text-[0.5625rem] transition-colors hover:border-line-bright hover:!text-paper"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAskingAbout(null)}
                    className="label px-2 py-1.5 !text-[0.5625rem] underline underline-offset-2"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Small({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="label rounded-full border border-line px-3 py-1.5 !text-[0.5625rem] transition-colors hover:border-line-bright hover:!text-paper"
    >
      {children}
    </button>
  );
}

/**
 * Three ways of being right.
 *
 * Offered only once somebody has said enough for the three to differ — before
 * that they are the same guess printed three times. Each is drawn from a
 * different part of the ranking, and each says which part, because "safe" and
 * "wildcard" are only useful labels if the reader can tell why a film earned
 * one.
 */
function Finalists({
  finalists,
  onChoose,
  onPick,
  onKeepGoing,
}: {
  finalists: NonNullable<DeckPayload["finalists"]>;
  onChoose: (card: PublicCard) => void;
  onPick: () => void;
  onKeepGoing: () => void;
}) {
  const three: { card: PublicCard; label: string; note: string }[] = [
    { card: finalists.safe, label: "Safe pick", note: "Closest to what you already like." },
    { card: finalists.xine, label: "xine's pick", note: "The one this site would argue for." },
    { card: finalists.wildcard, label: "Wildcard", note: "Further out, on purpose." },
  ];

  return (
    <div>
      <p className="label">Three to choose from</p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        You have said enough for these to differ from each other. Pick one, or
        let xine choose.
      </p>

      <ul className="mt-8 grid gap-6 sm:grid-cols-3">
        {three.map(({ card, label, note }) => (
          <li key={`${label}-${card.id}`}>
            <button
              type="button"
              onClick={() => onChoose(card)}
              className="group block w-full text-left"
            >
              <span className="label !text-gold">{label}</span>
              {card.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.posterUrl}
                  alt=""
                  className="mt-3 aspect-2/3 w-full rounded-[4px] border border-line object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              )}
              <span className="mt-3 block font-display text-xl leading-tight transition-colors group-hover:text-gold">
                {card.title}
              </span>
              <span className="mt-1 block text-xs text-faint">
                {card.director} · {card.year}
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-muted">{note}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onPick}
          className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
        >
          Pick for me
        </button>
        <button
          type="button"
          onClick={onKeepGoing}
          className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
        >
          Keep looking
        </button>
      </div>
    </div>
  );
}

function Chosen({ card, onBack }: { card: PublicCard; onBack: () => void }) {
  return (
    <div className="rounded-[4px] border border-line-bright bg-ink-raised p-6 sm:p-8">
      <p className="label !text-gold">Tonight</p>
      <div className="mt-5 flex flex-col gap-6 sm:flex-row">
        {card.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.posterUrl}
            alt=""
            className="w-32 shrink-0 rounded-[4px] border border-line object-cover sm:w-40"
          />
        )}
        <div className="min-w-0">
          <h2 className="font-display text-3xl leading-tight">{card.title}</h2>
          <p className="mt-1.5 text-xs text-faint">
            {[card.director, card.year, card.runtime && `${card.runtime} min`, card.country]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gold">{card.why}</p>
          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted">
            {card.synopsis}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/films/${card.slug}`}
              className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
            >
              Open the film
            </Link>
            <button
              type="button"
              onClick={onBack}
              className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
            >
              Something else
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
