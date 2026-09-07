"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { readPrimer, type PrimerFilm, type PrimerReading } from "@/app/actions/primer";

const NEEDED = 5;

/**
 * Five films, and a reading — the homepage's answer to "why would I sign up".
 *
 * Everything else on the front page describes xine. This performs it: pick
 * five films you love, and the site tells you something about yourself it
 * could only know by having read them. Twenty seconds, no account, and the
 * account offer arrives *after* the value rather than in front of it.
 *
 * Signed out, the reading is real but unsaved, and it says so. That is the
 * honest version of the pitch — asking somebody to register to find out
 * whether registering is worth it is the argument backwards.
 */
export function TastePrimer({ shelf, signedIn }: { shelf: PrimerFilm[]; signedIn: boolean }) {
  const [picked, setPicked] = useState<PrimerFilm[]>([]);
  const [reading, setReading] = useState<PrimerReading | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(film: PrimerFilm) {
    if (reading) return;
    setPicked((prev) => {
      const without = prev.filter((f) => f.id !== film.id);
      if (without.length !== prev.length) return without;
      if (prev.length >= NEEDED) return prev;

      const next = [...prev, film];
      // The fifth pick is the whole gesture — read it immediately rather than
      // making somebody find a button to claim what they have already earned.
      if (next.length === NEEDED) {
        startTransition(async () => {
          setReading(await readPrimer(next.map((f) => f.id)));
        });
      }
      return next;
    });
  }

  if (reading) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="label !text-gold">Your reading</p>
          <h3 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
            You lean{" "}
            {reading.traits.slice(0, 2).map((t) => t.label.toLowerCase()).join(" and ")}.
          </h3>

          <ul className="mt-7 space-y-3">
            {reading.traits.map((trait) => (
              <li key={trait.label} className="flex items-center gap-4">
                <span className="w-44 shrink-0 text-sm text-paper">{trait.label}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-gold"
                    style={{ width: `${Math.round(trait.strength * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-7 max-w-xl text-sm leading-relaxed text-muted">
            Read from the five films themselves — what they are, not what you
            said about them. Rate a few properly and it sharpens into
            something with a name.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <>
                <Link
                  href="/watch/taste"
                  className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
                >
                  View my taste →
                </Link>
                <Link
                  href="/watch"
                  className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
                >
                  Find something to watch
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-up"
                  className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20"
                >
                  Keep this — create an account
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setPicked([]);
                    setReading(null);
                  }}
                  className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-line-bright hover:text-paper"
                >
                  Start again
                </button>
              </>
            )}
          </div>

          {!signedIn && (
            <p className="mt-3 text-xs text-faint">
              Nothing was saved. An account keeps this and builds on it every
              time you rate something.
            </p>
          )}
        </div>

        {reading.suggestions.length > 0 && (
          <aside className="lg:border-l lg:border-line lg:pl-10">
            <p className="label">So you might want</p>
            <ul className="mt-4 space-y-4">
              {reading.suggestions.map((film) => (
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
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-sm text-muted">
          Pick five films you love.{" "}
          <span className="readout text-faint">
            {picked.length}/{NEEDED}
          </span>
        </p>
        {pending && <p className="label !text-gold">Reading…</p>}
      </div>

      <ul className="mt-5 grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
        {shelf.map((film) => {
          const on = picked.some((f) => f.id === film.id);
          return (
            <li key={film.id}>
              <button
                type="button"
                onClick={() => toggle(film)}
                aria-pressed={on}
                title={`${film.title} (${film.year})`}
                className={`group relative block w-full overflow-hidden rounded-[3px] border-2 transition-all ${
                  on ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"
                }`}
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
                {on && (
                  <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[0.6875rem] font-bold text-ink">
                    ♥
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
