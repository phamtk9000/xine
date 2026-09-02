"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleWatchlist } from "@/app/actions/films";
import { toggleLiked, toggleWatched } from "@/app/actions/logs";

/**
 * Watched · Watchlist · Liked — the one-tap marks.
 *
 * These are separate from the rating form because they answer a different
 * question. A rating is a judgement and costs a moment's thought; these are
 * bookkeeping, and anything that makes them cost more than a tap means people
 * stop leaving them — which would leave the monthly digest with nothing to
 * read.
 *
 * Each button flips its own state immediately and sends the write in a
 * transition. The server enforces the couplings between the three marks (see
 * app/actions/logs.ts), so the optimistic state has to predict them here too
 * or the row would visibly correct itself a moment after every tap.
 */

type State = { watched: boolean; watchlisted: boolean; liked: boolean };

export function QuickActions({
  filmId,
  slug,
  signedIn,
  initial,
}: {
  filmId: string;
  slug: string;
  signedIn: boolean;
  initial: State;
}) {
  const [state, setState] = useState(initial);
  const [, startTransition] = useTransition();

  function send(
    action: (fd: FormData) => Promise<unknown>,
    next: (prev: State) => State,
  ) {
    setState(next);
    const formData = new FormData();
    formData.set("filmId", filmId);
    formData.set("slug", slug);
    startTransition(async () => {
      await action(formData);
    });
  }

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/sign-in"
          className="inline-flex rounded-[3px] border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-faint"
        >
          Sign in to log this
        </Link>
        <p className="max-w-xs text-xs leading-relaxed text-faint">
          Mark it watched, save it or like it — and get a read on your taste at
          the end of every month.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
        <Action
          label="Watched"
          on={state.watched}
          onColor="var(--color-gold)"
          onClick={() =>
            send(toggleWatched, (p) => ({
              watched: !p.watched,
              // Watching it takes it off the list of things to get to, and
              // un-watching drops the like — both mirror the server.
              watchlisted: p.watched ? p.watchlisted : false,
              liked: p.watched ? false : p.liked,
            }))
          }
          icon={
            <>
              <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
              <circle cx="10" cy="10" r="2.75" />
            </>
          }
        />
        <Action
          label="Watchlist"
          on={state.watchlisted}
          onColor="var(--color-accent)"
          onClick={() =>
            send(toggleWatchlist, (p) => ({
              ...p,
              watchlisted: !p.watchlisted,
            }))
          }
          icon={<path d="M5 2.5h10v15l-5-4-5 4v-15Z" />}
        />
        <Action
          label="Like"
          on={state.liked}
          onColor="#e0452e"
          onClick={() =>
            send(toggleLiked, (p) => ({
              liked: !p.liked,
              // A like is a claim to have seen it.
              watched: p.liked ? p.watched : true,
              watchlisted: p.liked ? p.watchlisted : false,
            }))
          }
          icon={
            <path d="M10 17S2.5 12.4 2.5 7.4A4.1 4.1 0 0 1 10 5.2a4.1 4.1 0 0 1 7.5 2.2c0 5-7.5 9.6-7.5 9.6Z" />
          }
        />
      <Link
        href="/taste"
        className="ml-1 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint transition-colors hover:text-gold"
      >
        Your month →
      </Link>
    </div>
  );
}

function Action({
  label,
  on,
  onColor,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onColor: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      // aria-pressed carries the state for a screen reader; the colour and
      // fill carry it for everyone else, so it never rests on colour alone.
      className="group flex cursor-pointer items-center gap-2 rounded-[3px] border border-line px-4 py-2.5 transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
      style={on ? { borderColor: onColor } : undefined}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-5 w-5 transition-transform duration-200 group-active:scale-90"
        fill={on ? onColor : "none"}
        stroke={on ? onColor : "currentColor"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span
        className="font-sans text-[0.6875rem] tracking-[0.12em] uppercase"
        style={{ color: on ? onColor : undefined }}
      >
        {label}
      </span>
    </button>
  );
}
