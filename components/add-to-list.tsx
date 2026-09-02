"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToList } from "@/app/actions/films";

/**
 * "Add to list", on a film page.
 *
 * The list pages have always told people to add films from a film page, and
 * until now no film page offered it — the server action existed with nothing
 * calling it, so a list could only ever be filled at the moment it was
 * created. This is the missing half of building a list.
 *
 * A select and a button rather than a menu of every list: somebody with
 * twenty lists needs a scrollable control, and the native one is the only
 * one that is already accessible, keyboard-navigable and correct on a phone.
 */

export type ListOption = { id: string; title: string; count: number };

export function AddToList({
  filmId,
  slug,
  lists,
}: {
  filmId: string;
  slug: string;
  lists: ListOption[];
}) {
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (lists.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-faint">
        No lists yet.{" "}
        <Link
          href="/lists/new"
          className="text-gold underline underline-offset-4"
        >
          Build one
        </Link>{" "}
        and this film can be its first entry.
      </p>
    );
  }

  function add() {
    const formData = new FormData();
    formData.set("filmId", filmId);
    formData.set("slug", slug);
    formData.set("listId", listId);

    startTransition(async () => {
      const result = await addToList(formData);
      setNote(result.message ?? (result.ok ? "Added" : "That didn't work"));
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={listId}
          onChange={(e) => {
            setListId(e.target.value);
            setNote(null);
          }}
          aria-label="Choose a list"
          className="min-w-0 flex-1 rounded-[3px] border border-line bg-transparent px-4 py-2 text-sm text-paper transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id} className="bg-ink">
              {list.title} ({list.count})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={add}
          disabled={pending || !listId}
          className="shrink-0 rounded-[3px] border border-line px-4 py-2 font-sans text-[0.6875rem] tracking-[0.12em] uppercase transition-colors hover:border-faint disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>

      {note && (
        <p className="mt-2 text-xs text-gold" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
