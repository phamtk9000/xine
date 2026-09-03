"use client";

import { useState, useTransition } from "react";
import { setInterest } from "@/app/actions/recommendations";

/**
 * The two answers a reader can give a suggestion.
 *
 * Optimistic, like QuickRate and for the same reason: this is a control
 * people press while scrolling past, and one that waits on a round trip
 * before acknowledging the press does not get pressed twice.
 *
 * "Not for me" rather than a thumb-down, and "Interested" rather than a
 * heart. The judgement here is about the *suggestion*, not the film — a
 * reader has not seen it and is in no position to dislike it — and the words
 * are the only thing keeping that distinction visible.
 */
export function InterestButtons({
  filmId,
  mine,
  className = "",
}: {
  filmId: string;
  mine: "yes" | "no" | null;
  className?: string;
}) {
  const [verdict, setVerdict] = useState<"yes" | "no" | null>(mine);
  const [, startTransition] = useTransition();

  function press(next: "yes" | "no") {
    // Pressing the current answer takes it back — see the action.
    const after = verdict === next ? null : next;
    setVerdict(after);
    startTransition(async () => {
      await setInterest(filmId, next);
    });
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Choice
        on={verdict === "yes"}
        onClick={() => press("yes")}
        label={verdict === "yes" ? "Kept" : "Interested"}
        title="Keep this, and show me more like it"
      />
      <Choice
        on={verdict === "no"}
        onClick={() => press("no")}
        label={verdict === "no" ? "Hidden" : "Not for me"}
        title="Hide this, and show me fewer like it"
        muted
      />
    </div>
  );
}

function Choice({
  on,
  onClick,
  label,
  title,
  muted = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`label rounded-full border px-3 py-1 !text-[0.5625rem] transition-colors ${
        on
          ? muted
            ? "border-line-bright bg-ink-raised !text-faint"
            : "border-gold bg-gold/10 !text-gold"
          : "border-line !text-faint hover:border-line-bright hover:!text-paper"
      }`}
    >
      {label}
    </button>
  );
}
