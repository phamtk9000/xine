"use client";

import { useState } from "react";
import { ARCHETYPES, type ArchetypeKey } from "@/lib/archetype";
import { AXES, round1, type AxisKey } from "@/lib/scores";

/**
 * The rating system, argued rather than described.
 *
 * The old version of this section stated the case in prose and then drew a
 * bar chart of one film's five axes beside it — which illustrates the
 * breakdown but not the claim. The claim is that two people can land on the
 * same number and mean opposite things, and a single column of bars cannot
 * show that: it has nobody to disagree with.
 *
 * So this puts two readers on one film. Both gave it the same overall, both
 * would show four stars anywhere else on the internet, and the five axes
 * underneath them run in opposite directions. Every pair here is arithmetic
 * rather than decoration — each reader's axes average to exactly the shared
 * overall, which is what `deriveOverall` in lib/scores.ts actually does — so
 * the identical score is a real consequence of the numbers and not a caption
 * asking to be believed.
 *
 * The two figures are the site's own archetypes (lib/archetype.ts), which is
 * the point the section closes on: the axis you reward is a taste, it has a
 * name, and the profile will tell you which one is yours.
 *
 * Illustrative, and labelled as such — the films are real, the two readers
 * are not.
 */

type Reader = {
  archetype: ArchetypeKey;
  scores: Record<AxisKey, number>;
};

type Scenario = {
  film: string;
  year: number;
  /** Both readers' overall. Equal to the mean of each reader's five axes. */
  overall: number;
  readers: [Reader, Reader];
};

const SCENARIOS: Scenario[] = [
  {
    film: "Blade Runner 2049",
    year: 2017,
    overall: 8.4,
    readers: [
      {
        archetype: "colourist",
        scores: {
          story: 6.2,
          direction: 8.4,
          visual: 9.9,
          performance: 8.0,
          sound: 9.5,
        },
      },
      {
        archetype: "archivist",
        scores: {
          story: 9.6,
          direction: 9.0,
          visual: 7.4,
          performance: 8.4,
          sound: 7.6,
        },
      },
    ],
  },
  {
    film: "Whiplash",
    year: 2014,
    overall: 9.0,
    readers: [
      {
        archetype: "listener",
        scores: {
          story: 7.8,
          direction: 8.8,
          visual: 8.6,
          performance: 9.8,
          sound: 10,
        },
      },
      {
        archetype: "draughtsman",
        scores: {
          story: 9.2,
          direction: 9.8,
          visual: 9.4,
          performance: 9.2,
          sound: 7.4,
        },
      },
    ],
  },
  {
    film: "Tár",
    year: 2022,
    overall: 8.8,
    readers: [
      {
        archetype: "confidant",
        scores: {
          story: 8.0,
          direction: 8.6,
          visual: 8.4,
          performance: 10,
          sound: 9.0,
        },
      },
      {
        archetype: "archivist",
        scores: {
          story: 9.8,
          direction: 9.2,
          visual: 8.6,
          performance: 8.0,
          sound: 8.4,
        },
      },
    ],
  },
];

/** Where the pair disagrees hardest — the whole reason the section exists. */
function widestGap(readers: [Reader, Reader]) {
  return AXES.map(({ key, label }) => ({
    key,
    label,
    gap: round1(Math.abs(readers[0].scores[key] - readers[1].scores[key])),
  })).reduce((worst, axis) => (axis.gap > worst.gap ? axis : worst));
}

/* ---- the two profiles as one shape ------------------------------------- */

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 74;
/** Same floor as TasteDna: real ratings live between about 6 and 10, and a
 *  0-based polygon is a near-perfect pentagon for everybody. */
const FLOOR = 5;

function vertex(index: number, value: number) {
  const angle = (index / AXES.length) * Math.PI * 2 - Math.PI / 2;
  const radius = (Math.max(value - FLOOR, 0) / (10 - FLOOR)) * R;
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius] as const;
}

function polygon(reader: Reader) {
  return AXES.map(({ key }, i) => vertex(i, reader.scores[key]).join(",")).join(
    " ",
  );
}

function Silhouettes({ readers }: { readers: [Reader, Reader] }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-full w-full"
      aria-hidden="true"
    >
      {/* One faint ring for the scale, and the spokes the vertices sit on.
          Anything more and it reads as an analytics chart. */}
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="1"
      />
      {AXES.map((_, i) => {
        const [x, y] = vertex(i, 10);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="var(--color-line)"
            strokeWidth="0.75"
          />
        );
      })}

      {readers.map((reader) => {
        const { color } = ARCHETYPES[reader.archetype];
        return (
          <polygon
            key={reader.archetype}
            points={polygon(reader)}
            fill={color}
            fillOpacity={0.14}
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

/* ---- the section -------------------------------------------------------- */

function Stars() {
  // Four of five, the blunt instrument the section is arguing against.
  return (
    <span className="text-sm tracking-[0.18em] text-faint" aria-hidden="true">
      ★★★★<span className="text-line-bright">★</span>
    </span>
  );
}

export function RatingSplit() {
  const [index, setIndex] = useState(0);
  const scenario = SCENARIOS[index];
  const [left, right] = scenario.readers;
  const worst = widestGap(scenario.readers);

  return (
    <div>
      {/* Which film the two of them are arguing about. */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-4"
        role="tablist"
        aria-label="Sample films"
      >
        <span className="label">Same film</span>
        {SCENARIOS.map((option, i) => (
          <button
            key={option.film}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`font-display text-lg leading-none transition-colors ${
              i === index
                ? "text-paper underline decoration-gold underline-offset-[6px]"
                : "text-faint hover:text-muted"
            }`}
          >
            {option.film}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          {/* Both verdicts, stated the flat way the rest of the internet
              would state them — identical, and useless. */}
          <div className="grid grid-cols-2 gap-6">
            {scenario.readers.map((reader) => {
              const figure = ARCHETYPES[reader.archetype];
              return (
                <div key={reader.archetype}>
                  <span
                    className="block h-0.5 w-8"
                    style={{ background: figure.color }}
                  />
                  <p className="mt-3 text-sm text-muted">{figure.name}</p>
                  <p className="mt-2 flex items-baseline gap-3">
                    <span className="font-display text-5xl leading-none tabular-nums">
                      {scenario.overall.toFixed(1)}
                    </span>
                    <Stars />
                  </p>
                </div>
              );
            })}
          </div>

          {/* The five axes, opposed. Each row is one axis read twice. */}
          <dl className="mt-8 space-y-3.5">
            {AXES.map(({ key, label }) => {
              const a = left.scores[key];
              const b = right.scores[key];
              const widest = key === worst.key;
              return (
                <div
                  key={key}
                  // Tighter fixed columns on a phone: at 375px the desktop
                  // template leaves the two bars 59px each, which is not
                  // enough length for a difference to be visible at all.
                  className="grid grid-cols-[2rem_1fr_4.75rem_1fr_2rem] items-center gap-1.5 sm:grid-cols-[2.4rem_1fr_6.75rem_1fr_2.4rem] sm:gap-2"
                >
                  <dd className="text-right font-sans text-xs tabular-nums transition-colors"
                    style={{ color: widest ? ARCHETYPES[left.archetype].color : undefined }}
                  >
                    {a.toFixed(1)}
                  </dd>
                  {/* Bars grow outward from the label, so the row reads as
                      two people pulling in opposite directions. */}
                  <dd className="flex h-1.5 justify-end">
                    <span
                      className="h-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${(a / 10) * 100}%`,
                        background: ARCHETYPES[left.archetype].color,
                        opacity: widest ? 1 : 0.42,
                      }}
                    />
                  </dd>
                  <dt
                    className={`text-center text-[0.5625rem] uppercase tracking-[0.06em] sm:text-[0.6875rem] sm:tracking-[0.1em] ${
                      widest ? "text-paper" : "text-faint"
                    }`}
                  >
                    {label}
                  </dt>
                  <dd className="flex h-1.5">
                    <span
                      className="h-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${(b / 10) * 100}%`,
                        background: ARCHETYPES[right.archetype].color,
                        opacity: widest ? 1 : 0.42,
                      }}
                    />
                  </dd>
                  <dd className="font-sans text-xs tabular-nums"
                    style={{ color: widest ? ARCHETYPES[right.archetype].color : undefined }}
                  >
                    {b.toFixed(1)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="mx-auto shrink-0">
          <div className="h-[220px] w-[220px]">
            <Silhouettes readers={scenario.readers} />
          </div>
          <p className="mt-2 text-center text-xs text-faint">
            Same score. Different shape.
          </p>
        </div>
      </div>

      <p className="mt-8 border-t border-line pt-5 text-sm leading-relaxed text-muted">
        Same verdict, opposite film.{" "}
        <span className="text-paper">
          They disagree most on {worst.label} — {worst.gap.toFixed(1)} apart
        </span>
        , and that gap is the only part of either rating worth reading.
      </p>
      <p className="mt-3 text-xs text-faint">
        Illustration. The films are real; the two readers are figures from the
        taste profile, one per axis.
      </p>
    </div>
  );
}
