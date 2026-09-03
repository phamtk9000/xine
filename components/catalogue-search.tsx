"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchCatalogue, type FilmPick } from "@/app/actions/lists";
import { PosterThumb } from "@/components/poster";

/**
 * Catalogue search that answers before you finish typing.
 *
 * The form still works exactly as it did — type, press Enter, land on a
 * filtered catalogue — because that is the right answer for "show me
 * everything by Villeneuve". The dropdown is for the other case, which is
 * most cases: you already know the film, and a results page is a detour on
 * the way to it. Three letters, one click, you are on the film.
 *
 * The same server action the list builder uses, so ranking is consistent:
 * an exact title beats a title that starts with the query, which beats one
 * that contains it, which beats a director.
 *
 * Keyboard is the whole point of a combobox, so arrows move through the
 * suggestions, Enter opens the highlighted one, and Escape closes without
 * submitting. Nothing here is reachable only by mouse.
 */

const DEBOUNCE_MS = 180;
const SHOWN = 7;

export function CatalogueSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<FilmPick[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const ticket = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to ask for, and nothing to clear either: what is on screen is
    // derived from the query below, so a stale result set for a two-letter
    // query is simply not rendered rather than being emptied from here.
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      const mine = ++ticket.current;
      searchCatalogue(trimmed)
        .then((rows) => {
          // A reply older than the one on screen is dropped, or a slow
          // request for "ma" overwrites the results for "margin call".
          if (mine !== ticket.current) return;
          setResults(rows.slice(0, SHOWN));
          setOpen(true);
          setCursor(-1);
        })
        .catch(() => {
          if (mine === ticket.current) setResults([]);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  // Clicking anywhere else closes it. Blur alone would fire before a click
  // on a suggestion could register.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const visible = open && query.trim().length >= 2 && results.length > 0;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c <= 0 ? results.length - 1 : c - 1));
    } else if (event.key === "Enter" && cursor >= 0) {
      // Only when something is highlighted; otherwise the form submits and
      // the reader gets the full result set, which is what they asked for.
      event.preventDefault();
      router.push(`/films/${results[cursor].slug}`);
      setOpen(false);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <form action="/films" className="flex gap-2">
        <input
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search title or director"
          aria-label="Search films"
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-controls="catalogue-suggestions"
          className="w-full rounded-[3px] border border-line bg-ink-raised px-4 py-2 text-sm placeholder:text-faint focus:border-line-bright focus:outline-none"
        />
      </form>

      {visible && (
        <ul
          id="catalogue-suggestions"
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-[3px] border border-line-bright bg-ink-raised shadow-xl"
        >
          {results.map((film, index) => (
            <li key={film.id} role="option" aria-selected={index === cursor}>
              <Link
                href={`/films/${film.slug}`}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setCursor(index)}
                className={`flex items-center gap-3 border-b border-line p-2 pr-4 transition-colors last:border-0 ${
                  index === cursor ? "bg-ink" : ""
                }`}
              >
                <PosterThumb film={film} className="w-8 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{film.title}</span>
                  <span className="block truncate text-xs text-faint">
                    {film.director} · {film.year}
                  </span>
                </span>
                {film.kind === "series" && (
                  <span className="label !text-[0.5625rem]">Series</span>
                )}
              </Link>
            </li>
          ))}

          <li className="border-t border-line">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`/films?q=${encodeURIComponent(query.trim())}`);
              }}
              className="label w-full px-4 py-3 text-left transition-colors hover:text-paper"
            >
              See everything for “{query.trim()}” →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
