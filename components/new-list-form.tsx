"use client";

import { useActionState, useMemo, useState } from "react";
import { createList, type ListState } from "@/app/actions/lists";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import type { FilmSummary } from "@/lib/films";

export function NewListForm({ films }: { films: FilmSummary[] }) {
  const [state, action, pending] = useActionState<ListState, FormData>(
    createList,
    null,
  );
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return films.slice(0, 12);
    return films
      .filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.director.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [films, query]);

  const byId = useMemo(
    () => new Map(films.map((f) => [f.id, f])),
    [films],
  );

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
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
          {picked.length} selected. Order follows the order you pick them in.
        </p>

        {picked.length > 0 && (
          <ol className="mt-4 space-y-2">
            {picked.map((id, i) => {
              const film = byId.get(id);
              if (!film) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-ink-raised px-4 py-2.5"
                >
                  <span className="font-sans text-xs text-faint tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {film.title}
                    <span className="ml-2 text-faint">{film.year}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="label transition-colors hover:text-accent"
                  >
                    Remove
                  </button>
                  <input type="hidden" name="films" value={id} />
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue"
            aria-label="Search films to add"
          />
        </div>

        <ul className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-line">
          {matches.map((film) => {
            const on = picked.includes(film.id);
            return (
              <li key={film.id}>
                <button
                  type="button"
                  onClick={() => toggle(film.id)}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left text-sm transition-colors last:border-0 ${
                    on ? "text-gold" : "text-muted hover:text-paper"
                  }`}
                >
                  <span className="flex-1 truncate">
                    {film.title}{" "}
                    <span className="text-faint">
                      {film.director} · {film.year}
                    </span>
                  </span>
                  <span className="font-sans text-xs">{on ? "✓" : "+"}</span>
                </button>
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="px-4 py-4 text-sm text-faint">
              Nothing in the catalogue matches that.
            </li>
          )}
        </ul>
      </div>

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish list"}
      </Button>
    </form>
  );
}
