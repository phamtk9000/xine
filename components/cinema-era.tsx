"use client";

import Link from "next/link";
import { useState } from "react";
import type { EraPair, EraReading, YearCell } from "@/lib/era";
import { LOVED_AT } from "@/lib/era";

/**
 * The viewer's place in film history.
 *
 * One column of blocks per release year, one block per film, so the height IS
 * the count — no scale to read and no axis to trust. Why the centre of
 * gravity sits where it does is visible in the silhouette rather than
 * asserted underneath it.
 *
 * The era is a tonal density field behind the columns, not a filled
 * rectangle. A hard-edged block reads as a selected range in a trading chart
 * and implies a boundary the statistic doesn't have — the era is where the
 * viewing is dense, and a gradient is what density looks like. The only hard
 * mark on the whole graph is the centre of gravity, in gold, because that one
 * is a single exact year.
 *
 * WATCHED and RATED 8+ are separate readings of the same history. Switching
 * redraws everything, which is the point: what somebody puts on is not what
 * they love, and the two silhouettes rarely sit in the same place.
 */
export function CinemaEra({ era }: { era: EraPair }) {
  const [loved, setLoved] = useState(false);
  const [hover, setHover] = useState<YearCell | null>(null);

  const canSwitch = !!era.loved;
  const view: EraReading = loved && era.loved ? era.loved : era.watched;
  const span = Math.max(1, view.axisTo - view.axisFrom);
  const at = (year: number) => ((year - view.axisFrom) / span) * 100;

  const decades: number[] = [];
  for (let d = view.axisFrom; d <= view.axisTo; d += 10) decades.push(d);

  // Size the blocks so the tallest column nearly fills the plot, capped so a
  // sparse history doesn't turn into three fat slabs. A fixed height instead
  // would leave a one-film-per-year distribution as a barely visible rug.
  const PLOT = 144;
  const blockHeight = Math.min(20, (PLOT - 3 * (view.peak - 1)) / view.peak);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          <p className="label">{loved ? "Taste era" : "Watching era"}</p>
          <p className="mt-3 font-display text-5xl leading-none tracking-tight sm:text-6xl">
            {view.from}
            <span className="mx-2 text-muted">–</span>
            {view.to}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="label">Centre of gravity</p>
          <p className="mt-3 font-display text-5xl leading-none tracking-tight text-gold sm:text-6xl">
            {view.centre}
          </p>
        </div>
      </div>

      {canSwitch && (
        <div className="mt-8 flex items-center gap-1.5" role="group" aria-label="Distribution">
          <Mode on={!loved} onClick={() => setLoved(false)}>
            Watched
          </Mode>
          <Mode on={loved} onClick={() => setLoved(true)}>
            Rated {LOVED_AT}+
          </Mode>
        </div>
      )}

      {/* ── the graph ─────────────────────────────────────────────── */}
      <div className="relative mt-10 select-none">
        {/* Columns. One block per film, stacked from the baseline. */}
        <div className="relative flex h-36 items-end">
          {/* Density field: the era as light gathering around the viewing,
              faded on all four sides. A flat rectangle here reads as a
              selected range in a trading chart and asserts an edge the
              statistic does not have — the era is where the films are dense,
              so it is drawn as density. */}
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: `linear-gradient(90deg,
                transparent ${Math.max(0, at(view.from) - 8)}%,
                rgba(201,162,39,0.04) ${at(view.from)}%,
                rgba(201,162,39,0.10) ${(at(view.from) + at(view.to)) / 2}%,
                rgba(201,162,39,0.04) ${at(view.to)}%,
                transparent ${Math.min(100, at(view.to) + 8)}%)`,
              maskImage:
                "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage:
                "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)",
            }}
          />
          {view.years.map((cell) => (
            <button
              key={cell.year}
              type="button"
              disabled={cell.count === 0}
              onMouseEnter={() => cell.count && setHover(cell)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => cell.count && setHover(cell)}
              onBlur={() => setHover(null)}
              className="group relative flex h-full flex-1 flex-col justify-end gap-[2px] disabled:cursor-default focus-visible:outline-none"
              aria-label={
                cell.count
                  ? `${cell.year}, ${cell.count} film${cell.count === 1 ? "" : "s"}`
                  : undefined
              }
            >
              {Array.from({ length: cell.count }, (_, b) => (
                <span
                  key={b}
                  className="block w-full rounded-[1px] bg-paper/55 transition-colors group-hover:bg-gold group-focus-visible:bg-gold"
                  style={{ height: `${blockHeight}px` }}
                />
              ))}
            </button>
          ))}
        </div>

        {/* Baseline and decade rules. */}
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-0 h-px bg-line" aria-hidden="true" />
          {decades.map((d) => (
            <span
              key={d}
              className="absolute top-0 -translate-x-1/2 font-sans text-[0.625rem] tracking-[0.14em] text-faint tabular-nums"
              style={{ left: `${at(d)}%`, paddingTop: 6 }}
            >
              {d}
            </span>
          ))}

          {/* Centre of gravity — the one hard mark. */}
          <span
            className="absolute -top-36 h-36 w-px bg-gold/60"
            style={{ left: `${at(view.centre)}%` }}
            aria-hidden="true"
          />
          <span
            className="absolute -top-1 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-gold"
            style={{ left: `${at(view.centre)}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Hover read-out. Fixed height so the layout never jumps as the
            pointer crosses the columns. */}
        <div className="mt-4 h-10">
          {hover && (
            <p className="font-sans text-xs text-muted">
              <span className="text-paper tabular-nums">{hover.year}</span>
              {" · "}
              {hover.count} film{hover.count === 1 ? "" : "s"}
              {hover.mean !== null && (
                <>
                  {" · mean "}
                  <span className="text-gold tabular-nums">
                    {hover.mean.toFixed(1)}
                  </span>
                </>
              )}
              {hover.best && (
                <>
                  {" · "}
                  <span className="text-paper">{hover.best.title}</span>{" "}
                  <span className="tabular-nums">
                    {hover.best.score.toFixed(1)}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── three small reference points ───────────────────────────── */}
      <dl className="mt-6 grid grid-cols-3 gap-6 border-t border-line pt-6">
        <Reference label="Earliest" year={view.earliest.year}>
          <Link
            href={`/films/${view.earliest.slug}`}
            className="transition-colors hover:text-gold"
          >
            {view.earliest.title}
          </Link>
        </Reference>
        <Reference label="Centre" year={view.centre} />
        <Reference label="Latest" year={view.latest.year}>
          <Link
            href={`/films/${view.latest.slug}`}
            className="transition-colors hover:text-gold"
          >
            {view.latest.title}
          </Link>
        </Reference>
      </dl>

      <p className="mt-8 max-w-xl font-display text-2xl leading-snug text-muted">
        {era.observation}
      </p>
    </div>
  );
}

function Mode({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[3px] border px-4 py-1.5 font-sans text-[0.625rem] tracking-[0.16em] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none ${
        on
          ? "border-gold text-gold"
          : "border-line text-faint hover:border-faint hover:text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Reference({
  label,
  year,
  children,
}: {
  label: string;
  year: number;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-2 font-sans text-sm tabular-nums text-paper">{year}</dd>
      {children && (
        <dd className="mt-0.5 truncate text-xs text-faint">{children}</dd>
      )}
    </div>
  );
}
