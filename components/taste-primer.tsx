"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { correctTaste, keepTaste, nextTurn, type Correction } from "@/app/actions/primer";
import type { AgentFilm, AgentTurn } from "@/lib/rec/agent";

/** Kept in step with the same constant in app/actions/primer.ts. */
const NEEDED = 5;

/**
 * Five films, and a reading — the homepage's answer to "why would I sign up".
 *
 * The board is not a fixed shelf. Every pick goes back to the agent, which
 * re-deals the remaining posters around what it now believes and says, above
 * them, what it is still unsure about. That line is the feature: a grid that
 * reshuffles is a gimmick, and a grid that reshuffles while telling you it is
 * still deciding whether you want bleak or warm is a system visibly thinking.
 *
 * Signed out, the reading is real and unsaved, and it says so. Asking somebody
 * to register in order to find out whether registering is worth it is the
 * argument backwards.
 */
export function TastePrimer({
  opening,
  signedIn,
}: {
  opening: AgentTurn;
  signedIn: boolean;
}) {
  const [turn, setTurn] = useState<AgentTurn>(opening);
  const [picked, setPicked] = useState<AgentFilm[]>([]);
  const [shown, setShown] = useState<string[]>(opening.board.map((film) => film.id));
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const said = useRef<HTMLInputElement>(null);

  function pick(film: AgentFilm) {
    if (pending || picked.length >= NEEDED) return;
    const next = [...picked, film];
    setPicked(next);

    startTransition(async () => {
      const result = await nextTurn({
        picked: next.map((f) => f.id),
        shown,
        stated: correction?.stated,
      });
      setTurn(result);
      setShown((prev) => [...prev, ...result.board.map((f) => f.id)]);
    });
  }

  function restart() {
    setPicked([]);
    setCorrection(null);
    setSaved(null);
    setTurn(opening);
    setShown(opening.board.map((film) => film.id));
  }

  function correct() {
    const text = said.current?.value ?? "";
    if (text.trim().length < 3) return;
    startTransition(async () => {
      const result = await correctTaste(
        { picked: picked.map((f) => f.id), shown },
        text,
      );
      if (!result) return;
      setCorrection(result);
      setTurn(result.turn);
      if (said.current) said.current.value = "";
    });
  }

  function keep() {
    startTransition(async () => {
      const result = await keepTaste(picked.map((f) => f.id));
      setSaved(result?.saved ?? 0);
    });
  }

  const done = picked.length >= NEEDED;

  return (
    <div>
      {/* The running state of the conversation, on one line: how far in, what
          it has worked out, and how sure it is. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
        <p className="text-sm text-muted">
          {done ? (
            <>Read from five films.</>
          ) : (
            <>
              Pick five films you love.{" "}
              <span className="readout text-faint">
                {picked.length}/{NEEDED}
              </span>
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <span className="label !text-faint">Confidence</span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${Math.round(turn.certainty * 100)}%` }}
            />
          </span>
          {pending && <span className="label !text-gold">Thinking…</span>}
        </div>
      </div>

      {/* What it already thinks, alongside the board rather than after it —
          the reading is not a reveal at the end, it is a thing being built in
          front of you and correctable at any point. */}
      {turn.traits.length > 0 && !done && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {turn.traits.slice(0, 4).map((trait) => (
            <li
              key={trait.key}
              className="label rounded-full border border-line px-3 py-1.5 !text-muted"
              title={`${Math.round(trait.confidence * 100)}% sure`}
            >
              {trait.label}
            </li>
          ))}
        </ul>
      )}

      {done ? (
        <Reading
          turn={turn}
          picked={picked}
          signedIn={signedIn}
          saved={saved}
          pending={pending}
          correction={correction}
          said={said}
          onCorrect={correct}
          onKeep={keep}
          onRestart={restart}
        />
      ) : (
        <>
          {turn.probe && (
            <p className="mt-6 font-display text-lg text-paper/80 italic">{turn.probe}</p>
          )}

          <ul
            className={`mt-5 grid grid-cols-4 gap-2.5 transition-opacity sm:grid-cols-6 lg:grid-cols-8 ${
              pending ? "opacity-40" : ""
            }`}
          >
            {turn.board.map((film) => (
              <li key={film.id}>
                <button
                  type="button"
                  onClick={() => pick(film)}
                  title={`${film.title} (${film.year})`}
                  className="group relative block w-full overflow-hidden rounded-[3px] border-2 border-transparent opacity-75 transition-all hover:border-gold hover:opacity-100"
                >
                  <span className="relative block aspect-2/3 bg-ink-raised">
                    {film.posterUrl && (
                      <Image
                        src={film.posterUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 25vw, 12vw"
                        className="object-cover"
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {picked.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-faint">
              <span className="label !text-faint">Taken</span>
              {picked.map((film) => (
                <span key={film.id} className="text-muted">
                  {film.title}
                </span>
              ))}
              <button
                type="button"
                onClick={restart}
                className="underline underline-offset-4 transition-colors hover:text-paper"
              >
                Start again
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Reading({
  turn,
  picked,
  signedIn,
  saved,
  pending,
  correction,
  said,
  onCorrect,
  onKeep,
  onRestart,
}: {
  turn: AgentTurn;
  picked: AgentFilm[];
  signedIn: boolean;
  saved: number | null;
  pending: boolean;
  correction: Correction | null;
  said: React.RefObject<HTMLInputElement | null>;
  onCorrect: () => void;
  onKeep: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]">
      <div>
        <p className="label !text-gold">Your reading</p>
        <h3 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
          {turn.reading?.name}
        </h3>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          {turn.reading?.body}
        </p>

        <ul className="mt-7 space-y-3">
          {turn.traits.map((trait) => (
            <li key={trait.key} className="flex items-center gap-4">
              <span className="w-44 shrink-0 text-sm text-paper">{trait.label}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-gold transition-[width] duration-500"
                  style={{ width: `${Math.round(trait.confidence * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>

        {/* The argument back. Everything above is inferred from five clicks;
            this is the one input where somebody can simply say what they
            mean, and it outranks the inference. */}
        <div className="mt-8">
          <label htmlFor="taste-correction" className="label !text-faint">
            Not quite right?
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="taste-correction"
              ref={said}
              type="text"
              placeholder="Tell it — “I like these but nothing bleak”"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCorrect();
                }
              }}
              className="min-w-0 flex-1 rounded-full border border-line bg-ink-raised px-4 py-2.5 text-sm text-paper placeholder:text-faint focus:border-line-bright focus:outline-none"
            />
            <button
              type="button"
              onClick={onCorrect}
              disabled={pending}
              className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper disabled:opacity-50"
            >
              Read again
            </button>
          </div>

          {correction && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="label !text-faint">It heard</span>
              {correction.chips.length > 0 ? (
                correction.chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="label rounded-full border border-gold/40 bg-gold/10 px-3 py-1 !text-gold"
                  >
                    {chip.label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-faint">nothing it could act on.</span>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {signedIn ? (
            saved === null ? (
              <button
                type="button"
                onClick={onKeep}
                disabled={pending}
                className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
              >
                Keep this — rate these five
              </button>
            ) : (
              <Link
                href="/watch/taste"
                className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
              >
                View my taste →
              </Link>
            )
          ) : (
            <Link
              href="/sign-up"
              className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
            >
              Keep this — create an account
            </Link>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
          >
            Start again
          </button>
        </div>

        <p className="mt-3 text-xs text-faint">
          {saved !== null
            ? `Saved as ${saved} ratings. Everything on the site now reads from them.`
            : signedIn
              ? "Nothing has been written to your account yet."
              : "Nothing was saved. An account keeps this and builds on it every time you rate something."}
        </p>
      </div>

      {turn.suggestions.length > 0 && (
        <aside className="lg:border-l lg:border-line lg:pl-10">
          <p className="label">So you might want</p>
          <ul className="mt-4 space-y-5">
            {turn.suggestions.map((film) => (
              <li key={film.slug}>
                <Link href={`/films/${film.slug}`} className="group flex gap-3">
                  {film.posterUrl && (
                    <span className="relative block aspect-2/3 w-14 shrink-0 overflow-hidden rounded-[3px] border border-line">
                      <Image src={film.posterUrl} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm transition-colors group-hover:text-gold">
                      {film.title}
                    </span>
                    <span className="block text-xs text-faint">{film.year}</span>
                    <span className="mt-1 block text-xs leading-snug text-muted">{film.why}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-faint">
            {picked.length} picks ·{" "}
            {turn.reading?.source === "ai" ? "written by Claude" : "written from the numbers"}
          </p>
        </aside>
      )}
    </div>
  );
}
