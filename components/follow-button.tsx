"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFollow } from "@/app/actions/follows";

/**
 * Follow, as a toggle that states what it will do rather than what is true.
 *
 * The label reads "Follow" / "Following" and flips to "Unfollow" on hover
 * once you already follow somebody — the standard pattern, and the right one
 * here: the resting state has to be readable as a fact about the two of you
 * while the button still has to say what pressing it does.
 */
export function FollowButton({
  username,
  initial,
  signedIn,
  followers,
}: {
  username: string;
  initial: boolean;
  signedIn: boolean;
  followers: number;
}) {
  const [following, setFollowing] = useState(initial);
  const [count, setCount] = useState(followers);
  const [hover, setHover] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        className="rounded-[3px] border border-line px-4 py-2.5 font-sans text-[0.6875rem] tracking-[0.14em] uppercase text-muted transition-colors hover:border-line-bright hover:text-paper"
      >
        Sign in to follow
      </Link>
    );
  }

  function press() {
    const next = !following;
    setFollowing(next);
    setCount((n) => n + (next ? 1 : -1));

    const formData = new FormData();
    formData.set("username", username);

    startTransition(async () => {
      const result = await toggleFollow(formData);
      // The server is the authority; a refusal puts the button back.
      if (!result.ok) {
        setFollowing(!next);
        setCount((n) => n + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={press}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={pending}
      aria-pressed={following}
      className={`rounded-[3px] border px-4 py-2.5 font-sans text-[0.6875rem] tracking-[0.14em] uppercase transition-colors disabled:opacity-60 ${
        following
          ? "border-line-bright text-paper hover:border-accent hover:text-accent"
          : "border-line-bright text-paper hover:border-paper"
      }`}
    >
      {following ? (hover ? "Unfollow" : "Following") : "Follow"}
      <span className="readout ml-2 text-faint">{count}</span>
    </button>
  );
}
