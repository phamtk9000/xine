"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createList,
  searchCatalogue,
  type FilmPick,
  type ListState,
} from "@/app/actions/lists";
import { PosterThumb } from "@/components/poster";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";

/**
 * The list builder.
 *
 * The picker searches the server on every keystroke rather than filtering a
 * prefetched array — see searchCatalogue in app/actions/lists.ts for why the
 * old shape could not work. What that changes here is that replies can arrive
 * out of order, so every search carries a ticket and a reply older than the
 * one already on screen is dropped.
 *
 * Picked films are held as whole objects rather than ids. The list underneath
 * is a moving window onto fifteen hundred titles, so a picked id would have
 * nothing to render itself from the moment somebody typed a second search.
 */

const DEBOUNCE_MS = 200;

export function NewListForm({ initial }: { initial: FilmPick[] }) {
  const [state, action, pending] = useActionState<ListState, FormData>(
    createList,
    null,
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmPick[]>(initial);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<FilmPick[]>([]);

  // Monotonic: a reply renders only while no newer search has been sent.
  const ticket = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const mine = ++ticket.current;
      setSearching(true);
      searchCatalogue(query)
        .then((rows) => {
          if (mine === ticket.current) setResults(rows);
        })
        .catch(() => {
          if (mine === ticket.current) setResults([]);
        })
        .finally(() => {
          if (mine === ticket.current) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const pickedIds = new Set(picked.map((film) => film.id));

  function toggle(film: FilmPick) {
    setPicked((prev) =>
      prev.some((p) => p.id === film.id)
        ? prev.filter((p) => p.id !== film.id)
        : [...prev, film],
    );
  }

  function move(index: number, by: -1 | 1) {
    setPicked((prev) => {
      const to = index + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  return (
    <form action={action} className="space-y-6">
      <Field label="Title">
        <Input name="title" required placeholder="Rooms that should not exist" />
      </Field>

      <Field label="Description" hint="What is the argument?">
        <Textarea
          name="description"
          rows={4}
          placeholder="Architecture as antagonist. Buildings whose plans do not match their interiors…"
        />
      </Field>

      <div>
        <p className="label">Films</p>
        <p className="mt-1.5 text-xs text-faint">
          {picked.length === 0
            ? "Search the catalogue below and pick the ones that make the case."
            : `${picked.length} picked, in this order — use the arrows to change it.`}
        </p>

        {picked.length > 0 && (
          <ol className="mt-4 space-y-2">
            {picked.map((film, i) => (
              <li
                key={film.id}
                className="flex items-center gap-3 rounded-[3px] border border-line bg-ink-raised p-2 pr-3"
              >
                <span className="w-6 shrink-0 text-center font-sans text-xs text-faint tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <PosterThumb film={film} className="w-8 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {film.title}
                  <span className="ml-2 text-faint tabular-nums">
                    {film.year}
                  </span>
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <Nudge
                    label={`Move ${film.title} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    d="M10 15V5M5 10l5-5 5 5"
                  />
                  <Nudge
                    label={`Move ${film.title} down`}
                    disabled={i === picked.length - 1}
                    onClick={() => move(i, 1)}
                    d="M10 5v10M5 10l5 5 5-5"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(film)}
                    className="label ml-1 transition-colors hover:text-accent"
                  >
                    Remove
                  </button>
                </div>
                <input type="hidden" name="films" value={film.id} />
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue by title or director"
            aria-label="Search films to add"
            autoComplete="off"
          />
        </div>

        <ul
          className="mt-3 max-h-96 overflow-y-auto rounded-[3px] border border-line"
          aria-busy={searching}
        >
          {results.map((film) => {
            const on = pickedIds.has(film.id);
            return (
              <li key={film.id}>
                <button
                  type="button"
                  onClick={() => toggle(film)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 border-b border-line p-2 pr-4 text-left transition-colors last:border-0 hover:bg-ink-raised ${
                    on ? "text-gold" : "text-paper"
                  }`}
                >
                  <PosterThumb film={film} className="w-10 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {film.title}
                      {film.kind === "series" && (
                        <span className="ml-2 font-sans text-[0.625rem] tracking-[0.14em] text-faint uppercase">
                          Series
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {film.director} · {film.year}
                    </span>
                  </span>
                  <span
                    className="font-sans text-sm text-faint"
                    aria-hidden="true"
                  >
                    {on ? "✓" : "+"}
                  </span>
                </button>
              </li>
            );
          })}

          {results.length === 0 && (
            <li className="px-4 py-4 text-sm text-faint">
              {searching
                ? "Searching…"
                : "Nothing in the catalogue matches that."}
            </li>
          )}
        </ul>

        <p className="mt-2 text-xs text-faint" role="status">
          {searching
            ? "Searching the catalogue…"
            : query.trim()
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : "Showing what people rate most. Type to search the whole catalogue."}
        </p>
      </div>

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish list"}
      </Button>
    </form>
  );
}

function Nudge({
  label,
  disabled,
  onClick,
  d,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-[3px] border border-line p-1.5 text-muted transition-colors hover:border-faint hover:text-paper disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </button>
  );
}
