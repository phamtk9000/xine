"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rateFilm, type ActionResult } from "@/app/actions/films";
import { AXES, deriveOverall, formatScore, type AxisKey } from "@/lib/scores";
import { Button, Notice } from "@/components/ui";

type Existing = {
  overall: number;
  story: number | null;
  direction: number | null;
  visual: number | null;
  performance: number | null;
  sound: number | null;
} | null;

/**
 * The rating control.
 *
 * The one-tap path stays one tap: drag Overall, submit. The breakdown is
 * opt-in, and once any axis is touched Overall derives from the axes so the
 * two can never disagree — unless the rater deliberately drags Overall
 * afterwards, which pins it.
 */
export function RatingForm({
  filmId,
  slug,
  existing,
  signedIn,
}: {
  filmId: string;
  slug: string;
  existing: Existing;
  signedIn: boolean;
}) {
  const hadBreakdown =
    !!existing && AXES.some(({ key }) => existing[key] !== null);

  const [overall, setOverall] = useState<number>(existing?.overall ?? 7);
  const [pinned, setPinned] = useState(!!existing && !hadBreakdown);
  const [open, setOpen] = useState(hadBreakdown);
  const [axes, setAxes] = useState<Record<AxisKey, number | null>>({
    story: existing?.story ?? null,
    direction: existing?.direction ?? null,
    visual: existing?.visual ?? null,
    performance: existing?.performance ?? null,
    sound: existing?.sound ?? null,
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const derived = deriveOverall(axes);
  const shown = pinned || derived === null ? overall : derived;

  function setAxis(key: AxisKey, value: number) {
    setAxes((prev) => ({ ...prev, [key]: value }));
    setPinned(false);
  }

  function submit(formData: FormData) {
    formData.set("filmId", filmId);
    formData.set("slug", slug);
    formData.set("overall", String(shown));
    for (const { key } of AXES) {
      formData.set(key, axes[key] === null ? "" : String(axes[key]));
    }
    startTransition(async () => setResult(await rateFilm(formData)));
  }

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-line bg-ink-raised p-6">
        <p className="label">Your rating</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Sign in to rate this on six axes and say why.
        </p>
        <Link
          href="/sign-in"
          className="mt-5 inline-flex rounded-full bg-accent px-5 py-2 text-sm font-medium text-paper"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-ink-raised p-6">
      <form action={submit}>
        <div className="flex items-baseline justify-between">
          <p className="label">Your rating</p>
          <p className="font-display text-4xl leading-none text-gold tabular-nums">
            {formatScore(shown)}
          </p>
        </div>

        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={shown}
          onChange={(e) => {
            setOverall(Number(e.target.value));
            setPinned(true);
          }}
          className="mt-4 w-full accent-[var(--color-gold)]"
          aria-label="Overall rating"
        />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="label mt-5 transition-colors hover:text-paper"
          aria-expanded={open}
        >
          {open ? "− Hide breakdown" : "+ Rate the breakdown"}
        </button>

        {open && (
          <div className="mt-5 space-y-4 border-t border-line pt-5">
            {AXES.map(({ key, label }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted">{label}</span>
                  <span className="font-sans text-xs text-paper tabular-nums">
                    {axes[key] === null ? "—" : formatScore(axes[key])}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={axes[key] ?? 5}
                  onChange={(e) => setAxis(key, Number(e.target.value))}
                  className="mt-1.5 w-full accent-[var(--color-gold)]"
                  aria-label={label}
                />
              </div>
            ))}
            {derived !== null && !pinned && (
              <p className="text-xs text-faint">
                Overall is the average of the axes you filled in. Drag it
                yourself to override.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {existing ? "Update rating" : "Save rating"}
          </Button>
        </div>
      </form>

      {result?.message && (
        <div className="mt-4">
          <Notice tone={result.ok ? "info" : "error"}>{result.message}</Notice>
        </div>
      )}
      {result?.ok && !result.message && (
        <p className="mt-4 text-xs text-muted">Saved.</p>
      )}
    </div>
  );
}
