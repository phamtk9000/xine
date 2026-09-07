"use client";

import { useState, useTransition } from "react";
import { markKeptWatched, removeKept } from "@/app/actions/kept";

/**
 * The two things worth doing with a film you have already kept.
 *
 * Optimistic and one-way: the card leaves the strip the moment either is
 * pressed, because both answers mean "this is dealt with" and leaving it
 * sitting there while a round trip completes makes the button feel broken.
 *
 * No undo here, unlike the deck. Watching a film is a fact rather than an
 * opinion, and removing something from a holding area is the kind of action
 * where offering to reverse it costs more attention than the mistake would.
 */
export function KeptActions({
  filmId,
  className = "",
}: {
  filmId: string;
  className?: string;
}) {
  const [gone, setGone] = useState<null | "watched" | "removed">(null);
  const [, startTransition] = useTransition();

  if (gone) {
    return (
      <p className={`text-[0.6875rem] text-faint ${className}`}>
        {gone === "watched" ? "Marked watched." : "Removed."}
      </p>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setGone("watched");
          startTransition(async () => {
            await markKeptWatched(filmId);
          });
        }}
        title="You have seen it — records a watch and clears it from here"
        className="label rounded-full border border-gold bg-gold/10 px-3 py-1 !text-[0.5625rem] !text-gold transition-colors hover:bg-gold/20"
      >
        Watched
      </button>
      <button
        type="button"
        onClick={() => {
          setGone("removed");
          startTransition(async () => {
            await removeKept(filmId);
          });
        }}
        title="Take it off this list without judging the film"
        className="label rounded-full border border-line px-3 py-1 !text-[0.5625rem] !text-faint transition-colors hover:border-line-bright hover:!text-paper"
      >
        Remove
      </button>
    </div>
  );
}
