"use client";

import * as React from "react";
import { DIMENSIONS, NEUTRAL, type DimensionKey, type Vector } from "@/lib/rec/dimensions";

/**
 * The sliders, for when a chip is not precise enough.
 *
 * Folded away by default and that is not a compromise — it is the whole
 * design. Nine sliders in front of somebody who wants to watch a film in ten
 * minutes is a configuration screen, and the honest default for almost every
 * evening is the six chips above. This is here for the reader who knows
 * exactly what they want and cannot say it in a mood: something demanding
 * but not bleak, talky, slow, and not weird.
 *
 * Untouched sliders send nothing. A slider parked at the middle means "no
 * opinion" and must not become a request for the middle — a film that is
 * exactly average on nine dimensions is not what anybody meant, and a
 * recommender that reads the default position as an instruction will find one.
 */

/** The nine worth exposing. The rest are read from the words people type. */
const SHOWN: DimensionKey[] = [
  "pace",
  "weight",
  "accessibility",
  "realism",
  "dialogue",
  "story",
  "darkness",
  "familiarity",
  "weirdness",
];

/**
 * Endings, as a mood rather than a fact.
 *
 * No film in the catalogue records how it ends — TMDB does not carry it and
 * nobody has tagged eighteen thousand of them by hand. So this is read as
 * what people mean by it: "uplifting" is a request for something that does
 * not leave you flattened, and it moves darkness and weight accordingly.
 * Labelled honestly in the interface rather than promising a filter that
 * would silently be a guess.
 */
const ENDINGS: { value: string; label: string; soft: Vector }[] = [
  { value: "any", label: "Any", soft: {} },
  { value: "uplifting", label: "Uplifting", soft: { darkness: 0.22, weight: 0.35 } },
  { value: "bittersweet", label: "Bittersweet", soft: { weight: 0.75, darkness: 0.55 } },
  { value: "dark", label: "Dark", soft: { darkness: 0.85, weight: 0.75 } },
  { value: "ambiguous", label: "Ambiguous", soft: { accessibility: 0.75, weirdness: 0.68 } },
];

export function endingSoft(value: string | undefined): Vector {
  return ENDINGS.find((ending) => ending.value === value)?.soft ?? {};
}

export function FineTune({
  fine,
  ending,
  onChange,
  disabled = false,
}: {
  fine: Vector;
  ending?: string;
  onChange: (next: { fine: Vector; ending?: string }) => void;
  disabled?: boolean;
}) {
  const touched = Object.keys(fine).length + (ending && ending !== "any" ? 1 : 0);

  return (
    <details className="group mt-8 border-t border-line pt-6">
      <summary className="label flex cursor-pointer items-center justify-between transition-colors hover:text-paper">
        <span>Fine tune</span>
        <span className="text-faint">
          {touched > 0 ? `${touched} set` : "+"}
        </span>
      </summary>

      <div className="mt-5 space-y-5">
        {SHOWN.map((key) => {
          const dimension = DIMENSIONS.find((d) => d.key === key)!;
          const value = fine[key];
          const on = value !== undefined;

          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-[0.625rem] tracking-[0.12em] text-faint uppercase">
                  {dimension.low}
                </span>
                {on && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...fine };
                      delete next[key];
                      onChange({ fine: next, ending });
                    }}
                    className="font-sans text-[0.5625rem] tracking-[0.12em] text-faint uppercase underline underline-offset-2 hover:text-paper"
                  >
                    clear
                  </button>
                )}
                <span className="font-sans text-[0.625rem] tracking-[0.12em] text-faint uppercase">
                  {dimension.high}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                value={Math.round((value ?? NEUTRAL) * 100)}
                onChange={(event) =>
                  onChange({
                    fine: { ...fine, [key]: Number(event.target.value) / 100 },
                    ending,
                  })
                }
                className={`mt-2 w-full accent-gold ${on ? "opacity-100" : "opacity-40"}`}
                aria-label={`${dimension.low} to ${dimension.high}`}
              />
            </div>
          );
        })}

        <div className="border-t border-line pt-5">
          <p className="font-sans text-[0.625rem] tracking-[0.12em] text-faint uppercase">
            Ending
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ENDINGS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={(ending ?? "any") === option.value}
                onClick={() => onChange({ fine, ending: option.value })}
                className={`label rounded-full border px-3 py-1.5 !text-[0.5625rem] transition-colors ${
                  (ending ?? "any") === option.value
                    ? "border-gold bg-gold/10 !text-gold"
                    : "border-line !text-faint hover:border-line-bright hover:!text-paper"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-faint">
            Read as a mood, not a fact — no film here records how it ends, so
            this moves what the deck looks for rather than filtering on it.
          </p>
        </div>
      </div>
    </details>
  );
}
