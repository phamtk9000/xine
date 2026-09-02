"use client";

import { useState, useTransition } from "react";
import { setEntryNote } from "@/app/actions/lists";

/**
 * The note under a film on a list you own.
 *
 * Edit in place rather than behind a modal or a separate page: a list is
 * written by scanning down it and adding a line where one occurs to you, and
 * anything that interrupts that rhythm means the notes never get written —
 * which is the state the feature was in before, with the column sitting
 * empty in the schema.
 *
 * Closed, it is either the note or a quiet prompt. Open, it is a textarea
 * that saves on blur as well as on Enter, because the most common way to
 * leave a field is to click somewhere else.
 */
export function EntryNote({
  entryId,
  note,
}: {
  entryId: string;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [saved, setSaved] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  function commit() {
    setEditing(false);
    const next = value.trim();
    if (next === saved) return;

    setSaved(next);
    const formData = new FormData();
    formData.set("entryId", entryId);
    formData.set("note", next);
    startTransition(async () => {
      await setEntryNote(formData);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // The row is a link to the film; editing its note is not.
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        className="mt-2 block max-w-xl text-left text-sm leading-relaxed transition-colors"
      >
        {saved ? (
          <span className="text-muted hover:text-paper">{saved}</span>
        ) : (
          <span className="label hover:text-paper">
            {pending ? "Saving…" : "Add a note +"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="mt-2 max-w-xl"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <textarea
        autoFocus
        rows={2}
        maxLength={280}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setValue(saved);
            setEditing(false);
          }
        }}
        placeholder="Why this one is here."
        className="w-full resize-y rounded-[3px] border border-line-bright bg-ink-raised px-3 py-2 text-sm leading-relaxed text-paper placeholder:text-faint focus:outline-none"
      />
      <p className="mt-1.5 text-[0.625rem] tracking-[0.14em] text-faint uppercase">
        Enter to save · Escape to cancel
      </p>
    </div>
  );
}
