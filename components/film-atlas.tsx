"use client";

import Link from "next/link";
import { useState } from "react";
import { COUNTRIES, project } from "@/lib/atlas";
import type { CountryStat } from "@/lib/geography";

/**
 * Cinema without borders — where the films came from.
 *
 * A bubble per production country on an equirectangular graticule, sized by
 * how many films and lit by how highly they were rated. No coastlines: the
 * outlines would be a megabyte of paths in service of one dot per country,
 * and a filled map would have to pick a single country for every
 * co-production. The grid is enough to read longitude at a glance, and the
 * shape the bubbles make is the actual subject.
 *
 * Selecting a country is a plain button, so this works from a keyboard, and
 * the list beside the map is the same data in a form a screen reader can
 * read straight through — the map itself is `aria-hidden`.
 */
export function FilmAtlas({
  countries,
  unplaced,
}: {
  countries: CountryStat[];
  unplaced: number;
}) {
  const [active, setActive] = useState<string | null>(
    countries[0]?.code ?? null,
  );
  if (countries.length === 0) return null;

  const peak = Math.max(...countries.map((c) => c.films), 1);
  const selected = countries.find((c) => c.code === active) ?? null;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
      <div>
        <div
          className="relative w-full overflow-hidden rounded-xl border border-line bg-ink-sunk"
          style={{ aspectRatio: "350 / 122" }}
        >
          {/* Graticule. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
              <line
                key={lon}
                x1={project(0, lon).x}
                y1={0}
                x2={project(0, lon).x}
                y2={100}
                stroke="var(--color-line)"
                strokeWidth={lon === 0 ? 0.28 : 0.14}
              />
            ))}
            {[60, 30, 0, -30].map((lat) => (
              <line
                key={lat}
                x1={0}
                y1={project(lat, 0).y}
                x2={100}
                y2={project(lat, 0).y}
                stroke="var(--color-line)"
                strokeWidth={lat === 0 ? 0.28 : 0.14}
              />
            ))}
          </svg>

          {/* Bubbles. Area scales with count — radius on sqrt — so twice the
              films looks like twice as much ink, not four times. */}
          {countries.map((c) => {
            const place = COUNTRIES[c.code];
            if (!place) return null;
            const { x, y } = project(place[1], place[2]);
            const size = 10 + Math.sqrt(c.films / peak) * 30;
            const isOn = c.code === active;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => setActive(c.code)}
                aria-pressed={isOn}
                className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: size,
                  height: size,
                  background: isOn ? "var(--color-gold)" : "var(--color-accent)",
                  opacity: isOn ? 0.95 : 0.42,
                  boxShadow: isOn ? "0 0 0 2px var(--color-gold)" : undefined,
                }}
              >
                <span className="sr-only">
                  {c.name}, {c.films} film{c.films === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
          Bubble area is films watched · gold is selected
          {unplaced > 0 && ` · ${unplaced} without production data`}
        </p>
      </div>

      <aside>
        {selected && (
          <div className="rounded-xl border border-line p-6">
            <p className="font-display text-3xl leading-none">{selected.name}</p>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Films</dt>
                <dd className="tabular-nums">{selected.films}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Mean</dt>
                <dd className="tabular-nums text-gold">
                  {selected.mean?.toFixed(1) ?? "—"}
                </dd>
              </div>
            </dl>
            {selected.favourite && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="label">Favourite</p>
                <Link
                  href={`/films/${selected.favourite.slug}`}
                  className="mt-2 block font-display text-xl leading-tight transition-colors hover:text-gold"
                >
                  {selected.favourite.title}
                </Link>
                <p className="mt-1 font-sans text-xs text-faint tabular-nums">
                  {selected.favourite.score.toFixed(1)}
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="mt-5 max-h-64 space-y-1 overflow-y-auto pr-2">
          {countries.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => setActive(c.code)}
                className={`flex w-full justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-ink-raised ${
                  c.code === active ? "text-gold" : "text-muted"
                }`}
              >
                <span>{c.name}</span>
                <span className="tabular-nums text-faint">{c.films}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
