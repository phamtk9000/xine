"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rateFilm } from "@/app/actions/films";

/**
 * Rate a film without going to its page.
 *
 * Every derived thing on this site — the community score, taste DNA, the
 * archetype, neighbours, the monthly dossier — is starved without rating
 * volume, and until now the only place to leave one was the film page. That
 * is a page you reach by deciding to reach it; the moment somebody is
 * actually willing to rate is while they are scrolling past a poster of
 * something they saw last week.
 *
 * So this is a ten-step scale drawn as ticks: one press, no dialog, no
 * confirmation. Whole numbers only — the axis breakdown and the decimal live
 * on the film page, and offering both here would turn a one-tap control into
 * a form. The rating is written as `overall` alone, which the model already
 * treats as the valid minimum (see lib/scores.ts).
 *
 * Optimistic on purpose: the tick lights immediately and the write follows.
 * A rating that fails silently is a small loss; a control that feels slow
 * does not get used at all.
 */

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function QuickRate({
  filmId,
  slug,
  mine,
  signedIn,
  className = "",
}: {
  filmId: string;
  slug: string;
  /** Their existing rating, if any — the scale renders filled up to it. */
  mine?: number | null;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(mine ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  if (!signedIn) {
    // A button, not a link, and that is a correctness fix rather than a
    // preference. On a grid this control sits inside the card's own <a>, and
    // an <a> inside an <a> is invalid HTML — React logs a hydration error and
    // the browser silently un-nests the markup, which breaks the card link
    // for every poster on the page.
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          router.push("/sign-in");
        }}
        className={`label cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${className}`}
      >
        Sign in to rate
      </button>
    );
  }

  function rate(score: number) {
    // Pressing the current value again clears nothing — there is no unrate
    // in the model — so it is simply re-sent, which is harmless.
    setValue(score);

    const formData = new FormData();
    formData.set("filmId", filmId);
    formData.set("slug", slug);
    formData.set("overall", String(score));

    startTransition(async () => {
      await rateFilm(formData);
    });
  }

  const shown = hover ?? value;

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      onMouseLeave={() => setHover(null)}
      // Marks the control as precision work: the popcorn cursor stands down
      // over it and the click burst does not fire. A 32px carton of popcorn
      // sitting on top of a ten-step scale hides the very tick you are
      // aiming at, and seven kernels then fly across the answer.
      data-precise
    >
      <div className="flex items-end" role="group" aria-label="Rate">
        {STEPS.map((step) => {
          const on = shown !== null && step <= shown;
          return (
            <button
              key={step}
              type="button"
              // The whole control is inside a card that is itself a link on
              // some surfaces, so every press has to stop there.
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                rate(step);
              }}
              onMouseEnter={() => setHover(step)}
              onFocus={() => setHover(step)}
              aria-label={`Rate ${step} out of 10`}
              aria-pressed={value === step}
              // The hit area is 14px wide and the full height of the row; the
              // mark inside it is 7px. Ten targets seven pixels across with
              // three-pixel gaps was a control you had to aim at, and the
              // difference between a 7 and an 8 was one pixel of travel.
              // Padding is free — it costs nothing on screen and doubles the
              // thing your finger is actually trying to hit.
              className="flex w-[14px] cursor-pointer justify-center py-2 focus-visible:outline-none"
            >
              <span
                className={`block w-[7px] rounded-[1px] transition-all ${
                  on ? "bg-gold" : "bg-line-bright"
                }`}
                // Taller at the ends of the scale, like a real dial: the
                // shape tells you which way is up before a number does.
                style={{ height: on ? 14 : 7 }}
              />
            </button>
          );
        })}
      </div>

      <span className="readout w-6 text-[0.6875rem] text-faint tabular-nums">
        {shown !== null ? shown.toFixed(0) : "–"}
      </span>
    </div>
  );
}
