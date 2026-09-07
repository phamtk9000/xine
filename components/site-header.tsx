"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/session";

/**
 * Seven destinations that were never equals, arranged as what they are.
 *
 * As a flat row they read as seven peers, and a reader arriving with "I want
 * something to watch" had to weigh Calendar and Create at the same moment as
 * What to Watch. Four of them are discovery — different doors into the same
 * catalogue — and the other three are separate rooms.
 *
 * The desktop bar still reads as one line, because a navigation that
 * announces its own taxonomy is a site talking about itself. What the
 * grouping buys there is order and spacing; where it becomes explicit is the
 * mobile menu, which has the room to say it.
 */
const NAV_GROUPS = [
  {
    label: "Discover",
    items: [
      { href: "/watch", label: "What to watch" },
      { href: "/films", label: "Films" },
      { href: "/lists", label: "Lists" },
      { href: "/calendar", label: "Calendar" },
    ],
  },
  { label: "Read", items: [{ href: "/journal", label: "Journal" }] },
  { label: "People", items: [{ href: "/community", label: "Community" }] },
  { label: "Make", items: [{ href: "/create", label: "Create" }] },
];

const NAV = NAV_GROUPS.flatMap((group) => group.items);

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The sheet closes on tap rather than in an effect keyed to the pathname —
  // same result, no cascading render, and it also closes when you tap the
  // route you are already on.
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-3xl leading-none tracking-tight"
          aria-label="xine, home"
        >
          xine
        </Link>

        <nav className="hidden items-center lg:flex" aria-label="Main">
          {NAV.map((item, index) => {
            // A wider gap where one group ends and the next begins. It reads
            // as rhythm rather than as a rule, which is the most a navigation
            // should say about its own structure.
            const startsGroup =
              index > 0 &&
              NAV_GROUPS.some((group) => group.items[0]?.href === item.href);
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`label transition-colors hover:text-paper ${
                  startsGroup ? "ml-9" : "ml-7"
                } ${active ? "!text-paper" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/create/pitch"
            className="hidden rounded-[3px] bg-accent px-4 py-2.5 font-sans text-[0.625rem] font-medium tracking-[0.14em] text-paper uppercase transition-transform hover:-translate-y-px sm:block"
          >
            Pitch Your Film →
          </Link>

          {user ? (
            <>
              <Link
                href="/for-you"
                className="label hidden transition-colors hover:text-paper md:block"
              >
                For you
              </Link>
              <Link
                href="/taste"
                className="label hidden transition-colors hover:text-paper md:block"
              >
                Your month
              </Link>
              <Link
                href={`/community/${user.username}`}
                className="label hidden items-center gap-2.5 transition-colors hover:text-paper md:flex"
              >
                <Avatar user={user} size={22} />
                {user.displayName}
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="label hidden transition-colors hover:text-paper md:block"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="label -mr-2 px-2 py-2 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-ink lg:hidden">
          <nav className="mx-auto max-w-[1400px] px-5 py-4 sm:px-8" aria-label="Mobile">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="border-b border-line py-4 last:border-0">
                <p className="label !text-[0.5625rem] text-faint">{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className="mt-2 block font-display text-3xl leading-tight"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-5">
              <Link
                href="/create/pitch"
                onClick={close}
                className="rounded-[3px] bg-accent px-4 py-2.5 font-sans text-[0.625rem] font-medium tracking-[0.14em] text-paper uppercase"
              >
                Pitch Your Film →
              </Link>
              {user && (
                <>
                  <Link href="/for-you" onClick={close} className="label px-1">
                    For you
                  </Link>
                  <Link href="/taste" onClick={close} className="label px-1">
                    Your month
                  </Link>
                </>
              )}
              <Link
                href={user ? `/community/${user.username}` : "/sign-in"}
                onClick={close}
                className="label flex items-center gap-2.5 px-1"
              >
                {user && <Avatar user={user} size={22} />}
                {user ? user.displayName : "Sign in"}
              </Link>
              {user && (
                <Link href="/settings" onClick={close} className="label px-1">
                  Edit profile
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
