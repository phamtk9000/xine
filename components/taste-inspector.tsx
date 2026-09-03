"use client";

import { useState, useTransition } from "react";
import { DIMENSIONS } from "@/lib/rec/dimensions";
import { forgetTasteDimension, rebuildTasteFromRatings } from "@/app/actions/taste";

type DimensionRow = { value: number; confidence: number; samples: number };

/**
 * What xine has inferred, laid open.
 *
 * Every number here is a claim built from ratings and kept/refused
 * suggestions — never declared, never asked for directly — and a claim built
 * that way is sometimes wrong. This is the page where a reader checks the
 * working and corrects it, because a personalisation system that cannot be
 * inspected is not one anybody has reason to trust.
 *
 * Confidence is shown as a fill rather than a number: a bar mostly empty
 * reads instantly as "early guess", where "confidence: 0.31" needs a caption
 * to mean anything.
 */
export function TasteInspector({
  dims,
  affinities,
}: {
  dims: Record<string, DimensionRow>;
  affinities: { directors: string[]; countries: string[]; genres: string[] };
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [rebuilding, setRebuilding] = useState(false);

  const shown = DIMENSIONS.filter(
    (d) => dims[d.key] && !hidden.has(d.key) && dims[d.key].confidence > 0.08,
  ).sort((a, b) => dims[b.key].confidence - dims[a.key].confidence);

  function forget(key: string) {
    setHidden((prev) => new Set(prev).add(key));
    startTransition(() => {
      void forgetTasteDimension(key);
    });
  }

  async function rebuild() {
    setRebuilding(true);
    await rebuildTasteFromRatings();
    setRebuilding(false);
    window.location.reload();
  }

  if (shown.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        Nothing inferred yet — rate a handful of films, or keep and refuse a
        few suggestions on{" "}
        <a href="/watch" className="text-gold underline underline-offset-4">
          what to watch
        </a>
        , and this fills in.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-5">
        {shown.map((dimension) => {
          const row = dims[dimension.key];
          const onHighSide = row.value >= 0.5;
          const label = onHighSide ? dimension.high : dimension.low;
          const strength = Math.abs(row.value - 0.5) * 2;

          return (
            <li key={dimension.key} className="group">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-paper">
                  <span className="text-muted">You seem to prefer</span>{" "}
                  <span className="font-medium">{label.toLowerCase()}</span>
                  {strength < 0.25 && (
                    <span className="text-faint"> — mildly</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => forget(dimension.key)}
                  disabled={pending}
                  className="label shrink-0 text-[0.625rem] text-faint opacity-0 transition-opacity hover:!text-accent group-hover:opacity-100 disabled:opacity-30"
                >
                  Not right — forget this
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${Math.round(row.confidence * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {(affinities.directors.length > 0 ||
        affinities.countries.length > 0 ||
        affinities.genres.length > 0) && (
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {affinities.directors.length > 0 && (
            <div>
              <p className="label">Directors</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {affinities.directors.join(", ")}
              </p>
            </div>
          )}
          {affinities.countries.length > 0 && (
            <div>
              <p className="label">Cinemas</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {affinities.countries.join(", ")}
              </p>
            </div>
          )}
          {affinities.genres.length > 0 && (
            <div>
              <p className="label">Genres</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {affinities.genres.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={rebuild}
        disabled={rebuilding}
        className="label mt-10 rounded-full border border-line px-4 py-2 transition-colors hover:border-line-bright hover:text-paper disabled:opacity-50"
      >
        {rebuilding ? "Rebuilding…" : "Rebuild from ratings alone"}
      </button>
      <p className="mt-2 text-xs text-faint">
        Discards anything learned from kept or refused suggestions and starts
        over from what you have actually rated.
      </p>
    </div>
  );
}
